import { describe, expect, it } from "vitest"
import { loadDecksFromFolder, loadDecksFromModules } from "./loadDecks"
import { flatDeckJson, sampleDeckJson } from "../test/fixtures"

describe("loadDecksFromModules", () => {
  it("loads valid decks sorted by path", () => {
    const { decks, bad } = loadDecksFromModules({
      "../../decks/z-last.json": flatDeckJson,
      "../../decks/a-first.json": sampleDeckJson
    })
    expect(bad).toEqual([])
    expect(decks).toHaveLength(2)
    expect(decks[0].fileName).toBe("a-first.json")
    expect(decks[1].fileName).toBe("z-last.json")
    expect(decks[0].on).toBe(false)
    expect(decks[0].name).toBe("Unidad test")
  })

  it("reports invalid decks", () => {
    const { decks, bad } = loadDecksFromModules({
      "../../decks/broken.json": { blocks: [] }
    })
    expect(decks).toEqual([])
    expect(bad).toEqual(["broken.json"])
  })
})

describe("loadDecksFromFolder", () => {
  it("loads at least bundled fixture deck from decks/", () => {
    const { decks, bad } = loadDecksFromFolder()
    expect(bad).toEqual([])
    expect(decks.some((d) => d.fileName === "unidad-01.json")).toBe(true)
    expect(decks.every((d) => d.on === false)).toBe(true)
  })
})
