import { flushPromises, mount, VueWrapper } from "@vue/test-utils"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { Deck, QueueItem } from "./types"
import * as patrones from "./lib/patrones"
import { clearMistakes, initMistakesStore, loadMistakes, recordMistake } from "./lib/mistakes"
import { clearAllProgress, getLessonProgress, initProgressStore, recordProgress } from "./lib/progress"
import { clearPatronesSettings } from "./lib/settings"
import { closePatronesDb, resetPatronesDbCache } from "./lib/idb"

const { mockDecks, loadDecksFromFolderMock } = vi.hoisted(() => {
  const decks: Deck[] = [
    {
      name: "Unit A",
      fileName: "unit-a.json",
      summary: "",
      on: false,
      blocks: [{
        title: "Блок",
        mode: "transform",
        on: true,
        cards: [{ front: "el niño", back: "la niña", translation: "", note: "", uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }]
      }]
    },
    {
      name: "Unit B",
      fileName: "unit-b.json",
      summary: "",
      on: true,
      blocks: [{
        title: "Блок",
        mode: "vocab",
        on: true,
        cards: [{ front: "hola", back: "привет", translation: "", note: "", uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }]
      }]
    }
  ]
  return {
    mockDecks: decks,
    loadDecksFromFolderMock: vi.fn(() => ({
      decks: structuredClone(decks),
      bad: [] as string[]
    }))
  }
})

vi.mock("./lib/loadDecks", () => ({
  loadDecksFromFolder: loadDecksFromFolderMock
}))

import App from "./App.vue"

let wrappers: VueWrapper[] = []

async function mountApp() {
  const wrapper = mount(App)
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}

async function startDrill(wrapper: VueWrapper) {
  if (wrapper.get(".start").attributes("disabled") !== undefined) {
    const toggles = wrapper.findAll(".deck-toggle")
    await toggles[toggles.length - 1].trigger("click")
  }
  await wrapper.get(".start").trigger("click")
  await flushPromises()
}

async function startMistakesDrill(wrapper: VueWrapper) {
  await wrapper.get(".mistakes-start").trigger("click")
  await flushPromises()
}

async function openModeTab(wrapper: VueWrapper) {
  await wrapper.findAll(".setup-tabs button")[1].trigger("click")
  await flushPromises()
}

async function setOrder(wrapper: VueWrapper, value: string) {
  await openModeTab(wrapper)
  const input = wrapper.find(`.order-radio input[value="${value}"]`)
  await input.setValue(true)
  await flushPromises()
}

async function setTimer(wrapper: VueWrapper, seconds: string) {
  await openModeTab(wrapper)
  await wrapper.find(".opt-select").setValue(seconds)
  await flushPromises()
}

