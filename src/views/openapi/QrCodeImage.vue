<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import QRCode from 'qrcode'

const props = defineProps({
  target: { type: String, required: true },
  size: { type: Number, default: 148 },
})

const source = ref('')
const failed = ref(false)
let generation = 0

async function render() {
  const current = ++generation
  source.value = ''
  failed.value = false
  if (!props.target.trim()) return
  try {
    const result = await QRCode.toDataURL(props.target, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: props.size,
      color: { dark: '#1d1d1f', light: '#ffffff' },
    })
    if (current === generation) source.value = result
  } catch {
    if (current === generation) failed.value = true
  }
}

watch(() => [props.target, props.size], render, { immediate: true })
onBeforeUnmount(() => { generation++ })
</script>

<template>
  <span class="qr-code-image" :style="{ width: `${size}px`, height: `${size}px` }" :aria-busy="!source && !failed && !!target.trim()">
    <img v-if="source" :src="source" alt="二维码" />
    <button v-else-if="failed" type="button" @click="render">二维码生成失败，点击重试</button>
    <span v-else role="status">{{ target.trim() ? '二维码生成中…' : '暂无二维码' }}</span>
  </span>
</template>

<style scoped>
.qr-code-image { display: inline-flex; align-items: center; justify-content: center; flex: none; vertical-align: middle; }
.qr-code-image img { display: block; width: 100%; height: 100%; object-fit: contain; }
.qr-code-image button, .qr-code-image > span { font: inherit; font-size: 12px; color: var(--ink-3, #8c8d94); text-align: center; }
.qr-code-image button { padding: 12px; border: 0; background: transparent; cursor: pointer; }
</style>
