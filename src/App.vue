<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue"
import DoneView from "./components/DoneView.vue"
import DrillView from "./components/DrillView.vue"
import SetupView from "./components/SetupView.vue"
import { loadDecksFromFolder } from "./lib/loadDecks"
import { buildQueue, reviewCount, selectedDeckCount, sideFor } from "./lib/patrones"
import {
  buildMistakesQueue,
  mistakeCount as getMistakeCount,
  mistakesBatchCount,
  recordMistake,
  removeMistake
} from "./lib/mistakes"
import { dequeue } from "./lib/queue"
import { recordProgressSafe, buildWeakQueue, countWeakCards, weakBatchCount } from "./lib/progress"
import { loadDecksMasteryMap } from "./lib/mastery"
import { copyPatronesBackupToClipboard, downloadPatronesBackup } from "./lib/backup"
import {
  applyDeckSelections,
  applyPatronesSettings,
  loadPatronesSettings,
  resetPatronesSettingsSaveTimer,
  scheduleSavePatronesSettings
} from "./lib/settings"
import { ALL_CARD_MODES } from "./types"
import type {
  AppView,
  BackupExportMode,
  CardMode,
  Deck,
  DirMode,
  LessonMastery,
  OrderMode,
  QueueItem,
  SetupTab,
  TimerSec
} from "./types"

const decks = ref<Deck[]>([])
const loadErr = ref("")
const view = ref<AppView>("setup")
const queue = ref<QueueItem[]>([])
const cur = ref<QueueItem | null>(null)
const total = ref(0)
const missed = ref(0)
const missesRequeued = ref(0)
const revealed = ref(false)
const dirMode = ref<DirMode>("fwd")
const requeue = ref(true)
const curUnit = ref<string | null>(null)
const order = ref<OrderMode>("straight")
const modeFilter = ref<CardMode[]>([...ALL_CARD_MODES])
const autospeak = ref(false)
const timerSec = ref<TimerSec>(0)
const isDark = ref(true)
const setupTab = ref<SetupTab>("content")
const backupExportMode = ref<BackupExportMode>("download")
const settingsHydrated = ref(false)
const esVoice = ref<SpeechSynthesisVoice | null>(null)
const timerFill = ref("0%")
const timerTransition = ref("none")
const timerPaused = ref(false)
const storedMistakeCount = ref(0)
const storedWeakCount = ref(0)
const deckMastery = ref<Record<string, LessonMastery>>({})
const sessionMistakesMode = ref(false)

let timerId: ReturnType<typeof setTimeout> | null = null
let timerRunId = 0
let timerPhase: "question" | "answer" | null = null
let timerDurationMs = 0
let timerStartedAt = 0
let timerRemainingMs = 0

const isTimerMode = computed(() => timerSec.value > 0)

const ANSWER_TIMER_MS = 1000

function timerStepMs(phase: "question" | "answer"): number {
  return phase === "answer" ? ANSWER_TIMER_MS : timerSec.value * 1000
}

const cardSide = ref("")
const cardPrompt = ref("")
const cardAnswer = ref("")
const cardNote = ref("")
const cardTranslation = ref("")
const spanishText = ref("")

const selectedDecks = computed(() => decks.value.filter((d) => d.on))
const totalSelected = computed(() =>
  selectedDecks.value.reduce((s, d) => s + selectedDeckCount(d, modeFilter.value), 0)
)
const selectedReviewCount = computed(() => reviewCount(selectedDecks.value, modeFilter.value))
const isMistakesMode = computed(() => sessionMistakesMode.value)
const isReviewMode = computed(() => order.value === "review")
const isWeakMode = computed(() => order.value === "weak")
const mistakesSessionCount = computed(() => mistakesBatchCount(storedMistakeCount.value))
const weakSessionCount = computed(() => weakBatchCount(storedWeakCount.value))
const startDisabled = computed(() => {
  if (!modeFilter.value.length) return true
  if (isWeakMode.value) return storedWeakCount.value === 0 || totalSelected.value === 0
  if (isReviewMode.value) return selectedReviewCount.value === 0
  return totalSelected.value === 0
})
const mistakesStartDisabled = computed(() => storedMistakeCount.value === 0)
const mistakesStartLabel = computed(() => {
  const total = storedMistakeCount.value
  const batch = mistakesSessionCount.value
  if (!total) return "Нет сохранённых ошибок"
  if (total === batch) return `Поработать с ошибками → ${total} пар`
  return `Поработать с ошибками → ${batch} из ${total} пар`
})
const startLabel = computed(() => {
  if (isWeakMode.value) {
    const total = storedWeakCount.value
    const batch = weakSessionCount.value
    if (!total) return "Нет сложных карточек"
    if (total === batch) return `Сложные → ${total} пар`
    return `Сложные → ${batch} из ${total} пар`
  }
  if (isReviewMode.value) {
    return selectedReviewCount.value
      ? `Начать ревью → ${selectedReviewCount.value} пар`
      : "Выбери хотя бы один юнит"
  }
  return totalSelected.value
    ? `Начать прогон → ${totalSelected.value} пар`
    : "Выбери хотя бы один юнит"
})

