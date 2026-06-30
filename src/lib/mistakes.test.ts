import { afterEach, describe, expect, it, vi } from "vitest"
import {
  buildMistakesQueue,
  cardKey,
  clearMistakes,
  loadMistakes,
  mistakeCount,
  mistakesBatchCount,
  MISTAKES_BATCH_SIZE,
  MISTAKES_STORAGE_KEY,
  pickMistakesForSession,
  recordMistake,
  removeMistake
} from "./mistakes"
import type { QueueItem } from "../types"

const sample: QueueItem = {
  deck: "Unit",
  front: "hola",
  back: "привет",
  translation: "приветствие",
  note: "",
  section: "Lex",
  mode: "vocab"
}

describe("mistakes store", () => {
  afterEach(() => {
    clearMistakes()
  })

  it("builds stable card keys with direction", () => {
    expect(cardKey({ ...sample, dirMode: "ru" })).toBe("Unit\0hola\0привет\0ru")
    expect(cardKey({ ...sample, dirMode: "es" })).toBe("Unit\0hola\0привет\0es")
  })

  it("records and upserts mistakes per direction", () => {
    recordMistake(sample, "ru")
    recordMistake(sample, "ru")
    recordMistake(sample, "es")

    expect(mistakeCount()).toBe(2)
    const items = loadMistakes().sort((a, b) => a.dirMode.localeCompare(b.dirMode))
    expect(items[0].dirMode).toBe("es")
    expect(items[0].missCount).toBe(1)
    expect(items[1].dirMode).toBe("ru")
    expect(items[1].missCount).toBe(2)
  })

  it("removes mistake by card identity and direction", () => {
    recordMistake(sample, "ru")
    recordMistake(sample, "es")
    removeMistake(sample, "ru")
    expect(mistakeCount()).toBe(1)
    expect(loadMistakes()[0].dirMode).toBe("es")
  })

  it("builds shuffled queue from stored mistakes", () => {
    recordMistake(sample, "ru")
    recordMistake({
      ...sample,
      front: "casa",
      back: "дом"
    }, "es")

    const queue = buildMistakesQueue()
    expect(queue).toHaveLength(2)
    expect(queue.every((q) => q.section === "")).toBe(true)
    expect(queue.map((q) => q.front).sort()).toEqual(["casa", "hola"])
    expect(queue.find((q) => q.front === "hola")?.dirMode).toBe("ru")
    expect(queue.find((q) => q.front === "casa")?.dirMode).toBe("es")
  })

  it("limits session queue to batch size", () => {
    for (let i = 0; i < MISTAKES_BATCH_SIZE + 5; i++) {
      recordMistake({ ...sample, front: `w${i}`, back: `b${i}` }, "ru")
    }
    expect(mistakeCount()).toBe(MISTAKES_BATCH_SIZE + 5)
    expect(buildMistakesQueue()).toHaveLength(MISTAKES_BATCH_SIZE)
    expect(mistakesBatchCount()).toBe(MISTAKES_BATCH_SIZE)
  })

  it("picks most recently missed cards for the batch", () => {
    let now = 1000
    vi.spyOn(Date, "now").mockImplementation(() => now)

    for (let i = 0; i < 3; i++) {
      recordMistake({ ...sample, front: `old${i}`, back: `b${i}` }, "ru")
      now += 1
    }
    recordMistake({ ...sample, front: "fresh", back: "new" }, "ru")

    const batch = pickMistakesForSession()
    expect(batch).toHaveLength(4)
    expect(batch[0].front).toBe("fresh")

    vi.restoreAllMocks()
  })

  it("clears all mistakes", () => {
    recordMistake(sample, "auto")
    clearMistakes()
    expect(loadMistakes()).toEqual([])
  })

  it("ignores corrupted storage", () => {
    localStorage.setItem(MISTAKES_STORAGE_KEY, "not-json")
    expect(mistakeCount()).toBe(0)
  })

  it("ignores non-array storage payload", () => {
    localStorage.setItem(MISTAKES_STORAGE_KEY, JSON.stringify({}))
    expect(mistakeCount()).toBe(0)
  })

  it("no-ops when removing unknown mistake", () => {
    removeMistake(sample, "ru")
    expect(mistakeCount()).toBe(0)
  })

  it("defaults legacy mistakes without dirMode to auto", () => {
    localStorage.setItem(MISTAKES_STORAGE_KEY, JSON.stringify([{
      deck: "Unit",
      front: "hola",
      back: "привет",
      translation: "",
      note: "",
      section: "",
      mode: "vocab",
      missCount: 1,
      lastMissedAt: 1
    }]))
    expect(mistakeCount()).toBe(1)
    expect(loadMistakes()[0].dirMode).toBe("auto")
  })

  it("guards when localStorage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined)
    expect(mistakeCount()).toBe(0)
    recordMistake(sample, "ru")
    removeMistake(sample, "ru")
    clearMistakes()
    vi.unstubAllGlobals()
  })
})
