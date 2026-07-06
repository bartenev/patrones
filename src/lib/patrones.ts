import type {
  Block,
  Card,
  CardMode,
  CardRaw,
  Deck,
  DeckJsonInput,
  DirMode,
  OrderMode,
  QueueItem,
  SideView
} from "../types"

export function blockMatchesMode(block: Block, filter: CardMode[]): boolean {
  if (!filter.length) return false
  const mode = (block.mode || "auto").trim()
  return filter.some((item) => {
    if (item === "vocab") return mode === "vocab" || mode === "ru"
    return mode === item
  })
}

export function matchingBlocks(deck: Deck, filter: CardMode[]): Block[] {
  return deck.blocks.filter((b) => blockMatchesMode(b, filter))
}

export function deckHasMatchingBlocks(deck: Deck, filter: CardMode[]): boolean {
  return matchingBlocks(deck, filter).length > 0
}

export function visibleDecks(decks: Deck[], filter: CardMode[]): Deck[] {
  if (!filter.length) return []
  return decks.filter((d) => deckHasMatchingBlocks(d, filter))
}

export function normalizeCard(c: CardRaw): Card | null {
  if (!c || typeof c !== "object") return null

  const front = (c.front || "").trim()
  const back = (c.back || "").trim()
  if (!front || !back) return null

  return {
    front,
    back,
    translation: (c.translation || "").trim(),
    note: (c.note || "").trim(),
    ...(c.uuid ? { uuid: c.uuid.trim() } : {})
  }
}

export function parseDeck(obj: DeckJsonInput, fallbackName: string): Deck | null {
  let name = fallbackName
  let summary = ""
  let blocks: Block[] = []

  if (obj && typeof obj === "object") {
    name = obj.unit || obj.title || fallbackName
    summary = (obj.summary || "").trim()
    if (Array.isArray(obj.blocks)) {
      blocks = obj.blocks
        .map((bl) => ({
          title: (bl.title || "").trim(),
          mode: bl.mode || "auto",
          on: true,
          cards: (Array.isArray(bl.cards) ? bl.cards : [])
            .map(normalizeCard)
            .filter((c): c is Card => Boolean(c))
        }))
        .filter((bl) => bl.cards.length > 0)
    } else if (Array.isArray(obj.cards)) {
      blocks = [{
        title: "",
        mode: obj.mode || "auto",
        on: true,
        cards: obj.cards.map(normalizeCard).filter((c): c is Card => Boolean(c))
      }]
    }
  }

  blocks = blocks.filter((bl) => bl.cards.length > 0)
  const count = blocks.reduce((s, b) => s + b.cards.length, 0)
  return count ? { name, summary, blocks, on: false, fileName: "" } : null
}

export function cleanName(fn: string): string {
  return fn.replace(/\.json$/i, "")
}

export function blockCount(block: Block): number {
  return block.cards.length
}

export function filteredDeckCount(deck: Deck, filter: CardMode[]): number {
  return matchingBlocks(deck, filter).reduce((s, b) => s + blockCount(b), 0)
}

export function selectedBlocks(deck: Deck, filter: CardMode[]): Block[] {
  return deck.blocks.filter((b) => b.on && blockMatchesMode(b, filter))
}

export function activeBlocks(deck: Deck, filter: CardMode[]): Block[] {
  if (!deck.on) return []
  return selectedBlocks(deck, filter)
}

export function selectedDeckCount(deck: Deck, filter: CardMode[]): number {
  return activeBlocks(deck, filter).reduce((s, b) => s + blockCount(b), 0)
}

export function deckCount(d: Deck): number {
  return d.blocks.reduce((s, b) => s + b.cards.length, 0)
}

export function reviewCount(decks: Deck[], filter: CardMode[]): number {
  return decks.reduce((s, d) => s + activeBlocks(d, filter).length, 0)
}

export function shuffle<T>(a: T[]): T[] {
  const arr = [...a]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function blockToItems(deck: Deck, block: Block): QueueItem[] {
  return block.cards.map((c) => ({
    ...c,
    deck: deck.name,
    lessonId: deck.fileName,
    section: block.title || "",
    mode: block.mode || "auto"
  }))
}

export function collectQueueItems(selectedDecks: Deck[], filter: CardMode[]): QueueItem[] {
  const out: QueueItem[] = []
  selectedDecks.forEach((d) => {
    selectedBlocks(d, filter).forEach((bl) => {
      out.push(...blockToItems(d, bl))
    })
  })
  return out
}

export function buildQueue(
  selectedDecks: Deck[],
  order: OrderMode,
  filter: CardMode[]
): QueueItem[] {
  if (order === "review") {
    const out: QueueItem[] = []
    selectedDecks.forEach((d) => {
      selectedBlocks(d, filter).forEach((bl) => {
        const chunk = blockToItems(d, bl)
        if (chunk.length) {
          const idx = (Math.random() * chunk.length) | 0
          out.push(chunk[idx])
        }
      })
    })
    return shuffle(out)
  }

  if (order === "shuffleAll") {
    const items: QueueItem[] = []
    selectedDecks.forEach((d) => {
      selectedBlocks(d, filter).forEach((bl) => items.push(...blockToItems(d, bl)))
    })
    return shuffle(items).map((it) => ({ ...it, section: "" }))
  }

  const out: QueueItem[] = []

  selectedDecks.forEach((d) => {
    const active = selectedBlocks(d, filter)
    if (!active.length) return

    const blocks = order === "shuffleBlocks" ? shuffle([...active]) : active

    blocks.forEach((bl) => {
      const chunk = blockToItems(d, bl)
      out.push(...(order === "straight" ? chunk : shuffle(chunk)))
    })
  })

  return out
}

function sideLabel(card: QueueItem, reversed: boolean): string {
  const isVocab = card.mode === "vocab" || card.mode === "ru"
  if (reversed) return isVocab ? "español" : "форма"
  return isVocab ? "подсказка" : "форма"
}

export function sideFor(card: QueueItem, dirMode: DirMode): SideView {
  const reversed = dirMode === "rev"
  const prompt = reversed ? card.back : card.front
  const answer = reversed ? card.front : card.back
  const isVocab = card.mode === "vocab" || card.mode === "ru"
  const spanish = reversed
    ? (isVocab ? "" : card.front)
    : card.back

  return {
    prompt,
    answer,
    side: sideLabel(card, reversed),
    spanish,
    translation: card.translation
  }
}
