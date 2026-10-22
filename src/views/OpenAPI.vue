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
      <button :class="{ active: mode === 'platform' }" @click="mode = 'platform'">开放平台</button>
      <button :class="{ active: mode === 'function-config' }" @click="mode = 'function-config'">功能配置</button>
    </nav>
  </div>
</template>

<style scoped>
.openapi-panel { position: relative; min-height: 100%; padding-bottom: 64px; }
.openapi-panel.platform-mode { margin: -20px; min-height: calc(100% + 40px); }
.openapi-switch { position: fixed; right: 24px; bottom: 24px; z-index: 1000; display: inline-flex; gap: 4px; padding: 4px; border: 1px solid var(--border, rgba(0, 0, 0, .06)); border-radius: 12px; background: var(--bg2, rgba(255, 255, 255, .92)); backdrop-filter: blur(8px); box-shadow: 0 4px 16px rgba(0, 0, 0, .12); }
.openapi-switch button { display: inline-flex; align-items: center; border: 0; border-radius: 9px; padding: 8px 16px; background: none; color: var(--text2, #6e6e73); font-size: 13px; font-weight: 600; cursor: pointer; transition: all .18s; }
.openapi-switch button.active { background: #0099ff; color: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, .12); }
@media (max-width: 767px) {
  .openapi-panel.platform-mode { margin: -12px; min-height: calc(100% + 24px); }
  .openapi-switch { right: 12px; bottom: 12px; }
  .openapi-switch button { padding: 8px 12px; }
}
</style>
