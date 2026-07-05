export interface Card {
  front: string
  back: string
  translation: string
  note: string
}

export interface CardObject {
  front?: string
  back?: string
  translation?: string
  note?: string
}

export type CardRaw = CardObject

export interface Block {
  title: string
  mode: string
  cards: Card[]
}

export interface BlockJson {
  title?: string
  mode?: string
  cards?: CardRaw[]
}

export interface DeckJson {
  unit?: string
  title?: string
  mode?: string
  blocks?: BlockJson[]
  cards?: CardRaw[]
}

export type DeckJsonInput = DeckJson

export interface Deck {
  name: string
  blocks: Block[]
  on: boolean
  fileName: string
}

export interface QueueItem extends Card {
  deck: string
  section: string
  mode: string
  dirMode?: DirMode
}

export type OrderMode =
  | "straight"
  | "shuffleCards"
  | "shuffleBlocks"
  | "shuffleAll"
  | "mistakes"
  | "review"

export interface StoredMistake {
  deck: string
  front: string
  back: string
  translation: string
  note: string
  section: string
  mode: string
  dirMode: DirMode
  missCount: number
  lastMissedAt: number
}

export type DirMode = "fwd" | "rev"

export type TimerSec = 0 | 1 | 2 | 3 | 4 | 5

export type AppView = "setup" | "drill" | "done"

export interface SideView {
  prompt: string
  answer: string
  side: string
  spanish: string
  translation: string
}

export interface LoadDecksResult {
  decks: Deck[]
  bad: string[]
}
