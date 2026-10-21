<script setup>
import { computed } from 'vue'

const props = defineProps({
  values: { type: Array, default: () => [] },
  color: { type: String, default: 'var(--accent)' }
})
const points = computed(() => {
  const values = props.values.map((value) => Math.max(0, Number(value) || 0))
  const max = Math.max(1, ...values)
  const min = Math.min(0, ...values)
  return values
    .map(
      (value, index) =>
        `${(index / Math.max(1, values.length - 1)) * 112},${32 - ((value - min) / (max - min)) * 26}`
    )
    .join(' ')
})
</script>

<template>
  <svg class="sparkline" viewBox="0 0 112 38" fill="none" aria-hidden="true">
    <polyline
      :points="points"
      :stroke="color"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<style scoped>
.sparkline {
  width: 96px;
  height: 36px;
  overflow: visible;
  flex-shrink: 0;
}
</style>
