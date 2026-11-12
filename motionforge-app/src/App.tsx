import { useEffect, useRef, useState } from 'react'
import './App.css'
import type { ProjectAsset, VideoProject } from './engine/projectTypes'
import { createProject, getAllProjects, updateProject } from './engine/projectStore'
import { saveProjectFiles, getProjectFiles } from './engine/assetStore'

type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string; files?: string[]; at: string }
const chatKey = (id: string) => `motionforge_chat_${id}`

export default function App() {
  const [projects, setProjects] = useState<VideoProject[]>([])
  const [project, setProject] = useState<VideoProject | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [assets, setAssets] = useState<Array<ProjectAsset & { url: string }>>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => { setProjects(getAllProjects()) }, [])
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
      const reply: ChatMessage = {
        id: crypto.randomUUID(), role: 'assistant',
        text: saved.length
          ? `وصلت تعليماتك واتحفظت ${saved.length} ملفات مع المشروع. المحادثة دي هتفضل مرتبطة بنفس المشروع. ملحوظة مهمة: محرك تنفيذ أوامر التعديل وتوليد ملف الفيديو النهائي لسه مش موصول؛ مش هادّعي إن الفيديو اتنتج قبل ما نضيف المحرك فعليًا.`
          : 'وصلت رسالتك واتحفظت في محادثة المشروع. تقدر تكمل تعليماتك هنا؛ تنفيذ التعديلات وإنتاج الفيديو هيحتاج توصيل محرك الإنتاج الفعلي.',
        at: new Date().toISOString()
      }
      const completed = [...next, reply]
      setMessages(completed); localStorage.setItem(chatKey(current.id), JSON.stringify(completed))
      const fresh = await getProjectFiles(current.id); setAssets(fresh)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'حصل خطأ أثناء حفظ الرسالة.')
    } finally { setBusy(false) }
  }

  function openProject(item: VideoProject) { setProject(item); setNotice('') }
  function newChat() { setProject(null); setMessages([]); setAssets([]); setDraft(''); setFiles([]); setNotice('') }

  return <main className="chat-app" dir="rtl">
    <header className="chat-top">
      <div className="chat-brand"><span className="chat-logo">M</span><div><b>MotionForge</b><small>استوديو إنتاج الفيديو</small></div></div>
      <button className="chat-new" onClick={newChat}>＋ محادثة جديدة</button>
    </header>
    <div className="chat-layout">
      <section className="chat-main">
        {!project && messages.length === 0 ? <div className="chat-welcome">
          <span className="chat-kicker">فكرتك تتحول إلى فيديو</span>
          <h1>خلّينا ننتج الفيديو</h1>
          <p>اكتب فكرتك، وأرفق البرومبت والسكريبت والصوت والصور واللوجو. كل الشغل هيكون في نفس المحادثة.</p>
          <div className="chat-hint">ابدأ برسالة واحدة، وبعدها اطلب أي تعديل في نفس الشات.</div>
        </div> : <div className="chat-thread">
          <div className="thread-title"><b>{project?.name}</b><span>محادثة المشروع</span></div>
          {messages.map(m => <article key={m.id} className={m.role === 'user' ? 'bubble user-bubble' : 'bubble assistant-bubble'}>
            <small>{m.role === 'user' ? 'أنت' : 'MotionForge'}</small>
            {m.text && <p>{m.text}</p>}
            {m.files?.length ? <div className="bubble-files">📎 {m.files.join('، ')}</div> : null}
          </article>)}
          {assets.length > 0 && <div className="asset-strip">{assets.map(a => <span key={a.id}>📎 {a.name}</span>)}</div>}
          <div ref={bottom} />
        </div>}
        {notice && <div className="chat-notice">{notice}</div>}
        <div className="composer">
          {files.length > 0 && <div className="pending-files">{files.map((f, i) => <span key={i}>📎 {f.name} <button onClick={() => setFiles(old => old.filter((_, n) => n !== i))}>×</button></span>)}</div>}
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3}
            placeholder={project ? 'اكتب التعديل أو التعليمات الجديدة...' : 'اكتب فكرة الفيديو والبرومبت الكامل هنا...'}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }} />
          <div className="composer-actions">
            <input ref={picker} type="file" multiple accept="audio/*,image/*,video/*,.pdf,.txt,.doc,.docx" hidden onChange={e => setFiles(old => [...old, ...Array.from(e.target.files || [])])} />
            <button className="attach-button" onClick={() => picker.current?.click()}>＋ إرفاق ملفات</button>
            <span>الصوت • الصور • الفيديو • المستندات</span>
            <button className="send-button" onClick={() => void send()} disabled={busy || (!draft.trim() && files.length === 0)}>{busy ? 'جارٍ الحفظ...' : 'إرسال ↑'}</button>
          </div>
        </div>
      </section>
      <aside className="chat-sidebar">
        <b>محادثاتك</b>
        <button className={!project ? 'project-choice active' : 'project-choice'} onClick={newChat}>＋ ابدأ محادثة جديدة</button>
        {projects.map(p => <button key={p.id} className={project?.id === p.id ? 'project-choice active' : 'project-choice'} onClick={() => openProject(p)}>
          <b>{p.name}</b><small>{new Date(p.updatedAt).toLocaleDateString('ar-EG')}</small>
        </button>)}
        <p>كل مشروع له محادثته وملفاته المحفوظة.</p>
      </aside>
    </div>
    <footer className="chat-footer">MotionForge • مساحة إنتاج واحدة لكل فيديو</footer>
  </main>
}
