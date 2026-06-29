import { describe, expect, it, vi } from "vitest"
import {
  buildQueue,
  cleanName,
  deckCount,
  normalizeCard,
  parseDeck,
  shuffle,
  sideFor
} from "./patrones"
import { flatDeckJson, makeDeck, sampleDeckJson, tupleDeckJson } from "../test/fixtures"
import type { QueueItem } from "../types"

describe("normalizeCard", () => {
  it("parses tuple cards", () => {
    expect(normalizeCard(["  hola ", "привет ", " note "])).toEqual({
      a: "hola",
      b: "привет",
      note: "note"
    })
  })

  it("parses object cards with aliases", () => {
    expect(normalizeCard({ prompt: "x", answer: "y", note: "z" })).toEqual({
      a: "x",
      b: "y",
      note: "z"
    })
  })

  it("returns null for invalid input", () => {
    expect(normalizeCard(null as unknown as [])).toBeNull()
  })
})

describe("parseDeck", () => {
  it("parses blocked deck json", () => {
    const deck = parseDeck(sampleDeckJson, "fallback")
    expect(deck?.name).toBe("Unidad test")
    expect(deck?.blocks).toHaveLength(2)
    expect(deckCount(deck!)).toBe(3)
  })

  it("parses flat cards json", () => {
    const deck = parseDeck(flatDeckJson, "flat")
    expect(deck?.blocks).toHaveLength(1)
    expect(deckCount(deck!)).toBe(2)
  })

  it("parses bare tuple array", () => {
    const deck = parseDeck(tupleDeckJson, "tuple")
    expect(deck?.name).toBe("tuple")
    expect(deckCount(deck!)).toBe(1)
  })

  it("drops cards without both sides", () => {
    const deck = parseDeck({
      cards: [["ok", "yes"], ["only-a", ""], ["", "only-b"]]
    }, "x")
    expect(deckCount(deck!)).toBe(1)
  })

  it("returns null for empty deck", () => {
    expect(parseDeck({ blocks: [] }, "empty")).toBeNull()
  })
})

describe("cleanName", () => {
  it("removes json extension", () => {
    expect(cleanName("unidad-01.JSON")).toBe("unidad-01")
  })
})

describe("deckCount", () => {
  it("sums cards in all blocks", () => {
    const deck = makeDeck("u", [["a", "b"], ["c", "d"]], {
      blocks: [
        { title: "1", mode: "auto", cards: [{ a: "a", b: "b", note: "" }] },
        { title: "2", mode: "auto", cards: [{ a: "c", b: "d", note: "" }, { a: "e", b: "f", note: "" }] }
      ]
    })
    expect(deckCount(deck)).toBe(3)
  })
})

describe("shuffle", () => {
  it("returns permutation with same elements", () => {
    const src = [1, 2, 3, 4]
    const out = shuffle(src)
    expect(out).toHaveLength(4)
    expect(out.sort()).toEqual(src.sort())
    expect(src).toEqual([1, 2, 3, 4])
  })

  it("can reverse two elements when random returns 0", () => {
    vi.spyOn(Math, "random").mockReturnValue(0)
    expect(shuffle(["a", "b"])).toEqual(["b", "a"])
    vi.restoreAllMocks()
  })
})

describe("buildQueue", () => {
  const deckA = makeDeck("Unit A", [["a1", "b1"], ["a2", "b2"]], { blockTitle: "A-block" })
  const deckB = makeDeck("Unit B", [["c1", "d1"]], { blockTitle: "B-block" })

  it("straight: preserves unit, block and card order", () => {
    const queue = buildQueue([deckA, deckB], "straight")
    expect(queue.map((q) => q.a)).toEqual(["a1", "a2", "c1"])
    expect(queue.map((q) => q.deck)).toEqual(["Unit A", "Unit A", "Unit B"])
    expect(queue[0].section).toBe("A-block")
  })

  it("shuffleCards: keeps units and blocks, shuffles cards inside block", () => {
    vi.spyOn(Math, "random").mockReturnValue(0)
    const queue = buildQueue([deckA], "shuffleCards")
    expect(queue.map((q) => q.a)).toEqual(["a2", "a1"])
    vi.restoreAllMocks()
  })

  it("shuffleBlocks: shuffles blocks and cards within deck", () => {
    const multiBlock = makeDeck("Multi", [["x", "y"]], {
      blocks: [
        { title: "First", mode: "auto", cards: [{ a: "f1", b: "f2", note: "" }] },
        { title: "Second", mode: "auto", cards: [{ a: "s1", b: "s2", note: "" }] }
      ]
    })
    vi.spyOn(Math, "random").mockReturnValue(0)
    const queue = buildQueue([multiBlock], "shuffleBlocks")
    expect(queue.map((q) => q.a)).toEqual(["s1", "f1"])
    vi.restoreAllMocks()
  })

  it("shuffleAll: mixes everything and clears sections", () => {
    const queue = buildQueue([deckA, deckB], "shuffleAll")
    expect(queue).toHaveLength(3)
    expect(queue.every((q) => q.section === "")).toBe(true)
    expect(queue.map((q) => q.a).sort()).toEqual(["a1", "a2", "c1"])
  })
})

describe("sideFor", () => {
  const base: QueueItem = { a: "ru", b: "es", note: "", deck: "d", section: "", mode: "transform" }

  it("auto uses ru direction for vocab", () => {
    const v = sideFor({ ...base, mode: "vocab" }, "auto")
    expect(v).toEqual({ prompt: "ru", answer: "es", side: "подсказка", spanish: "es" })
  })

  it("auto uses es-fwd for transform", () => {
    const v = sideFor(base, "auto")
    expect(v.side).toBe("форма")
    expect(v.prompt).toBe("ru")
  })

  it("ru mode always ru to es", () => {
    expect(sideFor(base, "ru").side).toBe("подсказка")
  })

  it("es mode reverses prompt and answer", () => {
    const v = sideFor(base, "es")
    expect(v).toEqual({ prompt: "es", answer: "ru", side: "español", spanish: "es" })
  })
})
