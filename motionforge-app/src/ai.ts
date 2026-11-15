// Bring-your-own-key AI layer: every user brings their own key; calls go straight from the browser.
export type Provider = 'gemini' | 'openai' | 'claude' | 'openrouter' | 'custom'
export type AiSettings = { provider: Provider; key: string; model: string; baseUrl: string; imageModel?: string }
export type AiMessage = { role: 'user' | 'assistant'; content: string }
export type AiImage = { mime_type: string; data: string }

export const PROVIDERS: Record<Provider, { label: string; model: string; hint: string; link?: string; steps: string[] }> = {
  gemini: { label: 'Google Gemini (مجاني)', model: 'gemini-3.5-flash-lite', hint: 'مفتاح مجاني من Google AI Studio', link: 'https://aistudio.google.com/apikey', steps: ['افتح الرابط وسجّل دخول بحساب Google.', 'اضغط «Create API key».', 'اختار مشروع موجود أو «Create API key in new project».', 'انسخ المفتاح والصقه هنا، واضغط «جرّب المفتاح» ثم «حفظ».', 'مجاني، وليه حد يومي للاستخدام.'] },
  openai: { label: 'OpenAI', model: 'gpt-5-mini', hint: 'مفتاح من platform.openai.com', link: 'https://platform.openai.com/api-keys', steps: ['افتح الرابط وسجّل دخول.', 'اضغط «Create new secret key» وسمّيه.', 'انسخ المفتاح فوراً (مش هيظهر تاني).', 'الصقه هنا واضغط «جرّب المفتاح» ثم «حفظ».', 'مدفوع: لازم تشحن رصيد في حسابك الأول.'] },
  claude: { label: 'Claude (Anthropic)', model: 'claude-haiku-5-5', hint: 'مفتاح من console.anthropic.com', link: 'https://console.anthropic.com/settings/keys', steps: ['افتح الرابط وسجّل دخول.', 'اضغط «Create Key» وسمّيه.', 'انسخ المفتاح فوراً (مش هيظهر تاني).', 'الصقه هنا واضغط «جرّب المفتاح» ثم «حفظ».', 'مدفوع: لازم تضيف رصيد (Credits) في حسابك.'] },
  openrouter: { label: 'OpenRouter', model: 'google/gemini-2.5-flash', hint: 'مفتاح واحد لموديلات كتير', link: 'https://openrouter.ai/keys', steps: ['افتح الرابط وسجّل دخول.', 'اضغط «Create Key» وسمّيه.', 'انسخ المفتاح والصقه هنا.', 'اكتب اسم الموديل اللي عايزه (مثلاً google/gemini-2.5-flash).', 'فيه موديلات مجانية وموديلات مدفوعة حسب الاختيار.'] },
  custom: { label: 'مزوّد آخر (متوافق مع OpenAI)', model: '', hint: 'اكتب عنوان الـ API واسم الموديل', steps: ['هات من المزوّد: مفتاح الـ API وعنوان الـ API (ينتهي غالباً بـ /v1) واسم الموديل.', 'اكتبهم في الخانات تحت، واضغط «جرّب المفتاح».', 'لازم المزوّد يدعم صيغة OpenAI ويسمح بالاتصال من المتصفح.'] },
}

const STORE = 'essa_studio_ai'
export function loadAi(): AiSettings | null {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || 'null')
    return v && v.key ? { provider: v.provider || 'gemini', key: v.key, model: v.model || '', baseUrl: v.baseUrl || '', imageModel: v.imageModel || '' } : null
  } catch { return null }
}
export function saveAi(s: AiSettings) { localStorage.setItem(STORE, JSON.stringify(s)) }
export function clearAi() { localStorage.removeItem(STORE) }

function httpError(status: number, body: unknown): Error {
  const detail = (body as { error?: { message?: string } })?.error?.message
  if (status === 401 || status === 403) return new Error('المفتاح مرفوض. تأكد إنه صحيح وفعّال.')
  if (status === 429) return new Error('وصلت للحد المسموح لمفتاحك حالياً. استنى شوية وجرّب تاني.')
  return new Error(detail ? `خطأ من المزوّد: ${detail}` : `تعذر الحصول على رد (${status}).`)
}

