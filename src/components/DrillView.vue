<script setup lang="ts">
import type { TimerSec } from "../types"

defineProps<{
  fillWidth: string
  leftCount: number
  missed: number
  curUnit: string | null
  curSection: string
  showSecbar: boolean
  cardSide: string
  cardPrompt: string
  cardAnswer: string
  cardNote: string
  cardTranslation: string
  revealed: boolean
  isTimerMode: boolean
  timerPaused: boolean
  timerFill: string
  timerTransition: string
  timerSec: TimerSec
}>()

const emit = defineEmits<{
  quit: []
  "card-click": []
  reveal: []
  rate: [knew: boolean]
  speak: []
}>()
</script>

<template>
  <section class="wrap">
    <div class="bar">
      <button class="ghost" type="button" @click="emit('quit')">‹ выход</button>
      <div class="track">
        <div class="fill" :style="{ width: fillWidth }" />
      </div>
      <span>осталось <b>{{ leftCount }}</b></span>
      <span class="miss">споткнулся <b style="color: inherit">{{ missed }}</b></span>
    </div>

    <div v-if="showSecbar" class="secbar">
      <span>{{ curUnit }}</span>
      <span v-if="curSection" class="section">{{ curSection }}</span>
      <span class="ln" />
    </div>

    <div
      class="card"
      :class="{ paused: isTimerMode && timerPaused }"
      @click="emit('card-click')"
    >
      <div class="side">{{ cardSide }}</div>
      <div class="prompt">{{ cardPrompt }}</div>
      <div v-if="!revealed && cardTranslation" class="translation">{{ cardTranslation }}</div>
      <div v-if="revealed" class="answer">{{ cardAnswer }}</div>
      <div v-if="revealed && cardNote" class="note">{{ cardNote }}</div>
      <button
        v-if="revealed && !isTimerMode"
        class="spk"
        type="button"
        @click="emit('speak')"
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
      <button class="reveal" type="button" @click="emit('reveal')">Показать ответ</button>
    </div>
    <div v-else-if="!isTimerMode" class="controls">
      <button class="missed" type="button" @click="emit('rate', false)">Споткнулся</button>
      <button class="knew" type="button" @click="emit('rate', true)">Знал</button>
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
</template>
