export const DB_NAME = "patrones"
export const DB_VERSION = 1
export const LESSONS_STORE = "lessons"

let dbPromise: Promise<IDBDatabase> | null = null
let dbInstance: IDBDatabase | null = null

export function openPatronesDb(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance)
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB unavailable"))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(LESSONS_STORE)) {
        db.createObjectStore(LESSONS_STORE, { keyPath: "lessonId" })
      }
    }

    request.onsuccess = () => {
      dbInstance = request.result
      dbInstance.onclose = () => {
        dbInstance = null
        dbPromise = null
      }
      resolve(dbInstance)
    }
    request.onerror = () => {
      dbPromise = null
      reject(request.error ?? new Error("indexedDB open failed"))
    }
  })

  return dbPromise
}

export function resetPatronesDbCache() {
  dbPromise = null
  dbInstance = null
}

export async function closePatronesDb(): Promise<void> {
  if (!dbInstance) return
  dbInstance.close()
  dbInstance = null
  dbPromise = null
}

export async function idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | null> {
  const db = await openPatronesDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly")
    const request = tx.objectStore(storeName).get(key)
    request.onsuccess = () => resolve((request.result as T | undefined) ?? null)
    request.onerror = () => reject(request.error ?? new Error("indexedDB get failed"))
  })
}

export async function idbPut<T>(storeName: string, value: T): Promise<void> {
  const db = await openPatronesDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite")
    const request = tx.objectStore(storeName).put(value)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error("indexedDB put failed"))
  })
}

export async function idbClear(storeName: string): Promise<void> {
  const db = await openPatronesDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite")
    const request = tx.objectStore(storeName).clear()
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error("indexedDB clear failed"))
  })
}

export async function deletePatronesDb(): Promise<void> {
  await closePatronesDb()
  if (typeof indexedDB === "undefined") return

  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error("indexedDB delete failed"))
  })
}
