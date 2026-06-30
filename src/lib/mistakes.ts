import { shuffle } from "./patrones"
import type { DirMode, QueueItem, StoredMistake } from "../types"

export const MISTAKES_STORAGE_KEY = "patrones:mistakes"

export type MistakeRef = Pick<QueueItem, "deck" | "front" | "back"> & {
  dirMode: DirMode
}

export function cardKey(item: MistakeRef): string {
  return `${item.deck}\0${item.front}\0${item.back}\0${item.dirMode}`
}

function normalizeMistake(item: StoredMistake): StoredMistake {
  return {
    ...item,
    dirMode: item.dirMode ?? "auto"
  }
}

function readStore(): Map<string, StoredMistake> {
  if (typeof localStorage === "undefined") return new Map()

  try {
    const raw = localStorage.getItem(MISTAKES_STORAGE_KEY)
    if (!raw) return new Map()

    const list = JSON.parse(raw) as StoredMistake[]
    if (!Array.isArray(list)) return new Map()

    return new Map(list.map((item) => {
      const normalized = normalizeMistake(item)
      return [cardKey(normalized), normalized]
    }))
  } catch {
    return new Map()
  }
}

function writeStore(store: Map<string, StoredMistake>) {
  if (typeof localStorage === "undefined") return
  if (!store.size) {
    localStorage.removeItem(MISTAKES_STORAGE_KEY)
    return
  }
  localStorage.setItem(MISTAKES_STORAGE_KEY, JSON.stringify([...store.values()]))
}

export function loadMistakes(): StoredMistake[] {
  return [...readStore().values()]
}

export function mistakeCount(): number {
  return readStore().size
}

export function recordMistake(item: QueueItem, dirMode: DirMode) {
  const store = readStore()
  const ref: MistakeRef = {
    deck: item.deck,
    front: item.front,
    back: item.back,
    dirMode
  }
  const key = cardKey(ref)
  const prev = store.get(key)

  store.set(key, {
    deck: item.deck,
    front: item.front,
    back: item.back,
    translation: item.translation,
    note: item.note,
    section: item.section,
    mode: item.mode,
    dirMode,
    missCount: (prev?.missCount ?? 0) + 1,
    lastMissedAt: Date.now()
  })

  writeStore(store)
}

export function removeMistake(item: QueueItem, dirMode: DirMode) {
  const store = readStore()
  if (!store.delete(cardKey({ deck: item.deck, front: item.front, back: item.back, dirMode }))) return
  writeStore(store)
}

export function clearMistakes() {
  if (typeof localStorage === "undefined") return
  localStorage.removeItem(MISTAKES_STORAGE_KEY)
}

export function buildMistakesQueue(): QueueItem[] {
  return shuffle(loadMistakes().map((item) => ({
    front: item.front,
    back: item.back,
    translation: item.translation,
    note: item.note,
    deck: item.deck,
    section: "",
    mode: item.mode,
    dirMode: item.dirMode
  })))
}
