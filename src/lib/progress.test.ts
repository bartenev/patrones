import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { closePatronesDb, deletePatronesDb, resetPatronesDbCache } from "./idb"
import {
  canTrackProgress,
  cardWeakness,
  clearAllProgress,
  dirWeakness,
  emptyDirStats,
  getLessonProgress,
  initProgressStore,
  recordProgress,
  recordProgressSafe
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
    await deletePatronesDb()
    await initProgressStore()
  })

  afterEach(async () => {
    await clearAllProgress()
    await closePatronesDb()
    await deletePatronesDb()
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
})
