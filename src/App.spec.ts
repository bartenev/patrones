import { flushPromises, mount, VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Deck, QueueItem } from "./types"
import * as patrones from "./lib/patrones"

const { mockDecks, loadDecksFromFolderMock } = vi.hoisted(() => {
  const decks: Deck[] = [
    {
      name: "Unit A",
      fileName: "unit-a.json",
      on: false,
      blocks: [{
        title: "Блок",
        mode: "transform",
        cards: [{ a: "el niño", b: "la niña", note: "" }]
      }]
    },
    {
      name: "Unit B",
      fileName: "unit-b.json",
      on: true,
      blocks: [{
        title: "Блок",
        mode: "vocab",
        cards: [{ a: "hola", b: "привет", note: "" }]
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
    expect(wrapper.text()).toContain("unit-a.json")
    expect(wrapper.text()).toContain("unit-b.json")
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
  })

  it("shows four order modes", async () => {
    const wrapper = await mountApp()
    expect(wrapper.text()).toContain("1 — всё по порядку")
    expect(wrapper.text()).toContain("4 — полный хаос")
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

  it("shows section title and note after reveal", async () => {
    loadDecksFromFolderMock.mockImplementationOnce(() => ({
      decks: [{
        name: "Rich",
        fileName: "rich.json",
        on: false,
        blocks: [{
          title: "Секция",
          mode: "transform",
          cards: [{ a: "forma", b: "respuesta", note: "подсказка" }]
        }]
      }],
      bad: []
    }))
    const wrapper = await mountApp()
    await wrapper.find(".deck").trigger("click")
    await wrapper.get(".start").trigger("click")
    await flushPromises()
    expect(wrapper.text()).toContain("Секция")
    await wrapper.get(".reveal").trigger("click")
    expect(wrapper.text()).toContain("подсказка")
    expect(wrapper.find(".spk").exists()).toBe(true)
  })

  it("changes direction mode", async () => {
    const wrapper = await mountApp()
    await wrapper.findAll(".seg button")[2].trigger("click")
    await wrapper.find(".deck").trigger("click")
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

  it("hides section bar after sectionless card in shuffle all", async () => {
    loadDecksFromFolderMock.mockImplementationOnce(() => ({
      decks: [{
        name: "Mix",
        fileName: "mix.json",
        on: false,
        blocks: [
          { title: "A", mode: "vocab", cards: [{ a: "one", b: "uno", note: "" }] },
          { title: "B", mode: "vocab", cards: [{ a: "two", b: "dos", note: "" }] }
        ]
      }],
      bad: []
    }))
    const wrapper = await mountApp()
    await wrapper.find('input[value="shuffleAll"]').setValue(true)
    await wrapper.find(".deck").trigger("click")
    await wrapper.get(".start").trigger("click")
    await flushPromises()
    expect(wrapper.find(".secbar").exists()).toBe(false)
  })
})
