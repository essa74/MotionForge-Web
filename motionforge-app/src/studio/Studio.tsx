import { lazy, Suspense, useState } from 'react'
import { FREE_TEMPLATE, TEMPLATE_BGS, TEMPLATE_COLORS, createProject, deleteProject, deleteTemplate, loadProjects, loadTemplates, saveTemplate, templateById, type Project, type Template } from './projects'
import { ChatIcon, ICON } from './ui'
import { useBack } from './back'
import './studio.css'

// The editor carries the video engine (Remotion), so it loads only when a project is opened.
const Editor = lazy(() => import('./Editor'))

type Account = { name: string; initial: string; avatar?: string | null } | null

export default function Studio({ onOpenAi, account, onLogin, onLogout, theme, onToggleTheme, onOpenAssistant, onSink }: { onOpenAi: () => void; account: Account; onLogin: () => void; onLogout: () => void; theme: 'dark' | 'light'; onToggleTheme: () => void; onOpenAssistant: () => void; onSink: (sink: ((text: string) => void) | null) => void }) {
  const [accountOpen, setAccountOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>(loadProjects)
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [templates, setTemplates] = useState<Template[]>(loadTemplates)
  const [templateId, setTemplateId] = useState('free')
  const [editing, setEditing] = useState<{ id?: string; name: string; color: string; note: string; bg?: string; handle?: string; excel?: boolean } | null>(null)
  const open = projects.find(project => project.id === openId)

  const refresh = () => setProjects(loadProjects())
  useBack(!!open, () => { setOpenId(null); refresh() })
  useBack(accountOpen, () => setAccountOpen(false))
  useBack(creating, () => setCreating(false))

  if (open) return <Suspense fallback={<section className="studio"><div className="studio-body"><small>بحمّل محرر الفيديو…</small></div></section>}><Editor key={open.id} project={open} onOpenAi={onOpenAi} onOpenAssistant={onOpenAssistant} onSink={onSink} onBack={() => { refresh(); setOpenId(null) }} /></Suspense>

  return <section className="studio" dir="rtl">
    <div className="studio-head">
      <div className="studio-brand"><span className="studio-logo">E</span><div className="studio-head-title"><b>EssaStudio</b><small>استوديو الفيديو</small></div></div>
      <div className="studio-head-actions">
        <button className="icon-btn gold" onClick={onOpenAssistant} aria-label="المساعد"><ChatIcon /></button>
        <button className="icon-btn avatar-btn" onClick={() => setAccountOpen(true)} aria-label="حسابي">
          {account ? (account.avatar ? <img src={account.avatar} alt="" referrerPolicy="no-referrer" /> : <b>{account.initial}</b>) : <svg width="22" height="22" viewBox="0 0 24 24" {...ICON}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>}
        </button>
      </div>
    </div>

    {accountOpen && <div className="studio-sheet-layer" onClick={() => setAccountOpen(false)}>
      <div className="studio-sheet" role="dialog" aria-label="حسابي" onClick={event => event.stopPropagation()}>
        <div className="studio-sheet-grip" />
        <h3>حسابي</h3>
        {account
          ? <div className="studio-account"><span className="studio-account-avatar">{account.avatar ? <img src={account.avatar} alt="" referrerPolicy="no-referrer" /> : account.initial}</span><b>{account.name}</b></div>
          : <button onClick={onLogin}>سجّل الدخول بـ Google (اختياري)</button>}
        <button onClick={() => { setAccountOpen(false); onOpenAi() }}>🔑 مفتاح الذكاء الاصطناعي</button>
        <button onClick={onToggleTheme}>المظهر: {theme === 'dark' ? 'داكن ☾ (اضغط للفاتح)' : 'فاتح ☀ (اضغط للداكن)'}</button>
        {account && <button className="danger" onClick={() => { setAccountOpen(false); onLogout() }}>تسجيل الخروج</button>}
        <button onClick={() => setAccountOpen(false)}>إغلاق</button>
      </div>
    </div>}

    <div className="studio-body">
      <div className="studio-intro"><h1>مشاريعك</h1><p>اختار مشروع تكمله أو ابدأ واحد جديد</p></div>

      {creating
        ? <div className="studio-card">
            <h3>مشروع جديد</h3>
            <input className="studio-input" value={name} onChange={event => setName(event.target.value)} placeholder="اسم المشروع (مثلاً: ريل Transpose)" autoFocus />
            <label>القالب</label>
            <div className="studio-kinds">
              {[FREE_TEMPLATE, ...templates].map(item => <button key={item.id} className={templateId === item.id ? 'active' : ''} style={templateId === item.id ? { borderColor: item.color, color: item.color, background: item.color + '24' } : undefined} onClick={() => setTemplateId(item.id)}>{item.name}</button>)}
              <button onClick={() => setEditing({ name: '', color: '#E8B64C', note: '', bg: TEMPLATE_BGS[0], handle: '', excel: false })}>＋ قالب جديد</button>
            </div>
            {templateId !== 'free' && !editing && <div className="studio-actions">
              <button onClick={() => { const item = templateById(templateId); setEditing({ id: item.id, name: item.name, color: item.color, note: item.note, bg: item.bg, handle: item.handle, excel: item.excel }) }}>تعديل القالب</button>
              <button className="danger" onClick={() => { if (window.confirm('حذف القالب؟ المشاريع اللي عليه هتفضل موجودة.')) { deleteTemplate(templateId); setTemplates(loadTemplates()); setTemplateId('free') } }}>حذف القالب</button>
            </div>}
            {editing && <div className="studio-template-form">
              <input className="studio-input" value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} placeholder="اسم القالب (اسم صفحتك مثلاً)" />
              <small>لون التمييز</small>
                            <div className="studio-swatches">{TEMPLATE_COLORS.map(color => <button key={color} aria-label={`لون ${color}`} aria-pressed={editing.color === color} className={editing.color === color ? 'active' : ''} style={{ background: color }} onClick={() => setEditing({ ...editing, color })} />)}</div>
              <small>لون الخلفية</small>
              <div className="studio-swatches">{TEMPLATE_BGS.map(bg => <button key={bg} aria-label={`خلفية ${bg}`} aria-pressed={editing.bg === bg} className={editing.bg === bg ? 'active' : ''} style={{ background: bg, border: '1px solid #888' }} onClick={() => setEditing({ ...editing, bg })} />)}</div>
              <input className="studio-input" dir="ltr" value={editing.handle || ''} onChange={event => setEditing({ ...editing, handle: event.target.value })} placeholder="@handle الصفحة (يظهر في آخر الفيديو)" />
              <label className="studio-check"><input type="checkbox" checked={!!editing.excel} onChange={event => setEditing({ ...editing, excel: event.target.checked })} /> يسمح بمشاهد Excel (جداول). سيبها فاضية لو صفحتك مش عن Excel</label>
              <textarea value={editing.note} onChange={event => setEditing({ ...editing, note: event.target.value })} rows={4} placeholder="وصف الستايل لجيمناي (اختياري). مثلاً: خلفية سودا، شخصية عود كبريت بيضاء، كلمة مهمة بالدهبي في كل جملة" />
              <div className="studio-actions">
                <button className="primary" onClick={() => { const saved = saveTemplate(editing); setTemplates(loadTemplates()); setTemplateId(saved.id); setEditing(null) }}>حفظ القالب</button>
                <button onClick={() => setEditing(null)}>إلغاء</button>
              </div>
            </div>}
            <div className="studio-actions">
              <button className="primary" onClick={() => { const project = createProject(name, templateId); setName(''); setCreating(false); refresh(); setOpenId(project.id) }}>ابدأ المشروع</button>
              <button onClick={() => setCreating(false)}>إلغاء</button>
            </div>
          </div>
        : <button className="studio-new" onClick={() => setCreating(true)}>
            <span className="studio-new-plus"><svg width="22" height="22" viewBox="0 0 24 24" {...ICON} strokeWidth={2.4}><path d="M12 5v14M5 12h14" /></svg></span>
            <span><b>مشروع جديد</b><small>أي فكرة، بقالبك أو من غير قالب</small></span>
          </button>}

      {projects.length === 0 && !creating && <small>لسه مفيش مشاريع. اعمل أول مشروع من فوق.</small>}
      {projects.map(project => <div className="studio-project" key={project.id}>
        <button className="studio-project-open" onClick={() => setOpenId(project.id)}>
          <span className="studio-thumb" aria-hidden="true" style={{ background: `linear-gradient(160deg, ${templateById(project.templateId).color}, #0b0c10)` }}>{project.name.trim().charAt(0)}</span>
          <span className="studio-project-info">
            <b>{project.name}</b>
            <span className="kind-chip" style={{ background: templateById(project.templateId).color + "2e", color: templateById(project.templateId).color }}>{templateById(project.templateId).name}</span>
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