const showSecbar = computed(() => Boolean(curUnit.value))
const fillWidth = computed(() => {
  const denom = total.value + missesRequeued.value
  const done = denom - (queue.value.length + 1)
  return denom ? `${Math.max(0, (done / denom) * 100)}%` : "0%"
})
const leftCount = computed(() => queue.value.length + 1)

const doneText = computed(() =>
  missed.value === 0
    ? `Все ${total.value} без запинки. Чисто.`
    : `Пройдено ${total.value} пар · споткнулся ${missed.value} раз. Прогони ошибки ещё раз — закрепится.`
)

function clearTimerTimeout() {
  if (timerId !== null) {
    clearTimeout(timerId)
    timerId = null
  }
}

function resetTimerBar() {
  timerTransition.value = "none"
  timerFill.value = "0%"
}

function animateTimerBar(ms: number, fromPercent = 0) {
  const runId = ++timerRunId
  timerTransition.value = "none"
  timerFill.value = `${fromPercent}%`

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (runId !== timerRunId || view.value !== "drill" || timerPaused.value) return
      timerTransition.value = `width ${ms}ms linear`
      timerFill.value = "100%"
    })
  })
}

function clearTimer() {
  clearTimerTimeout()
  timerRunId++
  timerPaused.value = false
  timerPhase = null
  timerRemainingMs = 0
  resetTimerBar()
}

function runTimerStep(phase: "question" | "answer") {
  clearTimerTimeout()
  timerPaused.value = false
  if (!timerSec.value || view.value !== "drill") return

  const ms = timerStepMs(phase)
  timerPhase = phase
  timerDurationMs = ms
  timerStartedAt = Date.now()
  timerRemainingMs = ms
  animateTimerBar(ms)

  timerId = setTimeout(() => {
    timerId = null
    timerPhase = null
    if (phase === "question" && !revealed.value) reveal()
    else if (phase === "answer" && revealed.value) next()
  }, ms)
}

function pauseTimer() {
  if (!isTimerMode.value || view.value !== "drill" || timerPaused.value || timerId === null) return

  clearTimerTimeout()
  timerRunId++

  const elapsed = Date.now() - timerStartedAt
  timerRemainingMs = Math.max(0, timerDurationMs - elapsed)
  const currentPercent = Math.min(100, (elapsed / timerDurationMs) * 100)

  timerTransition.value = "none"
  timerFill.value = `${currentPercent}%`
  timerPaused.value = true
}

function resumeTimer() {
  if (!timerPaused.value || timerRemainingMs <= 0 || !timerPhase) return

  const ms = timerRemainingMs
  const startPercent = Number.parseFloat(timerFill.value) || 0
  const phase = timerPhase

  timerPaused.value = false
  timerDurationMs = ms
  timerStartedAt = Date.now()
  animateTimerBar(ms, startPercent)

  timerId = setTimeout(() => {
    timerId = null
    timerPhase = null
    if (phase === "question" && !revealed.value) reveal()
    else if (phase === "answer" && revealed.value) next()
  }, ms)
}

function onCardClick() {
  if (!isTimerMode.value || view.value !== "drill") return
  if (timerPaused.value) resumeTimer()
  else pauseTimer()
}

async function refreshDeckMastery() {
  if (!decks.value.length) {
    deckMastery.value = {}
    return
  }
  deckMastery.value = await loadDecksMasteryMap(decks.value)
}

async function refreshMistakeCount() {
  storedMistakeCount.value = await getMistakeCount()
}

