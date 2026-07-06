export type CardMode = "transform" | "vocab" | "cloze" | "phrase"

export const ALL_CARD_MODES: CardMode[] = ["transform", "vocab", "cloze", "phrase"]

export interface Card {
  front: string
  back: string
  translation: string
  note: string
  uuid?: string
}

export interface CardObject {
  front?: string
  back?: string
  translation?: string
  note?: string
  uuid?: string
}

export type CardRaw = CardObject

export interface Block {
  title: string
  mode: string
  cards: Card[]
  on: boolean
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
  lessonId: string
  section: string
  mode: string
  dirMode?: DirMode
}

export type ProgressResult = "knew" | "missed"

export interface CardDirStats {
  correct: number
  wrong: number
  streak: number
  lastSeenAt: number
}

export interface CardProgressStats {
  fwd: CardDirStats
  rev: CardDirStats
}

export interface LessonProgress {
  lessonId: string
  updatedAt: number
  cards: Record<string, CardProgressStats>
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
