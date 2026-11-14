import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { Player } from '@remotion/player'
import { canRenderMediaOnWeb, renderMediaOnWeb } from '@remotion/web-renderer'
import { SceneReel } from '../reels-engine/engine/Reel'
import { specSeconds, type ReelSpec } from '../reels-engine/engine/spec'
import { validateSpec } from '../reels-engine/engine/validate'
import { FORMATS, type Format } from '../reels-engine/lib/theme'
import { loadReelFonts } from './fonts'
import { buildScenePrompt, extractJson } from './scenePrompt'
import { DEFAULT_SPEC_TEXT, KIND_LABEL, createProject, deleteProject, loadProjects, saveProject, type Kind, type Project } from './projects'
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

const ICON = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const
function ChatIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" {...ICON}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /><path d="M9 11h.01M12.5 11h.01M16 11h.01" /></svg> }

function Editor({ project, apiBaseUrl, onBack, onOpenAssistant, onSink }: { project: Project; apiBaseUrl: string; onBack: () => void; onOpenAssistant: () => void; onSink: (sink: ((text: string) => void) | null) => void }) {
  const [tab, setTab] = useState<Tab>('inputs')
  const [script, setScript] = useState(project.script)
  const [format, setFormat] = useState<Format>(project.format)
  const [voice, setVoice] = useState<Voice | null>(null)
  const [logo, setLogo] = useState<Picked | null>(null)
  const [images, setImages] = useState<Picked[]>([])
  const [specText, setSpecText] = useState(project.specText || DEFAULT_SPEC_TEXT)
  const [fontsReady, setFontsReady] = useState(false)
  const [asking, setAsking] = useState(false)
  const [askSeconds, setAskSeconds] = useState(0)
  const [attempt, setAttempt] = useState(1)
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
  const inputProps = useMemo(() => ({ spec: spec ?? DEFAULT_SPEC, voiceOver: voice?.url, logo: logo?.url }), [spec, voice, logo])

  async function pickVoice(file?: File) {
    if (!file) return setVoice(null)
    const url = URL.createObjectURL(file)
    const seconds = await audioSeconds(url)
    if (!Number.isFinite(seconds)) { setMessage('تعذر قراءة الملف الصوتي. جرّب mp3 أو m4a.'); return }
    setMessage(''); setVoice({ name: file.name, url, seconds })
  }

  async function askGemini() {
    if (!script.trim()) return setMessage('الصق السكريبت الأول.')
    const token = localStorage.getItem('essa_studio_access_token')
    if (!token) return setMessage('سجّل الدخول الأول من المساعد (أيقونة الشات فوق).')
    setAsking(true); setMessage(''); setAskSeconds(0); setAttempt(1)
    const started = Date.now()
    const tick = window.setInterval(() => setAskSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    const prompt = buildScenePrompt({ script, voiceSeconds: voice?.seconds ?? null, imageNames: images.map(image => image.name), format })
    let cancelled = false
    try {
      // The free server sleeps when idle, so the first try can hang while it wakes up: retry once.
      for (let attemptNo = 1; attemptNo <= 2; attemptNo++) {
        setAttempt(attemptNo)
        const controller = new AbortController(); askAbort.current = controller
        const timer = window.setTimeout(() => controller.abort(), attemptNo === 1 ? 90000 : 120000)
        try {
          const response = await fetch(`${apiBaseUrl}/api/v1/chat/reply`, {
            method: 'POST', signal: controller.signal,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], attachments: [] }),
          })
          const data = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(data.detail || 'تعذر الحصول على رد من جيمناي.')
          const checked = validateSpec(extractJson(String(data.reply)))
          if (!checked.spec) throw new Error(checked.errors.join(' | '))
          setSpecText(JSON.stringify(checked.spec, null, 2)); setResult(null); setTab('scenes')
          setMessage(checked.errors.length ? 'جهزت المشاهد مع تنبيهات: ' + checked.errors.join(' | ') : 'المشاهد جاهزة. راجعها وعاين.')
          return
        } catch (error) {
          const aborted = error instanceof DOMException && error.name === 'AbortError'
          const network = error instanceof TypeError
          if (askAbort.current !== controller) { cancelled = true; return }
          if ((aborted || network) && attemptNo === 1) continue
          setMessage(aborted ? 'جيمناي ما ردش. جرّب تاني بعد دقيقة.' : (error as Error).message)
          return
        } finally { window.clearTimeout(timer) }
      }
    } finally {
      window.clearInterval(tick); askAbort.current = null; setAsking(false)
      if (cancelled) setMessage('اتلغى.')
    }
  }

  function cancelGemini() { const current = askAbort.current; askAbort.current = null; current?.abort() }

  async function copyPrompt() {
    const prompt = buildScenePrompt({ script, voiceSeconds: voice?.seconds ?? null, imageNames: images.map(image => image.name), format })
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
      <div className="studio-head-title"><b>{project.name}</b><small>{KIND_LABEL[project.kind]} · بيتحفظ تلقائي</small></div>
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
        : <button className="primary" onClick={() => void askGemini()}>✦ جهّز المشاهد بجيمناي</button>}
      <small>{asking ? (attempt === 1 ? 'جيمناي بيجهز… لو السيرفر كان نايم ممكن ياخد لحد دقيقة.' : 'السيرفر كان بيصحى، بحاول تاني…') : 'لو السيرفر كان نايم ممكن ياخد لحد دقيقة'}</small>
    </div>}
  </section>
}

