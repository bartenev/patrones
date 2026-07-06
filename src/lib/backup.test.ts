import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  backupFileName,
  downloadJsonFile,
  downloadPatronesBackup,
  exportPatronesBackup,
  serializePatronesBackup
} from "./backup"
import { SETTINGS_ID, savePatronesSettings } from "./settings"
import { clearAllProgress, initProgressStore, recordProgress } from "./progress"
import { clearMistakes, initMistakesStore, recordMistake } from "./mistakes"
import { clearPatronesSettings } from "./settings"
import { closePatronesDb, DB_VERSION, resetPatronesDbCache } from "./idb"
import type { QueueItem } from "../types"

const item: QueueItem = {
  deck: "Unit",
  lessonId: "unit.json",
  front: "hola",
  back: "привет",
  translation: "",
  note: "",
  section: "",
  mode: "vocab",
  uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
}

describe("backup", () => {
  beforeEach(async () => {
    resetPatronesDbCache()
    await initProgressStore()
    await initMistakesStore()
    await clearAllProgress()
    await clearMistakes()
    await clearPatronesSettings()
  })

  afterEach(async () => {
    await clearAllProgress()
    await clearMistakes()
    await clearPatronesSettings()
    await closePatronesDb()
    resetPatronesDbCache()
  })

  it("exports lessons, mistakes and settings", async () => {
    await recordProgress(item, "fwd", "knew")
    await recordMistake(item, "fwd")
    await savePatronesSettings({
      id: SETTINGS_ID,
      version: 1,
      updatedAt: 1,
      isDark: true,
      order: "straight",
      dirMode: "fwd",
      requeue: true,
      autospeak: false,
      timerSec: 0,
      modeFilter: ["vocab"],
      setupTab: "content",
      decks: {}
    })

    const backup = await exportPatronesBackup()
    expect(backup.format).toBe(BACKUP_FORMAT)
    expect(backup.version).toBe(BACKUP_VERSION)
    expect(backup.dbVersion).toBe(DB_VERSION)
    expect(backup.lessons).toHaveLength(1)
    expect(backup.mistakes).toHaveLength(1)
    expect(backup.settings?.timerSec).toBe(0)
    expect(JSON.parse(serializePatronesBackup(backup))).toMatchObject({
      format: BACKUP_FORMAT,
      lessons: [{ lessonId: "unit.json" }]
    })
  })

  it("builds dated backup filename", () => {
    expect(backupFileName(Date.UTC(2026, 6, 7))).toBe("patrones-backup-2026-07-07.json")
  })

  it("downloads json via temporary link", () => {
    const click = vi.fn()
    const link = { href: "", download: "", click } as HTMLAnchorElement
    const createElement = vi.spyOn(document, "createElement").mockReturnValue(link)
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test")

    downloadJsonFile("test.json", '{"ok":true}')

    expect(createObjectURL).toHaveBeenCalled()
    expect(link.download).toBe("test.json")
    expect(click).toHaveBeenCalled()
    expect(revoke).toHaveBeenCalledWith("blob:test")

    createElement.mockRestore()
    revoke.mockRestore()
    createObjectURL.mockRestore()
  })

  it("downloads patrones backup file", async () => {
    const click = vi.fn()
    vi.spyOn(document, "createElement").mockReturnValue({
      href: "",
      download: "",
      click
    } as HTMLAnchorElement)
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:backup")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {})

    const backup = await downloadPatronesBackup()
    expect(backup.format).toBe(BACKUP_FORMAT)
    expect(click).toHaveBeenCalled()
  })
})
