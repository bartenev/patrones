<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue"
import { loadDecksFromFolder } from "./lib/loadDecks"
import { buildQueue, deckCount, sideFor } from "./lib/patrones"
import type { AppView, Deck, DirMode, OrderMode, QueueItem } from "./types"

const decks = ref<Deck[]>([])
const loadErr = ref("")
const view = ref<AppView>("setup")
const queue = ref<QueueItem[]>([])
const cur = ref<QueueItem | null>(null)
const total = ref(0)
const missed = ref(0)
const missesRequeued = ref(0)
const revealed = ref(false)
const dirMode = ref<DirMode>("auto")
const requeue = ref(true)
const curSection = ref<string | null>(null)
const order = ref<OrderMode>("straight")
const autospeak = ref(false)
const isDark = ref(true)
const esVoice = ref<SpeechSynthesisVoice | null>(null)

const cardSide = ref("")
const cardPrompt = ref("")
const cardAnswer = ref("")
const cardTag = ref("")
const cardNote = ref("")
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
  }
]

const dirOptions: { value: DirMode; label: string }[] = [
  { value: "auto", label: "по блоку" },
  { value: "ru", label: "RU → ES" },
  { value: "es", label: "ES → RU" }
]

const selectedDecks = computed(() => decks.value.filter((d) => d.on))
const totalSelected = computed(() => selectedDecks.value.reduce((s, d) => s + deckCount(d), 0))
const startDisabled = computed(() => totalSelected.value === 0)
const startLabel = computed(() =>
  totalSelected.value
    ? `Начать прогон → ${totalSelected.value} пар`
    : "Выбери хотя бы один юнит"
)

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

function toggleDeck(deck: Deck, on: boolean) {
  deck.on = on
}

function selectAll(on: boolean) {
  decks.value.forEach((d) => { d.on = on })
}

function pickVoice() {
  if (!("speechSynthesis" in window)) return
  const vs = speechSynthesis.getVoices()
  esVoice.value = vs.find((v) => /es-ES/i.test(v.lang)) || vs.find((v) => /^es/i.test(v.lang)) || null
}

function speak(text: string) {
  if (!("speechSynthesis" in window) || !text) return
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = "es-ES"
  if (esVoice.value) u.voice = esVoice.value
  u.rate = 0.95
  speechSynthesis.speak(u)
}

function applyCardView() {
  if (!cur.value) return
  const v = sideFor(cur.value, dirMode.value)
  spanishText.value = v.spanish
  cardSide.value = v.side
  cardPrompt.value = v.prompt
  cardAnswer.value = v.answer
  cardTag.value = cur.value.deck || ""
  cardNote.value = cur.value.note || ""
}

function next() {
  if (!queue.value.length) {
    finish()
    return
  }

  cur.value = queue.value.shift() ?? null
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
}

function startCards() {
  queue.value = buildQueue(selectedDecks.value, order.value)
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
  revealed.value = true
  if (autospeak.value) speak(spanishText.value)
}

function rate(knew: boolean) {
  if (!revealed.value || !cur.value) return
  if (!knew) {
    missed.value++
    missesRequeued.value++
    if (requeue.value) {
      queue.value.push({ ...cur.value, section: "" })
    }
  }
  next()
}

function finish() {
  view.value = "done"
}

function quitDrill() {
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

  if (bad.length) {
    loadErr.value = `Не удалось разобрать: ${bad.join(", ")}`
  } else if (!loaded.length) {
    loadErr.value = "В папке decks/ нет .json — положи туда файлы юнитов и обнови страницу."
  }

  pickVoice()
  if ("speechSynthesis" in window) {
    speechSynthesis.onvoiceschanged = pickVoice
  }
  document.addEventListener("keydown", onKeydown)
})

onUnmounted(() => {
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
      <p class="lead">
        Юниты подхватываются из папки <code>decks/</code> — по одному <code>.json</code> на юнит.
        Отметь галочками, что прогонять, выбери режим порядка — и запускай.
      </p>

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
            <span class="nm">{{ deck.fileName }}</span>
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
                <span class="t">{{ opt.title }}</span>
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
              @click="dirMode = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>
          <label class="chk">
            <input v-model="autospeak" type="checkbox"> озвучивать ответ
          </label>
          <label class="chk">
            <input v-model="requeue" type="checkbox"> повторять ошибки
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

      <div class="card">
        <span class="tag">{{ cardTag }}</span>
        <div class="side">{{ cardSide }}</div>
        <div class="prompt">{{ cardPrompt }}</div>
        <div v-if="revealed" class="answer">{{ cardAnswer }}</div>
        <div v-if="revealed && cardNote" class="note">{{ cardNote }}</div>
        <button
          v-if="revealed"
          class="spk"
          type="button"
          @click="speak(spanishText)"
        >
          🔊 произнести
        </button>
      </div>

      <div v-if="!revealed" class="controls">
        <button class="reveal" type="button" @click="reveal">Показать ответ</button>
      </div>
      <div v-else class="controls">
        <button class="missed" type="button" @click="rate(false)">Споткнулся</button>
        <button class="knew" type="button" @click="rate(true)">Знал</button>
      </div>

      <div class="hint">
        <kbd>Пробел</kbd> показать ответ · <kbd>←</kbd> споткнулся · <kbd>→</kbd> знал · <kbd>S</kbd> озвучить · <kbd>Esc</kbd> выход
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

  <footer>Юниты из папки <code>decks/</code> · офлайн · ничего не уходит в сеть</footer>
</template>
