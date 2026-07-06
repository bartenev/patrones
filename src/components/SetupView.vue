<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue"
import {
  blockCount,
  filteredDeckCount,
  matchingBlocks,
  selectedDeckCount,
  visibleDecks
} from "../lib/patrones"
import type { Block, BackupExportMode, CardMode, Deck, DirMode, OrderMode, SetupTab, TimerSec } from "../types"

const modeFilterOptions: { value: CardMode; label: string }[] = [
  { value: "transform", label: "transform" },
  { value: "vocab", label: "vocab" },
  { value: "cloze", label: "cloze" },
  { value: "phrase", label: "phrase" }
]

const props = defineProps<{
  decks: Deck[]
  loadErr: string
  storedMistakeCount: number
  storedWeakCount: number
  isMistakesMode: boolean
  startDisabled: boolean
  startLabel: string
}>()

const order = defineModel<OrderMode>("order", { required: true })
const dirMode = defineModel<DirMode>("dirMode", { required: true })
const autospeak = defineModel<boolean>("autospeak", { required: true })
const requeue = defineModel<boolean>("requeue", { required: true })
const timerSec = defineModel<TimerSec>("timerSec", { required: true })
const modeFilter = defineModel<CardMode[]>("modeFilter", { required: true })
const setupTab = defineModel<SetupTab>("setupTab", { required: true })
const backupExportMode = defineModel<BackupExportMode>("backupExportMode", { required: true })

const emit = defineEmits<{
  start: []
  refreshWeak: []
  exportBackup: [mode: BackupExportMode]
}>()

const blocksPickerDeck = ref<Deck | null>(null)
const summaryDeck = ref<Deck | null>(null)

const backupActionLabel = computed(() =>
  backupExportMode.value === "clipboard"
    ? "Скопировать в буфер"
    : "Скачать резервную копию"
)

const filteredDecks = computed(() => visibleDecks(props.decks, modeFilter.value))

const selectedOrderOption = computed(() =>
  orderOptions.find((opt) => opt.value === order.value) ?? orderOptions[0]
)

const pickerBlocks = computed(() => {
  if (!blocksPickerDeck.value) return []
  return matchingBlocks(blocksPickerDeck.value, modeFilter.value)
})

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
  },
  {
    value: "weak",
    title: "7 — слабые",
    desc: "до 10 карточек с высокой долей ошибок в выбранном направлении. Берутся из прогресса IndexedDB."
  }
]

const dirOptions: { value: DirMode; label: string }[] = [
  { value: "fwd", label: "front → back" },
  { value: "rev", label: "back → front" }
]

const timerOptions: { value: TimerSec; label: string }[] = [
  { value: 0, label: "вручную" },
  { value: 1, label: "1 сек" },
  { value: 2, label: "2 сек" },
  { value: 3, label: "3 сек" },
  { value: 4, label: "4 сек" },
  { value: 5, label: "5 сек" }
]

function toggleMode(mode: CardMode) {
  if (modeFilter.value.includes(mode)) {
    modeFilter.value = modeFilter.value.filter((item) => item !== mode)
  } else {
    modeFilter.value = [...modeFilter.value, mode]
  }
}

function isModeSelected(mode: CardMode) {
  return modeFilter.value.includes(mode)
}

function orderOptionTitle(value: OrderMode, title: string, mistakeCount: number, weakCount: number) {
  if (value === "mistakes") {
    return `5 — только ошибки (${mistakeCount})`
  }
  if (value === "weak") {
    return `7 — слабые (${weakCount})`
  }
  return title
}

function deckVisibleBlocks(deck: Deck) {
  return matchingBlocks(deck, modeFilter.value)
}

function isPartialDeck(deck: Deck) {
  const visible = deckVisibleBlocks(deck)
  if (!deck.on || !visible.length) return false
  const selected = visible.filter((b) => b.on)
  return selected.length > 0 && selected.length < visible.length
}

function deckCountLabel(deck: Deck) {
  const visible = deckVisibleBlocks(deck)
  const totalBlocks = visible.length
  const totalCards = filteredDeckCount(deck, modeFilter.value)
  if (!deck.on) {
    return `${totalCards} · ${totalBlocks} бл.`
  }
  const cards = selectedDeckCount(deck, modeFilter.value)
  if (!isPartialDeck(deck)) {
    return `${cards} · ${totalBlocks} бл.`
  }
  const activeBlocks = visible.filter((b) => b.on).length
  return `${cards} · ${activeBlocks}/${totalBlocks} бл.`
}

function blocksBtnLabel(deck: Deck) {
  const visible = deckVisibleBlocks(deck)
  const active = visible.filter((b) => b.on).length
  return active === visible.length ? "блоки" : `${active}/${visible.length}`
}

