import { afterEach, describe, expect, it, vi } from "vitest"
import {
  closePatronesDb,
  deletePatronesDb,
  idbClear,
  idbGet,
  idbPut,
  LESSONS_STORE,
  openPatronesDb,
  resetPatronesDbCache
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
