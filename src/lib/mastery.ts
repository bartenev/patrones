import { dirWeakness, loadLessonsProgress } from "./progress"
import type { Card, CardProgressStats, Deck, LessonMastery, LessonMasteryLevel, LessonProgress } from "../types"

const DAY_MS = 86_400_000

export function deckTrackableCards(deck: Deck): Card[] {
  const out: Card[] = []
  for (const block of deck.blocks) {
    for (const card of block.cards) {
      if (card.uuid) out.push(card)
    }
  }
  return out
}

export function recencyFactor(lastSeenAt: number, now: number): number {
  if (!lastSeenAt) return 0.5

  const days = (now - lastSeenAt) / DAY_MS
  if (days <= 1) return 1
  if (days <= 7) return 0.95
  if (days <= 14) return 0.85
  if (days <= 30) return 0.75
  return 0.65
}

export function cardMasteryScore(
  cardProgress: CardProgressStats | undefined,
  now: number
): number | null {
  if (!cardProgress) return null

  const dirs = [cardProgress.fwd, cardProgress.rev]
  let attempts = 0
  let correct = 0
  let lastSeen = 0

  for (const dir of dirs) {
    attempts += dir.correct + dir.wrong
    correct += dir.correct
    lastSeen = Math.max(lastSeen, dir.lastSeenAt)
  }

  if (!attempts) return null

  const accuracy = correct / attempts
  const weakness = Math.max(dirWeakness(cardProgress.fwd), dirWeakness(cardProgress.rev))
  const recency = recencyFactor(lastSeen, now)
  const confidence = 1 - Math.exp(-attempts / 4)
  const raw = accuracy * (1 - weakness * 0.6) * recency * confidence

  return Math.max(0, Math.min(1, raw))
}

export function masteryLevel(score: number, attemptedCards: number): LessonMasteryLevel {
  if (!attemptedCards) return "none"
  if (score < 25) return "low"
  if (score < 50) return "mid"
  if (score < 75) return "good"
  return "solid"
}

export function computeDeckMastery(
  deck: Deck,
  lesson: LessonProgress | null,
  now = Date.now()
): LessonMastery {
  const cards = deckTrackableCards(deck)
  if (!cards.length) {
    return {
      lessonId: deck.fileName,
      score: 0,
      level: "none",
      coverage: 0,
      attemptedCards: 0,
      trackableCards: 0
    }
  }

  let sum = 0
  let attemptedCards = 0

  for (const card of cards) {
    const score = cardMasteryScore(lesson?.cards[card.uuid!], now)
    if (score === null) continue
    attemptedCards++
    sum += score
  }

  const score = Math.round((sum / cards.length) * 100)
  const coverage = attemptedCards / cards.length

  return {
    lessonId: deck.fileName,
    score,
    level: masteryLevel(score, attemptedCards),
    coverage,
    attemptedCards,
    trackableCards: cards.length
  }
}

export async function loadDecksMasteryMap(decks: Deck[]): Promise<Record<string, LessonMastery>> {
  const lessonIds = [...new Set(decks.map((deck) => deck.fileName).filter(Boolean))]
  const lessons = await loadLessonsProgress(lessonIds)
  const now = Date.now()
  const out: Record<string, LessonMastery> = {}

  for (const deck of decks) {
    out[deck.fileName] = computeDeckMastery(deck, lessons.get(deck.fileName) ?? null, now)
  }

  return out
}
