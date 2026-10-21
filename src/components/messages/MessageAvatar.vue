<script setup>
import { computed, ref, watch } from 'vue'
import SvgIcon from '../SvgIcon.vue'

const props = defineProps({
  src: String,
  name: String,
  bot: Boolean,
  group: Boolean,
  size: { type: Number, default: 42 }
})
const failed = ref(false)
watch(
  () => props.src,
  () => {
    failed.value = false
  }
)
const tone = computed(
  () => [...(props.name || '')].reduce((sum, letter) => sum + letter.codePointAt(0), 0) % 5
)
</script>

<template>
  <span
    class="message-avatar"
    :class="[`tone-${tone}`, { 'is-bot': bot }]"
    :style="{ width: `${size}px`, height: `${size}px` }"
    aria-hidden="true"
  >
    <img
      v-if="src && !failed"
      :src="src"
      alt=""
      loading="lazy"
      referrerpolicy="no-referrer"
      @error="failed = true"
    />
    <SvgIcon v-else-if="bot || group" :name="bot ? 'chip' : 'people'" :size="Math.round(size * 0.48)" />
    <span v-else>{{ (name || '?').slice(0, 1).toUpperCase() }}</span>
  </span>
</template>

<style scoped>
.message-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 14px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 16px;
  font-weight: 650;
}
.message-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.tone-1 {
  background: color-mix(in srgb, var(--success) 12%, var(--bg2));
  color: var(--success);
}
.tone-2 {
  background: color-mix(in srgb, var(--warning) 12%, var(--bg2));
  color: var(--warning);
}
.tone-3 {
  background: color-mix(in srgb, #9370db 12%, var(--bg2));
  color: #9370db;
}
.tone-4 {
  background: color-mix(in srgb, #e47797 12%, var(--bg2));
  color: #d96788;
}
.is-bot {
  background: var(--accent-soft);
  color: var(--accent);
}
</style>
