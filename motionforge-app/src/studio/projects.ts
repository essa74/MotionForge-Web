import type { Format } from '../reels-engine/lib/theme'

// A template is a personal look the user defines (name, colour, style note for Gemini). Nothing is built in except the free project.
export type Template = { id: string; name: string; color: string; note: string; bg?: string; handle?: string; excel?: boolean; draw?: boolean }
export const FREE_TEMPLATE: Template = { id: 'free', name: 'فيديو حر', color: '#E8B64C', note: '', bg: '#0b0b10', handle: '' }
export const TEMPLATE_BGS = ['#0b0b10', '#0b1330', '#111827', '#0f2a1d', '#ffffff']
export const TEMPLATE_COLORS = ['#E8B64C', '#2e9b63', '#4f8cff', '#e0627a', '#a76bff', '#e08a3c']
const TEMPLATES = 'essa_studio_templates'

export function loadTemplates(): Template[] {
  try { return JSON.parse(localStorage.getItem(TEMPLATES) || '[]') as Template[] } catch { return [] }
}
export function saveTemplate(input: { id?: string; name: string; color: string; note: string; bg?: string; handle?: string; excel?: boolean; draw?: boolean }): Template {
  const template: Template = { id: input.id || crypto.randomUUID(), name: input.name.trim() || 'قالب جديد', color: input.color, note: input.note.trim(), bg: input.bg || TEMPLATE_BGS[0], handle: (input.handle || '').trim(), excel: !!input.excel, draw: !!input.draw }
  const rest = loadTemplates().filter(item => item.id !== template.id)
  try { localStorage.setItem(TEMPLATES, JSON.stringify([...rest, template])) } catch { /* storage full or blocked */ }
  return template
}
export function deleteTemplate(id: string) { try { localStorage.setItem(TEMPLATES, JSON.stringify(loadTemplates().filter(item => item.id !== id))) } catch { /* ignore */ } }
export function templateById(id: string): Template { return loadTemplates().find(item => item.id === id) ?? FREE_TEMPLATE }

/** The page identity the video engine paints text and closing scenes with. */
export function lookOf(t: Template) {
  const bg = t.bg || TEMPLATE_BGS[0]
  const n = parseInt(bg.replace('#', ''), 16)
  const light = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 150
  return { bg, text: light ? '#0b0b10' : '#ffffff', accent: t.color, handle: t.handle || undefined }
}

export type Project = { id: string; name: string; templateId: string; updated: number; script: string; specText: string; format: Format }

const INDEX = 'essa_studio_projects'
const LEGACY_SCRIPT = 'essa_studio_script'
const LEGACY_SPEC = 'essa_studio_spec'

export const DEFAULT_SPEC_TEXT = JSON.stringify({ format: 'vertical', scenes: [{ type: 'text', duration: 3, title: 'عنوان الريل', theme: 'dark' }, { type: 'logo', duration: 3 }] }, null, 2)

function write(projects: Project[]) {
  try { localStorage.setItem(INDEX, JSON.stringify(projects)) } catch { /* storage full or blocked */ }
}

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(INDEX)
    // Older projects carried a fixed kind; they become free projects.
    if (raw) return (JSON.parse(raw) as Array<Project & { kind?: string }>).map(({ kind: _kind, ...project }) => ({ ...project, templateId: project.templateId || 'free' })).sort((a, b) => b.updated - a.updated)
  } catch { /* fall through to migration */ }
  // Bring over the single project of the earlier version, once.
  const script = localStorage.getItem(LEGACY_SCRIPT)
  const specText = localStorage.getItem(LEGACY_SPEC)
  if (script || specText) {
    const migrated: Project = { id: crypto.randomUUID(), name: 'مشروعي الأول', templateId: 'free', updated: Date.now(), script: script ?? '', specText: specText ?? DEFAULT_SPEC_TEXT, format: 'vertical' }
    write([migrated]); return [migrated]
  }
  return []
}

export function createProject(name: string, templateId: string): Project {
  const project: Project = { id: crypto.randomUUID(), name: name.trim() || 'مشروع جديد', templateId, updated: Date.now(), script: '', specText: DEFAULT_SPEC_TEXT, format: 'vertical' }
  write([project, ...loadProjects()])
  return project
}

export function saveProject(id: string, patch: Partial<Omit<Project, 'id'>>) {
  write(loadProjects().map(project => project.id === id ? { ...project, ...patch, updated: Date.now() } : project))
}

export function deleteProject(id: string) { write(loadProjects().filter(project => project.id !== id)) }

/** Excel (table) scenes only make sense for Excel content: a template opts in, a free project decides from its script. */
export function allowsExcel(template: Template, script: string): boolean {
  return template.id === 'free' ? /excel|إكسل|اكسل|إكسيل|اكسيل/i.test(script) : !!template.excel
}

/** Drawn stick-figure scenes: a template opts in. */
export function allowsDraw(template: Template): boolean { return !!template.draw }