async function refreshWeakCount() {
  if (!selectedDecks.value.length || !modeFilter.value.length) {
    storedWeakCount.value = 0
    return
  }
  storedWeakCount.value = await countWeakCards(
    selectedDecks.value,
    modeFilter.value,
    dirMode.value
  )
}

function pickVoice() {
  if (typeof speechSynthesis === "undefined") return
  const vs = speechSynthesis.getVoices()
  esVoice.value = vs.find((v) => /es-ES/i.test(v.lang)) || vs.find((v) => /^es/i.test(v.lang)) || null
}

function speak(text: string) {
  if (typeof speechSynthesis === "undefined" || !text) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = "es-ES"
  if (esVoice.value) u.voice = esVoice.value
  u.rate = 0.95
  speechSynthesis.speak(u)
}

function effectiveDirMode(): DirMode {
  return cur.value?.dirMode ?? dirMode.value
}

function applyCardView() {
  if (!cur.value) return
  const v = sideFor(cur.value, effectiveDirMode())
  spanishText.value = v.spanish
  cardSide.value = v.side
  cardPrompt.value = v.prompt
  cardAnswer.value = v.answer
  cardNote.value = cur.value.note || ""
  cardTranslation.value = v.translation || ""
}

function next() {
  if (!queue.value.length) {
    finish()
    return
  }

  const { item, rest } = dequeue(queue.value)
  queue.value = rest
  cur.value = item
  if (!cur.value) {
    finish()
    return
  }
  revealed.value = false

  if (cur.value.deck && cur.value.deck !== curUnit.value) {
    curUnit.value = cur.value.deck
  } else if (!cur.value.deck) {
    curUnit.value = null
  }

  applyCardView()
  startQuestionTimer()
}

function startQuestionTimer() {
  runTimerStep("question")
}

function startAnswerTimer() {
  runTimerStep("answer")
}

function startCards() {
  void startCardsAsync(false)
}

function startMistakes() {
  void startCardsAsync(true)
}

async function startCardsAsync(mistakes: boolean) {
  clearTimer()
  sessionMistakesMode.value = mistakes
  queue.value = mistakes
    ? await buildMistakesQueue()
    : isWeakMode.value
      ? await buildWeakQueue(selectedDecks.value, modeFilter.value, dirMode.value)
      : buildQueue(selectedDecks.value, order.value, modeFilter.value)
  total.value = queue.value.length
  missed.value = 0
  missesRequeued.value = 0
  curUnit.value = null
  if (!total.value) return
  view.value = "drill"
  next()
}

function reveal() {
  if (revealed.value) return
  clearTimer()
  revealed.value = true
  if (cur.value) {
    spanishText.value = sideFor(cur.value, effectiveDirMode()).spanish
  }
  if (autospeak.value) speak(spanishText.value)
  startAnswerTimer()
}

function rate(knew: boolean) {
  if (!revealed.value || !cur.value) return
  clearTimer()
  const item = cur.value
  const dir = effectiveDirMode()
  if (!isMistakesMode.value || !knew) {
    recordProgressSafe(item, dir, knew ? "knew" : "missed")
  }
  if (!knew) {
    missed.value++
    missesRequeued.value++
    void recordMistake(item, dir).then(() => refreshMistakeCount()).catch(() => {})
    if (isMistakesMode.value || requeue.value) {
      queue.value.push({ ...cur.value, section: "" })
    }
  } else if (isMistakesMode.value) {
    void removeMistake(item, dir).then(() => refreshMistakeCount()).catch(() => {})
  }
  void refreshWeakCount()
  void refreshDeckMastery()
  next()
}

function finish() {
  clearTimer()
  sessionMistakesMode.value = false
  view.value = "done"
  void refreshWeakCount()
  void refreshDeckMastery()
}

function quitDrill() {
  clearTimer()
  sessionMistakesMode.value = false
  view.value = "setup"
  void refreshWeakCount()
  void refreshDeckMastery()
}

const settingsRefs = {
  isDark,
  order,
  dirMode,
  requeue,
  autospeak,
  timerSec,
  modeFilter,
  setupTab,
  backupExportMode
}

function persistSettings() {
  if (!settingsHydrated.value) return
  scheduleSavePatronesSettings(settingsRefs, decks.value)
}

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.setAttribute("data-theme", isDark.value ? "dark" : "light")
}

