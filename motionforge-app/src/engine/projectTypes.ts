export type VideoFormat = 'vertical' | 'horizontal' | 'square'

export type ProjectCategory =
  | 'auto'
  | 'educational'
  | 'historical'
  | 'documentary'
  | 'storytelling'
  | 'marketing'
  | 'scientific'
  | 'social'

export type ProjectStatus =
  'draft' | 'storyboard' | 'editing' | 'rendering' | 'completed' | 'error'

export type AssetType = 'audio' | 'image' | 'video' | 'logo' | 'document'

export type LayerType = 'text' | 'image' | 'video' | 'shape' | 'animation'

export interface ProjectAsset {
  id: string
  name: string
  type: AssetType
  url?: string
  duration?: number
  mimeType?: string
  size?: number
  metadata?: Record<string, unknown>
}

export interface SceneLayer {
  id: string
  type: LayerType
  name: string
  content?: string

  startTime: number
  duration: number

  properties: Record<string, unknown>

  assetId?: string
  visible?: boolean
  locked?: boolean
}

export interface Scene {
  id: string
  order: number

  title: string
  description: string
  narration?: string

  duration: number
  startTime: number
  endTime: number

  visualStyle?: string
  background?: string
  transition?: string

  assets: ProjectAsset[]
  layers: SceneLayer[]

  notes?: string
}

export interface RevisionSnapshot {
  version: number
  createdAt: string
  scenes: Scene[]
  projectName: string
  description: string
}

export interface Revision {
  id: string
  projectId: string
  description: string
  createdAt: string

  affectedSceneIds: string[]

  previousVersionId?: string
  beforeSnapshot?: RevisionSnapshot
}

export interface RenderSettings {
  format: VideoFormat
  width: number
  height: number
  fps: number
  output: 'mp4'
}

export interface VideoProject {
  id: string
  name: string
  idea: string
  script: string

  category: ProjectCategory
  status: ProjectStatus

  format: VideoFormat
  renderSettings: RenderSettings

  scenes: Scene[]
  assets: ProjectAsset[]
  revisions: Revision[]

  createdAt: string
  updatedAt: string
  version: number

  description?: string
  language?: string
  totalDuration?: number
}