const KIND_ICON: Record<Kind, string> = { excel: 'xl', bein: 'bs', historima: 'hs' }

export default function Studio({ apiBaseUrl, onOpenAssistant, onSink }: { apiBaseUrl: string; onOpenAssistant: () => void; onSink: (sink: ((text: string) => void) | null) => void }) {
  const [projects, setProjects] = useState<Project[]>(loadProjects)
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Kind>('excel')
  const open = projects.find(project => project.id === openId)

  const refresh = () => setProjects(loadProjects())

  if (open) return <Editor key={open.id} project={open} apiBaseUrl={apiBaseUrl} onOpenAssistant={onOpenAssistant} onSink={onSink} onBack={() => { refresh(); setOpenId(null) }} />

  return <section className="studio" dir="rtl">
    <div className="studio-head">
      <div className="studio-brand"><span className="studio-logo">E</span><div className="studio-head-title"><b>EssaStudio</b><small>استوديو الفيديو</small></div></div>
      <button className="icon-btn gold" onClick={onOpenAssistant} aria-label="المساعد"><ChatIcon /></button>
    </div>

    <div className="studio-body">
      <div className="studio-intro"><h1>مشاريعك</h1><p>اختار مشروع تكمله أو ابدأ واحد جديد</p></div>

      {creating
        ? <div className="studio-card">
            <h3>مشروع جديد</h3>
            <input className="studio-input" value={name} onChange={event => setName(event.target.value)} placeholder="اسم المشروع (مثلاً: ريل Transpose)" autoFocus />
            <div className="studio-kinds">
              {(Object.keys(KIND_LABEL) as Kind[]).map(key => <button key={key} className={`kind-${key} ${kind === key ? 'active' : ''}`} onClick={() => setKind(key)}>{KIND_LABEL[key]}</button>)}
            </div>
            <div className="studio-actions">
              <button className="primary" onClick={() => { const project = createProject(name, kind); setName(''); setCreating(false); refresh(); setOpenId(project.id) }}>ابدأ المشروع</button>
              <button onClick={() => setCreating(false)}>إلغاء</button>
            </div>
          </div>
        : <button className="studio-new" onClick={() => setCreating(true)}>
            <span className="studio-new-plus"><svg width="22" height="22" viewBox="0 0 24 24" {...ICON} strokeWidth={2.4}><path d="M12 5v14M5 12h14" /></svg></span>
            <span><b>مشروع جديد</b><small>Excel · بين السطور · HISTORIMA</small></span>
          </button>}

      {projects.length === 0 && !creating && <small>لسه مفيش مشاريع. اعمل أول مشروع من فوق.</small>}
      {projects.map(project => <div className="studio-project" key={project.id}>
        <button className="studio-project-open" onClick={() => setOpenId(project.id)}>
          <span className={`studio-thumb thumb-${KIND_ICON[project.kind]}`} aria-hidden="true">{project.kind === 'bein' && <svg viewBox="0 0 76 96" width="76" height="96"><circle cx="38" cy="38" r="11" fill="none" stroke="#fff" strokeWidth="2.4" /><path d="M38 49v22M38 56l-12 8M38 56l12 8M38 71l-9 14M38 71l9 14" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" /><path d="M0 88h76" stroke="#E8B64C" strokeWidth="2" /></svg>}</span>
          <span className="studio-project-info">
            <b>{project.name}</b>
            <span className={`kind-chip kind-${project.kind}`}>{KIND_LABEL[project.kind]}</span>
            <small>آخر تعديل: {new Date(project.updated).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}</small>
          </span>
        </button>
        <button className="icon-btn" aria-label={`حذف ${project.name}`} onClick={() => { if (window.confirm(`حذف "${project.name}"؟ مش هتقدر ترجعه.`)) { deleteProject(project.id); refresh() } }}>
          <svg width="20" height="20" viewBox="0 0 24 24" {...ICON}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>
        </button>
      </div>)}
    </div>
  </section>
}
