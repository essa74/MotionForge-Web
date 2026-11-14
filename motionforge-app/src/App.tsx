import { createElement, lazy, Suspense, useEffect, useRef, useState } from 'react'
import './App.css'
import type { ProjectAsset, VideoProject } from './engine/projectTypes'
import { createProject, getAllProjects, updateProject, deleteProject } from './engine/projectStore'
import { saveProjectFiles, getProjectFiles, deleteProjectFiles } from './engine/assetStore'


// The video studio pulls in the whole render engine, so it is only loaded when opened.
const Studio = lazy(() => import('./studio/Studio'))

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

type ChatAttachment = { id: string; name: string; type: 'image' | 'video' | 'audio' | 'document'; mimeType: string }
type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string; files?: Array<ChatAttachment | string>; at: string }

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`تعذر قراءة الملف ${file.name}.`))
    reader.onload = () => {
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      if (comma < 0) reject(new Error(`تعذر تجهيز الملف ${file.name}.`))
      else resolve(result.slice(comma + 1))
    }
    reader.readAsDataURL(file)
  })
}

function attachmentName(file: ChatAttachment | string): string {
  return typeof file === 'string' ? file : file.name
}
type AuthUser = { email: string; display_name?: string | null; avatar_url?: string | null }
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://essa-studio-ai-api.onrender.com'
const chatKey = (id: string) => `motionforge_chat_${id}`

