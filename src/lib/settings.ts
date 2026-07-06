import { idbDelete, idbGet, idbPut, SETTINGS_STORE } from "./idb"
import { ALL_CARD_MODES } from "../types"
import type {
  BackupExportMode,
  CardMode,
  Deck,
  DirMode,
  OrderMode,
  PatronesSettings,
  SetupTab,
  StoredDeckSelection,
  TimerSec
} from "../types"

export const SETTINGS_ID = "ui" as const
export const SETTINGS_DOC_VERSION = 1

const ORDER_MODES: OrderMode[] = [
  "straight",
  "shuffleCards",
  "shuffleBlocks",
  "shuffleAll",
  "review",
  "weak"
]

const TIMER_VALUES: TimerSec[] = [0, 1, 2, 3, 4, 5]
const SETUP_TABS: SetupTab[] = ["content", "mode"]
const BACKUP_MODES: BackupExportMode[] = ["download", "clipboard"]

export interface PatronesSettingsRefs {
  isDark: { value: boolean }
  order: { value: OrderMode }
  dirMode: { value: DirMode }
  requeue: { value: boolean }
  autospeak: { value: boolean }
  timerSec: { value: TimerSec }
  modeFilter: { value: CardMode[] }
  setupTab: { value: SetupTab }
  backupExportMode: { value: BackupExportMode }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function isCardMode(value: unknown): value is CardMode {
  return typeof value === "string" && ALL_CARD_MODES.includes(value as CardMode)
}

function normalizeModeFilter(value: unknown): CardMode[] | null {
  if (!Array.isArray(value) || !value.length || !value.every(isCardMode)) return null
  return [...new Set(value)]
}

function normalizeDecks(value: unknown): Record<string, StoredDeckSelection> | null {
  if (!value || typeof value !== "object") return null

  const decks: Record<string, StoredDeckSelection> = {}
  for (const [fileName, rawDeck] of Object.entries(value)) {
    if (!rawDeck || typeof rawDeck !== "object") return null
    const deck = rawDeck as Partial<StoredDeckSelection>
    if (typeof deck.on !== "boolean" || !Array.isArray(deck.blocks)) return null

    const blocks = deck.blocks.map((rawBlock) => {
      if (!rawBlock || typeof rawBlock !== "object") return null
      const block = rawBlock as Partial<StoredDeckSelection["blocks"][number]>
      if (typeof block.title !== "string" || typeof block.mode !== "string" || typeof block.on !== "boolean") {
        return null
      }
      return { title: block.title, mode: block.mode, on: block.on }
    })

    if (blocks.some((block) => block === null)) return null
    decks[fileName] = { on: deck.on, blocks: blocks as StoredDeckSelection["blocks"] }
  }

  return decks
}

export function normalizePatronesSettings(raw: unknown): PatronesSettings | null {
  if (!raw || typeof raw !== "object") return null

  const value = raw as Partial<PatronesSettings>
  if (value.id !== SETTINGS_ID || value.version !== SETTINGS_DOC_VERSION) return null
  if (typeof value.isDark !== "boolean") return null

  const order = (value.order as string) === "mistakes" ? "straight" : value.order
  if (!ORDER_MODES.includes(order as OrderMode)) return null
  if (value.dirMode !== "fwd" && value.dirMode !== "rev") return null
  if (typeof value.requeue !== "boolean" || typeof value.autospeak !== "boolean") return null
  if (!TIMER_VALUES.includes(value.timerSec as TimerSec)) return null

  const modeFilter = normalizeModeFilter(value.modeFilter)
  if (!modeFilter) return null

  const setupTab = SETUP_TABS.includes(value.setupTab as SetupTab)
    ? value.setupTab as SetupTab
    : "content"
  const backupExportMode = BACKUP_MODES.includes(value.backupExportMode as BackupExportMode)
    ? value.backupExportMode as BackupExportMode
    : "download"
  const decks = normalizeDecks(value.decks)
  if (!decks) return null

  return {
    id: SETTINGS_ID,
    version: SETTINGS_DOC_VERSION,
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
    isDark: value.isDark,
    order: order as OrderMode,
    dirMode: value.dirMode,
    requeue: value.requeue,
    autospeak: value.autospeak,
    timerSec: value.timerSec as TimerSec,
    modeFilter,
    setupTab,
    backupExportMode,
    decks
  }
}

export function collectDeckSelections(decks: Deck[]): Record<string, StoredDeckSelection> {
  const out: Record<string, StoredDeckSelection> = {}
  for (const deck of decks) {
    out[deck.fileName] = {
      on: deck.on,
      blocks: deck.blocks.map((block) => ({
        title: block.title,
        mode: block.mode,
        on: block.on
      }))
    }
  }
  return out
}

export function buildPatronesSettings(
  refs: PatronesSettingsRefs,
  decks: Deck[]
): PatronesSettings {
  return {
    id: SETTINGS_ID,
    version: SETTINGS_DOC_VERSION,
    updatedAt: Date.now(),
    isDark: refs.isDark.value,
    order: refs.order.value,
    dirMode: refs.dirMode.value,
    requeue: refs.requeue.value,
    autospeak: refs.autospeak.value,
    timerSec: refs.timerSec.value,
    modeFilter: [...refs.modeFilter.value],
    setupTab: refs.setupTab.value,
    backupExportMode: refs.backupExportMode.value,
    decks: collectDeckSelections(decks)
  }
}

export function applyPatronesSettings(settings: PatronesSettings, refs: PatronesSettingsRefs): void {
  refs.isDark.value = settings.isDark
  refs.order.value = settings.order
  refs.dirMode.value = settings.dirMode
  refs.requeue.value = settings.requeue
  refs.autospeak.value = settings.autospeak
  refs.timerSec.value = settings.timerSec
  refs.modeFilter.value = [...settings.modeFilter]
  refs.setupTab.value = settings.setupTab
  refs.backupExportMode.value = settings.backupExportMode
}

export function applyDeckSelections(decks: Deck[], saved: Record<string, StoredDeckSelection>): void {
  for (const deck of decks) {
    const stored = saved[deck.fileName]
    if (!stored) continue

    for (const block of deck.blocks) {
      const storedBlock = stored.blocks.find(
        (item) => item.title === block.title && item.mode === block.mode
      )
      if (storedBlock) block.on = storedBlock.on
    }

    deck.on = stored.on && deck.blocks.some((block) => block.on)
  }
}

export async function loadPatronesSettings(): Promise<PatronesSettings | null> {
  const raw = await idbGet<unknown>(SETTINGS_STORE, SETTINGS_ID)
  return normalizePatronesSettings(raw)
}

export async function savePatronesSettings(settings: PatronesSettings): Promise<void> {
  await idbPut(SETTINGS_STORE, {
    ...settings,
    id: SETTINGS_ID,
    updatedAt: Date.now()
  })
}

export function scheduleSavePatronesSettings(
  refs: PatronesSettingsRefs,
  decks: Deck[]
): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void savePatronesSettings(buildPatronesSettings(refs, decks)).catch(() => {})
  }, 250)
}

export async function clearPatronesSettings(): Promise<void> {
  await idbDelete(SETTINGS_STORE, SETTINGS_ID)
}

export function resetPatronesSettingsSaveTimer(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
}
