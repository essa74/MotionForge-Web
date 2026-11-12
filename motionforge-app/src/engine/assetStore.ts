import type { AssetType, ProjectAsset } from './projectTypes'

const DB_NAME = 'motionforge-assets'
const DB_VERSION = 1
const STORE_NAME = 'project-files'

interface StoredAsset {
  id: string
  projectId: string
  file: Blob
  name: string
  type: AssetType
  mimeType: string
  size: number
  createdAt: string
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('التخزين المحلي للملفات غير متاح في هذا المتصفح.'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('projectId', 'projectId', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('تعذر فتح مخزن الملفات.'))
    request.onblocked = () => reject(new Error('مخزن الملفات مشغول في تبويب آخر.'))
  })
}

export async function saveProjectFiles(
  projectId: string,
  files: Array<{ file: File; type: AssetType }>,
): Promise<ProjectAsset[]> {
  if (files.length === 0) return []
  const db = await openDatabase()
  try {
    const stored: StoredAsset[] = files.map(({ file, type }) => ({
      id: `${projectId}-${crypto.randomUUID()}`,
      projectId,
      file,
      name: file.name,
      type,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      createdAt: new Date().toISOString(),
    }))
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      stored.forEach((asset) => store.put(asset))
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('تعذر حفظ الملفات.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('تم إلغاء حفظ الملفات.'))
    })
    return stored.map(({ id, name, type, mimeType, size }) => ({ id, name, type, mimeType, size }))
  } finally {
    db.close()
  }
}

export async function getProjectFiles(projectId: string): Promise<Array<ProjectAsset & { url: string }>> {
  const db = await openDatabase()
  try {
    const records = await new Promise<StoredAsset[]>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const request = transaction.objectStore(STORE_NAME).index('projectId').getAll(projectId)
      request.onsuccess = () => resolve(request.result as StoredAsset[])
      request.onerror = () => reject(request.error ?? new Error('تعذر قراءة ملفات المشروع.'))
    })
    return records.map((asset) => ({
      id: asset.id, name: asset.name, type: asset.type, mimeType: asset.mimeType,
      size: asset.size, url: URL.createObjectURL(asset.file),
    }))
  } finally {
    db.close()
  }
}

export async function deleteProjectFiles(projectId: string): Promise<void> {
  const db = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.index('projectId').openKeyCursor(IDBKeyRange.only(projectId))
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) { store.delete(cursor.primaryKey); cursor.continue() }
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('تعذر حذف ملفات المشروع.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('تم إلغاء حذف الملفات.'))
    })
  } finally {
    db.close()
  }
}

export async function deleteProjectAsset(assetId: string): Promise<void> {
  const db = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).delete(assetId)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('تعذر حذف الملف.'))
      transaction.onabort = () => reject(transaction.error ?? new Error('تم إلغاء حذف الملف.'))
    })
  } finally {
    db.close()
  }
}
