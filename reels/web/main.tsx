import {useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {canRenderMediaOnWeb, renderMediaOnWeb} from '@remotion/web-renderer';
import {FORMATS, type Format} from '../src/lib/theme';
import {BrowserTest} from './BrowserTest';
import {loadFonts} from './fonts';

const FPS = 30;
const MAX_SECONDS = 180;

type Result = {url: string; sizeMb: number; renderSeconds: number; videoSeconds: number; speed: number};

const css = `
  :root { color-scheme: light; font-family: system-ui, "Segoe UI", Tahoma, sans-serif; }
  body { margin: 0; background: #f1f5f2; color: #0f172a; }
  main { max-width: 560px; margin: 0 auto; padding: 18px 16px 48px; }
  h1 { font-size: 22px; margin: 4px 0 6px; }
  p.sub { margin: 0 0 16px; color: #475569; font-size: 15px; line-height: 1.6; }
  .card { background: #fff; border: 1px solid #d9e2dc; border-radius: 14px; padding: 14px; margin-bottom: 12px; }
  label { display: block; font-size: 14px; color: #334155; margin-bottom: 6px; font-weight: 600; }
  select, input[type=file] { width: 100%; font-size: 16px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 10px; background: #fff; box-sizing: border-box; }
  button { width: 100%; font-size: 17px; font-weight: 700; padding: 14px; border: 0; border-radius: 12px; background: #217346; color: #fff; }
  button.secondary { background: #e2e8f0; color: #0f172a; margin-top: 8px; }
  button:disabled { opacity: .5; }
  .bar { height: 12px; background: #e2e8f0; border-radius: 99px; overflow: hidden; margin: 10px 0 6px; }
  .bar > i { display: block; height: 100%; background: #217346; transition: width .2s; }
  .row { display: flex; justify-content: space-between; font-size: 14px; color: #334155; margin: 3px 0; }
  .ok { color: #166534; font-weight: 700; } .bad { color: #b91c1c; font-weight: 700; }
  video { width: 100%; border-radius: 10px; background: #000; max-height: 70vh; }
  pre { white-space: pre-wrap; direction: ltr; text-align: left; font-size: 13px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; margin: 8px 0 0; }
`;

function App() {
  const [format, setFormat] = useState<Format>('vertical');
  const [seconds, setSeconds] = useState(30);
  const [voice, setVoice] = useState<{url: string; name: string; seconds: number} | null>(null);
  const [support, setSupport] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({encoded: 0, total: 0, elapsed: 0});
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const stage = useRef('');

  const totalSeconds = voice ? Math.min(voice.seconds, MAX_SECONDS) : seconds;

  async function pickVoice(file: File | undefined) {
    setResult(null);
    if (!file) return setVoice(null);
    const url = URL.createObjectURL(file);
    const probe = new Audio(url);
    await new Promise<void>((resolve) => {
      probe.addEventListener('loadedmetadata', () => resolve(), {once: true});
      probe.addEventListener('error', () => resolve(), {once: true});
    });
    if (!Number.isFinite(probe.duration)) {
      setError('تعذّر قراءة الملف الصوتي. جرّب ملف mp3 أو m4a.');
      return setVoice(null);
    }
    setError('');
    setVoice({url, name: file.name, seconds: probe.duration});
  }

  async function start() {
    setError('');
    setResult(null);
    setProgress(0);
    setRunning(true);
    const controller = new AbortController();
    abort.current = controller;
    const {width, height} = FORMATS[format];
    const frames = Math.max(1, Math.ceil(totalSeconds * FPS));
    setStats({encoded: 0, total: frames, elapsed: 0});
    const t0 = performance.now();
    try {
      try {
        const lock = await (navigator as Navigator & {wakeLock?: {request: (t: string) => Promise<unknown>}}).wakeLock?.request('screen');
        void lock;
      } catch {
        /* optional */
      }
      stage.current = 'fonts';
      await loadFonts();
      stage.current = 'check';
      const check = await canRenderMediaOnWeb({container: 'mp4', videoCodec: 'h264', width, height});
      if (!check.canRender) {
        throw new Error('المتصفح لا يدعم الرندر: ' + check.issues.map((i) => i.message).join(' | '));
      }
      stage.current = 'render';
      const {getBlob} = await renderMediaOnWeb({
        composition: {
          id: 'BrowserTest',
          component: BrowserTest,
          durationInFrames: frames,
          fps: FPS,
          width,
          height,
        },
        inputProps: {voiceOver: voice?.url},
        container: 'mp4',
        videoCodec: 'h264',
        videoBitrate: 'high',
        licenseKey: 'free-license',
        muted: !voice,
        signal: controller.signal,
        logLevel: 'warn',
        onProgress: (p) => {
          setProgress(p.progress);
          setStats({encoded: p.encodedFrames, total: frames, elapsed: (performance.now() - t0) / 1000});
        },
      });
      stage.current = 'blob';
      const blob = await getBlob();
      const renderSeconds = (performance.now() - t0) / 1000;
      setResult({
        url: URL.createObjectURL(blob),
        sizeMb: blob.size / 1e6,
        renderSeconds,
        videoSeconds: totalSeconds,
        speed: totalSeconds / renderSeconds,
      });
      setProgress(1);
    } catch (e) {
      setError(controller.signal.aborted ? 'تم الإيقاف.' : 'المرحلة: ' + stage.current + ' | ' + String((e as Error)?.message || e) + ' | ' + String((e as Error)?.stack || '').split('\n').slice(0, 4).join(' / '));
    } finally {
      setRunning(false);
    }
  }

  async function checkSupport() {
    const {width, height} = FORMATS[format];
    const c = await canRenderMediaOnWeb({container: 'mp4', videoCodec: 'h264', width, height});
    setSupport(c.canRender ? 'المتصفح يدعم الرندر' : 'غير مدعوم: ' + c.issues.map((i) => i.message).join(' | '));
  }

  const report = result
    ? [
        `format=${format} (${FORMATS[format].width}x${FORMATS[format].height}) fps=${FPS}`,
        `video=${result.videoSeconds.toFixed(1)}s audio=${voice ? 'yes' : 'no'}`,
        `render=${result.renderSeconds.toFixed(1)}s speed=${result.speed.toFixed(2)}x realtime size=${result.sizeMb.toFixed(1)}MB`,
        `cores=${navigator.hardwareConcurrency} mem=${(navigator as Navigator & {deviceMemory?: number}).deviceMemory ?? '?'}GB`,
        navigator.userAgent,
      ].join('\n')
    : '';

  return (
    <main>
      <style>{css}</style>
      <h1>اختبار الرندر في المتصفح</h1>
      <p className="sub">
        بيعمل فيديو MP4 كامل من جهازك، من غير سيرفر ولا تكلفة. سيب الشاشة مفتوحة والتبويب ظاهر لحد ما يخلص.
      </p>

      <div className="card">
        <label>المقاس</label>
        <select value={format} onChange={(e) => setFormat(e.target.value as Format)} disabled={running}>
          <option value="vertical">طولي 9:16 (1080×1920)</option>
          <option value="horizontal">عرضي 16:9 (1920×1080)</option>
          <option value="square">مربع (1080×1080)</option>
        </select>
        <div style={{height: 12}} />
        <label>صوت (اختياري)، طول الفيديو هيتبع الصوت</label>
        <input type="file" accept="audio/*" disabled={running} onChange={(e) => void pickVoice(e.target.files?.[0])} />
        {voice && (
          <div className="row">
            <span>{voice.name}</span>
            <span>{voice.seconds.toFixed(1)} ث</span>
          </div>
        )}
        {!voice && (
          <>
            <div style={{height: 12}} />
            <label>مدة الفيديو</label>
            <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} disabled={running}>
              <option value={10}>10 ثواني</option>
              <option value={30}>30 ثانية</option>
              <option value={60}>60 ثانية</option>
              <option value={120}>دقيقتين</option>
              <option value={180}>3 دقايق</option>
            </select>
          </>
        )}
      </div>

      <button onClick={() => void start()} disabled={running}>
        {running ? 'جارٍ الرندر…' : `ابدأ الاختبار (${totalSeconds.toFixed(0)} ث)`}
      </button>
      {running ? (
        <button className="secondary" onClick={() => abort.current?.abort()}>إيقاف</button>
      ) : (
        <button className="secondary" onClick={() => void checkSupport()}>فحص دعم المتصفح فقط</button>
      )}
      {support && <p className="sub" style={{marginTop: 10}}>{support}</p>}

      {(running || progress > 0) && (
        <div className="card" style={{marginTop: 12}}>
          <div className="bar"><i style={{width: `${Math.round(progress * 100)}%`}} /></div>
          <div className="row"><span>التقدم</span><span>{Math.round(progress * 100)}%</span></div>
          <div className="row"><span>الإطارات</span><span>{stats.encoded} / {stats.total}</span></div>
          <div className="row"><span>الوقت</span><span>{stats.elapsed.toFixed(0)} ث</span></div>
        </div>
      )}

      {error && <div className="card bad" style={{marginTop: 12}}>{error}</div>}

      {result && (
        <div className="card" style={{marginTop: 12}}>
          <div className="ok">تم الرندر ✔</div>
          <div className="row"><span>وقت الرندر</span><span>{result.renderSeconds.toFixed(1)} ث</span></div>
          <div className="row"><span>السرعة</span><span>{result.speed.toFixed(2)}× من الوقت الحقيقي</span></div>
          <div className="row"><span>الحجم</span><span>{result.sizeMb.toFixed(1)} MB</span></div>
          <video src={result.url} controls playsInline style={{marginTop: 10}} />
          <p className="sub" style={{margin: '8px 0 0'}}>اضغط مطولًا على الفيديو للحفظ لو الخيار ظهر.</p>
          <pre>{report}</pre>
          <button
            className="secondary"
            onClick={() => {
              navigator.clipboard.writeText(report).then(() => setCopied(true)).catch(() => setCopied(false));
            }}
          >
            {copied ? 'اتنسخ' : 'انسخ النتيجة وابعتها لي'}
          </button>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
