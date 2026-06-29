import { flushPromises, mount, VueWrapper } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Deck } from "./types"

const { mockDecks, loadDecksFromFolderMock } = vi.hoisted(() => {
  const decks: Deck[] = [
    {
      name: "Unit A",
      fileName: "unit-a.json",
      on: false,
      blocks: [{
        title: "Блок",
        mode: "vocab",
        cards: [{ a: "hola", b: "привет", note: "" }]
      }]
    },
    {
      name: "Unit B",
      fileName: "unit-b.json",
      on: false,
      blocks: [{
        title: "Блок",
        mode: "transform",
        cards: [{ a: "el niño", b: "la niña", note: "" }]
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

async function mountApp() {
  const wrapper = mount(App)
  await flushPromises()
  return wrapper
}

async function startDrill(wrapper: VueWrapper) {
  await wrapper.find(".deck").trigger("click")
  await wrapper.get(".start").trigger("click")
  await flushPromises()
}

describe("App", () => {
  beforeEach(() => {
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
    vi.unstubAllGlobals()
  })

  it("renders setup with loaded units", async () => {
    const wrapper = await mountApp()
    expect(wrapper.text()).toContain("Patrones")
    expect(wrapper.text()).toContain("unit-a.json")
    expect(wrapper.text()).toContain("unit-b.json")
    expect(wrapper.get(".start").attributes("disabled")).toBeDefined()
  })

  it("toggles unit selection by row click", async () => {
    const wrapper = await mountApp()
    const row = wrapper.find(".deck")
    expect(row.classes()).not.toContain("on")
    await row.trigger("click")
    expect(row.classes()).toContain("on")
    expect(wrapper.get(".start").attributes("disabled")).toBeUndefined()
    expect(wrapper.text()).toContain("Начать прогон → 1 пар")
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
})
