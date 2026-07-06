import { idbClear, idbGet, idbPut, LESSONS_STORE, openPatronesDb } from "./idb"
import type { CardDirStats, DirMode, LessonProgress, ProgressResult, QueueItem } from "../types"

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
