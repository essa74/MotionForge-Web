import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { Player } from '@remotion/player'
import { canRenderMediaOnWeb, renderMediaOnWeb } from '@remotion/web-renderer'
import { SceneReel } from '../reels-engine/engine/Reel'
import { specSeconds, type ReelSpec } from '../reels-engine/engine/spec'
import { validateSpec } from '../reels-engine/engine/validate'
import { FORMATS, type Format } from '../reels-engine/lib/theme'
import { loadReelFonts } from './fonts'
import { askAi, loadAi } from '../ai'
import { buildScenePrompt, extractJson } from './scenePrompt'
import { DEFAULT_SPEC_TEXT, allowsExcel, lookOf, saveProject, templateById, type Project } from './projects'
import { ChatIcon, ICON } from './ui'
import './studio.css'

const FPS = 30
const MAX_VOICE_SECONDS = 200

type Picked = { name: string; url: string }
type Voice = Picked & { seconds: number }
type Result = { url: string; sizeMb: number; renderSeconds: number }

function audioSeconds(url: string): Promise<number> {
  return new Promise(resolve => {
    const probe = new Audio(url)
    probe.addEventListener('loadedmetadata', () => resolve(probe.duration), { once: true })
    probe.addEventListener('error', () => resolve(NaN), { once: true })
  })
}

const DEFAULT_SPEC: ReelSpec = { format: 'vertical', scenes: [{ type: 'text', duration: 3, title: 'عنوان الريل', theme: 'dark' }, { type: 'logo', duration: 3 }] }

type Tab = 'inputs' | 'scenes' | 'preview'
const TABS: Array<[Tab, string]> = [['inputs', '١ المدخلات'], ['scenes', '٢ المشاهد'], ['preview', '٣ المعاينة']]


