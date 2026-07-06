import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { clearAllProgress } from "./progress"
import { closePatronesDb, resetPatronesDbCache } from "./idb"
import {
  buildMistakesQueue,
  canStoreMistake,
  cardKey,
  clearMistakes,
  initMistakesStore,
  loadMistakes,
  mistakeCount,
  mistakesBatchCount,
  MISTAKES_BATCH_SIZE,
  pickMistakesForSession,
  recordMistake,
  removeMistake
} from "./mistakes"
import type { QueueItem } from "../types"

const sample: QueueItem = {
  deck: "Unit",
  lessonId: "unit.json",
  front: "hola",
  back: "привет",
  translation: "приветствие",
  note: "",
  section: "Lex",
  mode: "vocab",
  uuid: "11111111-1111-4111-8111-111111111111"
}

describe("mistakes store (indexedDB)", () => {
  beforeEach(async () => {
    resetPatronesDbCache()
    await initMistakesStore()
    await clearMistakes()
    await clearAllProgress()
  })

  afterEach(async () => {
    await clearMistakes()
    await clearAllProgress()
    await closePatronesDb()
    resetPatronesDbCache()
  })

  it("builds stable card keys with uuid and direction", () => {
    expect(cardKey({ uuid: sample.uuid, dirMode: "fwd" })).toBe(`${sample.uuid}\0fwd`)
    expect(cardKey({ uuid: sample.uuid, dirMode: "rev" })).toBe(`${sample.uuid}\0rev`)
  })

  it("requires uuid to store mistakes", () => {
    expect(canStoreMistake(sample)).toBe(true)
    expect(canStoreMistake({ ...sample, uuid: undefined })).toBe(false)
  })

  it("records and upserts mistakes per direction", async () => {
    await recordMistake(sample, "fwd")
    await recordMistake(sample, "fwd")
    await recordMistake(sample, "rev")

    expect(await mistakeCount()).toBe(2)
    const items = (await loadMistakes()).sort((a, b) => a.dirMode.localeCompare(b.dirMode))
    expect(items[0].dirMode).toBe("fwd")
    expect(items[0].missCount).toBe(2)
    expect(items[1].dirMode).toBe("rev")
    expect(items[1].missCount).toBe(1)
  })

  it("removes mistake by card identity and direction", async () => {
    await recordMistake(sample, "fwd")
    await recordMistake(sample, "rev")
    await removeMistake(sample, "fwd")
    expect(await mistakeCount()).toBe(1)
    expect((await loadMistakes())[0].dirMode).toBe("rev")
  })

  it("builds shuffled queue from stored mistakes", async () => {
    await recordMistake(sample, "fwd")
    await recordMistake({
      ...sample,
      uuid: "22222222-2222-4222-8222-222222222222",
      front: "casa",
      back: "дом"
    }, "rev")

    const queue = await buildMistakesQueue()
    expect(queue).toHaveLength(2)
    expect(queue.every((q) => q.section === "")).toBe(true)
    expect(queue.map((q) => q.front).sort()).toEqual(["casa", "hola"])
    expect(queue.find((q) => q.front === "hola")?.dirMode).toBe("fwd")
    expect(queue.find((q) => q.front === "casa")?.dirMode).toBe("rev")
  })

  it("limits session queue to batch size", async () => {
    for (let i = 0; i < MISTAKES_BATCH_SIZE + 5; i++) {
      await recordMistake({
        ...sample,
        uuid: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        front: `w${i}`,
        back: `b${i}`
      }, "fwd")
    }
    expect(await mistakeCount()).toBe(MISTAKES_BATCH_SIZE + 5)
    expect(await buildMistakesQueue()).toHaveLength(MISTAKES_BATCH_SIZE)
    expect(mistakesBatchCount(MISTAKES_BATCH_SIZE + 5)).toBe(MISTAKES_BATCH_SIZE)
  })

  it("picks most recently missed cards for the batch", async () => {
    let now = 1000
    vi.spyOn(Date, "now").mockImplementation(() => now)

    for (let i = 0; i < 3; i++) {
      await recordMistake({
        ...sample,
        uuid: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        front: `old${i}`,
        back: `b${i}`
      }, "fwd")
      now += 1
    }
    await recordMistake({
      ...sample,
      uuid: "33333333-3333-4333-8333-333333333333",
      front: "fresh",
      back: "new"
    }, "fwd")

    const batch = await pickMistakesForSession()
    expect(batch).toHaveLength(4)
    expect(batch[0].front).toBe("fresh")

    vi.restoreAllMocks()
  })

  it("clears all mistakes", async () => {
    await recordMistake(sample, "fwd")
    await clearMistakes()
    expect(await loadMistakes()).toEqual([])
  })

  it("no-ops when removing unknown mistake", async () => {
    await removeMistake(sample, "fwd")
    expect(await mistakeCount()).toBe(0)
  })

  it("skips cards without uuid", async () => {
    await recordMistake({ ...sample, uuid: undefined }, "fwd")
    expect(await mistakeCount()).toBe(0)
  })
})
