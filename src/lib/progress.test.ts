import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { clearMistakes } from "./mistakes"
import { closePatronesDb, resetPatronesDbCache } from "./idb"
import {
  canTrackProgress,
  cardWeakness,
  clearAllProgress,
  dirWeakness,
  emptyDirStats,
  getLessonProgress,
  initProgressStore,
  recordProgress,
  recordProgressSafe,
  buildWeakQueue,
  countWeakCards,
  itemDirWeakness,
  pickWeakCandidates,
  weakBatchCount,
  WEAK_MIN_ATTEMPTS,
  WEAK_WEAKNESS_THRESHOLD
} from "./progress"
import type { QueueItem } from "../types"

const sample: QueueItem = {
  deck: "Unit 1",
  lessonId: "unidad-01.json",
  front: "hola",
  back: "привет",
  translation: "",
  note: "",
  section: "Lex",
  mode: "vocab",
  uuid: "11111111-1111-4111-8111-111111111111"
}

describe("progress store (indexedDB)", () => {
  beforeEach(async () => {
    resetPatronesDbCache()
    await initProgressStore()
    await clearAllProgress()
    await clearMistakes()
  })

  afterEach(async () => {
    await clearAllProgress()
    await clearMistakes()
    await closePatronesDb()
    resetPatronesDbCache()
  })

  it("initializes store", async () => {
    await initProgressStore()
    expect(await getLessonProgress(sample.lessonId)).toBeNull()
  })

  it("requires uuid and lessonId", () => {
    expect(canTrackProgress(sample)).toBe(true)
    expect(canTrackProgress({ ...sample, uuid: undefined })).toBe(false)
    expect(canTrackProgress({ ...sample, lessonId: "" })).toBe(false)
  })

  it("computes weakness with smoothing", () => {
    expect(dirWeakness(emptyDirStats())).toBe(0)
    expect(dirWeakness({ correct: 8, wrong: 2, streak: 3, lastSeenAt: 1 })).toBeCloseTo(2 / 12)
  })

  it("records knew and missed per direction", async () => {
    await recordProgress(sample, "fwd", "missed")
    await recordProgress(sample, "fwd", "knew")
    await recordProgress(sample, "rev", "missed")

    const lesson = await getLessonProgress(sample.lessonId)
    expect(lesson?.cards[sample.uuid!].fwd).toMatchObject({ correct: 1, wrong: 1, streak: 1 })
    expect(lesson?.cards[sample.uuid!].rev).toMatchObject({ correct: 0, wrong: 1, streak: -1 })
    expect(cardWeakness(lesson!.cards[sample.uuid!])).toBeGreaterThan(0)
  })

  it("skips cards without uuid", async () => {
    await recordProgress({ ...sample, uuid: undefined }, "fwd", "knew")
    expect(await getLessonProgress(sample.lessonId)).toBeNull()
  })

  it("upserts lesson document", async () => {
    const other: QueueItem = {
      ...sample,
      uuid: "22222222-2222-4222-8222-222222222222",
      front: "adiós"
    }
    await recordProgress(sample, "fwd", "knew")
    await recordProgress(other, "fwd", "missed")

    const lesson = await getLessonProgress(sample.lessonId)
    expect(Object.keys(lesson!.cards)).toHaveLength(2)
  })

  it("recordProgressSafe swallows async errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    recordProgressSafe({ ...sample, lessonId: "" }, "fwd", "knew")
    await Promise.resolve()
    spy.mockRestore()
  })

  it("picks weak cards by direction and threshold", async () => {
    await recordProgress(sample, "fwd", "missed")
    await recordProgress(sample, "fwd", "missed")

    const lessons = new Map([[sample.lessonId, (await getLessonProgress(sample.lessonId))!]])
    const weakness = itemDirWeakness(sample, "fwd", lessons)
    expect(weakness).not.toBeNull()
    expect(weakness!).toBeGreaterThanOrEqual(WEAK_WEAKNESS_THRESHOLD)

    const picked = pickWeakCandidates([sample], "fwd", lessons)
    expect(picked).toHaveLength(1)
    expect(weakBatchCount(15)).toBe(10)
  })

  it("builds weak queue from indexed progress", async () => {
    const deck = {
      name: "Unit 1",
      fileName: sample.lessonId,
      summary: "",
      on: true,
      blocks: [{
        title: "Lex",
        mode: "vocab",
        on: true,
        cards: [{
          front: sample.front,
          back: sample.back,
          translation: "",
          note: "",
          uuid: sample.uuid!
        }]
      }]
    }

    await recordProgress(sample, "fwd", "missed")
    await recordProgress(sample, "fwd", "missed")

    const queue = await buildWeakQueue([deck], ["vocab"], "fwd")
    expect(queue).toHaveLength(1)
    expect(queue[0].front).toBe("hola")
    expect(await countWeakCards([deck], ["vocab"], "fwd")).toBe(1)
  })

  it("ignores cards below attempt minimum", () => {
    const lessons = new Map<string, import("../types").LessonProgress>()
    lessons.set(sample.lessonId, {
      lessonId: sample.lessonId,
      updatedAt: 1,
      cards: {
        [sample.uuid!]: {
          fwd: { correct: 0, wrong: 1, streak: -1, lastSeenAt: 1 },
          rev: emptyDirStats()
        }
      }
    })
    expect(itemDirWeakness(sample, "fwd", lessons)).toBeNull()
    expect(WEAK_MIN_ATTEMPTS).toBe(2)
  })
})