function exportBackup(mode: BackupExportMode) {
  const action = mode === "clipboard" ? copyPatronesBackupToClipboard : downloadPatronesBackup
  void action().catch(() => {})
}

function onKeydown(e: KeyboardEvent) {
  if (view.value !== "drill") return
  if (e.code === "Space" || e.code === "Enter") {
    e.preventDefault()
    if (!revealed.value) reveal()
  } else if (e.key === "ArrowRight" || e.key === "2") {
    if (revealed.value) {
      e.preventDefault()
      rate(true)
    }
  } else if (e.key === "ArrowLeft" || e.key === "1") {
    if (revealed.value) {
      e.preventDefault()
      rate(false)
    }
  } else if (e.key.toLowerCase() === "s") {
    speak(spanishText.value)
  } else if (e.key === "Escape") {
    quitDrill()
  }
}

onMounted(async () => {
  const { decks: loaded, bad } = loadDecksFromFolder()
  const saved = await loadPatronesSettings()
  if (saved) {
    applyPatronesSettings(saved, settingsRefs)
    applyDeckSelections(loaded, saved.decks)
  }

  decks.value = loaded
  document.documentElement.setAttribute("data-theme", isDark.value ? "dark" : "light")
  void refreshMistakeCount()
  void refreshWeakCount()
  void refreshDeckMastery()

  if (bad.length) {
    loadErr.value = `Не удалось разобрать: ${bad.join(", ")}`
  } else if (!loaded.length) {
    loadErr.value = "В папке decks/ нет .json — положи туда файлы юнитов и обнови страницу."
  }

  pickVoice()
  if (typeof speechSynthesis !== "undefined") {
    speechSynthesis.onvoiceschanged = pickVoice
  }
  document.addEventListener("keydown", onKeydown)
  settingsHydrated.value = true
})

watch(
  [isDark, order, dirMode, requeue, autospeak, timerSec, modeFilter, setupTab, backupExportMode, decks],
  () => {
    persistSettings()
  },
  { deep: true }
)

watch(isDark, (dark) => {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light")
})

onUnmounted(() => {
  clearTimer()
  resetPatronesSettingsSaveTimer()
  document.removeEventListener("keydown", onKeydown)
})
</script>

<template>
  <header>
    <span class="tile" aria-hidden="true" />
    <span class="brand">
      <b>Patrones</b>
      <span>паттерн-тренажёр</span>
    </span>
    <button class="ghost" type="button" title="Тема" @click="toggleTheme">
      {{ isDark ? "☀ Тема" : "☾ Тема" }}
    </button>
  </header>

  <main>
    <SetupView
      v-show="view === 'setup'"
      v-model:order="order"
      v-model:dir-mode="dirMode"
      v-model:autospeak="autospeak"
      v-model:requeue="requeue"
      v-model:timer-sec="timerSec"
      v-model:mode-filter="modeFilter"
      v-model:setup-tab="setupTab"
      v-model:backup-export-mode="backupExportMode"
      :decks="decks"
      :deck-mastery="deckMastery"
      :load-err="loadErr"
      :stored-weak-count="storedWeakCount"
      :mistakes-start-disabled="mistakesStartDisabled"
      :mistakes-start-label="mistakesStartLabel"
      :start-disabled="startDisabled"
      :start-label="startLabel"
      @start="startCards"
      @start-mistakes="startMistakes"
      @refresh-weak="refreshWeakCount"
      @export-backup="exportBackup"
    />

    <DrillView
      v-show="view === 'drill'"
      :fill-width="fillWidth"
      :left-count="leftCount"
      :missed="missed"
      :cur-unit="curUnit"
      :show-secbar="showSecbar"
      :card-side="cardSide"
      :card-prompt="cardPrompt"
      :card-answer="cardAnswer"
      :card-note="cardNote"
      :card-translation="cardTranslation"
      :revealed="revealed"
      :is-timer-mode="isTimerMode"
      :timer-paused="timerPaused"
      :timer-fill="timerFill"
      :timer-transition="timerTransition"
      :timer-sec="timerSec"
      @quit="quitDrill"
      @card-click="onCardClick"
      @reveal="reveal"
      @rate="rate"
      @speak="speak(spanishText)"
    />

    <DoneView
      v-show="view === 'done'"
      :done-text="doneText"
      @restart="startCards"
      @setup="view = 'setup'"
    />
  </main>
</template>
