import type { Format } from '../reels-engine/lib/theme'

export type Kind = 'excel' | 'bein' | 'historima'
export const KIND_LABEL: Record<Kind, string> = { excel: 'شرح Excel', bein: 'بين السطور (2D)', historima: 'HISTORIMA' }

export type Project = { id: string; name: string; kind: Kind; updated: number; script: string; specText: string; format: Format }

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
    if (raw) return (JSON.parse(raw) as Project[]).sort((a, b) => b.updated - a.updated)
  } catch { /* fall through to migration */ }
  // Bring over the single project of the earlier version, once.
  const script = localStorage.getItem(LEGACY_SCRIPT)
  const specText = localStorage.getItem(LEGACY_SPEC)
  if (script || specText) {
    const migrated: Project = { id: crypto.randomUUID(), name: 'مشروعي الأول', kind: 'excel', updated: Date.now(), script: script ?? '', specText: specText ?? DEFAULT_SPEC_TEXT, format: 'vertical' }
    write([migrated]); return [migrated]
  }
  return []
}

export function createProject(name: string, kind: Kind): Project {
  const project: Project = { id: crypto.randomUUID(), name: name.trim() || 'مشروع جديد', kind, updated: Date.now(), script: '', specText: DEFAULT_SPEC_TEXT, format: 'vertical' }
  write([project, ...loadProjects()])
  return project
}

export function saveProject(id: string, patch: Partial<Omit<Project, 'id'>>) {
  write(loadProjects().map(project => project.id === id ? { ...project, ...patch, updated: Date.now() } : project))
}

export function deleteProject(id: string) { write(loadProjects().filter(project => project.id !== id)) }
