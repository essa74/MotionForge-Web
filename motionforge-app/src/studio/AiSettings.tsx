import { useState } from 'react'
import { IMAGE_MODELS, PROVIDERS, askAi, clearAi, loadAi, saveAi, type AiSettings as Settings, type Provider } from '../ai'

export default function AiSettings({ onClose, onChange }: { onClose: () => void; onChange: () => void }) {
  const saved = loadAi()
  const [provider, setProvider] = useState<Provider>(saved?.provider || 'gemini')
  const [key, setKey] = useState(saved?.key || '')
  const [model, setModel] = useState(saved?.model || '')
  const [baseUrl, setBaseUrl] = useState(saved?.baseUrl || '')
  const [imageModel, setImageModel] = useState(saved?.imageModel || '')
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const info = PROVIDERS[provider]
  const current = (): Settings => ({ provider, key: key.trim(), model: model.trim(), baseUrl: baseUrl.trim(), imageModel: imageModel.trim() })

  async function test() {
    if (!key.trim()) return setStatus('الصق المفتاح الأول.')
    setBusy(true); setStatus('بجرّب المفتاح…')
    try { await askAi(current(), [{ role: 'user', content: 'رد بكلمة واحدة: تمام' }]); setStatus('✓ المفتاح شغّال.') }
    catch (e) { setStatus((e as Error).message) } finally { setBusy(false) }
  }
  function save() {
    if (!key.trim()) return setStatus('الصق المفتاح الأول.')
    saveAi(current()); onChange(); onClose()
  }
  function remove() { clearAi(); setKey(''); onChange(); setStatus('اتمسح المفتاح من المتصفح.') }

  return <div className="studio-sheet-layer" onClick={onClose}>
    <div className="studio-sheet" role="dialog" aria-label="مفتاح الذكاء الاصطناعي" onClick={e => e.stopPropagation()}>
      <div className="studio-sheet-grip" />
      <h3>مفتاح الذكاء الاصطناعي</h3>
      <small>المفتاح بيتحفظ في متصفحك بس، والطلبات بتروح من جهازك مباشرة للمزوّد.</small>
      <select value={provider} onChange={e => setProvider(e.target.value as Provider)}>
        {(Object.keys(PROVIDERS) as Provider[]).map(p => <option key={p} value={p}>{PROVIDERS[p].label}</option>)}
      </select>
      <small>{info.hint}{info.link && <> — <a href={info.link} target="_blank" rel="noreferrer">افتح الرابط</a></>}</small>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={{ flex: 1, direction: 'ltr' }} type={show ? 'text' : 'password'} placeholder="API key" value={key} onChange={e => setKey(e.target.value)} autoComplete="off" />
        <button onClick={() => setShow(!show)}>{show ? 'إخفاء' : 'إظهار'}</button>
      </div>
      {provider === 'custom' && <input style={{ direction: 'ltr' }} placeholder="https://.../v1" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />}
      <input style={{ direction: 'ltr' }} placeholder={`الموديل (الافتراضي: ${info.model || 'مطلوب'})`} value={model} onChange={e => setModel(e.target.value)} />
      {(provider === 'gemini' || provider === 'openai' || provider === 'custom') && <input style={{ direction: 'ltr' }} placeholder={`موديل الصور (الافتراضي: ${IMAGE_MODELS[provider] || 'مطلوب'})`} value={imageModel} onChange={e => setImageModel(e.target.value)} />}
      {status && <small>{status}</small>}
      <button disabled={busy} onClick={() => void test()}>جرّب المفتاح</button>
      <button className="primary" onClick={save}>حفظ</button>
      {saved && <button className="danger" onClick={remove}>مسح المفتاح</button>}
      <button onClick={onClose}>إغلاق</button>
    </div>
  </div>
}
