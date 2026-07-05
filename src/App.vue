<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue"
import { loadDecksFromFolder } from "./lib/loadDecks"
import { buildQueue, deckCount, reviewCount, sideFor } from "./lib/patrones"
import {
  buildMistakesQueue,
  mistakeCount as getMistakeCount,
  mistakesBatchCount,
  recordMistake,
  removeMistake
} from "./lib/mistakes"
import { dequeue } from "./lib/queue"
import type { AppView, Deck, DirMode, OrderMode, QueueItem, TimerSec } from "./types"

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
const curSection = ref<string | null>(null)
const order = ref<OrderMode>("straight")
const autospeak = ref(false)
const timerSec = ref<TimerSec>(0)
const isDark = ref(true)
const esVoice = ref<SpeechSynthesisVoice | null>(null)
const timerFill = ref("0%")
const timerTransition = ref("none")
const timerPaused = ref(false)
const storedMistakeCount = ref(0)

let timerId: ReturnType<typeof setTimeout> | null = null
let timerRunId = 0
let timerPhase: "question" | "answer" | null = null
let timerDurationMs = 0
let timerStartedAt = 0
let timerRemainingMs = 0

const timerOptions: { value: TimerSec; label: string }[] = [
  { value: 0, label: "вручную" },
  { value: 1, label: "1 сек" },
  { value: 2, label: "2 сек" },
  { value: 3, label: "3 сек" },
  { value: 4, label: "4 сек" },
  { value: 5, label: "5 сек" }
]

const isTimerMode = computed(() => timerSec.value > 0)

const ANSWER_TIMER_MS = 1000

function timerStepMs(phase: "question" | "answer"): number {
  return phase === "answer" ? ANSWER_TIMER_MS : timerSec.value * 1000
}

const cardSide = ref("")
const cardPrompt = ref("")
const cardAnswer = ref("")
const cardTag = ref("")
const cardNote = ref("")
const cardTranslation = ref("")
const spanishText = ref("")

const orderOptions: { value: OrderMode; title: string; desc: string }[] = [
  {
    value: "straight",
    title: "1 — всё по порядку",
    desc: "юниты по очереди → блоки прямо → карточки прямо. Для постановки навыка."
  },
  {
    value: "shuffleCards",
    title: "2 — карточки вперемешку",
    desc: "юниты по очереди → блоки прямо → карточки внутри блока случайно."
  },
  {
    value: "shuffleBlocks",
    title: "3 — блоки и карточки вперемешку",
    desc: "юниты по очереди → блоки случайно → карточки внутри блока случайно."
  },
  {
    value: "shuffleAll",
    title: "4 — полный хаос",
    desc: "все карточки из выбранных юнитов в один случайный поток. Экзамен."
  },
  {
    value: "mistakes",
    title: "5 — только ошибки",
    desc: "до 10 карточек за раз из банка. Ошибся — снова в очередь; знал — убирается из банка."
  },
  {
    value: "review",
    title: "6 — ревью",
    desc: "по одной случайной карточке из каждого блока выбранных юнитов. Быстрая проверка."
  }
]

const dirOptions: { value: DirMode; label: string }[] = [
  { value: "fwd", label: "front → back" },
  { value: "rev", label: "back → front" }
]

