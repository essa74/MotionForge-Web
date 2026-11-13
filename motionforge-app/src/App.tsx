import { createElement, useEffect, useRef, useState } from 'react'
import './App.css'
import type { ProjectAsset, VideoProject } from './engine/projectTypes'
import { createProject, getAllProjects, updateProject } from './engine/projectStore'
import { saveProjectFiles, getProjectFiles } from './engine/assetStore'


function renderMarkdown(source: string) {
  const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  const inline = (value: string) => escapeHtml(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  const lines = source.replace(/\r/g, '').split('\n')
  const blocks: string[] = []
  let paragraph: string[] = []
  let list: 'ul' | 'ol' | null = null
  let code: string[] | null = null
  const flushParagraph = () => {
    if (paragraph.length) { blocks.push('<p>' + paragraph.map(inline).join('<br>') + '</p>'); paragraph = [] }
  }
  const closeList = () => { if (list) { blocks.push('</' + list + '>'); list = null } }
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      flushParagraph(); closeList()
      if (code) { blocks.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>'); code = null }
      else code = []
      continue
    }
    if (code) { code.push(line); continue }
    const heading = line.match(/^\s{0,3}(#{1,3})\s+(.+)$/)
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/)
    if (heading) { flushParagraph(); closeList(); const level = Math.min(heading[1].length + 2, 5); blocks.push('<h' + level + '>' + inline(heading[2]) + '</h' + level + '>'); continue }
    if (bullet || numbered) {
      flushParagraph(); const kind = bullet ? 'ul' : 'ol'
      if (list !== kind) { closeList(); list = kind; blocks.push('<' + list + '>') }
      blocks.push('<li>' + inline((bullet || numbered)![1]) + '</li>'); continue
    }
    if (!line.trim()) { flushParagraph(); closeList(); continue }
    paragraph.push(line)
  }
  if (code) blocks.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>')
  flushParagraph(); closeList()
  return { __html: blocks.join('') }
}

function MarkdownMessage({ text }: { text: string }) {
  return createElement('div', { className: 'markdown-content', dangerouslySetInnerHTML: renderMarkdown(text) })
}

type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string; files?: string[]; at: string }
type AuthUser = { email: string; display_name?: string | null; avatar_url?: string | null }
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://essa-studio-ai-api.onrender.com'
const chatKey = (id: string) => `motionforge_chat_${id}`