function blockTitle(block: Block) {
  return block.title || "Без названия"
}

function toggleDeck(deck: Deck, on: boolean) {
  deck.on = on
  deck.blocks.forEach((b) => { b.on = on })
  if (!on) {
    if (blocksPickerDeck.value === deck) blocksPickerDeck.value = null
    if (summaryDeck.value === deck) summaryDeck.value = null
  }
}

function toggleBlock(deck: Deck, block: Block, on: boolean) {
  block.on = on
  deck.on = deck.blocks.some((b) => b.on)
}

function openBlocksPicker(deck: Deck) {
  blocksPickerDeck.value = deck
  summaryDeck.value = null
}

function closeBlocksPicker() {
  blocksPickerDeck.value = null
}

function openSummary(deck: Deck) {
  summaryDeck.value = deck
  blocksPickerDeck.value = null
}

function closeSummary() {
  summaryDeck.value = null
}

function selectBlocksInPicker(on: boolean) {
  pickerBlocks.value.forEach((b) => { b.on = on })
  if (blocksPickerDeck.value) {
    blocksPickerDeck.value.on = blocksPickerDeck.value.blocks.some((b) => b.on)
  }
}

function selectAll(on: boolean) {
  filteredDecks.value.forEach((d) => toggleDeck(d, on))
  if (!on) {
    blocksPickerDeck.value = null
    summaryDeck.value = null
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== "Escape") return
  if (blocksPickerDeck.value) closeBlocksPicker()
  else if (summaryDeck.value) closeSummary()
}

onMounted(() => {
  document.addEventListener("keydown", onKeydown)
})

watch([order, dirMode, modeFilter, () => props.decks.map((d) => `${d.fileName}:${d.on}`).join()], () => {
  emit("refreshWeak")
})

onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown)
})
</script>