export default function App() {
  const [projects, setProjects] = useState<VideoProject[]>([])
  const [project, setProject] = useState<VideoProject | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [pendingPreviews, setPendingPreviews] = useState<Array<{ file: File; url: string }>>([])
  const [assets, setAssets] = useState<Array<ProjectAsset & { url: string }>>([])
  const [busy, setBusy] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [, setStorageStatus] = useState('جارٍ فحص حماية التخزين...')
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [, setAuthLoading] = useState(true)
  const [agentBusy, setAgentBusy] = useState(false)
  const [agentResult, setAgentResult] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [historySearch, setHistorySearch] = useState('')
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('essa_studio_pinned_chats') || '[]') } catch { return [] } })
  const [view, setView] = useState<'chat' | 'studio'>('chat')
  const [theme, setTheme] = useState<'dark' | 'light'>(() => localStorage.getItem('essa_studio_theme') === 'light' ? 'light' : 'dark')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<VideoProject | null>(null)
  const [renameTarget, setRenameTarget] = useState<VideoProject | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
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
  useEffect(() => {
    const previews = files.filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'))
      .map(file => ({ file, url: URL.createObjectURL(file) }))
    setPendingPreviews(previews)
    return () => previews.forEach(item => URL.revokeObjectURL(item.url))
  }, [files])

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
      const uploadedFiles = [...files]
      const saved = await saveProjectFiles(current.id, uploadedFiles.map(file => ({
        file,
        type: file.type.startsWith('audio/') ? 'audio' as const : file.type.startsWith('video/') ? 'video' as const : file.type.startsWith('image/') ? 'image' as const : 'document' as const
      })))
      const messageFiles: ChatAttachment[] = saved.map((asset, index) => ({
        id: asset.id, name: asset.name, type: asset.type === 'logo' ? 'image' : asset.type, mimeType: asset.mimeType || uploadedFiles[index]?.type || 'application/octet-stream'
      }))
      const updated = saved.length ? updateProject(current.id, { assets: [...current.assets, ...saved] }) : current
      if (saved.length) {
        const freshAssets = await getProjectFiles(current.id)
        setAssets(freshAssets)
      }
      if (updated) { current = updated; setProject(updated); setProjects(getAllProjects()) }
      const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', text, files: messageFiles, at: new Date().toISOString() }
      const next = [...(project ? messages : []), userMessage]
      setMessages(next)
      localStorage.setItem(chatKey(current.id), JSON.stringify(next))
      setDraft(''); setFiles([])
      if (picker.current) picker.current.value = ''
      const savedToken = localStorage.getItem('essa_studio_access_token')
      if (!savedToken) throw new Error('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.')
      const history = [...(project ? messages : []), userMessage]
        .slice(-20)
        .map(message => ({ role: message.role, content: message.text || (message.files?.length ? `أرفقت الملفات التالية: ${message.files.map(attachmentName).join('، ')}` : '') }))
        .filter(message => message.content.trim())
      const imageAttachments = await Promise.all(uploadedFiles
        .filter(file => file.type.startsWith('image/'))
        .map(async file => ({ name: file.name, mime_type: file.type, data: await fileToBase64(file) })))
      const controller = new AbortController()
      const requestTimeout = window.setTimeout(() => controller.abort(), 180000)
      let aiResponse: Response
      try {
        aiResponse = await fetch(`${API_BASE_URL}/api/v1/chat/reply`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${savedToken}`,
        },
        body: JSON.stringify({ messages: history, attachments: imageAttachments }),
        })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw new Error('الرد اتأخر أكثر من 3 دقايق. جرّب إرسال الرسالة مرة أخرى.')
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

  async function runAgentWorkspaceTest() {
    if (agentBusy) return
    const token = localStorage.getItem('essa_studio_access_token')
    if (!token) { setNotice('سجّل الدخول إلى Google أولاً.'); return }
    setAgentBusy(true); setAgentResult('جارٍ إنشاء مساحة عمل...')
    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      const workspaceResponse = await fetch(`${API_BASE_URL}/api/v1/agent/workspaces`, {
        method: 'POST', headers, body: JSON.stringify({ name: 'EssaStudio Agent Test' })
      })
      const workspaceData = await workspaceResponse.json().catch(() => ({}))
      if (!workspaceResponse.ok) throw new Error(workspaceData.detail || 'تعذر إنشاء مساحة العمل.')
      localStorage.setItem('essa_studio_agent_workspace', workspaceData.workspace_id)
      setAgentResult('تم إنشاء مساحة العمل. جارٍ تجهيز مشروع Remotion...')
      const scaffoldResponse = await fetch(`${API_BASE_URL}/api/v1/agent/workspaces/${workspaceData.workspace_id}/scaffold/remotion`, {
        method: 'POST', headers, body: JSON.stringify({
          project_name: 'EssaStudioIntro', composition_id: 'EssaStudioIntro',
          title: 'EssaStudio AI', duration_seconds: 7, width: 1920, height: 1080, fps: 30
        })
      })
      const scaffoldData = await scaffoldResponse.json().catch(() => ({}))
      if (!scaffoldResponse.ok) throw new Error(scaffoldData.detail || 'تعذر إنشاء مشروع Remotion.')
      setAgentResult('تم إنشاء المشروع. جارٍ فحص الملفات وإمكانات بيئة التشغيل...')
      const preflightResponse = await fetch(`${API_BASE_URL}/api/v1/agent/workspaces/${workspaceData.workspace_id}/remotion/preflight`, {
        method: 'POST', headers
      })
      const preflight = await preflightResponse.json().catch(() => ({}))
      if (!preflightResponse.ok) throw new Error(preflight.detail || 'تعذر فحص مشروع Remotion.')
      const runtime = preflight.runtime || {}
      const missing = ['node', 'npm', 'ffmpeg'].filter(tool => !runtime[tool])
      const runtimeText = preflight.can_render_here
        ? 'بيئة التشغيل تحتوي Node وnpm وFFmpeg.'
        : 'أدوات الرندر غير مكتملة على خادم API' + (missing.length ? ': ' + missing.join('، ') : '') + '. سنحتاج Worker منفصل.'
      setAgentResult(`نجح فحص المشروع: ${preflight.checks_passed}/${preflight.checks_total} اختبار. الملفات: ${scaffoldData.files?.length || 0}. ${runtimeText} مساحة العمل: ${workspaceData.workspace_id}`)
      setNotice('تم إنشاء مشروع Remotion وفحص ملفاته. لم يتم تشغيل الرندر بعد.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'حدث خطأ أثناء اختبار المحرك.'
      setAgentResult(message); setNotice(message)
    } finally { setAgentBusy(false) }
  }


  async function runPersistentStorageTest() {
    if (agentBusy) return
    const token = localStorage.getItem('essa_studio_access_token')
    if (!token) { setNotice('سجّل الدخول إلى Google أولاً.'); return }
    setAgentBusy(true); setAgentResult('جارٍ اختبار الحفظ الدائم على قاعدة البيانات...')
    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      const base = `${API_BASE_URL}/api/v1/storage`
      const createResponse = await fetch(`${base}/workspaces`, {
        method: 'POST', headers, body: JSON.stringify({ name: 'EssaStudio Storage Test' })
      })
      const created = await createResponse.json().catch(() => ({}))
      if (!createResponse.ok) throw new Error(created.detail || 'تعذر إنشاء مساحة الحفظ.')
      const workspaceId = created.workspace_id
      const testContent = `EssaStudio AI persistent storage test\\nCreated: ${new Date().toISOString()}\\n`
      const saveResponse = await fetch(`${base}/workspaces/${workspaceId}/files`, {
        method: 'PUT', headers, body: JSON.stringify({ path: 'storage-test.txt', content: testContent })
      })
      const saved = await saveResponse.json().catch(() => ({}))
      if (!saveResponse.ok) throw new Error(saved.detail || 'تعذر حفظ الملف.')
      const readResponse = await fetch(`${base}/workspaces/${workspaceId}/files/storage-test.txt`, { headers })
      const read = await readResponse.json().catch(() => ({}))
      if (!readResponse.ok) throw new Error(read.detail || 'تعذر قراءة الملف بعد الحفظ.')
      if (read.content !== testContent) throw new Error('تمت القراءة لكن المحتوى لا يطابق الملف المحفوظ.')
      const listResponse = await fetch(`${base}/workspaces/${workspaceId}/files`, { headers })
      const listed = await listResponse.json().catch(() => ({}))
      if (!listResponse.ok) throw new Error(listed.detail || 'تعذر عرض ملفات المشروع.')
      setAgentResult(`نجح اختبار قاعدة البيانات: إنشاء مشروع، حفظ ملف، قراءته ومطابقة محتواه، وعرض الملفات. عدد الملفات: ${listed.files?.length || 0}. معرّف المشروع: ${workspaceId}`)
      setNotice('الحفظ الدائم يعمل في قاعدة البيانات. لم يتم اختبار الرندر في هذه الخطوة.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'حدث خطأ أثناء اختبار الحفظ الدائم.'
      setAgentResult(message); setNotice(message)
    } finally { setAgentBusy(false) }
  }

  function openProject(item: VideoProject) { setProject(item); setNotice(''); setSidebarOpen(false) }
  function newChat() { setProject(null); setMessages([]); setAssets([]); setDraft(''); setFiles([]); setNotice(''); setSidebarOpen(false) }
  function togglePin(id: string) {
    setPinnedIds(current => {
      const next = current.includes(id) ? current.filter(value => value !== id) : [...current, id]
      localStorage.setItem('essa_studio_pinned_chats', JSON.stringify(next))
      return next
    })
  }
  function renameProject(item: VideoProject) {
    setRenameTarget(item)
    setRenameDraft(item.name)
    setOpenMenuId(null)
  }
  function saveProjectName() {
    if (!renameTarget || !renameDraft.trim()) return
    const updated = updateProject(renameTarget.id, { name: renameDraft.trim().slice(0, 70) })
    if (updated) { setProjects(getAllProjects()); if (project?.id === renameTarget.id) setProject(updated) }
    setRenameTarget(null)
  }
  async function removeProject(item: VideoProject) {
    deleteProject(item.id)
    localStorage.removeItem(chatKey(item.id))
    try { await deleteProjectFiles(item.id) } catch { /* keep deletion completed */ }
    setPinnedIds(current => { const next = current.filter(id => id !== item.id); localStorage.setItem('essa_studio_pinned_chats', JSON.stringify(next)); return next })
    setProjects(getAllProjects())
    if (project?.id === item.id) newChat()
    setConfirmDelete(null)
  }
  function toggleTheme() {
    setTheme(current => { const next = current === 'dark' ? 'light' : 'dark'; localStorage.setItem('essa_studio_theme', next); return next })
  }
  const diagnosticsMode = new URLSearchParams(window.location.search).get('diagnostics') === '1'
  const visibleProjects = [...projects]
    .sort((a, b) => Number(pinnedIds.includes(b.id)) - Number(pinnedIds.includes(a.id)) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .filter(item => item.name.toLocaleLowerCase('ar').includes(historySearch.trim().toLocaleLowerCase('ar')))

  return <main className={`chat-app ${theme === 'light' ? 'theme-light' : 'theme-dark'}`} dir="rtl">
    <header className="chat-top">
      <div className="chat-brand"><span className="chat-logo">E</span><div><b>EssaStudio AI</b><small>استوديو إنتاج الفيديو</small></div></div>
      <button className="header-new-chat header-studio" onClick={() => setView('studio')} aria-label="استوديو الريلز" title="استوديو الريلز">🎬</button>
      <button className="sidebar-toggle" onClick={() => setSidebarOpen(value => !value)} aria-label="فتح قائمة المحادثات">☰</button>
      <button className="header-new-chat" onClick={newChat} aria-label="محادثة جديدة" title="محادثة جديدة"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
    </header>
    {view === 'studio' ? <Suspense fallback={<div className="chat-notice">بحمّل الاستوديو…</div>}><Studio apiBaseUrl={API_BASE_URL} onClose={() => setView('chat')} /></Suspense> : <div className="chat-layout">
      <section className="chat-main">
        {!project && messages.length === 0 ? <div className="chat-welcome">
          <h1>{authUser ? `أهلاً بيك، ${authUser.display_name || authUser.email.split('@')[0]}` : 'إيه اللي حابب نشتغل عليه؟'}</h1>
          <p>اكتب فكرتك، أو ارفع ملفاتك، وهنشتغل عليها مع بعض خطوة بخطوة.</p>
        </div> : <div className="chat-thread">
          {messages.map(m => <article key={m.id} className={m.role === 'user' ? 'message-group user-message-group' : 'message-group assistant-message-group'}>
            <div className={m.role === 'user' ? 'bubble user-bubble' : 'bubble assistant-bubble'}>
              {m.text && <MarkdownMessage text={m.text} />}
              {m.files?.length ? <div className="bubble-attachments">{m.files.map((file, index) => {
                const name = attachmentName(file)
                const id = typeof file === 'string' ? '' : file.id
                const asset = assets.find(item => item.id === id || item.name === name)
                const mime = typeof file === 'string' ? (asset?.mimeType || '') : file.mimeType
                const isImage = mime.startsWith('image/') || asset?.type === 'image' || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(name)
                const isVideo = mime.startsWith('video/') || asset?.type === 'video' || /\.(mp4|webm|mov|m4v)$/i.test(name)
                if (isImage) return asset?.url ? <a className="attachment-image-link" href={asset.url} target="_blank" rel="noreferrer" key={id || name} aria-label="عرض الصورة المرفقة"><img className="attachment-image-preview" src={asset.url} alt="الصورة المرفقة" /></a> : null
                if (isVideo) return asset?.url ? <div className="attachment-video-preview" key={id || name}><video src={asset.url} controls preload="metadata" /></div> : null
                return <span className="bubble-file-chip" key={id || `${name}-${index}`}>📎 {name}</span>
              })}</div> : null}
            </div>
            <div className="message-tools">
              <button type="button" className="message-copy-button" onClick={async () => {
                const content = [m.text, ...(m.files?.length ? [`المرفقات: ${m.files.map(attachmentName).join('، ')}`] : [])].filter(Boolean).join('\n');
                try {
                  await navigator.clipboard.writeText(content);
                  setCopiedMessageId(m.id);
                  window.setTimeout(() => setCopiedMessageId(current => current === m.id ? null : current), 1600);
                } catch {
                  setNotice('تعذر النسخ تلقائياً. حاول تحديد النص ونسخه يدوياً.');
                }
              }} aria-label="نسخ الرسالة" title="نسخ الرسالة">
                {copiedMessageId === m.id
                  ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
                  : <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>}
              </button>
            </div>
          </article>)}
          {busy && <article className="bubble assistant-bubble typing-bubble"><p>بفكر في طلبك وبجهز الرد... <span className="typing-dots">•••</span></p></article>}
          {notice && <div className="chat-notice">{notice}</div>}
          {assets.some(a => a.type !== "image" && a.type !== "video") && <div className="asset-strip">{assets.filter(a => a.type !== "image" && a.type !== "video").map(a => <span key={a.id}>📎 {a.name}</span>)}</div>}
          <div ref={bottom} />
        </div>}
        <div className="composer-wrap">
        <div className="composer">
          {files.length > 0 && <div className="pending-files">{files.map((f, i) => {
            const preview = pendingPreviews.find(item => item.file === f)
            return <span className="pending-file-item" key={`${f.name}-${i}`}>
              {preview && f.type.startsWith('image/') ? <span className="pending-thumb"><img src={preview.url} alt="معاينة الصورة" /><button type="button" aria-label="إزالة الصورة" onClick={() => setFiles(old => old.filter((_, n) => n !== i))}>×</button></span> : preview && f.type.startsWith('video/') ? <span className="pending-thumb"><video src={preview.url} muted /><button type="button" aria-label="إزالة الفيديو" onClick={() => setFiles(old => old.filter((_, n) => n !== i))}>×</button></span> : <><span className="pending-file-icon">{f.type.startsWith('audio/') ? '♫' : '📄'}</span><span className="pending-file-name">{f.name}</span><button type="button" aria-label={`إزالة ${f.name}`} onClick={() => setFiles(old => old.filter((_, n) => n !== i))}>×</button></>}
            </span>
          })}</div>}
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
        {diagnosticsMode && <>
        <button className="agent-test-button" onClick={() => void runPersistentStorageTest()} disabled={agentBusy || !authUser}>
          {agentBusy ? 'جارٍ اختبار الحفظ...' : '💾 اختبار الحفظ الدائم'}
        </button>
        <button className="agent-test-button" onClick={() => void runAgentWorkspaceTest()} disabled={agentBusy || !authUser}>
          {agentBusy ? 'جارٍ اختبار المحرك...' : '⚙ اختبار محرك الإنتاج'}
        </button>
        {agentResult && <div className="agent-test-result" role="status">{agentResult}</div>}
        </>}
        <label className="history-search">
          <span>⌕</span>
          <input value={historySearch} onChange={event => setHistorySearch(event.target.value)} placeholder="ابحث في المحادثات" />
        </label>
        <div className="history-label">الأخيرة</div>
        <div className="history-list">
          {visibleProjects.length ? visibleProjects.map(p => <div key={p.id} className={`project-choice ${project?.id === p.id ? 'active' : ''}`}>
            <button type="button" className="history-open" onClick={() => openProject(p)}>
              <span className="history-chat-icon">{pinnedIds.includes(p.id) ? '★' : '◷'}</span>
              <span className="history-chat-copy"><b>{p.name}</b><small>{new Date(p.updatedAt).toLocaleDateString('ar-EG')}</small></span>
            </button>
            <span className="history-menu-wrap">
              <button type="button" className="history-menu-trigger" aria-label="خيارات المحادثة" title="خيارات المحادثة" onClick={event => { event.stopPropagation(); setOpenMenuId(openMenuId === p.id ? null : p.id) }}>•••</button>
              {openMenuId === p.id && <span className="history-menu">
                <button type="button" onClick={event => { event.stopPropagation(); togglePin(p.id); setOpenMenuId(null) }}>{pinnedIds.includes(p.id) ? 'إلغاء التثبيت' : 'تثبيت المحادثة'} <span>{pinnedIds.includes(p.id) ? '★' : '☆'}</span></button>
                <button type="button" onClick={event => { event.stopPropagation(); renameProject(p) }}>تعديل الاسم <span>✎</span></button>
                <button type="button" className="history-delete-action" onClick={event => { event.stopPropagation(); setConfirmDelete(p); setOpenMenuId(null) }}>حذف المحادثة <span>⌫</span></button>
              </span>}
            </span>
          </div>) : <p className="history-empty">{historySearch ? 'لا توجد محادثات مطابقة.' : 'محادثاتك الجديدة هتظهر هنا.'}</p>}
        </div>
        <div className="sidebar-bottom">
          <button className="sidebar-theme-setting" onClick={toggleTheme}><span className="sidebar-theme-icon">{theme === 'dark' ? '☀' : '☾'}</span><span>المظهر</span><b>{theme === 'dark' ? 'داكن' : 'فاتح'}</b></button>
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
      {confirmDelete && <div className="dialog-backdrop" role="presentation" onClick={() => setConfirmDelete(null)}>
        <section className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title" onClick={event => event.stopPropagation()}>
          <div className="dialog-icon">⌫</div>
          <h2 id="delete-dialog-title">حذف المحادثة؟</h2>
          <p>هل تريد حذف «{confirmDelete.name}» نهائيًا؟ لا يمكن التراجع عن هذا الإجراء.</p>
          <div className="dialog-actions"><button className="dialog-cancel" onClick={() => setConfirmDelete(null)}>إلغاء</button><button className="dialog-confirm-delete" onClick={() => void removeProject(confirmDelete)}>حذف المحادثة</button></div>
        </section>
      </div>}
      {renameTarget && <div className="dialog-backdrop" role="presentation" onClick={() => setRenameTarget(null)}>
        <section className="app-dialog rename-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-dialog-title" onClick={event => event.stopPropagation()}>
          <h2 id="rename-dialog-title">تعديل اسم المحادثة</h2>
          <input value={renameDraft} maxLength={70} onChange={event => setRenameDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') saveProjectName() }} autoFocus />
          <div className="dialog-actions"><button className="dialog-cancel" onClick={() => setRenameTarget(null)}>إلغاء</button><button className="dialog-confirm" onClick={saveProjectName} disabled={!renameDraft.trim()}>حفظ</button></div>
        </section>
      </div>}
    </div>}

  </main>
}
