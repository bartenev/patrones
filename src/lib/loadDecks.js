import { cleanName, parseDeck } from "./patrones.js"

const modules = import.meta.glob("../../decks/*.json", { eager: true, import: "default" })

export function loadDecksFromFolder() {
  const decks = []
  const bad = []

  const entries = Object.entries(modules).sort(([a], [b]) => a.localeCompare(b, "ru"))

  for (const [path, data] of entries) {
    const fileName = path.split("/").pop()
    const deck = parseDeck(data, cleanName(fileName))
    if (deck) {
      deck.fileName = fileName
      deck.on = false
      decks.push(deck)
    } else {
      bad.push(fileName)
    }
  }

  return { decks, bad }
}
