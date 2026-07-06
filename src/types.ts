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
  summary?: string
  mode?: string
  blocks?: BlockJson[]
  cards?: CardRaw[]
}

export type DeckJsonInput = DeckJson

export interface Deck {
  name: string
  summary: string
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
  | "weak"

export interface StoredMistake {
  id: string
  uuid: string
  lessonId: string
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

export interface PatronesBackup {
  format: "patrones-backup"
  version: 1
  exportedAt: number
  dbVersion: number
  lessons: LessonProgress[]
  mistakes: StoredMistake[]
  settings?: PatronesSettings
}

export type BackupExportMode = "download" | "clipboard"

export type SetupTab = "content" | "mode"

export interface StoredBlockSelection {
  title: string
  mode: string
  on: boolean
}

export interface StoredDeckSelection {
  on: boolean
  blocks: StoredBlockSelection[]
}

export interface PatronesSettings {
  id: "ui"
  version: 1
  updatedAt: number
  isDark: boolean
  order: OrderMode
  dirMode: DirMode
  requeue: boolean
  autospeak: boolean
  timerSec: TimerSec
  modeFilter: CardMode[]
  setupTab: SetupTab
  backupExportMode: BackupExportMode
  decks: Record<string, StoredDeckSelection>
}