const selectedDecks = computed(() => decks.value.filter((d) => d.on))
const totalSelected = computed(() => selectedDecks.value.reduce((s, d) => s + deckCount(d), 0))
const selectedReviewCount = computed(() => reviewCount(selectedDecks.value))
const isMistakesMode = computed(() => order.value === "mistakes")
const isReviewMode = computed(() => order.value === "review")
const mistakesSessionCount = computed(() => mistakesBatchCount(storedMistakeCount.value))
const startDisabled = computed(() => {
  if (isMistakesMode.value) return storedMistakeCount.value === 0
  if (isReviewMode.value) return selectedReviewCount.value === 0
  return totalSelected.value === 0
})
const startLabel = computed(() => {
  if (isMistakesMode.value) {
    const total = storedMistakeCount.value
    const batch = mistakesSessionCount.value
    if (!total) return "Нет сохранённых ошибок"
    if (total === batch) return `Повторить ошибки → ${total} пар`
    return `Повторить ошибки → ${batch} из ${total} пар`
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

const showSecbar = computed(() => Boolean(curSection.value))
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

function refreshMistakeCount() {
  storedMistakeCount.value = getMistakeCount()
}

function orderOptionTitle(value: OrderMode, title: string) {
  if (value === "mistakes") {
    return `5 — только ошибки (${storedMistakeCount.value})`
  }
  return title
}

function toggleDeck(deck: Deck, on: boolean) {
  deck.on = on
}

function selectAll(on: boolean) {
  decks.value.forEach((d) => { d.on = on })
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
  cardTag.value = cur.value.deck || ""
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

  if (cur.value.section && cur.value.section !== curSection.value) {
    curSection.value = cur.value.section
  } else if (!cur.value.section) {
    curSection.value = null
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
  clearTimer()
  queue.value = isMistakesMode.value
    ? buildMistakesQueue()
    : buildQueue(selectedDecks.value, order.value)
  total.value = queue.value.length
  missed.value = 0
  missesRequeued.value = 0
  curSection.value = null
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
  if (!knew) {
    missed.value++
    missesRequeued.value++
    recordMistake(cur.value, effectiveDirMode())
    refreshMistakeCount()
    if (isMistakesMode.value || requeue.value) {
      queue.value.push({ ...cur.value, section: "" })
    }
  } else if (isMistakesMode.value) {
    removeMistake(cur.value, effectiveDirMode())
    refreshMistakeCount()
  }
  next()
}

function finish() {
  clearTimer()
  view.value = "done"
}

function quitDrill() {
  clearTimer()
  view.value = "setup"
}

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.setAttribute("data-theme", isDark.value ? "dark" : "light")
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

onMounted(() => {
  document.documentElement.setAttribute("data-theme", isDark.value ? "dark" : "light")

  const { decks: loaded, bad } = loadDecksFromFolder()
  decks.value = loaded
  refreshMistakeCount()

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
})

onUnmounted(() => {
  clearTimer()
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
    <section v-show="view === 'setup'" class="wrap">
      <div class="deck-head">
        <h2>Юниты</h2>
        <div v-if="decks.length" class="tools">
          <button class="mini" type="button" @click="selectAll(true)">все</button>
          <button class="mini" type="button" @click="selectAll(false)">снять</button>
        </div>
      </div>

      <div v-if="decks.length" class="decks-scroll">
        <ul class="decks">
          <li
            v-for="deck in decks"
            :key="deck.fileName"
            class="deck"
            :class="{ on: deck.on }"
            @click="toggleDeck(deck, !deck.on)"
          >
            <input
              type="checkbox"
              :checked="deck.on"
              tabindex="-1"
              @click.prevent
            >
            <span class="nm" :title="deck.name">{{ deck.name }}</span>
            <span class="ct">{{ deckCount(deck) }} · {{ deck.blocks.length }} бл.</span>
          </li>
        </ul>
      </div>

      <p v-if="loadErr" class="err">{{ loadErr }}</p>

      <template v-if="decks.length">
        <div class="block">
          <h3>Порядок карточек</h3>
          <div class="radio">
            <label
              v-for="opt in orderOptions"
              :key="opt.value"
              :class="{ on: order === opt.value }"
            >
              <input v-model="order" type="radio" name="order" :value="opt.value">
              <span>
                <span class="t">{{ orderOptionTitle(opt.value, opt.title) }}</span>
                <span class="d">{{ opt.desc }}</span>
              </span>
            </label>
          </div>
        </div>

        <div class="opts">
          <div class="seg">
            <button
              v-for="opt in dirOptions"
              :key="opt.value"
              type="button"
              :class="{ on: dirMode === opt.value }"
              :disabled="isMistakesMode"
              @click="dirMode = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>
          <label class="chk">
            <input v-model="autospeak" type="checkbox"> озвучивать ответ
          </label>
          <label class="chk">
            <input v-model="requeue" type="checkbox" :disabled="isMistakesMode"> повторять ошибки
          </label>
          <label class="timer-sel">
            таймер
            <select v-model.number="timerSec">
              <option v-for="opt in timerOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </label>
        </div>

        <button class="start" type="button" :disabled="startDisabled" @click="startCards">
          {{ startLabel }}
        </button>
      </template>
    </section>

    <section v-show="view === 'drill'" class="wrap">
      <div class="bar">
        <button class="ghost" type="button" @click="quitDrill">‹ выход</button>
        <div class="track">
          <div class="fill" :style="{ width: fillWidth }" />
        </div>
        <span>осталось <b>{{ leftCount }}</b></span>
        <span class="miss">споткнулся <b style="color: inherit">{{ missed }}</b></span>
      </div>

      <div v-if="showSecbar" class="secbar">
        <span>{{ curSection }}</span>
        <span class="ln" />
      </div>

      <div
        class="card"
        :class="{ paused: isTimerMode && timerPaused }"
        @click="onCardClick"
      >
        <span class="tag">{{ cardTag }}</span>
        <div class="side">{{ cardSide }}</div>
        <div class="prompt">{{ cardPrompt }}</div>
        <div v-if="!revealed && cardTranslation" class="translation">{{ cardTranslation }}</div>
        <div v-if="revealed" class="answer">{{ cardAnswer }}</div>
        <div v-if="revealed && cardNote" class="note">{{ cardNote }}</div>
        <button
          v-if="revealed && !isTimerMode"
          class="spk"
          type="button"
          @click="speak(spanishText)"
        >
          🔊 произнести
        </button>
        <div v-if="isTimerMode" class="card-timer">
          <div
            class="fill"
            :style="{ width: timerFill, transition: timerTransition }"
          />
        </div>
      </div>

      <div v-if="!isTimerMode && !revealed" class="controls">
        <button class="reveal" type="button" @click="reveal">Показать ответ</button>
      </div>
      <div v-else-if="!isTimerMode" class="controls">
        <button class="missed" type="button" @click="rate(false)">Споткнулся</button>
        <button class="knew" type="button" @click="rate(true)">Знал</button>
      </div>

      <div class="hint">
        <template v-if="isTimerMode">
          авто · {{ timerSec }} с на вопрос · 1 с на ответ · клик — пауза · <kbd>Esc</kbd> выход
        </template>
        <template v-else>
          <kbd>Пробел</kbd> показать ответ · <kbd>←</kbd> споткнулся · <kbd>→</kbd> знал · <kbd>S</kbd> озвучить · <kbd>Esc</kbd> выход
        </template>
      </div>
    </section>

    <section v-show="view === 'done'" class="wrap">
      <div class="done">
        <h2>¡Listo!</h2>
        <p>{{ doneText }}</p>
        <div class="row">
          <button class="file-btn" type="button" @click="startCards">Прогнать ещё раз</button>
          <button class="ghost" type="button" @click="view = 'setup'">К выбору колод</button>
        </div>
      </div>
    </section>
  </main>
</template>
