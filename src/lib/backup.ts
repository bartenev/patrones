import {
  DB_VERSION,
  idbGetAll,
  LESSONS_STORE,
  MISTAKES_STORE
} from "./idb"
import type { LessonProgress, PatronesBackup, PatronesSettings, StoredMistake } from "../types"
import { SETTINGS_STORE, idbGet } from "./idb"
import { SETTINGS_ID } from "./settings"

export const BACKUP_FORMAT = "patrones-backup" as const
export const BACKUP_VERSION = 1

export async function exportPatronesBackup(): Promise<PatronesBackup> {
  const [lessons, mistakes, settings] = await Promise.all([
    idbGetAll<LessonProgress>(LESSONS_STORE),
    idbGetAll<StoredMistake>(MISTAKES_STORE),
    idbGet<PatronesSettings>(SETTINGS_STORE, SETTINGS_ID)
  ])

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    dbVersion: DB_VERSION,
    lessons,
    mistakes,
    settings: settings ?? undefined
  }
}

export function backupFileName(exportedAt: number): string {
  const d = new Date(exportedAt)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `patrones-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`
}

export function serializePatronesBackup(backup: PatronesBackup): string {
  return JSON.stringify(backup, null, 2)
}

export function downloadJsonFile(filename: string, json: string): void {
  const blob = new Blob([json], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export async function downloadPatronesBackup(): Promise<PatronesBackup> {
  const backup = await exportPatronesBackup()
  downloadJsonFile(backupFileName(backup.exportedAt), serializePatronesBackup(backup))
  return backup
}
