export function normalizeCard(c) {
  if (Array.isArray(c)) {
    return { a: (c[0] || "").trim(), b: (c[1] || "").trim(), note: (c[2] || "").trim() }
  }
  if (c && typeof c === "object") {
    return {
      a: (c.a || c.prompt || "").trim(),
      b: (c.b || c.answer || "").trim(),
      note: (c.note || "").trim()
    }
  }
  return null
}

export function parseDeck(obj, fallbackName) {
  let name = fallbackName
  let blocks = []

  if (Array.isArray(obj)) {
    blocks = [{ title: "", mode: "auto", cards: obj.map(normalizeCard).filter(Boolean) }]
  } else if (obj && typeof obj === "object") {
    name = obj.unit || obj.title || fallbackName
    if (Array.isArray(obj.blocks)) {
      blocks = obj.blocks
        .map((bl) => ({
          title: (bl.title || "").trim(),
          mode: bl.mode || "auto",
          cards: (Array.isArray(bl.cards) ? bl.cards : [])
            .map(normalizeCard)
            .filter((c) => c && c.a && c.b)
        }))
        .filter((bl) => bl.cards.length)
    } else if (Array.isArray(obj.cards)) {
      blocks = [{
        title: "",
        mode: obj.mode || "auto",
        cards: obj.cards.map(normalizeCard).filter((c) => c && c.a && c.b)
      }]
    }
  }

  blocks = blocks.filter((bl) => bl.cards.length)
  const count = blocks.reduce((s, b) => s + b.cards.length, 0)
  return count ? { name, blocks, on: false, fileName: "" } : null
}

export function cleanName(fn) {
  return fn.replace(/\.json$/i, "")
}

export function deckCount(d) {
  return d.blocks.reduce((s, b) => s + b.cards.length, 0)
}

export function shuffle(a) {
  const arr = [...a]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function buildQueue(selectedDecks, order) {
  const items = []

  selectedDecks.forEach((d) => {
    d.blocks.forEach((bl) => {
      const sec = bl.title || ""
      bl.cards.forEach((c) => {
        items.push({ ...c, deck: d.name, section: sec, mode: bl.mode || "auto" })
      })
    })
  })

  if (order === "shuffleAll") {
    const shuffled = shuffle(items)
    shuffled.forEach((it) => { it.section = "" })
    return shuffled
  }

  if (order === "shuffleBlocks") {
    const out = []
    selectedDecks.forEach((d) => {
      d.blocks.forEach((bl) => {
        const chunk = bl.cards.map((c) => ({
          ...c,
          deck: d.name,
          section: bl.title || "",
          mode: bl.mode || "auto"
        }))
        out.push(...shuffle(chunk))
      })
    })
    return out
  }

  return items
}

export function sideFor(card, dirMode) {
  let mode = dirMode
  if (mode === "auto") {
    mode = (card.mode === "vocab" || card.mode === "ru") ? "ru" : "es-fwd"
  }
  if (mode === "ru") {
    return { prompt: card.a, answer: card.b, side: "подсказка", spanish: card.b }
  }
  if (mode === "es") {
    return { prompt: card.b, answer: card.a, side: "español", spanish: card.b }
  }
  return { prompt: card.a, answer: card.b, side: "форма", spanish: card.b }
}
