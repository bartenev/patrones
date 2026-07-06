import { idbClear, idbGet, idbPut, LESSONS_STORE, openPatronesDb } from "./idb"
import { collectQueueItems, shuffle } from "./patrones"
import type { CardDirStats, CardMode, Deck, DirMode, LessonProgress, ProgressResult, QueueItem } from "../types"

export const WEAK_BATCH_SIZE = 10
export const WEAK_MIN_ATTEMPTS = 2
export const WEAK_WEAKNESS_THRESHOLD = 0.3

interface WeakCandidate {
  item: QueueItem
  weakness: number
}

export function emptyDirStats(): CardDirStats {
  return { correct: 0, wrong: 0, streak: 0, lastSeenAt: 0 }
}

export function emptyLessonProgress(lessonId: string): LessonProgress {
  return { lessonId, updatedAt: 0, cards: {} }
}

export function canTrackProgress(item: Pick<QueueItem, "uuid" | "lessonId">): boolean {
  return Boolean(item.uuid && item.lessonId)
}

export function dirWeakness(stats: CardDirStats): number {
  const attempts = stats.correct + stats.wrong
  if (!attempts) return 0
  return stats.wrong / (attempts + 2)
}

export function cardWeakness(stats: { fwd: CardDirStats; rev: CardDirStats }): number {
  return Math.max(dirWeakness(stats.fwd), dirWeakness(stats.rev))
}

function ensureCardStats(lesson: LessonProgress, uuid: string) {
  if (!lesson.cards[uuid]) {
    lesson.cards[uuid] = { fwd: emptyDirStats(), rev: emptyDirStats() }
  }
  return lesson.cards[uuid]
}

export async function loadLessonsProgress(lessonIds: string[]): Promise<Map<string, LessonProgress>> {
  const lessons = new Map<string, LessonProgress>()
  await Promise.all(lessonIds.map(async (lessonId) => {
    const lesson = await getLessonProgress(lessonId)
    if (lesson) lessons.set(lessonId, lesson)
  }))
  return lessons
}

export function itemDirWeakness(
  item: QueueItem,
  dirMode: DirMode,
  lessons: Map<string, LessonProgress>
): number | null {
  if (!canTrackProgress(item) || !item.uuid || !item.lessonId) return null

  const lesson = lessons.get(item.lessonId)
  const card = lesson?.cards[item.uuid]
  if (!card) return null

  const dir = dirMode === "rev" ? "rev" : "fwd"
  const stats = card[dir]
  const attempts = stats.correct + stats.wrong
  if (attempts < WEAK_MIN_ATTEMPTS) return null

  const weakness = dirWeakness(stats)
  if (weakness < WEAK_WEAKNESS_THRESHOLD) return null
  return weakness
}

export function pickWeakCandidates(
  items: QueueItem[],
  dirMode: DirMode,
  lessons: Map<string, LessonProgress>
): WeakCandidate[] {
  const candidates: WeakCandidate[] = []

  for (const item of items) {
    const weakness = itemDirWeakness(item, dirMode, lessons)
    if (weakness === null) continue
    candidates.push({ item, weakness })
  }

  return candidates.sort((a, b) => b.weakness - a.weakness)
}

export function weakBatchCount(total: number): number {
  return Math.min(total, WEAK_BATCH_SIZE)
}

export async function countWeakCards(
  decks: Deck[],
  filter: CardMode[],
  dirMode: DirMode
): Promise<number> {
  const items = collectQueueItems(decks, filter)
  if (!items.length) return 0

  const lessonIds = [...new Set(items.map((item) => item.lessonId).filter(Boolean))]
  const lessons = await loadLessonsProgress(lessonIds)
  return pickWeakCandidates(items, dirMode, lessons).length
}

export async function buildWeakQueue(
  decks: Deck[],
  filter: CardMode[],
  dirMode: DirMode
): Promise<QueueItem[]> {
  const items = collectQueueItems(decks, filter)
  if (!items.length) return []

  const lessonIds = [...new Set(items.map((item) => item.lessonId).filter(Boolean))]
  const lessons = await loadLessonsProgress(lessonIds)
  const picked = pickWeakCandidates(items, dirMode, lessons)
    .slice(0, WEAK_BATCH_SIZE)
    .map((entry) => entry.item)

  return shuffle(picked).map((item) => ({ ...item, section: "" }))
}

export async function getLessonProgress(lessonId: string): Promise<LessonProgress | null> {
  return idbGet<LessonProgress>(LESSONS_STORE, lessonId)
}

export async function recordProgress(
  item: QueueItem,
  dirMode: DirMode,
  result: ProgressResult
): Promise<void> {
  if (!canTrackProgress(item) || !item.uuid || !item.lessonId) return

  const lesson = (await getLessonProgress(item.lessonId)) ?? emptyLessonProgress(item.lessonId)
  const card = ensureCardStats(lesson, item.uuid)
  const dir = dirMode === "rev" ? "rev" : "fwd"
  const stats = card[dir]
  const now = Date.now()

  if (result === "knew") {
    stats.correct++
    stats.streak = Math.max(0, stats.streak) + 1
  } else {
    stats.wrong++
    stats.streak = Math.min(0, stats.streak) - 1
  }
  stats.lastSeenAt = now
  lesson.updatedAt = now

  await idbPut(LESSONS_STORE, lesson)
}

export function recordProgressSafe(
  item: QueueItem,
  dirMode: DirMode,
  result: ProgressResult
) {
  void recordProgress(item, dirMode, result).catch(() => {})
}

export async function initProgressStore(): Promise<void> {
  await openPatronesDb()
}

export async function clearAllProgress(): Promise<void> {
  await idbClear(LESSONS_STORE)
}