export default function App() {
  const [projects, setProjects] = useState<VideoProject[]>([])
  const [project, setProject] = useState<VideoProject | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [assets, setAssets] = useState<Array<ProjectAsset & { url: string }>>([])
  const [busy, setBusy] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [storageStatus, setStorageStatus] = useState('جارٍ فحص حماية التخزين...')
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => { setProjects(getAllProjects()) }, [])
  useEffect(() => {
    let active = true
    const params = new URLSearchParams(window.location.search)
    const authResult = params.get('auth')
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const incomingToken = hashParams.get('access_token')
    if (incomingToken) localStorage.setItem('essa_studio_access_token', incomingToken)
    if (authResult === 'error') setNotice('تعذر تسجيل الدخول إلى Google. حاول مرة أخرى.')
    if (authResult) params.delete('auth')
    if (authResult || incomingToken) {
      const query = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''))
    }
    const savedToken = localStorage.getItem('essa_studio_access_token')
    fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      credentials: 'include',
      headers: savedToken ? { Authorization: `Bearer ${savedToken}` } : {},
    })
      .then(async response => {
        if (!response.ok) return null
        return await response.json() as AuthUser
      })
      .then(user => { if (active) setAuthUser(user) })
      .catch(() => { if (active) setAuthUser(null) })
      .finally(() => { if (active) setAuthLoading(false) })
    return () => { active = false }
  }, [])

  function startGoogleLogin() {
    window.location.assign(`${API_BASE_URL}/api/v1/auth/google`)
  }

  async function logout() {
    try {
      await fetch(`${API_BASE_URL}/api/v1/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: localStorage.getItem('essa_studio_access_token')
          ? { Authorization: `Bearer ${localStorage.getItem('essa_studio_access_token')}` }
          : {},
      })
    } finally {
      localStorage.removeItem('essa_studio_access_token')
      setAuthUser(null)
      setNotice('تم تسجيل الخروج.')
    }
  }
  useEffect(() => {
    let active = true
    async function protectStorage() {
      try {
        if (!navigator.storage?.persist) {
          if (active) setStorageStatus('الحفظ محلي؛ المتصفح لا يدعم طلب الحماية')
          return
        }
        const alreadyProtected = await navigator.storage.persisted()
        const protectedNow = alreadyProtected || await navigator.storage.persist()
        if (active) setStorageStatus(protectedNow ? 'التخزين محمي من الحذف التلقائي' : 'الحفظ محلي؛ لم يمنح المتصفح حماية إضافية')
      } catch {
        if (active) setStorageStatus('الحفظ محلي؛ تعذر تأكيد حماية التخزين')
      }
    }
    void protectStorage()
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!project) { setMessages([]); setAssets([]); return }
    try { setMessages(JSON.parse(localStorage.getItem(chatKey(project.id)) || '[]')) }
    catch { setMessages([]) }
    let live = true
    getProjectFiles(project.id).then(items => { if (live) setAssets(items); else items.forEach(x => URL.revokeObjectURL(x.url)) })
      .catch(() => setAssets([]))
    return () => { live = false; assets.forEach(x => URL.revokeObjectURL(x.url)) }
  }, [project?.id])
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, busy])

  function saveMessages(next: ChatMessage[]) {
    setMessages(next)
    if (project) localStorage.setItem(chatKey(project.id), JSON.stringify(next))
  }

  async function send() {
    const text = draft.trim()
    if ((!text && files.length === 0) || busy) return
    setBusy(true); setNotice('')
    try {
      let current = project
      if (!current) {
        if (!text) throw new Error('اكتب فكرة الفيديو أولاً.')
        current = createProject({ name: text.slice(0, 48), idea: text, script: '', category: 'auto', format: 'vertical' })
        setProject(current)
        setProjects(getAllProjects())
      }
      const saved = await saveProjectFiles(current.id, files.map(file => ({
        file,
        type: file.type.startsWith('audio/') ? 'audio' as const : file.type.startsWith('video/') ? 'video' as const : 'image' as const
      })))
      const updated = saved.length ? updateProject(current.id, { assets: [...current.assets, ...saved] }) : current
      if (updated) { current = updated; setProject(updated); setProjects(getAllProjects()) }
      const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', text, files: files.map(f => f.name), at: new Date().toISOString() }
      const next = [...(project ? messages : []), userMessage]
      setMessages(next)
      localStorage.setItem(chatKey(current.id), JSON.stringify(next))
      setDraft(''); setFiles([])
      if (picker.current) picker.current.value = ''
      const savedToken = localStorage.getItem('essa_studio_access_token')
      if (!savedToken) throw new Error('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.')
      const history = [...(project ? messages : []), userMessage]
        .slice(-20)
        .map(message => ({ role: message.role, content: message.text || (message.files?.length ? `أرفقت الملفات التالية: ${message.files.join('، ')}` : '') }))
        .filter(message => message.content.trim())
      const controller = new AbortController()
      const requestTimeout = window.setTimeout(() => controller.abort(), 90000)
      let aiResponse: Response
      try {
        aiResponse = await fetch(`${API_BASE_URL}/api/v1/chat/reply`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${savedToken}`,
        },
        body: JSON.stringify({ messages: history }),
        })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw new Error('الرد اتأخر أكثر من 90 ثانية. جرّب إرسال الرسالة مرة أخرى.')
        throw new Error('حصلت مشكلة في الاتصال بالخادم. تأكد من الإنترنت وحاول مرة أخرى.')
      } finally { window.clearTimeout(requestTimeout) }
      const aiData = await aiResponse.json().catch(() => ({}))
      if (!aiResponse.ok) throw new Error(aiData.detail || 'تعذر الحصول على رد من المساعد.')
      const reply: ChatMessage = {
        id: crypto.randomUUID(), role: 'assistant',
        text: aiData.reply,
        at: new Date().toISOString()
      }
      const completed = [...next, reply]
      setMessages(completed); localStorage.setItem(chatKey(current.id), JSON.stringify(completed))
      const touched = updateProject(current.id, { updatedAt: new Date().toISOString() })
      if (touched) setProjects(getAllProjects())
      const fresh = await getProjectFiles(current.id); setAssets(fresh)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'حصل خطأ أثناء حفظ الرسالة.')
    } finally { setBusy(false) }
  }

  function openProject(item: VideoProject) { setProject(item); setNotice(''); setSidebarOpen(false) }
  function newChat() { setProject(null); setMessages([]); setAssets([]); setDraft(''); setFiles([]); setNotice(''); setSidebarOpen(false) }
  const visibleProjects = [...projects]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .filter(item => item.name.toLocaleLowerCase('ar').includes(historySearch.trim().toLocaleLowerCase('ar')))

  return <main className="chat-app" dir="rtl">
    <header className="chat-top">
      <button className="sidebar-toggle" onClick={() => setSidebarOpen(value => !value)} aria-label="فتح قائمة المحادثات">☰</button>
      <div className="chat-brand"><span className="chat-logo">E</span><div><b>EssaStudio AI</b><small>استوديو إنتاج الفيديو</small></div></div>
    </header>
    <div className="chat-layout">
      <section className="chat-main">
        {!project && messages.length === 0 ? <div className="chat-welcome">
          <div className="welcome-mark">E</div>
          <h1>{authUser ? `أهلاً بيك، ${authUser.display_name || authUser.email.split('@')[0]}` : 'إيه اللي حابب نشتغل عليه؟'}</h1>
          <p>اكتب فكرتك، أو ارفع ملفاتك، وهنشتغل عليها مع بعض خطوة بخطوة.</p>
          <div className="welcome-suggestions">
            <button onClick={() => setDraft('عايز أعمل فيديو قصير من فكرة جديدة')}>🎬 إنشاء فيديو من فكرة</button>
            <button onClick={() => setDraft('عايز أكتب سيناريو وبرومبت لفيديو')}>✍️ كتابة سيناريو وبرومبت</button>
            <button onClick={() => setDraft('عايز أجهز فيديو من ملفات وصور عندي')}>🖼️ العمل على ملفات وصور</button>
          </div>
        </div> : <div className="chat-thread">
          {messages.map(m => <article key={m.id} className={m.role === 'user' ? 'message-group user-message-group' : 'message-group assistant-message-group'}>
            <div className={m.role === 'user' ? 'bubble user-bubble' : 'bubble assistant-bubble'}>
              {m.text && <MarkdownMessage text={m.text} />}
              {m.files?.length ? <div className="bubble-files">📎 {m.files.join('، ')}</div> : null}
            </div>
            <div className="message-tools">
              <button type="button" className="message-copy-button" onClick={async () => {
                const content = [m.text, ...(m.files?.length ? [`المرفقات: ${m.files.join('، ')}`] : [])].filter(Boolean).join('\n');
                try {
                  await navigator.clipboard.writeText(content);
                  setCopiedMessageId(m.id);
                  window.setTimeout(() => setCopiedMessageId(current => current === m.id ? null : current), 1600);
                } catch {
                  setNotice('تعذر النسخ تلقائياً. حاول تحديد النص ونسخه يدوياً.');
                }
              }} aria-label="نسخ الرسالة" title="نسخ الرسالة">
                {copiedMessageId === m.id ? '✓ تم النسخ' : 'نسخ'}
              </button>
            </div>
          </article>)}
          {busy && <article className="bubble assistant-bubble typing-bubble"><p>بفكر في طلبك وبجهز الرد... <span className="typing-dots">•••</span></p></article>}
          {notice && <div className="chat-notice">{notice}</div>}
          {assets.length > 0 && <div className="asset-strip">{assets.map(a => <span key={a.id}>📎 {a.name}</span>)}</div>}
          <div ref={bottom} />
        </div>}
        <div className="composer-wrap">
        <div className="composer">
          {files.length > 0 && <div className="pending-files">{files.map((f, i) => <span key={i}>📎 {f.name} <button onClick={() => setFiles(old => old.filter((_, n) => n !== i))}>×</button></span>)}</div>}
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3}
            placeholder={project ? 'اكتب التعديل أو التعليمات الجديدة...' : 'اكتب فكرة الفيديو والبرومبت الكامل هنا...'}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }} />
          <div className="composer-actions">
            <input ref={picker} type="file" multiple accept="audio/*,image/*,video/*,.pdf,.txt,.doc,.docx" hidden onChange={e => setFiles(old => [...old, ...Array.from(e.target.files || [])])} />
            <div className="composer-tools">
              <button className="attach-button" onClick={() => picker.current?.click()} aria-label="إرفاق ملفات" title="إرفاق ملفات">＋</button>
              <span className="attachment-types">الصور · الفيديو · الصوت · المستندات</span>
            </div>
            <button className="send-button" onClick={() => void send()} disabled={busy || (!draft.trim() && files.length === 0)} aria-label={busy ? 'جارٍ الإرسال' : 'إرسال'} title="إرسال">
              {busy ? <span className="send-loading">…</span> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg>}
            </button>
          </div>
        </div>
        <div className="composer-disclaimer">EssaStudio AI قد يخطئ. راجع النتائج قبل استخدامها.</div>
        </div>
      </section>
      <aside className={`chat-sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-heading"><b>مساحة العمل</b><button onClick={() => setSidebarOpen(false)} aria-label="إغلاق القائمة">×</button></div>
        <button className="sidebar-new-chat" onClick={newChat}>＋ محادثة جديدة</button>
        <label className="history-search">
          <span>⌕</span>
          <input value={historySearch} onChange={event => setHistorySearch(event.target.value)} placeholder="ابحث في المحادثات" />
        </label>
        <div className="history-label">الأخيرة</div>
        <div className="history-list">
          {visibleProjects.length ? visibleProjects.map(p => <button key={p.id} className={`project-choice ${project?.id === p.id ? 'active' : ''}`} onClick={() => openProject(p)}>
            <span className="history-chat-icon">◷</span>
            <span className="history-chat-copy"><b>{p.name}</b><small>{new Date(p.updatedAt).toLocaleDateString('ar-EG')}</small></span>
          </button>) : <p className="history-empty">{historySearch ? 'لا توجد محادثات مطابقة.' : 'محادثاتك الجديدة هتظهر هنا.'}</p>}
        </div>
        <div className="sidebar-bottom">
          {authUser ? <>
            <div className="sidebar-profile">
              {authUser.avatar_url
                ? <img className="sidebar-profile-avatar" src={authUser.avatar_url} alt="" referrerPolicy="no-referrer" />
                : <span className="sidebar-profile-avatar sidebar-profile-fallback">{(authUser.display_name || authUser.email).trim().charAt(0).toUpperCase()}</span>}
              <span className="sidebar-account">{authUser.display_name || authUser.email}</span>
            </div>
            <button className="sidebar-logout" onClick={() => void logout()}>تسجيل الخروج</button>
          </> : <button onClick={startGoogleLogin}>تسجيل الدخول باستخدام Google</button>}
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="إغلاق القائمة" />}
    </div>

  </main>
}
