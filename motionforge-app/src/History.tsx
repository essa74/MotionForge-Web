import { useMemo } from 'react'
import type { VideoProject } from './engine/projectTypes'

type Props = {
  open: boolean
  projects: VideoProject[]
  pinnedIds: string[]
  activeId?: string
  search: string
  menuId: string | null
  chatKey: (id: string) => string
  onSearch: (value: string) => void
  onMenu: (id: string | null) => void
  onOpen: (project: VideoProject) => void
  onNew: () => void
  onPin: (id: string) => void
  onRename: (project: VideoProject) => void
  onDelete: (project: VideoProject) => void
  onClose: () => void
}

const DAY = 86400000

function firstLine(chatKey: string): string {
  try {
    const messages = JSON.parse(localStorage.getItem(chatKey) || '[]') as Array<{ role: string; text?: string }>
    return (messages.find(message => message.role === 'user')?.text || '').replace(/\s+/g, ' ').trim().slice(0, 90)
  } catch { return '' }
}

function dayLabel(updatedAt: string): string {
  const startOfToday = new Date().setHours(0, 0, 0, 0)
  const at = new Date(updatedAt).getTime()
  if (at >= startOfToday) return 'اليوم'
  if (at >= startOfToday - DAY) return 'امبارح'
  return 'أقدم'
}

export default function HistoryPanel(props: Props) {
  const { open, projects, pinnedIds, activeId, search, menuId, chatKey } = props
  const groups = useMemo(() => {
    const result: Array<{ label: string; items: VideoProject[] }> = []
    const add = (label: string, item: VideoProject) => {
      const group = result.find(entry => entry.label === label)
      if (group) group.items.push(item); else result.push({ label, items: [item] })
    }
    for (const item of projects) add(pinnedIds.includes(item.id) ? '★ المثبّتة' : dayLabel(item.updatedAt), item)
    const order = ['★ المثبّتة', 'اليوم', 'امبارح', 'أقدم']
    return result.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label))
  }, [projects, pinnedIds])

  if (!open) return null
  return <div className="history-panel" role="dialog" aria-label="المحادثات">
    <div className="history-top">
      <button className="sheet-btn" onClick={props.onClose} aria-label="رجوع للمحادثة"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
      <label className="history-find">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6" /><path d="M20 20l-4-4" /></svg>
        <input value={search} onChange={event => props.onSearch(event.target.value)} placeholder="ابحث في المحادثات" />
      </label>
    </div>

    <div className="history-scroll">
      {groups.length === 0 && <p className="history-empty">{search ? 'مفيش محادثات مطابقة.' : 'محادثاتك الجديدة هتظهر هنا.'}</p>}
      {groups.map(group => <section key={group.label}>
        <h4 className="history-group">{group.label}</h4>
        {group.items.map(item => {
          const preview = firstLine(chatKey(item.id))
          return <div key={item.id} className={`history-card ${activeId === item.id ? 'active' : ''}`}>
            <div className="history-card-row">
              <button className="history-card-open" onClick={() => props.onOpen(item)}>
                <b>{item.name}</b>
                {preview && <span>{preview}</span>}
                <small>{new Date(item.updatedAt).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })} · {new Date(item.updatedAt).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}</small>
              </button>
              <button className="history-more" onClick={() => props.onMenu(menuId === item.id ? null : item.id)} aria-label={`خيارات ${item.name}`} aria-expanded={menuId === item.id}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
              </button>
            </div>
            {menuId === item.id && <div className="history-actions">
              <button onClick={() => { props.onPin(item.id); props.onMenu(null) }}>{pinnedIds.includes(item.id) ? 'إلغاء التثبيت' : 'تثبيت'}</button>
              <button onClick={() => props.onRename(item)}>تعديل الاسم</button>
              <button className="danger" onClick={() => { props.onDelete(item); props.onMenu(null) }}>حذف</button>
            </div>}
          </div>
        })}
      </section>)}
    </div>

    <div className="history-bottom"><button onClick={props.onNew}>＋ محادثة جديدة</button></div>
  </div>
}