export default function Editor({ project, onOpenAi, onBack, onOpenAssistant, onSink }: { project: Project; onOpenAi: () => void; onBack: () => void; onOpenAssistant: () => void; onSink: (sink: ((text: string) => void) | null) => void }) {
  const [tab, setTab] = useState<Tab>('inputs')
  const template = useMemo(() => templateById(project.templateId), [project.templateId])
  const [script, setScript] = useState(project.script)
  const [format, setFormat] = useState<Format>(project.format)
  const [voice, setVoice] = useState<Voice | null>(null)
  const [logo, setLogo] = useState<Picked | null>(null)
  const [images, setImages] = useState<Picked[]>([])
  const [specText, setSpecText] = useState(project.specText || DEFAULT_SPEC_TEXT)
  const [fontsReady, setFontsReady] = useState(false)
  const [asking, setAsking] = useState(false)
  const [askSeconds, setAskSeconds] = useState(0)
  const askAbort = useRef<AbortController | null>(null)
  const [message, setMessage] = useState('')
  const [rendering, setRendering] = useState(false)
  const [progress, setProgress] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState<Result | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => { loadReelFonts().then(() => setFontsReady(true)).catch(() => setMessage('تعذر تحميل الخطوط.')) }, [])
  // Notices fade out on their own (errors stay a little longer); the x button closes them at once.
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), /فشل|تعذر|خطأ|المتصفح لا|سجّل|اتأخر/.test(message) ? 15000 : 6000)
    return () => window.clearTimeout(timer)
  }, [message])
  useEffect(() => {
    onSink(text => setScript(old => old.trim() ? old.trimEnd() + '\n\n' + text : text))
    return () => onSink(null)
  }, [onSink])
  useEffect(() => {
    const timer = window.setTimeout(() => saveProject(project.id, { script, specText, format }), 400)
    return () => window.clearTimeout(timer)
  }, [project.id, script, specText, format])

  const parsed = useMemo(() => {
    try {
      return validateSpec(JSON.parse(specText))
    } catch (error) {
      return { spec: null, errors: ['الـ JSON فيه خطأ في الكتابة: ' + (error as Error).message] }
    }
  }, [specText])

  // Scene images are named in the spec; swap each name for the uploaded file's URL.
  const spec = useMemo<ReelSpec | null>(() => {
    if (!parsed.spec) return null
    const byName = new Map(images.map(image => [image.name, image.url]))
    return { ...parsed.spec, format, scenes: parsed.spec.scenes.map(scene => scene.type === 'image' ? { ...scene, src: byName.get(scene.src) ?? scene.src } : scene) }
  }, [parsed.spec, images, format])

  const missingImages = useMemo(() => (parsed.spec?.scenes ?? []).flatMap(scene => scene.type === 'image' && !images.some(image => image.name === scene.src) ? [scene.src] : []), [parsed.spec, images])

  const tail = spec && spec.scenes[spec.scenes.length - 1]?.type === 'logo' ? spec.scenes[spec.scenes.length - 1].duration : 0
  const totalSeconds = spec ? (voice ? Math.min(voice.seconds, MAX_VOICE_SECONDS) + tail : specSeconds(spec)) : 0
  const frames = Math.max(1, Math.ceil(totalSeconds * FPS))
  const size = FORMATS[format]
  const look = useMemo(() => lookOf(template), [template])
  const inputProps = useMemo(() => ({ spec: spec ?? DEFAULT_SPEC, voiceOver: voice?.url, logo: logo?.url, look }), [spec, voice, logo, look])

  async function pickVoice(file?: File) {
    if (!file) return setVoice(null)
    const url = URL.createObjectURL(file)
    const seconds = await audioSeconds(url)
    if (!Number.isFinite(seconds)) { setMessage('تعذر قراءة الملف الصوتي. جرّب mp3 أو m4a.'); return }
    setMessage(''); setVoice({ name: file.name, url, seconds })
  }

  async function askGemini() {
    if (!script.trim()) return setMessage('الصق السكريبت الأول.')
    const ai = loadAi()
    if (!ai) { setMessage('محتاج مفتاح الذكاء الاصطناعي الأول.'); onOpenAi(); return }
    setAsking(true); setMessage(''); setAskSeconds(0)
    const started = Date.now()
    const tick = window.setInterval(() => setAskSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    const prompt = buildScenePrompt({ script, voiceSeconds: voice?.seconds ?? null, imageNames: images.map(image => image.name), format, styleNote: template.note, allowExcel: allowsExcel(template, script) })
    const controller = new AbortController(); askAbort.current = controller
    const timer = window.setTimeout(() => controller.abort(), 120000)
    try {
      const reply = await askAi(ai, [{ role: 'user', content: prompt }], { signal: controller.signal })
      const checked = validateSpec(extractJson(reply))
      // Safety net: a model that ignores the rule still cannot put a table into a non-Excel reel.
      if (checked.spec && !allowsExcel(template, script)) checked.spec.scenes = checked.spec.scenes.map(sc => sc.type === 'excel' ? { type: 'text' as const, duration: sc.duration, title: (typeof sc.caption === 'string' ? sc.caption : sc.caption?.[0]?.text) || 'تابع معانا' } : sc)
      if (!checked.spec) throw new Error(checked.errors.join(' | '))
      setSpecText(JSON.stringify(checked.spec, null, 2)); setResult(null); setTab('scenes')
      setMessage(checked.errors.length ? 'جهزت المشاهد مع تنبيهات: ' + checked.errors.join(' | ') : 'المشاهد جاهزة. راجعها وعاين.')
    } catch (error) {
      if (askAbort.current !== controller) setMessage('اتلغى.')
      else setMessage(error instanceof DOMException && error.name === 'AbortError' ? 'الذكاء الاصطناعي ما ردش. جرّب تاني.' : (error as Error).message)
    } finally {
      window.clearTimeout(timer); window.clearInterval(tick); askAbort.current = null; setAsking(false)
    }
  }

  function cancelGemini() { const current = askAbort.current; askAbort.current = null; current?.abort() }

  async function copyPrompt() {
    const prompt = buildScenePrompt({ script, voiceSeconds: voice?.seconds ?? null, imageNames: images.map(image => image.name), format, styleNote: template.note, allowExcel: allowsExcel(template, script) })
    try { await navigator.clipboard.writeText(prompt); setMessage('اتنسخت التعليمات. الصقها في جيمناي وارجع الصق الـ JSON تحت.') } catch { setMessage('تعذر النسخ.') }
  }

  async function render() {
    if (!spec) return
    setMessage(''); setResult(null); setProgress(0); setElapsed(0); setRendering(true)
    const controller = new AbortController(); abort.current = controller
    const t0 = performance.now()
    try {
      try { await (navigator as Navigator & { wakeLock?: { request: (type: string) => Promise<unknown> } }).wakeLock?.request('screen') } catch { /* optional */ }
      const check = await canRenderMediaOnWeb({ container: 'mp4', videoCodec: 'h264', width: size.width, height: size.height })
      if (!check.canRender) throw new Error('المتصفح لا يدعم الرندر: ' + check.issues.map(issue => issue.message).join(' | '))
      const { getBlob } = await renderMediaOnWeb({
        composition: { id: 'SceneReel', component: SceneReel as unknown as ComponentType<Record<string, unknown>>, durationInFrames: frames, fps: FPS, width: size.width, height: size.height },
        inputProps, container: 'mp4', videoCodec: 'h264', videoBitrate: 'high', muted: !voice,
        licenseKey: 'free-license', signal: controller.signal, logLevel: 'warn',
        onProgress: p => { setProgress(p.progress); setElapsed((performance.now() - t0) / 1000) },
      })
      const blob = await getBlob()
      setResult({ url: URL.createObjectURL(blob), sizeMb: blob.size / 1e6, renderSeconds: (performance.now() - t0) / 1000 })
      setProgress(1)
    } catch (error) {
      setMessage(controller.signal.aborted ? 'تم الإيقاف.' : 'فشل الرندر: ' + ((error as Error)?.message || String(error)))
    } finally { setRendering(false) }
  }

  const issues = [...parsed.errors, ...(missingImages.length ? [`صور ناقصة، ارفعها بنفس الاسم: ${missingImages.join('، ')}`] : [])]

  return <section className="studio" dir="rtl">
    <div className="studio-head">
      <button className="icon-btn" onClick={onBack} aria-label="رجوع للمشاريع"><svg width="22" height="22" viewBox="0 0 24 24" {...ICON} strokeWidth={2}><path d="M9 6l6 6-6 6" /></svg></button>
      <div className="studio-head-title"><b>{project.name}</b><small>{template.name} · بيتحفظ تلقائي</small></div>
      <button className="icon-btn gold" onClick={onOpenAssistant} aria-label="المساعد"><ChatIcon /></button>
    </div>

    <div className="studio-tabs" role="tablist">
      {TABS.map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}
    </div>

    <div className="studio-body">
    {tab === 'inputs' && <div className="studio-card">
      <label>السكريبت</label>
      <textarea value={script} onChange={event => setScript(event.target.value)} rows={7} placeholder="الصق السكريبت هنا، أو اطلبه من المساعد" />
      <div className="studio-row">
        <div><label>المقاس</label>
          <select value={format} onChange={event => setFormat(event.target.value as Format)} disabled={rendering}>
            <option value="vertical">طولي 9:16</option><option value="horizontal">عرضي 16:9</option><option value="square">مربع</option>
          </select></div>
      </div>
      <label>الصوت (طول الفيديو هيتبعه)</label>
      <input type="file" accept="audio/*" onChange={event => void pickVoice(event.target.files?.[0])} />
      {voice && <small className="ok">{voice.name} — {voice.seconds.toFixed(1)} ثانية ✓</small>}
      <label>اللوجو</label>
      <input type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; setLogo(file ? { name: file.name, url: URL.createObjectURL(file) } : null) }} />
      <label>صور المشاهد (اختياري)</label>
      <input type="file" accept="image/*" multiple onChange={event => setImages([...event.target.files ?? []].map(file => ({ name: file.name, url: URL.createObjectURL(file) })))} />
      {images.length > 0 && <small>{images.map(image => image.name).join('، ')}</small>}
      <small>الصوت واللوجو والصور بتتختار تاني كل مرة تفتح المشروع.</small>
    </div>}

    {tab === 'scenes' && <div className="studio-card">
      <small>المشاهد بصيغة JSON. تقدر تعدّلها بإيدك، أو ارجع للمدخلات واطلبها من جيمناي.</small>
      <textarea className="mono" value={specText} onChange={event => { setSpecText(event.target.value); setResult(null) }} rows={14} spellCheck={false} />
      {issues.length > 0 && <ul className="studio-issues">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
      {spec && <small className="ok">{spec.scenes.length} مشاهد — مدة الفيديو {totalSeconds.toFixed(1)} ثانية</small>}
      <button onClick={() => void copyPrompt()}>انسخ التعليمات (لو هتستخدم جيمناي بره)</button>
    </div>}

    {tab === 'preview' && <div className="studio-card">
      {fontsReady && spec ? <div className="studio-player" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
        <Player component={SceneReel} inputProps={inputProps} durationInFrames={frames} fps={FPS} compositionWidth={size.width} compositionHeight={size.height} initialFrame={Math.min(frames - 1, 24)} controls style={{ width: '100%', height: '100%' }} acknowledgeRemotionLicense />
      </div> : <small>{spec ? 'بحمّل الخطوط…' : 'صحّح المشاهد عشان تظهر المعاينة.'}</small>}
      <div className="studio-actions">
        <button className="primary" onClick={() => void render()} disabled={!spec || rendering || !fontsReady}>{rendering ? 'جارٍ الرندر…' : 'اعمل الفيديو MP4'}</button>
        {rendering && <button onClick={() => abort.current?.abort()}>إيقاف</button>}
      </div>
      {(rendering || progress > 0) && <div className="studio-progress"><i style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
      {rendering && <small>{Math.round(progress * 100)}% — {elapsed.toFixed(0)} ثانية. سيب الشاشة مفتوحة والتبويب ظاهر.</small>}
      {result && <div className="studio-result">
        <b>تم ✔ ({result.sizeMb.toFixed(1)} MB في {result.renderSeconds.toFixed(0)} ثانية)</b>
        <video src={result.url} controls playsInline />
        <a className="studio-download" href={result.url} download="reel.mp4">تحميل الفيديو</a>
      </div>}
    </div>}
    </div>

    {message && <div className="studio-message"><span>{message}</span><button onClick={() => setMessage('')} aria-label="إغلاق">×</button></div>}

    {tab === 'inputs' && <div className="studio-bottom">
      {asking
        ? <button className="primary" onClick={cancelGemini}>إلغاء ({askSeconds} ث)</button>
        : <button className="primary" onClick={() => void askGemini()}>✦ جهّز المشاهد بالذكاء الاصطناعي</button>}
      <small>{asking ? 'الذكاء الاصطناعي بيجهز… ممكن ياخد لحد دقيقة.' : 'بيستخدم مفتاحك الخاص من إعدادات حسابي'}</small>
    </div>}
  </section>
}

