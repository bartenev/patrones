import { describe, expect, it } from "vitest"
import { loadDecksFromFolder, loadDecksFromModules } from "./loadDecks"
import { flatDeckJson, sampleDeckJson } from "../test/fixtures"

describe("loadDecksFromModules", () => {
  it("loads valid decks sorted by path descending", () => {
    const { decks, bad } = loadDecksFromModules({
      "../../decks/z-last.json": flatDeckJson,
      "../../decks/a-first.json": sampleDeckJson
    })
    expect(bad).toEqual([])
    expect(decks).toHaveLength(2)
    expect(decks[0].fileName).toBe("z-last.json")
    expect(decks[1].fileName).toBe("a-first.json")
    expect(decks[0].on).toBe(true)
    expect(decks[1].on).toBe(false)
    expect(decks[0].name).toBe("Flat")
  })

  it("reports invalid decks", () => {
    const { decks, bad } = loadDecksFromModules({
      "../../decks/broken.json": { blocks: [] }
    })
    expect(decks).toEqual([])
    expect(bad).toEqual(["broken.json"])
  })

  it("handles bare filename paths", () => {
    const { decks, bad } = loadDecksFromModules({
      "solo.json": flatDeckJson
    })
    expect(bad).toEqual([])
    expect(decks[0].fileName).toBe("solo.json")
    expect(decks[0].on).toBe(true)
  })

  it("handles nested folder paths", () => {
    const { decks, bad } = loadDecksFromModules({
      "decks/nested/unit.json": flatDeckJson
    })
    expect(bad).toEqual([])
    expect(decks[0].fileName).toBe("unit.json")
    expect(decks[0].on).toBe(true)
  })
})

describe("loadDecksFromFolder", () => {
  it("loads at least bundled fixture deck from decks/", () => {
    const { decks, bad } = loadDecksFromFolder()
    expect(bad).toEqual([])
    expect(decks.some((d) => d.fileName === "unidad-01.json")).toBe(true)
    const newest = [...decks].sort((a, b) => b.fileName.localeCompare(a.fileName, "ru"))[0]
    expect(newest?.on).toBe(true)
    expect(decks.filter((d) => d.on)).toHaveLength(1)
  })
})
