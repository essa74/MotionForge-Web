import { lazy, Suspense, useState } from 'react'
import { KIND_LABEL, createProject, deleteProject, loadProjects, type Kind, type Project } from './projects'
import { ChatIcon, ICON } from './ui'
import './studio.css'

// The editor carries the video engine (Remotion), so it loads only when a project is opened.
const Editor = lazy(() => import('./Editor'))

const KIND_ICON: Record<Kind, string> = { excel: 'xl', bein: 'bs', historima: 'hs' }

type Account = { name: string; initial: string; avatar?: string | null } | null

export default function Studio({ apiBaseUrl, account, onLogin, onLogout, theme, onToggleTheme, onOpenAssistant, onSink }: { apiBaseUrl: string; account: Account; onLogin: () => void; onLogout: () => void; theme: 'dark' | 'light'; onToggleTheme: () => void; onOpenAssistant: () => void; onSink: (sink: ((text: string) => void) | null) => void }) {
  const [accountOpen, setAccountOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>(loadProjects)
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Kind>('excel')
  const open = projects.find(project => project.id === openId)

  const refresh = () => setProjects(loadProjects())

  if (open) return <Suspense fallback={<section className="studio"><div className="studio-body"><small>بحمّل محرر الفيديو…</small></div></section>}><Editor key={open.id} project={open} apiBaseUrl={apiBaseUrl} onOpenAssistant={onOpenAssistant} onSink={onSink} onBack={() => { refresh(); setOpenId(null) }} /></Suspense>

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
          : <button className="primary" onClick={onLogin}>سجّل الدخول بـ Google</button>}
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
          <span className={`studio-thumb thumb-${KIND_ICON[project.kind]}`} aria-hidden="true">{project.kind === 'excel' && <svg viewBox="0 0 76 96" width="76" height="96"><rect x="10" y="16" width="56" height="50" rx="5" fill="rgba(255,255,255,.14)" /><path d="M10 29h56M10 41h56M10 53h56M29 16v50M48 16v50" stroke="rgba(255,255,255,.55)" strokeWidth="1.2" /><rect x="10" y="16" width="56" height="12" rx="5" fill="rgba(255,255,255,.3)" /><rect x="10" y="78" width="56" height="6" rx="3" fill="#E8B64C" /></svg>}{project.kind === 'historima' && <span className="thumb-brand">HISTORIMA</span>}{project.kind === 'bein' && <svg viewBox="0 0 76 96" width="76" height="96"><circle cx="38" cy="38" r="11" fill="none" stroke="#fff" strokeWidth="2.4" /><path d="M38 49v22M38 56l-12 8M38 56l12 8M38 71l-9 14M38 71l9 14" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" /><path d="M0 88h76" stroke="#E8B64C" strokeWidth="2" /></svg>}</span>
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
