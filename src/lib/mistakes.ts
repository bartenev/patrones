import {
  idbClear,
  idbDelete,
  idbGet,
  idbGetAll,
  idbPut,
  MISTAKES_STORE,
  openPatronesDb
} from "./idb"
import { shuffle } from "./patrones"
import type { DirMode, QueueItem, StoredMistake } from "../types"

export const MISTAKES_BATCH_SIZE = 10

export type MistakeRef = Pick<QueueItem, "uuid" | "dirMode">

export function mistakeKey(uuid: string, dirMode: DirMode): string {
  const dir = dirMode === "rev" ? "rev" : "fwd"
  return `${uuid}\0${dir}`
}

export function cardKey(item: MistakeRef): string {
  return mistakeKey(item.uuid!, item.dirMode)
}

export function canStoreMistake(item: Pick<QueueItem, "uuid">): boolean {
  return Boolean(item.uuid)
}

function normalizeDirMode(dirMode: DirMode): DirMode {
  return dirMode === "rev" ? "rev" : "fwd"
}

function toQueueItem(item: StoredMistake): QueueItem {
  return {
    uuid: item.uuid,
    front: item.front,
    back: item.back,
    translation: item.translation,
    note: item.note,
    deck: item.deck,
    lessonId: item.lessonId,
    section: "",
    mode: item.mode,
    dirMode: item.dirMode
  }
}

export async function loadMistakes(): Promise<StoredMistake[]> {
  return idbGetAll<StoredMistake>(MISTAKES_STORE)
}

export async function mistakeCount(): Promise<number> {
  const mistakes = await loadMistakes()
  return mistakes.length
}

export function mistakesBatchCount(total: number): number {
  return Math.min(total, MISTAKES_BATCH_SIZE)
}

export async function pickMistakesForSession(
  mistakes?: StoredMistake[]
): Promise<StoredMistake[]> {
  const list = mistakes ?? await loadMistakes()
  return [...list]
    .sort((a, b) => b.lastMissedAt - a.lastMissedAt)
    .slice(0, MISTAKES_BATCH_SIZE)
}

export async function recordMistake(item: QueueItem, dirMode: DirMode): Promise<void> {
  if (!canStoreMistake(item) || !item.uuid) return

  const dir = normalizeDirMode(dirMode)
  const id = mistakeKey(item.uuid, dir)
  const prev = await idbGet<StoredMistake>(MISTAKES_STORE, id)

  await idbPut<StoredMistake>(MISTAKES_STORE, {
    id,
    uuid: item.uuid,
    lessonId: item.lessonId,
    deck: item.deck,
    front: item.front,
    back: item.back,
    translation: item.translation,
    note: item.note,
    section: item.section,
    mode: item.mode,
    dirMode: dir,
    missCount: (prev?.missCount ?? 0) + 1,
    lastMissedAt: Date.now()
  })
}

export async function removeMistake(item: QueueItem, dirMode: DirMode): Promise<void> {
  if (!canStoreMistake(item) || !item.uuid) return
  await idbDelete(MISTAKES_STORE, mistakeKey(item.uuid, normalizeDirMode(dirMode)))
}

export async function clearMistakes(): Promise<void> {
  await idbClear(MISTAKES_STORE)
}

export async function initMistakesStore(): Promise<void> {
  await openPatronesDb()
}

export async function buildMistakesQueue(): Promise<QueueItem[]> {
  const picked = await pickMistakesForSession()
  return shuffle(picked.map(toQueueItem))
}