describe("App", () => {
  beforeAll(async () => {
    resetPatronesDbCache()
    await initProgressStore()
    await initMistakesStore()
  })

  beforeEach(async () => {
    vi.useRealTimers()
    wrappers = []
    await clearAllProgress()
    await clearMistakes()
    await clearPatronesSettings()
    loadDecksFromFolderMock.mockClear()
    loadDecksFromFolderMock.mockImplementation(() => ({
      decks: structuredClone(mockDecks),
      bad: []
    }))
    document.documentElement.removeAttribute("data-theme")
    localStorage.clear()
    vi.stubGlobal("speechSynthesis", {
      cancel: vi.fn(),
      speak: vi.fn(),
      getVoices: vi.fn(() => []),
      onvoiceschanged: null
    })
    vi.stubGlobal("SpeechSynthesisUtterance", vi.fn(function (this: { text: string }, text: string) {
      this.text = text
    }))
  })

  afterEach(async () => {
    vi.useRealTimers()
    wrappers.forEach((w) => w.unmount())
    wrappers = []
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    await flushPromises()
  })

  it("renders setup with loaded units", async () => {
    const wrapper = await mountApp()
    expect(wrapper.text()).toContain("Patrones")
    expect(wrapper.text()).toContain("Unit A")
    expect(wrapper.text()).toContain("Unit B")
    expect(wrapper.get(".start").attributes("disabled")).toBeUndefined()
    expect(wrapper.text()).toContain("Начать прогон → 1 пар")
  })

  it("toggles unit selection by toggle click", async () => {
    const wrapper = await mountApp()
    const row = wrapper.find(".deck")
    expect(row.classes()).not.toContain("on")
    await wrapper.find(".deck-toggle").trigger("click")
    expect(row.classes()).toContain("on")
    expect(wrapper.get(".start").attributes("disabled")).toBeUndefined()
    expect(wrapper.text()).toContain("Начать прогон → 2 пар")
  })

  it("select all and clear selection", async () => {
    const wrapper = await mountApp()
    const buttons = wrapper.findAll(".mini")
    await buttons[0].trigger("click")
    expect(wrapper.findAll(".deck.on")).toHaveLength(2)
    await buttons[1].trigger("click")
    expect(wrapper.findAll(".deck.on")).toHaveLength(0)
  })

  it("runs drill flow: reveal, knew, finish", async () => {
    const wrapper = await mountApp()
    await startDrill(wrapper)

    expect(wrapper.text()).toContain("hola")
    expect(wrapper.text()).toContain("осталось")
    expect(wrapper.find(".answer").exists()).toBe(false)

    await wrapper.get(".reveal").trigger("click")
    expect(wrapper.text()).toContain("привет")
    expect(wrapper.get(".knew").exists()).toBe(true)

    await wrapper.get(".knew").trigger("click")
    expect(wrapper.text()).toContain("¡Listo!")
    expect(wrapper.text()).toContain("Все 1 без запинки")
  })

  it("requeues missed cards when enabled", async () => {
    const wrapper = await mountApp()
    await startDrill(wrapper)
    await wrapper.get(".reveal").trigger("click")
    await wrapper.get(".missed").trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("hola")
    expect(wrapper.text()).toContain("осталось 1")
    await wrapper.get(".reveal").trigger("click")
    await wrapper.get(".knew").trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("споткнулся 1")
  })

  it("quits drill on escape", async () => {
    const wrapper = await mountApp()
    await startDrill(wrapper)
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await flushPromises()
    expect(wrapper.find(".decks-scroll").exists()).toBe(true)
  })

  it("supports keyboard reveal and rating", async () => {
    const wrapper = await mountApp()
    await startDrill(wrapper)
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true }))
    await flushPromises()
    expect(wrapper.text()).toContain("привет")
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
    await flushPromises()
    expect(wrapper.text()).toContain("¡Listo!")
  })

  it("uses dark theme by default and toggles to light", async () => {
    const wrapper = await mountApp()
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
    expect(wrapper.text()).toContain("☀ Тема")
    await wrapper.get('[title="Тема"]').trigger("click")
    expect(document.documentElement.getAttribute("data-theme")).toBe("light")
    expect(wrapper.text()).toContain("☾ Тема")
    await wrapper.get('[title="Тема"]').trigger("click")
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark")
  })

  it("handles deck toggle click", async () => {
    const wrapper = await mountApp()
    await wrapper.find(".deck-toggle").trigger("click")
  })

  it("shows six order modes", async () => {
    const wrapper = await mountApp()
    await openModeTab(wrapper)
    expect(wrapper.findAll(".order-radio input[type='radio']")).toHaveLength(6)
    expect(wrapper.text()).toContain("6 — слабые")
  })

  it("shows error when folder has no decks", async () => {
    loadDecksFromFolderMock.mockImplementationOnce(() => ({ decks: [], bad: [] }))
    const wrapper = await mountApp()
    expect(wrapper.text()).toContain("В папке decks/ нет .json")
  })

  it("shows parse errors for bad files", async () => {
    loadDecksFromFolderMock.mockImplementationOnce(() => ({
      decks: structuredClone(mockDecks),
      bad: ["broken.json"]
    }))
    const wrapper = await mountApp()
    expect(wrapper.text()).toContain("broken.json")
  })

  it("stores card progress in indexedDB on rating", async () => {
    const wrapper = await mountApp()
    await startDrill(wrapper)
    await wrapper.get(".reveal").trigger("click")
    await wrapper.get(".knew").trigger("click")
    await vi.waitUntil(async () => {
      const lesson = await getLessonProgress("unit-b.json")
      return lesson?.cards["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]?.fwd.correct === 1
    })
  })

  it("returns to setup from done screen", async () => {
    const wrapper = await mountApp()
    await startDrill(wrapper)
    await wrapper.get(".reveal").trigger("click")
    await wrapper.get(".knew").trigger("click")
    await wrapper.get(".done .ghost").trigger("click")
    await flushPromises()
    expect(wrapper.find(".decks-scroll").exists()).toBe(true)
  })

  it("rates missed via keyboard and speaks on demand", async () => {
    const wrapper = await mountApp()
    await startDrill(wrapper)
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true }))
    await flushPromises()
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true }))
    await flushPromises()
    expect(wrapper.text()).toContain("hola")
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true }))
    await flushPromises()
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "s", bubbles: true }))
    await flushPromises()
    expect(speechSynthesis.speak).toHaveBeenCalled()
    await wrapper.get(".knew").trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("споткнулся 1")
  })

  it("shows unit title and note after reveal", async () => {
    loadDecksFromFolderMock.mockImplementationOnce(() => ({
      decks: [{
        name: "Rich",
        fileName: "rich.json",
        summary: "",
        on: false,
        blocks: [{
          title: "Секция",
          mode: "transform",
          on: true,
          cards: [{
            front: "forma",
            back: "respuesta",
            translation: "перевод",
            note: "подсказка"
          }]
        }]
      }],
      bad: []
    }))
    const wrapper = await mountApp()
    await wrapper.find(".deck-toggle").trigger("click")
    await wrapper.get(".start").trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("Rich")
    expect(wrapper.text()).toContain("перевод")
    expect(wrapper.text()).not.toContain("подсказка")
    await wrapper.get(".reveal").trigger("click")
    expect(wrapper.text()).toContain("подсказка")
    expect(wrapper.find(".spk").exists()).toBe(true)
  })

  it("changes direction mode", async () => {
    const wrapper = await mountApp()
    await openModeTab(wrapper)
    await wrapper.findAll(".dir-seg button")[1].trigger("click")
    await wrapper.get(".start").trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("español")
  })

  it("removes keydown listener on unmount", async () => {
    const removeSpy = vi.spyOn(document, "removeEventListener")
    const wrapper = await mountApp()
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function))
    removeSpy.mockRestore()
  })

  it("auto flips and advances on timer", async () => {
    const wrapper = await mountApp()
    await setTimer(wrapper, "2")
    vi.useFakeTimers()
    try {
      await startDrill(wrapper)
      expect(wrapper.find(".card-timer").exists()).toBe(true)
      expect(wrapper.find(".reveal").exists()).toBe(false)
      expect(wrapper.text()).toContain("авто · 2 с на вопрос")
      await vi.advanceTimersByTimeAsync(2000)
      await flushPromises()
      expect(wrapper.text()).toContain("привет")
      await vi.advanceTimersByTimeAsync(1000)
      await flushPromises()
      expect(wrapper.text()).toContain("¡Listo!")
    } finally {
      vi.useRealTimers()
      await flushPromises()
    }
  })

  it("clears active timer when quitting drill", async () => {
    const wrapper = await mountApp()
    await setTimer(wrapper, "3")
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(global, "clearTimeout")
    try {
      await startDrill(wrapper)
      await wrapper.find(".bar .ghost").trigger("click")
      expect(clearSpy).toHaveBeenCalled()
    } finally {
      clearSpy.mockRestore()
      vi.useRealTimers()
      await flushPromises()
    }
  })

  it("autospeaks on timer reveal", async () => {
    const wrapper = await mountApp()
    await setTimer(wrapper, "1")
    await openModeTab(wrapper)
    await wrapper.findAll("label.opt-toggle input")[0].setValue(true)
    await flushPromises()
    vi.useFakeTimers()
    try {
      await startDrill(wrapper)
      await vi.advanceTimersByTimeAsync(1000)
      await flushPromises()
      expect(speechSynthesis.speak).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
      await flushPromises()
    }
  })

  it("pauses and resumes timer on card click", async () => {
    const wrapper = await mountApp()
    await setTimer(wrapper, "2")
    vi.useFakeTimers()
    try {
      await startDrill(wrapper)
      const card = wrapper.get(".card")
      expect(card.classes()).not.toContain("paused")

      await card.trigger("click")
      await flushPromises()
      expect(card.classes()).toContain("paused")

      await vi.advanceTimersByTimeAsync(5000)
      await flushPromises()
      expect(wrapper.text()).not.toContain("привет")

      await card.trigger("click")
      await flushPromises()
      expect(card.classes()).not.toContain("paused")

      await vi.advanceTimersByTimeAsync(2000)
      await flushPromises()
      expect(wrapper.text()).toContain("привет")
    } finally {
      vi.useRealTimers()
      await flushPromises()
    }
  })

  it("resumes answer timer and advances to done", async () => {
    const wrapper = await mountApp()
    await setTimer(wrapper, "1")
    vi.useFakeTimers()
    try {
      await startDrill(wrapper)
      await vi.advanceTimersByTimeAsync(1000)
      await flushPromises()
      expect(wrapper.text()).toContain("привет")

      const card = wrapper.get(".card")
      await card.trigger("click")
      await flushPromises()
      expect(card.classes()).toContain("paused")

      await card.trigger("click")
      await flushPromises()

      await vi.advanceTimersByTimeAsync(1000)
      await flushPromises()
      expect(wrapper.text()).toContain("¡Listo!")
    } finally {
      vi.useRealTimers()
      await flushPromises()
    }
  })

  it("disables start in weak mode when no difficult cards", async () => {
    const wrapper = await mountApp()
    await setOrder(wrapper, "weak")
    await flushPromises()
    expect(wrapper.text()).toContain("Нет сложных карточек")
    expect(wrapper.get(".start").attributes("disabled")).toBeDefined()
  })

  it("runs weak mode for cards with high error rate", async () => {
    const item = {
      deck: "Unit B",
      lessonId: "unit-b.json",
      front: "hola",
      back: "привет",
      translation: "",
      note: "",
      section: "",
      mode: "vocab",
      uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    }
    await recordProgress(item, "fwd", "missed")
    await recordProgress(item, "fwd", "missed")

    const wrapper = await mountApp()
    await setOrder(wrapper, "weak")
    await flushPromises()
    await vi.waitUntil(() => {
      const disabled = wrapper.get(".start").attributes("disabled")
      return disabled === undefined && wrapper.text().includes("Сложные → 1 пар")
    }, { timeout: 3000 })
    await wrapper.get(".start").trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("hola")
    await wrapper.get(".reveal").trigger("click")
    await wrapper.get(".knew").trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("¡Listo!")
  })

  it("disables mistakes button when bank is empty", async () => {
    const wrapper = await mountApp()
    await flushPromises()
    expect(wrapper.text()).toContain("Нет сохранённых ошибок")
    expect(wrapper.get(".mistakes-start").attributes("disabled")).toBeDefined()
  })

  it("ignores second reveal", async () => {
    const wrapper = await mountApp()
    await startDrill(wrapper)
    await wrapper.get(".reveal").trigger("click")
    expect(wrapper.find(".reveal").exists()).toBe(false)
  })

  it("mounts when speech synthesis is unavailable", async () => {
    vi.stubGlobal("speechSynthesis", undefined)
    const wrapper = await mountApp()
    await startDrill(wrapper)
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "s", bubbles: true }))
    await flushPromises()
    expect(wrapper.text()).toContain("hola")
  })

  it("ignores card click outside timer drill", async () => {
    const wrapper = await mountApp()
    await startDrill(wrapper)
    await wrapper.get(".card").trigger("click")
    await flushPromises()
    expect(wrapper.find(".reveal").exists()).toBe(true)
  })

  it("shows done text with misses", async () => {
    const wrapper = await mountApp()
    await startDrill(wrapper)
    await wrapper.get(".reveal").trigger("click")
    await wrapper.get(".missed").trigger("click")
    await wrapper.get(".reveal").trigger("click")
    await wrapper.get(".knew").trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("споткнулся 1")
    expect(wrapper.text()).toContain("Пройдено 1 пар")
  })

  it("does not requeue when option disabled", async () => {
    const wrapper = await mountApp()
    await openModeTab(wrapper)
    await wrapper.findAll("label.opt-toggle input")[1].setValue(false)
    await flushPromises()
    await startDrill(wrapper)
    await wrapper.get(".reveal").trigger("click")
    await wrapper.get(".missed").trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("¡Listo!")
    expect(wrapper.text()).toContain("споткнулся 1")
    expect(wrapper.find(".done").isVisible()).toBe(true)
  })

  it("rates missed via arrow left", async () => {
    const wrapper = await mountApp()
    await startDrill(wrapper)
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true }))
    await flushPromises()
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }))
    await flushPromises()
    expect(wrapper.text()).toContain("hola")
  })

  it("ignores keyboard shortcuts on done screen", async () => {
    const wrapper = await mountApp()
    await startDrill(wrapper)
    await wrapper.get(".reveal").trigger("click")
    await wrapper.get(".knew").trigger("click")
    const doneBefore = wrapper.find(".done p").text()
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true }))
    await flushPromises()
    expect(wrapper.find(".done p").text()).toBe(doneBefore)
  })

  it("restarts drill from done screen", async () => {
    const wrapper = await mountApp()
    await startDrill(wrapper)
    await wrapper.get(".reveal").trigger("click")
    await wrapper.get(".knew").trigger("click")
    await wrapper.get(".file-btn").trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("hola")
  })

  it("speaks with selected voice", async () => {
    const voice = { lang: "es-ES", name: "Monica" } as SpeechSynthesisVoice
    vi.stubGlobal("speechSynthesis", {
      cancel: vi.fn(),
      speak: vi.fn(),
      getVoices: vi.fn(() => [voice]),
      onvoiceschanged: null
    })
    const wrapper = await mountApp()
    if (speechSynthesis.onvoiceschanged) {
      speechSynthesis.onvoiceschanged(new Event("voiceschanged"))
    }
    await startDrill(wrapper)
    await wrapper.get(".reveal").trigger("click")
    await wrapper.get(".spk").trigger("click")
    const utterance = vi.mocked(SpeechSynthesisUtterance).mock.results.at(-1)?.value
    expect(utterance.voice?.lang).toBe("es-ES")
    expect(utterance.voice?.name).toBe("Monica")
  })

  it("finishes when queue head is invalid", async () => {
    vi.spyOn(patrones, "buildQueue").mockReturnValueOnce([undefined as unknown as QueueItem])
    const wrapper = await mountApp()
    await startDrill(wrapper)
    await flushPromises()
    expect(wrapper.text()).toContain("¡Listo!")
  })

  it("shows unit name in secbar during shuffle all", async () => {
    loadDecksFromFolderMock.mockImplementationOnce(() => ({
      decks: [{
        name: "Mix",
        fileName: "mix.json",
        summary: "",
        on: false,
        blocks: [
          { title: "A", mode: "vocab", on: true, cards: [{ front: "one", back: "uno", translation: "", note: "" }] },
          { title: "B", mode: "vocab", on: true, cards: [{ front: "two", back: "dos", translation: "", note: "" }] }
        ]
      }],
      bad: []
    }))
    const wrapper = await mountApp()
    await setOrder(wrapper, "shuffleAll")
    await wrapper.find(".deck-toggle").trigger("click")
    await wrapper.get(".start").trigger("click")
    await flushPromises()
    expect(wrapper.find(".secbar").text()).toContain("Mix")
  })

  it("stores mistake in indexedDB on miss", async () => {
    const wrapper = await mountApp()
    await startDrill(wrapper)
    await wrapper.get(".reveal").trigger("click")
    await wrapper.get(".missed").trigger("click")
    await flushPromises()
    await vi.waitUntil(async () => (await loadMistakes()).length === 1)
    await vi.waitUntil(() => wrapper.text().includes("Поработать с ошибками → 1 пар"), { timeout: 3000 })
    expect((await loadMistakes())[0].front).toBe("hola")
  })

  it("runs mistakes-only mode and removes card when knew", async () => {
    await recordMistake({
      front: "hola",
      back: "привет",
      translation: "",
      note: "",
      deck: "Unit B",
      lessonId: "unit-b.json",
      section: "",
      mode: "vocab",
      uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    }, "fwd")


    const wrapper = await mountApp()
    await startMistakesDrill(wrapper)
    expect(wrapper.text()).toContain("hola")
    await wrapper.get(".reveal").trigger("click")
    await wrapper.get(".knew").trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("¡Listo!")
    expect(await loadMistakes()).toEqual([])
  })

  it("requeues missed card in mistakes mode until knew", async () => {
    await recordMistake({
      front: "hola",
      back: "привет",
      translation: "",
      note: "",
      deck: "Unit B",
      lessonId: "unit-b.json",
      section: "",
      mode: "vocab",
      uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    }, "fwd")

    const wrapper = await mountApp()
    await startMistakesDrill(wrapper)
    await wrapper.get(".reveal").trigger("click")
    await wrapper.get(".missed").trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("hola")
    await wrapper.get(".reveal").trigger("click")
    await wrapper.get(".knew").trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("¡Listo!")
    expect(await loadMistakes()).toEqual([])
  })

  it("stores separate mistakes per direction mode", async () => {
    const wrapper = await mountApp()
    await startDrill(wrapper)
    await wrapper.get(".reveal").trigger("click")
    await wrapper.get(".missed").trigger("click")
    await flushPromises()
    await wrapper.findAll(".dir-seg button")[1].trigger("click")
    await flushPromises()
    await wrapper.get(".reveal").trigger("click")
    await wrapper.get(".missed").trigger("click")
    await flushPromises()
    await vi.waitUntil(async () => (await loadMistakes()).length === 2)
    await vi.waitUntil(async () => {
      await flushPromises()
      return wrapper.text().includes("Поработать с ошибками → 2 пар")
    }, { timeout: 3000 })
    const stored = await loadMistakes()
    expect(stored.map((item) => item.dirMode).sort()).toEqual(["fwd", "rev"])
  })

  it("toggles block selection inside unit", async () => {
    loadDecksFromFolderMock.mockImplementationOnce(() => ({
      decks: [{
        name: "Blocks",
        fileName: "blocks.json",
        summary: "",
        on: true,
        blocks: [
          {
            title: "Правило A",
            mode: "transform",
            on: true,
            cards: [{ front: "a1", back: "a2", translation: "", note: "" }]
          },
          {
            title: "Правило B",
            mode: "transform",
            on: true,
            cards: [
              { front: "b1", back: "b2", translation: "", note: "" },
              { front: "b3", back: "b4", translation: "", note: "" }
            ]
          }
        ]
      }],
      bad: []
    }))
    const wrapper = await mountApp()
    expect(wrapper.text()).toContain("Начать прогон → 3 пар")
    await wrapper.get(".blocks-btn").trigger("click")
    await flushPromises()
    const rows = document.body.querySelectorAll(".block-row")
    expect(rows.length).toBeGreaterThan(1)
    ;(rows[1] as HTMLElement).click()
    await flushPromises()
    ;(document.body.querySelector(".blocks-done") as HTMLElement).click()
    await flushPromises()
    expect(wrapper.text()).toContain("Начать прогон → 1 пар")
    await wrapper.get(".start").trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("a1")
    await wrapper.get(".reveal").trigger("click")
    await wrapper.get(".knew").trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("¡Listo!")
  })

  it("closes blocks picker when unit is deselected", async () => {
    loadDecksFromFolderMock.mockImplementationOnce(() => ({
      decks: [{
        name: "Blocks",
        fileName: "blocks.json",
        summary: "",
        on: true,
        blocks: [{
          title: "A",
          mode: "vocab",
          on: true,
          cards: [{ front: "a", back: "b", translation: "", note: "" }]
        }]
      }],
      bad: []
    }))
    const wrapper = await mountApp()
    await wrapper.get(".blocks-btn").trigger("click")
    await flushPromises()
    expect(document.body.querySelector(".blocks-popover")).toBeTruthy()
    await wrapper.get(".deck-toggle").trigger("click")
    await flushPromises()
    expect(document.body.querySelector(".blocks-popover")).toBeFalsy()
  })

  it("replays mistake in saved direction mode", async () => {
    await recordMistake({
      front: "hola",
      back: "привет",
      translation: "",
      note: "",
      deck: "Unit B",
      lessonId: "unit-b.json",
      section: "",
      mode: "vocab",
      uuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    }, "rev")

    const wrapper = await mountApp()
    await startMistakesDrill(wrapper)
    expect(wrapper.text()).toContain("español")
    expect(wrapper.text()).toContain("привет")
  })

  it("shows review label when no units selected", async () => {
    const wrapper = await mountApp()
    await setOrder(wrapper, "review")
    await wrapper.findAll(".mini")[1].trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("Выбери хотя бы один юнит")
  })

  it("shows partial mistakes batch label", async () => {
    for (let i = 0; i < 11; i++) {
      await recordMistake({
        front: `f${i}`,
        back: `b${i}`,
        translation: "",
        note: "",
        deck: `Unit ${i}`,
        lessonId: `unit-${i}.json`,
        section: "",
        mode: "vocab",
        uuid: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`
      }, "fwd")
    }
    const wrapper = await mountApp()
    await flushPromises()
    expect(wrapper.text()).toContain("Поработать с ошибками → 10 из 11 пар")
  })

  it("shows partial weak batch label", async () => {
    const cards = []
    for (let i = 0; i < 11; i++) {
      const uuid = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`
      cards.push({ front: `f${i}`, back: `b${i}`, translation: "", note: "", uuid })
      const item = {
        deck: "Weak",
        lessonId: "weak.json",
        front: `f${i}`,
        back: `b${i}`,
        translation: "",
        note: "",
        section: "",
        mode: "vocab" as const,
        uuid
      }
      await recordProgress(item, "fwd", "missed")
      await recordProgress(item, "fwd", "missed")
    }
    loadDecksFromFolderMock.mockImplementationOnce(() => ({
      decks: [{
        name: "Weak",
        fileName: "weak.json",
        summary: "",
        on: true,
        blocks: [{ title: "B", mode: "vocab", on: true, cards }]
      }],
      bad: []
    }))
    const wrapper = await mountApp()
    await setOrder(wrapper, "weak")
    await flushPromises()
    await vi.waitUntil(() => wrapper.text().includes("Сложные → 10 из 11 пар"), { timeout: 3000 })
  })

  it("toggles mode filter and shows empty state", async () => {
    const wrapper = await mountApp()
    const modeButtons = wrapper.findAll(".mode-seg button")
    for (const btn of modeButtons) {
      await btn.trigger("click")
    }
    await flushPromises()
    expect(wrapper.text()).toContain("Выбери хотя бы один тип карточек")
    await modeButtons[0].trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("Unit A")
    expect(wrapper.text()).not.toContain("Unit B")
  })

  it("closes blocks picker via escape and overlay", async () => {
    const wrapper = await mountApp()
    await wrapper.find(".deck.on .blocks-btn").trigger("click")
    await flushPromises()
    expect(document.body.querySelector(".blocks-popover")).toBeTruthy()
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await flushPromises()
    expect(document.body.querySelector(".blocks-popover")).toBeFalsy()
    await wrapper.find(".deck.on .blocks-btn").trigger("click")
    await flushPromises()
    ;(document.body.querySelector(".blocks-close") as HTMLElement).click()
    await flushPromises()
    expect(document.body.querySelector(".blocks-popover")).toBeFalsy()
  })

  it("selects and clears blocks inside picker", async () => {
    loadDecksFromFolderMock.mockImplementationOnce(() => ({
      decks: [{
        name: "Blocks",
        fileName: "blocks.json",
        summary: "",
        on: true,
        blocks: [
          {
            title: "",
            mode: "transform",
            on: true,
            cards: [{ front: "a1", back: "a2", translation: "", note: "" }]
          },
          {
            title: "Правило B",
            mode: "transform",
            on: true,
            cards: [{ front: "b1", back: "b2", translation: "", note: "" }]
          }
        ]
      }],
      bad: []
    }))
    const wrapper = await mountApp()
    await wrapper.get(".blocks-btn").trigger("click")
    await flushPromises()
    expect(document.body.textContent).toContain("Без названия")
    const tools = document.body.querySelectorAll(".blocks-popover-tools .mini")
    await (tools[1] as HTMLElement).click()
    await flushPromises()
    await (tools[0] as HTMLElement).click()
    await flushPromises()
    ;(document.body.querySelector(".blocks-done") as HTMLElement).click()
    await flushPromises()
    expect(wrapper.text()).toContain("Начать прогон → 2 пар")
  })

  it("hides secbar when queue item has no deck", async () => {
    vi.spyOn(patrones, "buildQueue").mockReturnValueOnce([
      {
        front: "solo",
        back: "answer",
        translation: "",
        note: "",
        deck: "",
        section: "S",
        mode: "vocab"
      }
    ])
    const wrapper = await mountApp()
    await startDrill(wrapper)
    expect(wrapper.find(".secbar").exists()).toBe(false)
  })
})
