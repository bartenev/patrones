import { describe, expect, it } from "vitest"
import { makeDeck } from "../test/fixtures"
import {
  cardMasteryScore,
  computeDeckMastery,
  deckTrackableCards,
  masteryLevel,
  recencyFactor
} from "./mastery"
import { emptyDirStats } from "./progress"

describe("mastery", () => {
  it("counts only cards with uuid", () => {
    const deck = makeDeck("U", [
      {
        front: "hola",
        back: "привет",
        translation: "",
        note: "",
        uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      },
      {
        front: "casa",
        back: "дом",
        translation: "",
        note: ""
      }
    ], { fileName: "u.json" })
    expect(deckTrackableCards(deck)).toHaveLength(1)
  })

  it("scores card from direction stats", () => {
    const fwd = { ...emptyDirStats(), correct: 8, wrong: 2, streak: 3, lastSeenAt: Date.now() }
    const score = cardMasteryScore({ fwd, rev: emptyDirStats() }, Date.now())
    expect(score).not.toBeNull()
    expect(score!).toBeGreaterThan(0.5)
  })

  it("maps score to mastery level", () => {
    expect(masteryLevel(0, 0)).toBe("none")
    expect(masteryLevel(20, 3)).toBe("low")
    expect(masteryLevel(40, 3)).toBe("mid")
    expect(masteryLevel(70, 3)).toBe("good")
    expect(masteryLevel(90, 3)).toBe("solid")
  })

  it("decays recency factor over time", () => {
    const now = Date.UTC(2026, 0, 1)
    expect(recencyFactor(now, now)).toBe(1)
    expect(recencyFactor(now - 30 * 24 * 60 * 60 * 1000, now)).toBeLessThan(1)
  })

  it("aggregates deck mastery", () => {
    const deck = makeDeck("U", [{
      front: "hola",
      back: "привет",
      translation: "",
      note: "",
      uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    }], { fileName: "u.json" })
    const progress = {
      lessonId: "u.json",
      updatedAt: 1,
      cards: {
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa": {
          fwd: { ...emptyDirStats(), correct: 5, wrong: 0, streak: 5, lastSeenAt: Date.now() },
          rev: emptyDirStats()
        }
      }
    }
    const mastery = computeDeckMastery(deck, progress, Date.now())
    expect(mastery.trackableCards).toBe(1)
    expect(mastery.attemptedCards).toBe(1)
    expect(mastery.score).toBeGreaterThan(0)
  })
})
