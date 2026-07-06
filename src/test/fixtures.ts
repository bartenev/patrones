import type { Card, Deck, DeckJsonInput } from "../types"

export function makeCard(
  front: string,
  back: string,
  opts: { translation?: string; note?: string } = {}
): Card {
  return {
    front,
    back,
    translation: opts.translation ?? "",
    note: opts.note ?? ""
  }
}

export function makeDeck(
  name: string,
  cards: Array<[string, string] | Card>,
  opts: Partial<Deck> & { blockTitle?: string; mode?: string } = {}
): Deck {
  const { blockTitle = "Блок", mode = "transform", ...deckOpts } = opts
  return {
    name,
    fileName: `${name}.json`,
    summary: "",
    on: false,
    blocks: [{
      title: blockTitle,
      mode,
      on: true,
      cards: cards.map((c) => (
        Array.isArray(c) ? makeCard(c[0], c[1]) : c
      ))
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
      cards: [
        { front: "hola", back: "привет" },
        { front: "casa", back: "дом" }
      ]
    },
    {
      title: "Forms",
      mode: "transform",
      cards: [{ front: "el niño", back: "la niña", note: "note" }]
    }
  ]
}

export const flatDeckJson: DeckJsonInput = {
  unit: "Flat",
  cards: [
    { front: "uno", back: "один" },
    { front: "dos", back: "два" }
  ]
}
