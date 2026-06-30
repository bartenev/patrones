import type { DeckJsonInput, LoadDecksResult } from "../types"
import { cleanName, parseDeck } from "./patrones"

const modules = import.meta.glob<DeckJsonInput>("../../decks/*.json", {
  eager: true,
  import: "default"
})

export function loadDecksFromModules(
  entries: Record<string, DeckJsonInput>
): LoadDecksResult {
  const decks: LoadDecksResult["decks"] = []
  const bad: string[] = []

  const sorted = Object.entries(entries).sort(([a], [b]) => a.localeCompare(b, "ru"))

  for (const [path, data] of sorted) {
    const fileName = path.split("/").pop() ?? path
    const deck = parseDeck(data, cleanName(fileName))
    if (deck) {
      deck.fileName = fileName
      deck.on = false
      decks.push(deck)
    } else {
      bad.push(fileName)
    }
  }

  if (decks.length) {
    decks[decks.length - 1].on = true
  }

  return { decks, bad }
}

export function loadDecksFromFolder(): LoadDecksResult {
  return loadDecksFromModules(modules)
}
