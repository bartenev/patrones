import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { makeDeck } from "../test/fixtures"
import {
  SETTINGS_DOC_VERSION,
  SETTINGS_ID,
  applyDeckSelections,
  applyPatronesSettings,
  buildPatronesSettings,
  clearPatronesSettings,
  loadPatronesSettings,
  normalizePatronesSettings,
  resetPatronesSettingsSaveTimer,
  savePatronesSettings,
  scheduleSavePatronesSettings
} from "./settings"
import { closePatronesDb, resetPatronesDbCache } from "./idb"
import type { PatronesSettings } from "../types"
import type { PatronesSettingsRefs } from "./settings"

function baseSettings(overrides: Partial<PatronesSettings> = {}): PatronesSettings {
  return {
    id: SETTINGS_ID,
    version: SETTINGS_DOC_VERSION,
    updatedAt: 1,
    isDark: true,
    order: "straight",
    dirMode: "fwd",
    requeue: true,
    autospeak: false,
    timerSec: 0,
    modeFilter: ["transform", "vocab", "cloze", "phrase"],
    setupTab: "content",
    decks: {
      "unit-a.json": {
        on: true,
        blocks: [{ title: "Блок", mode: "transform", on: true }]
      }
    },
    ...overrides
  }
}

function makeRefs(): PatronesSettingsRefs {
  return {
    isDark: { value: false },
    order: { value: "shuffleAll" },
    dirMode: { value: "rev" },
    requeue: { value: false },
    autospeak: { value: true },
    timerSec: { value: 3 },
    modeFilter: { value: ["vocab"] },
    setupTab: { value: "mode" }
  }
}

describe("settings", () => {
  beforeEach(() => {
    resetPatronesSettingsSaveTimer()
    resetPatronesDbCache()
  })

  afterEach(async () => {
    resetPatronesSettingsSaveTimer()
    await clearPatronesSettings()
    await closePatronesDb()
    resetPatronesDbCache()
    vi.useRealTimers()
  })

  it("normalizes valid settings", () => {
    const settings = baseSettings()
    expect(normalizePatronesSettings(settings)).toEqual(settings)
  })

  it("migrates legacy mistakes order mode to straight", () => {
    const normalized = normalizePatronesSettings({
      ...baseSettings(),
      order: "mistakes"
    })
    expect(normalized?.order).toBe("straight")
  })

  it("rejects invalid settings", () => {
    expect(normalizePatronesSettings(null)).toBeNull()
    expect(normalizePatronesSettings({ id: "ui", version: 2 })).toBeNull()
    expect(normalizePatronesSettings(baseSettings({ modeFilter: [] }))).toBeNull()
  })

  it("saves and loads settings from indexedDB", async () => {
    const settings = baseSettings({ isDark: false, timerSec: 2 })
    await savePatronesSettings(settings)
    expect(await loadPatronesSettings()).toMatchObject({
      isDark: false,
      timerSec: 2,
      order: "straight"
    })
  })

  it("builds and applies settings refs", () => {
    const refs = makeRefs()
    const decks = [makeDeck("A", [], { fileName: "a.json", on: true })]
    const built = buildPatronesSettings(refs, decks)

    expect(built.isDark).toBe(false)
    expect(built.order).toBe("shuffleAll")
    expect(built.decks["a.json"]?.on).toBe(true)

    const target = makeRefs()
    applyPatronesSettings(built, target)
    expect(target.isDark.value).toBe(false)
    expect(target.timerSec.value).toBe(3)
    expect(target.modeFilter.value).toEqual(["vocab"])
  })

  it("applies saved deck and block selections", () => {
    const deck = makeDeck("Blocks", [], {
      fileName: "blocks.json",
      on: false,
      blocks: [
        { title: "A", mode: "transform", on: true, cards: [] },
        { title: "B", mode: "vocab", on: true, cards: [] }
      ]
    })
    applyDeckSelections([deck], {
      "blocks.json": {
        on: true,
        blocks: [
          { title: "A", mode: "transform", on: false },
          { title: "B", mode: "vocab", on: true }
        ]
      }
    })
    expect(deck.on).toBe(true)
    expect(deck.blocks[0].on).toBe(false)
    expect(deck.blocks[1].on).toBe(true)
  })

  it("debounces scheduled save", async () => {
    resetPatronesSettingsSaveTimer()
    const refs = makeRefs()
    const decks = [makeDeck("A", [], { fileName: "a.json" })]
    scheduleSavePatronesSettings(refs, decks)
    expect(await loadPatronesSettings()).toBeNull()
    await vi.waitUntil(async () => {
      const saved = await loadPatronesSettings()
      return saved?.order === "shuffleAll"
    }, { timeout: 1000 })
  })
})