export async function askAi(s: AiSettings, messages: AiMessage[], opts: { signal?: AbortSignal; images?: AiImage[] } = {}): Promise<string> {
  const model = s.model.trim() || PROVIDERS[s.provider].model
  const images = opts.images || []
  const last = messages.length - 1
  let url: string, headers: Record<string, string> = { 'Content-Type': 'application/json' }, body: unknown
  if (s.provider === 'gemini') {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
    headers['x-goog-api-key'] = s.key
    body = { contents: messages.map((m, i) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }, ...(i === last ? images.map(im => ({ inline_data: { mime_type: im.mime_type, data: im.data } })) : [])] })) }
  } else if (s.provider === 'claude') {
    url = 'https://api.anthropic.com/v1/messages'
    headers = { ...headers, 'x-api-key': s.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }
    body = { model, max_tokens: 8000, messages: messages.map((m, i) => ({ role: m.role, content: i === last && images.length ? [...images.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.mime_type, data: im.data } })), { type: 'text', text: m.content }] : m.content })) }
  } else {
    const base = s.provider === 'openai' ? 'https://api.openai.com/v1' : s.provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : s.baseUrl.trim().replace(/\/+$/, '')
    if (!base) throw new Error('اكتب عنوان الـ API للمزوّد.')
    if (!model) throw new Error('اكتب اسم الموديل.')
    url = `${base}/chat/completions`
    headers.Authorization = `Bearer ${s.key}`
    body = { model, messages: messages.map((m, i) => ({ role: m.role, content: i === last && images.length ? [{ type: 'text', text: m.content }, ...images.map(im => ({ type: 'image_url', image_url: { url: `data:${im.mime_type};base64,${im.data}` } }))] : m.content })) }
  }
  let res: Response
  try { res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: opts.signal }) }
  catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new Error('تعذر الاتصال بالمزوّد. تأكد من الإنترنت (وبعض المزوّدين لا يسمحون بالاتصال من المتصفح).')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw httpError(res.status, data)
  const d = data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; content?: Array<{ text?: string }>; choices?: Array<{ message?: { content?: string } }> }
  const text = s.provider === 'gemini' ? d.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('')
    : s.provider === 'claude' ? d.content?.map(p => p.text || '').join('')
    : d.choices?.[0]?.message?.content
  if (!text) throw new Error('المزوّد رد برد فاضي. جرّب تاني.')
  return text
}

export const IMAGE_MODELS: Partial<Record<Provider, string>> = { gemini: 'gemini-2.5-flash-image', openai: 'gpt-image-1' }

/** Generates one picture with the user's own key. Many keys/plans do not allow it: the provider's message is passed on. */
export async function generateImage(s: AiSettings, prompt: string, opts: { signal?: AbortSignal; shape?: 'vertical' | 'horizontal' | 'square' } = {}): Promise<{ mime: string; data: string }> {
  const model = (s.imageModel || '').trim() || IMAGE_MODELS[s.provider] || ''
  if (s.provider === 'claude' || s.provider === 'openrouter') throw new Error('المزوّد ده مش مدعوم لتوليد الصور هنا. استخدم Gemini أو OpenAI.')
  if (!model) throw new Error('اكتب اسم موديل الصور في إعدادات المفتاح.')
  let url: string, headers: Record<string, string> = { 'Content-Type': 'application/json' }, body: unknown
  if (s.provider === 'gemini') {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
    headers['x-goog-api-key'] = s.key
    body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }
  } else {
    const base = s.provider === 'openai' ? 'https://api.openai.com/v1' : s.baseUrl.trim().replace(/\/+$/, '')
    if (!base) throw new Error('اكتب عنوان الـ API للمزوّد.')
    url = `${base}/images/generations`
    headers.Authorization = `Bearer ${s.key}`
    body = { model, prompt, size: opts.shape === 'horizontal' ? '1536x1024' : opts.shape === 'square' ? '1024x1024' : '1024x1536' }
  }
  let res: Response
  try { res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: opts.signal }) }
  catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new Error('تعذر الاتصال بالمزوّد.')
  }
  const data = await res.json().catch(() => ({})) as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } }> } }>; data?: Array<{ b64_json?: string }>; error?: { message?: string } }
  if (!res.ok) {
    const detail = data.error?.message
    if (res.status === 401 || res.status === 403) throw new Error(`المفتاح مش مسموح له بتوليد الصور${detail ? ': ' + detail : '.'}`)
    if (res.status === 429) throw new Error(`وصلت للحد المسموح لتوليد الصور على مفتاحك${detail ? ': ' + detail : '.'}`)
    throw new Error(detail ? `رفض المزوّد توليد الصورة: ${detail}` : `تعذر توليد الصورة (${res.status}).`)
  }
  if (s.provider === 'gemini') {
    for (const p of data.candidates?.[0]?.content?.parts ?? []) {
      const img = p.inlineData ?? (p.inline_data ? { mimeType: p.inline_data.mime_type, data: p.inline_data.data } : undefined)
      if (img?.data) return { mime: img.mimeType || 'image/png', data: img.data }
    }
    throw new Error('الموديل ما رجّعش صورة (ممكن الوصف اترفض). جرّب وصف تاني.')
  }
  const b64 = data.data?.[0]?.b64_json
  if (!b64) throw new Error('المزوّد ما رجّعش صورة.')
  return { mime: 'image/png', data: b64 }
}
