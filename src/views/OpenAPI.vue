<script setup>
import { ref, computed } from 'vue'
import OpenAPIPlatform from './openapi/OpenAPI.vue'
import FunctionConfig from './openapi/FunctionConfig.vue'

const mode = ref('platform')
const currentView = computed(() => mode.value === 'platform' ? OpenAPIPlatform : FunctionConfig)
</script>

<template>
  <div :class="['openapi-panel', { 'platform-mode': mode === 'platform' }]">
    <KeepAlive><component :is="currentView" /></KeepAlive>
    <nav class="openapi-switch" aria-label="开放平台页面切换">
      <button type="button" :aria-pressed="mode === 'platform'" @click="mode = 'platform'">开放平台</button>
      <button type="button" :aria-pressed="mode === 'function-config'" @click="mode = 'function-config'">功能配置</button>
    </nav>
  </div>
</template>

<style scoped>
.openapi-panel { position: relative; min-height: 100%; padding-bottom: 64px; }
.openapi-panel.platform-mode { margin: -20px; min-height: calc(100% + 40px); }
.openapi-switch { position: fixed; right: 24px; bottom: 24px; z-index: 70; display: flex; gap: 4px; padding: 4px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg2); box-shadow: var(--shadow); }
.openapi-switch button { border: 0; border-radius: 9px; padding: 8px 16px; background: transparent; color: var(--text2); font-size: 13px; font-weight: 600; cursor: pointer; }
.openapi-switch button[aria-pressed="true"] { background: var(--accent); color: #fff; }
@media (max-width: 767px) {
  .openapi-panel.platform-mode { margin: -12px; min-height: calc(100% + 24px); }
  .openapi-switch { right: 12px; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); }
  .openapi-switch button { padding: 8px 12px; }
}
</style>
