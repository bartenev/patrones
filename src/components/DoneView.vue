<script setup lang="ts">
defineProps<{
  doneText: string
}>()

const emit = defineEmits<{
  restart: []
  setup: []
}>()
</script>

<template>
  <section class="wrap">
    <div class="done">
      <h2>¡Listo!</h2>
      <p>{{ doneText }}</p>
      <div class="row">
        <button class="file-btn" type="button" @click="emit('restart')">Прогнать ещё раз</button>
        <button class="ghost" type="button" @click="emit('setup')">К выбору колод</button>
      </div>
    </div>
  </section>
</template>
