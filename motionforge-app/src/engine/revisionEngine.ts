import type {
  VideoProject,
  Scene,
  Revision,
  RevisionSnapshot,
} from './projectTypes'

import { updateProject } from './projectStore'

export interface RevisionRequest {
  projectId: string
  instruction: string
  sceneId?: string
}

export interface RevisionPlan {
  instruction: string
  targetSceneIds: string[]
  scope: 'scene' | 'project'
  requiresAI: boolean
}

function createId(): string {
  return `revision-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function createSnapshot(
  project: VideoProject,
  description: string,
): RevisionSnapshot {
  return {
    version: project.version,
    createdAt: new Date().toISOString(),
    projectName: project.name,
    description,
    scenes: cloneData(project.scenes),
  }
}

export function createRevisionPlan(
  project: VideoProject,
  request: RevisionRequest,
): RevisionPlan {
  return {
    instruction: request.instruction,
    targetSceneIds: request.sceneId
      ? [request.sceneId]
      : project.scenes.map((scene) => scene.id),
    scope: request.sceneId ? 'scene' : 'project',
    requiresAI: true,
  }
}

export function saveProjectRevision(
  project: VideoProject,
  nextScenes: Scene[],
  description: string,
): VideoProject | null {
  const previousSnapshot = createSnapshot(project, description)

  const previousSceneMap = new Map(
    project.scenes.map((scene) => [scene.id, scene]),
  )

  const nextSceneMap = new Map(nextScenes.map((scene) => [scene.id, scene]))

  const affectedSceneIds = new Set<string>()

  for (const scene of project.scenes) {
    const nextScene = nextSceneMap.get(scene.id)

    if (!nextScene || JSON.stringify(scene) !== JSON.stringify(nextScene)) {
      affectedSceneIds.add(scene.id)
    }
  }

  for (const scene of nextScenes) {
    if (!previousSceneMap.has(scene.id)) {
      affectedSceneIds.add(scene.id)
    }
  }

  const revision: Revision = {
    id: createId(),
    projectId: project.id,
    description,
    createdAt: new Date().toISOString(),
    affectedSceneIds: Array.from(affectedSceneIds),
    previousVersionId: String(project.version),
    beforeSnapshot: previousSnapshot,
  }

  return updateProject(project.id, {
    scenes: cloneData(nextScenes),
    totalDuration: nextScenes.reduce((sum, scene) => sum + scene.duration, 0),
    revisions: [...(project.revisions ?? []), revision],
    version: project.version + 1,
  })
}

/**
 * الاسم القديم محفوظ للتوافق مع أي ملفات أخرى
 * ما زالت تستدعي saveSceneRevision.
 */
export const saveSceneRevision = saveProjectRevision

export function getRevisionHistory(project: VideoProject): Revision[] {
  return [...(project.revisions ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

export function restoreRevision(
  project: VideoProject,
  revisionId: string,
): VideoProject | null {
  const revision = (project.revisions ?? []).find(
    (item) => item.id === revisionId,
  )

  if (!revision) return null

  const snapshot = revision.beforeSnapshot

  if (!snapshot) {
    throw new Error('هذه النسخة لا تحتوي على بيانات كافية للاستعادة.')
  }

  const restoreRecord: Revision = {
    id: createId(),
    projectId: project.id,
    description: `استعادة النسخة السابقة: ${revision.description}`,
    createdAt: new Date().toISOString(),
    affectedSceneIds: Array.from(
      new Set([
        ...project.scenes.map((scene) => scene.id),
        ...snapshot.scenes.map((scene) => scene.id),
      ]),
    ),
    previousVersionId: String(project.version),
    beforeSnapshot: createSnapshot(project, 'الحالة الحالية قبل الاستعادة'),
  }

  return updateProject(project.id, {
    name: snapshot.projectName,
    scenes: cloneData(snapshot.scenes),
    revisions: [...(project.revisions ?? []), restoreRecord],
    version: project.version + 1,
  })
}
