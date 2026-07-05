import { flushPromises, mount, VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Deck, QueueItem } from "./types"
import * as patrones from "./lib/patrones"
import { recordMistake } from "./lib/mistakes"

const { mockDecks, loadDecksFromFolderMock } = vi.hoisted(() => {
  const decks: Deck[] = [
    {
      name: "Unit A",
      fileName: "unit-a.json",
      on: false,
      blocks: [{
        title: "Блок",
        mode: "transform",
        on: true,
        cards: [{ front: "el niño", back: "la niña", translation: "", note: "" }]
      }]
    },
    {
      name: "Unit B",
      fileName: "unit-b.json",
      on: true,
      blocks: [{
        title: "Блок",
        mode: "vocab",
        on: true,
        cards: [{ front: "hola", back: "привет", translation: "", note: "" }]
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
    const rows = wrapper.findAll(".deck")
    await rows[rows.length - 1].trigger("click")
  }
  await wrapper.get(".start").trigger("click")
  await flushPromises()
}

describe("App", () => {
  beforeEach(() => {
    wrappers = []
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

  afterEach(() => {
    wrappers.forEach((w) => w.unmount())
    wrappers = []
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("renders setup with loaded units", async () => {
    const wrapper = await mountApp()
    expect(wrapper.text()).toContain("Patrones")
    expect(wrapper.text()).toContain("Unit A")
    expect(wrapper.text()).toContain("Unit B")
    expect(wrapper.get(".start").attributes("disabled")).toBeUndefined()
    expect(wrapper.text()).toContain("Начать прогон → 1 пар")
  })

  it("toggles unit selection by row click", async () => {
    const wrapper = await mountApp()
    const row = wrapper.find(".deck")
    expect(row.classes()).not.toContain("on")
    await row.trigger("click")
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

  it("handles deck checkbox click", async () => {
    const wrapper = await mountApp()
    await wrapper.find(".deck input").trigger("click")
  })

  it("shows six order modes", async () => {
    const wrapper = await mountApp()
    expect(wrapper.text()).toContain("1 — всё по порядку")
    expect(wrapper.text()).toContain("4 — полный хаос")
    expect(wrapper.text()).toContain("5 — только ошибки")
    expect(wrapper.text()).toContain("6 — ревью")
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

  it("returns to setup from done screen", async () => {
    const wrapper = await mountApp()
    await startDrill(wrapper)
    await wrapper.get(".reveal").trigger("click")
    await wrapper.get(".knew").trigger("click")
    await wrapper.get(".ghost").trigger("click")
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
    await wrapper.find(".deck").trigger("click")
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
    vi.useFakeTimers()
    try {
      const wrapper = await mountApp()
      const select = wrapper.get("select")
      await select.setValue("2")
      await flushPromises()
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
    }
  })

  it("clears active timer when quitting drill", async () => {
    vi.useFakeTimers()
    const clearSpy = vi.spyOn(global, "clearTimeout")
    try {
      const wrapper = await mountApp()
      await wrapper.get("select").setValue("3")
      await flushPromises()
      await startDrill(wrapper)
      await wrapper.find(".bar .ghost").trigger("click")
      await flushPromises()
      expect(clearSpy).toHaveBeenCalled()
    } finally {
      clearSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it("autospeaks on timer reveal", async () => {
    vi.useFakeTimers()
    try {
      const wrapper = await mountApp()
      await wrapper.get("select").setValue("1")
      await wrapper.findAll("label.chk input")[0].setValue(true)
      await flushPromises()
      await startDrill(wrapper)
      await vi.advanceTimersByTimeAsync(1000)
      await flushPromises()
      expect(speechSynthesis.speak).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("pauses and resumes timer on card click", async () => {
    vi.useFakeTimers()
    try {
      const wrapper = await mountApp()
      await wrapper.get("select").setValue("2")
      await flushPromises()
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
    }
  })

  it("resumes answer timer and advances to done", async () => {
    vi.useFakeTimers()
    try {
      const wrapper = await mountApp()
      await wrapper.get("select").setValue("1")
      await flushPromises()
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
    }
  })

  it("disables start in mistakes mode when bank is empty", async () => {
    const wrapper = await mountApp()
    await wrapper.find('input[value="mistakes"]').setValue(true)
    await flushPromises()
    expect(wrapper.text()).toContain("5 — только ошибки (0)")
    expect(wrapper.text()).toContain("Нет сохранённых ошибок")
    expect(wrapper.get(".start").attributes("disabled")).toBeDefined()
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
    await wrapper.findAll("label.chk input")[1].setValue(false)
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
        on: false,
        blocks: [
          { title: "A", mode: "vocab", on: true, cards: [{ front: "one", back: "uno", translation: "", note: "" }] },
          { title: "B", mode: "vocab", on: true, cards: [{ front: "two", back: "dos", translation: "", note: "" }] }
        ]
      }],
      bad: []
    }))
    const wrapper = await mountApp()
    await wrapper.find('input[value="shuffleAll"]').setValue(true)
    await wrapper.find(".deck").trigger("click")
    await wrapper.get(".start").trigger("click")
    await flushPromises()
    expect(wrapper.find(".secbar").text()).toContain("Mix")
  })

  it("stores mistake in localStorage on miss", async () => {
    const wrapper = await mountApp()
    await startDrill(wrapper)
    await wrapper.get(".reveal").trigger("click")
    await wrapper.get(".missed").trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("5 — только ошибки (1)")
    expect(localStorage.getItem("patrones:mistakes")).toContain("hola")
  })

  it("runs mistakes-only mode and removes card when knew", async () => {
    recordMistake({
      front: "hola",
      back: "привет",
      translation: "",
      note: "",
      deck: "Unit B",
      section: "",
      mode: "vocab"
    }, "fwd")

    const wrapper = await mountApp()
    await wrapper.find('input[value="mistakes"]').setValue(true)
    await flushPromises()
    expect(wrapper.text()).toContain("Повторить ошибки → 1 пар")
    await wrapper.get(".start").trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("hola")
    await wrapper.get(".reveal").trigger("click")
    await wrapper.get(".knew").trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("¡Listo!")
    expect(localStorage.getItem("patrones:mistakes")).toBeNull()
  })

  it("requeues missed card in mistakes mode until knew", async () => {
    recordMistake({
      front: "hola",
      back: "привет",
      translation: "",
      note: "",
      deck: "Unit B",
      section: "",
      mode: "vocab"
    }, "fwd")

    const wrapper = await mountApp()
    await wrapper.find('input[value="mistakes"]').setValue(true)
    await wrapper.get(".start").trigger("click")
    await flushPromises()
    await wrapper.get(".reveal").trigger("click")
    await wrapper.get(".missed").trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("hola")
    await wrapper.get(".reveal").trigger("click")
    await wrapper.get(".knew").trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("¡Listo!")
    expect(localStorage.getItem("patrones:mistakes")).toBeNull()
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
    expect(wrapper.text()).toContain("5 — только ошибки (2)")
    const stored = JSON.parse(localStorage.getItem("patrones:mistakes") || "[]")
    expect(stored.map((item: { dirMode: string }) => item.dirMode).sort()).toEqual(["fwd", "rev"])
  })

  it("toggles block selection inside unit", async () => {
    loadDecksFromFolderMock.mockImplementationOnce(() => ({
      decks: [{
        name: "Blocks",
        fileName: "blocks.json",
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

  it("replays mistake in saved direction mode", async () => {
    recordMistake({
      front: "hola",
      back: "привет",
      translation: "",
      note: "",
      deck: "Unit B",
      section: "",
      mode: "vocab"
    }, "rev")

    const wrapper = await mountApp()
    await wrapper.find('input[value="mistakes"]').setValue(true)
    await wrapper.get(".start").trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("español")
    expect(wrapper.text()).toContain("привет")
  })

  it("shows review label when no units selected", async () => {
    const wrapper = await mountApp()
    await wrapper.find('input[value="review"]').setValue(true)
    await wrapper.findAll(".mini")[1].trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("Выбери хотя бы один юнит")
  })

  it("shows partial mistakes batch label", async () => {
    for (let i = 0; i < 11; i++) {
      recordMistake({
        front: `f${i}`,
        back: `b${i}`,
        translation: "",
        note: "",
        deck: `Unit ${i}`,
        section: "",
        mode: "vocab"
      }, "fwd")
    }
    const wrapper = await mountApp()
    await wrapper.find('input[value="mistakes"]').setValue(true)
    await flushPromises()
    expect(wrapper.text()).toContain("Повторить ошибки → 10 из 11 пар")
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

  it("clears unit title when queue item has no deck", async () => {
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
    expect(wrapper.find(".secbar").text()).toContain("S")
    expect(wrapper.find(".secbar").text()).not.toContain("Unit")
  })
})
