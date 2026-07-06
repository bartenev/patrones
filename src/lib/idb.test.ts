import { afterEach, describe, expect, it, vi } from "vitest"
import {
  closePatronesDb,
  deletePatronesDb,
  idbClear,
  idbDelete,
  idbGet,
  idbGetAll,
  idbPut,
  LESSONS_STORE,
  MISTAKES_STORE,
  openPatronesDb,
  resetPatronesDbCache,
  SETTINGS_STORE
} from "./idb"
import type { LessonProgress } from "../types"

describe("idb", () => {
  afterEach(async () => {
    vi.unstubAllGlobals()
    await closePatronesDb()
    await deletePatronesDb()
    resetPatronesDbCache()
  })

  it("opens db and reuses connection", async () => {
    const first = await openPatronesDb()
    const second = await openPatronesDb()
    expect(second).toBe(first)
  })

  it("puts and gets lesson documents", async () => {
    const lesson: LessonProgress = {
      lessonId: "unidad-01.json",
      updatedAt: 1,
      cards: {}
    }
    await idbPut(LESSONS_STORE, lesson)
    expect(await idbGet<LessonProgress>(LESSONS_STORE, lesson.lessonId)).toEqual(lesson)
  })

  it("rejects when indexedDB is unavailable", async () => {
    resetPatronesDbCache()
    vi.stubGlobal("indexedDB", undefined)
    await expect(openPatronesDb()).rejects.toThrow("indexedDB unavailable")
    await expect(deletePatronesDb()).resolves.toBeUndefined()
  })

  it("clears object store", async () => {
    const lesson: LessonProgress = {
      lessonId: "unidad-02.json",
      updatedAt: 1,
      cards: {}
    }
    await idbPut(LESSONS_STORE, lesson)
    await idbClear(LESSONS_STORE)
    expect(await idbGet<LessonProgress>(LESSONS_STORE, lesson.lessonId)).toBeNull()
  })

  it("gets all records and deletes by key", async () => {
    await idbPut(MISTAKES_STORE, { id: "m1", uuid: "u1", front: "hola" })
    expect(await idbGetAll(MISTAKES_STORE)).toHaveLength(1)
    await idbDelete(MISTAKES_STORE, "m1")
    expect(await idbGetAll(MISTAKES_STORE)).toEqual([])
  })

  it("puts and gets settings documents", async () => {
    const settings = { id: "ui", version: 1, updatedAt: 1, isDark: true }
    await idbPut(SETTINGS_STORE, settings)
    expect(await idbGet(SETTINGS_STORE, "ui")).toEqual(settings)
  })

  it("rejects when db open fails", async () => {
    resetPatronesDbCache()
    vi.stubGlobal("indexedDB", {
      open: () => {
        const request = {
          error: new Error("open failed"),
          onerror: null as (() => void) | null,
          onsuccess: null,
          onupgradeneeded: null,
          result: null
        }
        queueMicrotask(() => request.onerror?.())
        return request
      }
    })
    await expect(openPatronesDb()).rejects.toThrow()
  })
})
