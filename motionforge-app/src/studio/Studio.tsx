import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { Player } from '@remotion/player'
import { canRenderMediaOnWeb, renderMediaOnWeb } from '@remotion/web-renderer'
import { SceneReel } from '../reels-engine/engine/Reel'
import { specSeconds, type ReelSpec } from '../reels-engine/engine/spec'
import { validateSpec } from '../reels-engine/engine/validate'
import { FORMATS, type Format } from '../reels-engine/lib/theme'
import { loadReelFonts } from './fonts'
import { buildScenePrompt, extractJson } from './scenePrompt'
import './studio.css'

const FPS = 30
const MAX_VOICE_SECONDS = 200
const KEY_SCRIPT = 'essa_studio_script'
const KEY_SPEC = 'essa_studio_spec'

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

export default function Studio({ apiBaseUrl, onClose }: { apiBaseUrl: string; onClose: () => void }) {
  const [script, setScript] = useState(() => localStorage.getItem(KEY_SCRIPT) || '')
  const [format, setFormat] = useState<Format>('vertical')
  const [voice, setVoice] = useState<Voice | null>(null)
  const [logo, setLogo] = useState<Picked | null>(null)
  const [images, setImages] = useState<Picked[]>([])
  const [specText, setSpecText] = useState(() => localStorage.getItem(KEY_SPEC) || JSON.stringify(DEFAULT_SPEC, null, 2))
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
  useEffect(() => { localStorage.setItem(KEY_SCRIPT, script) }, [script])
  useEffect(() => { localStorage.setItem(KEY_SPEC, specText) }, [specText])

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
    if (!token) return setMessage('سجّل الدخول الأول عشان جيمناي يشتغل.')
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
          setSpecText(JSON.stringify(checked.spec, null, 2)); setResult(null)
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
    <div className="studio-head"><b>استوديو الريلز</b><span><button onClick={() => window.location.reload()}>تحديث</button> <button onClick={onClose}>رجوع للمحادثة</button></span></div>

    <div className="studio-card">
      <h3>1) المدخلات</h3>
      <label>السكريبت</label>
      <textarea value={script} onChange={event => setScript(event.target.value)} rows={7} placeholder="الصق السكريبت هنا" />
      <div className="studio-row">
        <div><label>المقاس</label>
          <select value={format} onChange={event => setFormat(event.target.value as Format)} disabled={rendering}>
            <option value="vertical">طولي 9:16</option><option value="horizontal">عرضي 16:9</option><option value="square">مربع</option>
          </select></div>
      </div>
      <label>الصوت (طول الفيديو هيتبعه)</label>
      <input type="file" accept="audio/*" onChange={event => void pickVoice(event.target.files?.[0])} />
      {voice && <small>{voice.name} — {voice.seconds.toFixed(1)} ثانية</small>}
      <label>اللوجو</label>
      <input type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; setLogo(file ? { name: file.name, url: URL.createObjectURL(file) } : null) }} />
      <label>صور المشاهد (اختياري)</label>
      <input type="file" accept="image/*" multiple onChange={event => setImages([...event.target.files ?? []].map(file => ({ name: file.name, url: URL.createObjectURL(file) })))} />
      {images.length > 0 && <small>{images.map(image => image.name).join('، ')}</small>}
    </div>

    <div className="studio-card">
      <h3>2) المشاهد</h3>
      <div className="studio-actions">
        {asking
          ? <button onClick={cancelGemini}>إلغاء ({askSeconds} ث)</button>
          : <button className="primary" onClick={() => void askGemini()}>جهّز المشاهد بجيمناي</button>}
        <button onClick={() => void copyPrompt()} disabled={asking}>انسخ التعليمات</button>
      </div>
      {asking && <small>{attempt === 1 ? 'جيمناي بيجهز… لو السيرفر كان نايم ممكن ياخد لحد دقيقة.' : 'السيرفر كان بيصحى، بحاول تاني…'}</small>}
      <textarea className="mono" value={specText} onChange={event => { setSpecText(event.target.value); setResult(null) }} rows={12} spellCheck={false} />
      {issues.length > 0 && <ul className="studio-issues">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
      {spec && <small>{spec.scenes.length} مشاهد — مدة الفيديو {totalSeconds.toFixed(1)} ثانية</small>}
    </div>

    <div className="studio-card">
      <h3>3) المعاينة والرندر</h3>
      {fontsReady && spec ? <div className="studio-player" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
        <Player component={SceneReel} inputProps={inputProps} durationInFrames={frames} fps={FPS} compositionWidth={size.width} compositionHeight={size.height} controls style={{ width: '100%', height: '100%' }} acknowledgeRemotionLicense />
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
    </div>
    {message && <div className="studio-message">{message}</div>}
  </section>
}
