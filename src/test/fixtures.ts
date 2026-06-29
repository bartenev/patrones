import type { Deck, DeckJsonInput } from "../types"

export function makeDeck(
  name: string,
  cards: [string, string, string?][],
  opts: Partial<Deck> & { blockTitle?: string; mode?: string } = {}
): Deck {
  const { blockTitle = "Блок", mode = "transform", ...deckOpts } = opts
  return {
    name,
    fileName: `${name}.json`,
    on: false,
    blocks: [{
      title: blockTitle,
      mode,
      cards: cards.map(([a, b, note = ""]) => ({ a, b, note }))
    }],
    ...deckOpts
  }
}

export const sampleDeckJson: DeckJsonInput = {
  unit: "Unidad test",
  blocks: [
    {
      title: "Lex",
      mode: "vocab",
      cards: [["hola", "привет"], ["casa", "дом"]]
    },
    {
      title: "Forms",
      mode: "transform",
      cards: [["el niño", "la niña", "note"]]
    }
  ]
}

export const flatDeckJson: DeckJsonInput = {
  unit: "Flat",
  cards: [["uno", "один"], ["dos", "два"]]
}

export const tupleDeckJson: DeckJsonInput = [["a", "b"]]
