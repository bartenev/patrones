<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue"
import { blockCount, deckCount, selectedDeckCount } from "../lib/patrones"
import type { Block, Deck, DirMode, OrderMode, TimerSec } from "../types"

defineProps<{
  decks: Deck[]
  loadErr: string
  storedMistakeCount: number
  isMistakesMode: boolean
  startDisabled: boolean
  startLabel: string
}>()

const order = defineModel<OrderMode>("order", { required: true })
const dirMode = defineModel<DirMode>("dirMode", { required: true })
const autospeak = defineModel<boolean>("autospeak", { required: true })
const requeue = defineModel<boolean>("requeue", { required: true })
const timerSec = defineModel<TimerSec>("timerSec", { required: true })

const emit = defineEmits<{
  start: []
}>()

const blocksPickerDeck = ref<Deck | null>(null)

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

const timerOptions: { value: TimerSec; label: string }[] = [
  { value: 0, label: "вручную" },
  { value: 1, label: "1 сек" },
  { value: 2, label: "2 сек" },
  { value: 3, label: "3 сек" },
  { value: 4, label: "4 сек" },
  { value: 5, label: "5 сек" }
]

function orderOptionTitle(value: OrderMode, title: string, mistakeCount: number) {
  if (value === "mistakes") {
    return `5 — только ошибки (${mistakeCount})`
  }
  return title
}

function isPartialDeck(deck: Deck) {
  return deck.on && deck.blocks.some((b) => !b.on)
}

function deckCountLabel(deck: Deck) {
  const totalBlocks = deck.blocks.length
  if (!deck.on) {
    return `${deckCount(deck)} · ${totalBlocks} бл.`
  }
  const cards = selectedDeckCount(deck)
  if (!isPartialDeck(deck)) {
    return `${cards} · ${totalBlocks} бл.`
  }
  const activeBlocks = deck.blocks.filter((b) => b.on).length
  return `${cards} · ${activeBlocks}/${totalBlocks} бл.`
}

function blocksBtnLabel(deck: Deck) {
  const total = deck.blocks.length
  const active = deck.blocks.filter((b) => b.on).length
  return active === total ? "блоки" : `${active}/${total}`
}

function blockTitle(block: Block) {
  return block.title || "Без названия"
}

function toggleDeck(deck: Deck, on: boolean) {
  deck.on = on
  deck.blocks.forEach((b) => { b.on = on })
  if (!on && blocksPickerDeck.value === deck) {
    blocksPickerDeck.value = null
  }
}

function toggleBlock(deck: Deck, block: Block, on: boolean) {
  block.on = on
  deck.on = deck.blocks.some((b) => b.on)
}

function openBlocksPicker(deck: Deck) {
  blocksPickerDeck.value = deck
}

function closeBlocksPicker() {
  blocksPickerDeck.value = null
}

function selectBlocksInPicker(on: boolean) {
  blocksPickerDeck.value?.blocks.forEach((b) => { b.on = on })
  if (blocksPickerDeck.value) {
    blocksPickerDeck.value.on = on
  }
}

function selectAll(decks: Deck[], on: boolean) {
  decks.forEach((d) => toggleDeck(d, on))
  if (!on) {
    blocksPickerDeck.value = null
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && blocksPickerDeck.value) {
    closeBlocksPicker()
  }
}

onMounted(() => {
  document.addEventListener("keydown", onKeydown)
})

onUnmounted(() => {
  document.removeEventListener("keydown", onKeydown)
})
</script>

<template>
  <section class="wrap">
    <div class="deck-head">
      <h2>Юниты</h2>
      <div v-if="decks.length" class="tools">
        <button class="mini" type="button" @click="selectAll(decks, true)">все</button>
        <button class="mini" type="button" @click="selectAll(decks, false)">снять</button>
      </div>
    </div>

    <div v-if="decks.length" class="decks-scroll">
      <ul class="decks">
        <li
          v-for="deck in decks"
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
          <span class="blocks-slot">
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

    <Teleport to="body">
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
              v-for="block in blocksPickerDeck.blocks"
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
              <span class="t">{{ orderOptionTitle(opt.value, opt.title, storedMistakeCount) }}</span>
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

      <button class="start" type="button" :disabled="startDisabled" @click="emit('start')">
        {{ startLabel }}
      </button>
    </template>
  </section>
</template>