<template>
  <section class="wrap setup">
    <template v-if="decks.length">
      <div class="setup-tabs seg" role="tablist" aria-label="Настройки прогона">
        <button
          type="button"
          role="tab"
          :class="{ on: setupTab === 'content' }"
          :aria-selected="setupTab === 'content'"
          @click="setupTab = 'content'"
        >
          Контент
        </button>
        <button
          type="button"
          role="tab"
          :class="{ on: setupTab === 'mode' }"
          :aria-selected="setupTab === 'mode'"
          @click="setupTab = 'mode'"
        >
          Режим
        </button>
      </div>

      <div v-show="setupTab === 'content'" class="setup-pane" role="tabpanel">
        <div v-if="!isMistakesMode" class="mode-filter">
          <h3>Тип карточек</h3>
          <div class="seg mode-seg">
            <button
              v-for="opt in modeFilterOptions"
              :key="opt.value"
              type="button"
              :class="{ on: isModeSelected(opt.value) }"
              @click="toggleMode(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>

        <div class="deck-head">
          <h2>Юниты</h2>
          <div v-if="filteredDecks.length" class="tools">
            <button class="mini" type="button" @click="selectAll(true)">все</button>
            <button class="mini" type="button" @click="selectAll(false)">снять</button>
          </div>
        </div>

        <div v-if="filteredDecks.length" class="decks-scroll">
          <ul class="decks">
            <li
              v-for="deck in filteredDecks"
              :key="deck.fileName"
              class="deck"
              :class="{ on: deck.on, partial: isPartialDeck(deck) }"
              @click="toggleDeck(deck, !deck.on)"
            >
              <div class="deck-main">
                <input
                  type="checkbox"
                  :checked="deck.on"
                  tabindex="-1"
                  @click.prevent
                >
                <span class="nm" :title="deck.name">{{ deck.name }}</span>
                <span class="ct">{{ deckCountLabel(deck) }}</span>
              </div>
              <span class="deck-actions">
                <button
                  v-if="deck.summary"
                  class="summary-btn"
                  type="button"
                  title="Сводка по юниту"
                  tabindex="-1"
                  @click.stop="openSummary(deck)"
                >
                  сводка
                </button>
                <button
                  class="blocks-btn"
                  :class="{ custom: isPartialDeck(deck), idle: !deck.on }"
                  type="button"
                  title="Выбрать блоки"
                  :tabindex="deck.on ? 0 : -1"
                  @click.stop="deck.on && openBlocksPicker(deck)"
                >
                  {{ deck.on ? blocksBtnLabel(deck) : "блоки" }}
                </button>
              </span>
            </li>
          </ul>
        </div>

        <p v-else-if="!isMistakesMode && !modeFilter.length" class="err mode-empty">
          Выбери хотя бы один тип карточек.
        </p>
        <p v-else-if="!isMistakesMode" class="err mode-empty">
          Нет юнитов с выбранными типами карточек.
        </p>
      </div>

      <div v-show="setupTab === 'mode'" class="setup-pane" role="tabpanel">
        <div class="order-block">
          <h3>Порядок карточек</h3>
          <select v-model="order" class="order-select">
            <option
              v-for="opt in orderOptions"
              :key="opt.value"
              :value="opt.value"
            >
              {{ orderOptionTitle(opt.value, opt.title, storedMistakeCount, storedWeakCount) }}
            </option>
          </select>
          <p class="order-desc">{{ selectedOrderOption.desc }}</p>
        </div>

        <div class="opts">
          <h3>Сессия</h3>
          <div class="opts-panel">
            <div class="opt-row opt-row--dir">
              <span class="opt-label">Направление</span>
              <div class="seg dir-seg">
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
            </div>

            <label class="opt-row opt-toggle">
              <span class="opt-label">Озвучивать ответ</span>
              <input v-model="autospeak" type="checkbox">
            </label>

            <label class="opt-row opt-toggle">
              <span class="opt-label">Повторять ошибки</span>
              <input v-model="requeue" type="checkbox" :disabled="isMistakesMode">
            </label>

            <div class="opt-row">
              <span class="opt-label">Таймер</span>
              <select v-model.number="timerSec" class="opt-select">
                <option v-for="opt in timerOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>
          </div>
        </div>

        <div class="data-block">
          <h3>Данные</h3>
          <p class="data-hint">Прогресс и банк ошибок из IndexedDB</p>
          <div class="backup-radio" role="radiogroup" aria-label="Способ экспорта">
            <label class="backup-radio__item">
              <input v-model="backupExportMode" type="radio" value="download">
              <span>Скачать файл</span>
            </label>
            <label class="backup-radio__item">
              <input v-model="backupExportMode" type="radio" value="clipboard">
              <span>Скопировать в буфер</span>
            </label>
          </div>
          <button class="file-btn" type="button" @click="emit('exportBackup', backupExportMode)">
            {{ backupActionLabel }}
          </button>
        </div>
      </div>

      <div class="setup-bar">
        <div class="setup-bar-inner">
          <button class="start" type="button" :disabled="startDisabled" @click="emit('start')">
            {{ startLabel }}
          </button>
        </div>
      </div>
    </template>

    <Teleport to="body">
      <div
        v-if="summaryDeck"
        class="blocks-overlay"
        @click.self="closeSummary"
      >
        <div class="summary-popover" role="dialog" aria-modal="true" :aria-label="summaryDeck.name">
          <div class="blocks-popover-head">
            <div>
              <h3>Сводка</h3>
              <p>{{ summaryDeck.name }}</p>
            </div>
            <button class="ghost blocks-close" type="button" aria-label="Закрыть" @click="closeSummary">
              ×
            </button>
          </div>

          <p class="summary-text">{{ summaryDeck.summary }}</p>

          <button class="file-btn blocks-done" type="button" @click="closeSummary">
            Готово
          </button>
        </div>
      </div>

      <div
        v-if="blocksPickerDeck"
        class="blocks-overlay"
        @click.self="closeBlocksPicker"
      >
        <div class="blocks-popover" role="dialog" aria-modal="true" :aria-label="blocksPickerDeck.name">
          <div class="blocks-popover-head">
            <div>
              <h3>Блоки</h3>
              <p>{{ blocksPickerDeck.name }}</p>
            </div>
            <button class="ghost blocks-close" type="button" aria-label="Закрыть" @click="closeBlocksPicker">
              ×
            </button>
          </div>

          <div class="blocks-popover-tools">
            <button class="mini" type="button" @click="selectBlocksInPicker(true)">все</button>
            <button class="mini" type="button" @click="selectBlocksInPicker(false)">снять</button>
          </div>

          <ul class="blocks-list">
            <li
              v-for="block in pickerBlocks"
              :key="`${blocksPickerDeck.fileName}:${block.title}:${block.mode}`"
              class="block-row"
              :class="{ on: block.on }"
              @click="toggleBlock(blocksPickerDeck, block, !block.on)"
            >
              <input
                type="checkbox"
                :checked="block.on"
                tabindex="-1"
                @click.prevent
              >
              <span class="nm" :title="blockTitle(block)">{{ blockTitle(block) }}</span>
              <span class="ct">{{ blockCount(block) }} карт.</span>
            </li>
          </ul>

          <button class="file-btn blocks-done" type="button" @click="closeBlocksPicker">
            Готово
          </button>
        </div>
      </div>
    </Teleport>

    <p v-if="loadErr" class="err">{{ loadErr }}</p>
  </section>
</template>
