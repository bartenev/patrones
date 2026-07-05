import { describe, expect, it, vi } from "vitest"
import {
  buildQueue,
  cleanName,
  deckCount,
  normalizeCard,
  parseDeck,
  reviewCount,
  shuffle,
  sideFor
} from "./patrones"
import { flatDeckJson, makeDeck, sampleDeckJson } from "../test/fixtures"
import type { QueueItem } from "../types"

describe("normalizeCard", () => {
  it("parses object cards with front and back", () => {
    expect(normalizeCard({
      front: "el niño",
      back: "la niña",
      translation: "ребёнок",
      note: "hint"
    })).toEqual({
      front: "el niño",
      back: "la niña",
      translation: "ребёнок",
      note: "hint"
    })
  })

  it("trims fields", () => {
    expect(normalizeCard({ front: "  hola ", back: " привет " })).toEqual({
      front: "hola",
      back: "привет",
      translation: "",
      note: ""
    })
  })

  it("returns null for invalid input", () => {
    expect(normalizeCard(null as unknown as { front: string })).toBeNull()
    expect(normalizeCard({ front: "", back: "x" })).toBeNull()
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

  it("drops cards without both sides", () => {
    const deck = parseDeck({
      cards: [
        { front: "ok", back: "yes" },
        { front: "only-a", back: "" },
        { front: "", back: "only-b" }
      ]
    }, "x")
    expect(deckCount(deck!)).toBe(1)
  })

  it("returns null for empty deck", () => {
    expect(parseDeck({ blocks: [] }, "empty")).toBeNull()
  })

  it("uses title when unit is missing", () => {
    const deck = parseDeck({
      title: "From title",
      cards: [{ front: "a", back: "b" }]
    }, "fallback")
    expect(deck?.name).toBe("From title")
  })

  it("prefers unit over title", () => {
    const deck = parseDeck({
      unit: "Unidad",
      title: "Title",
      cards: [{ front: "a", back: "b" }]
    }, "fallback")
    expect(deck?.name).toBe("Unidad")
  })

  it("defaults block title when missing", () => {
    const deck = parseDeck({
      blocks: [{ cards: [{ front: "a", back: "b" }] }]
    }, "x")
    expect(deck?.blocks[0].title).toBe("")
  })

  it("skips blocks without cards array", () => {
    const deck = parseDeck({
      blocks: [{ title: "empty" }, { title: "ok", cards: [{ front: "a", back: "b" }] }]
    }, "x")
    expect(deck?.blocks).toHaveLength(1)
  })

  it("filters blocks with only invalid cards", () => {
    expect(parseDeck({
      blocks: [{ title: "bad", cards: [{ front: "", back: "" }] }]
    }, "x")).toBeNull()
  })

  it("returns null for non-object input", () => {
    expect(parseDeck(null as unknown as { unit: string }, "x")).toBeNull()
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
        { title: "1", mode: "auto", cards: [{ front: "a", back: "b", translation: "", note: "" }] },
        {
          title: "2",
          mode: "auto",
          cards: [
            { front: "c", back: "d", translation: "", note: "" },
            { front: "e", back: "f", translation: "", note: "" }
          ]
        }
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

describe("reviewCount", () => {
  it("sums blocks in selected decks", () => {
    const deck = makeDeck("u", [["a", "b"], ["c", "d"]], {
      blocks: [
        { title: "1", mode: "auto", cards: [{ front: "a", back: "b", translation: "", note: "" }] },
        {
          title: "2",
          mode: "auto",
          cards: [
            { front: "c", back: "d", translation: "", note: "" },
            { front: "e", back: "f", translation: "", note: "" }
          ]
        }
      ]
    })
    expect(reviewCount([deck])).toBe(2)
  })
})

describe("buildQueue", () => {
  const deckA = makeDeck("Unit A", [["a1", "b1"], ["a2", "b2"]], { blockTitle: "A-block" })
  const deckB = makeDeck("Unit B", [["c1", "d1"]], { blockTitle: "B-block" })

  it("straight: preserves unit, block and card order", () => {
    const queue = buildQueue([deckA, deckB], "straight")
    expect(queue.map((q) => q.front)).toEqual(["a1", "a2", "c1"])
    expect(queue.map((q) => q.deck)).toEqual(["Unit A", "Unit A", "Unit B"])
    expect(queue[0].section).toBe("A-block")
  })

  it("shuffleCards: keeps units and blocks, shuffles cards inside block", () => {
    vi.spyOn(Math, "random").mockReturnValue(0)
    const queue = buildQueue([deckA], "shuffleCards")
    expect(queue.map((q) => q.front)).toEqual(["a2", "a1"])
    vi.restoreAllMocks()
  })

  it("shuffleBlocks: shuffles blocks and cards within deck", () => {
    const multiBlock = makeDeck("Multi", [["x", "y"]], {
      blocks: [
        { title: "First", mode: "auto", cards: [{ front: "f1", back: "f2", translation: "", note: "" }] },
        { title: "Second", mode: "auto", cards: [{ front: "s1", back: "s2", translation: "", note: "" }] }
      ]
    })
    vi.spyOn(Math, "random").mockReturnValue(0)
    const queue = buildQueue([multiBlock], "shuffleBlocks")
    expect(queue.map((q) => q.front)).toEqual(["s1", "f1"])
    vi.restoreAllMocks()
  })

  it("shuffleAll: mixes everything and clears sections", () => {
    const queue = buildQueue([deckA, deckB], "shuffleAll")
    expect(queue).toHaveLength(3)
    expect(queue.every((q) => q.section === "")).toBe(true)
    expect(queue.map((q) => q.front).sort()).toEqual(["a1", "a2", "c1"])
  })

  it("review: picks one random card per block from each deck", () => {
    const multiBlock = makeDeck("Multi", [["x", "y"]], {
      blocks: [
        {
          title: "First",
          mode: "auto",
          cards: [
            { front: "f1", back: "f2", translation: "", note: "" },
            { front: "f3", back: "f4", translation: "", note: "" }
          ]
        },
        { title: "Second", mode: "auto", cards: [{ front: "s1", back: "s2", translation: "", note: "" }] }
      ]
    })
    const queue = buildQueue([deckA, multiBlock], "review")
    expect(queue).toHaveLength(3)
    expect(queue.map((q) => q.section).sort()).toEqual(["A-block", "First", "Second"])
  })

  it("review: picks first card when random returns 0", () => {
    const multiBlock = makeDeck("Multi", [["x", "y"]], {
      blocks: [
        {
          title: "First",
          mode: "auto",
          cards: [
            { front: "f1", back: "f2", translation: "", note: "" },
            { front: "f3", back: "f4", translation: "", note: "" }
          ]
        }
      ]
    })
    vi.spyOn(Math, "random").mockReturnValue(0)
    const queue = buildQueue([multiBlock], "review")
    expect(queue).toHaveLength(1)
    expect(queue[0].front).toBe("f1")
    vi.restoreAllMocks()
  })

  it("uses auto mode for blocks without explicit mode", () => {
    const deck = makeDeck("U", [["a", "b"]], {
      blocks: [{ title: "", mode: "", cards: [{ front: "a", back: "b", translation: "", note: "" }] }]
    })
    const [item] = buildQueue([deck], "straight")
    expect(item.mode).toBe("auto")
  })
})

describe("sideFor", () => {
  const base: QueueItem = {
    front: "ru",
    back: "es",
    translation: "перевод",
    note: "",
    deck: "d",
    section: "",
    mode: "transform"
  }

  it("fwd uses front as prompt for vocab", () => {
    const v = sideFor({ ...base, mode: "vocab" }, "fwd")
    expect(v).toEqual({
      prompt: "ru",
      answer: "es",
      side: "подсказка",
      spanish: "es",
      translation: "перевод"
    })
  })

  it("fwd uses front as prompt for transform", () => {
    const v = sideFor(base, "fwd")
    expect(v).toEqual({
      prompt: "ru",
      answer: "es",
      side: "форма",
      spanish: "es",
      translation: "перевод"
    })
  })

  it("fwd treats ru block mode like vocab", () => {
    const v = sideFor({ ...base, mode: "ru" }, "fwd")
    expect(v.side).toBe("подсказка")
  })

  it("rev uses back as prompt for vocab", () => {
    const v = sideFor({ ...base, mode: "vocab" }, "rev")
    expect(v).toEqual({
      prompt: "es",
      answer: "ru",
      side: "español",
      spanish: "",
      translation: "перевод"
    })
  })

  it("rev uses back as prompt for transform", () => {
    const v = sideFor(base, "rev")
    expect(v).toEqual({
      prompt: "es",
      answer: "ru",
      side: "форма",
      spanish: "ru",
      translation: "перевод"
    })
  })

  it("rev speaks spanish answer for transform", () => {
    const v = sideFor({
      front: "el niño",
      back: "la niña",
      translation: "ребёнок",
      note: "",
      deck: "d",
      section: "",
      mode: "transform"
    }, "rev")
    expect(v.prompt).toBe("la niña")
    expect(v.answer).toBe("el niño")
    expect(v.spanish).toBe("el niño")
    expect(v.translation).toBe("ребёнок")
  })
})
