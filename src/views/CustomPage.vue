<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import axios from '../utils/axios'
import SvgIcon from '../components/SvgIcon.vue'

const route = useRoute()
const iframeSrc = computed(() => {
  const key = route.params.key
  if (!key) return ''
  return `${axios.defaults.baseURL}/api/web-pages/${key}`
})
function openInNewWindow() {
  if (iframeSrc.value) window.open(iframeSrc.value, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div class="custom-page">
    <div v-if="iframeSrc" class="custom-page-actions">
      <button class="custom-page-open" type="button" @click="openInNewWindow">
        <SvgIcon name="open-outline" :size="12" />
        <span>新窗口打开</span>
      </button>
    </div>
    <iframe v-if="iframeSrc" :src="iframeSrc" frameborder="0" class="custom-iframe" />
    <n-empty v-else description="页面加载中..." />
  </div>
</template>

<style scoped>
.custom-page {
  position:relative;
  height:calc(100vh - 100px);
  display:flex;
  flex-direction:column
}
.custom-page-actions {
  position:absolute;
  top:-18px;
  right:0;
  z-index:2;
  display:flex;
  align-items:center;
  justify-content:flex-end;
  height:20px;
  pointer-events:none
}
.custom-page-open {
  display:inline-flex;
  align-items:center;
  gap:4px;
  height:22px;
  padding:0 6px;
  border:1px solid var(--border);
  border-radius:6px;
  background:color-mix(in srgb, var(--bg2) 94%, transparent);
  color:var(--text2);
  box-shadow:0 2px 6px rgba(0,0,0,.1);
  font-size:10px;
  white-space:nowrap;
  cursor:pointer;
  pointer-events:auto;
  backdrop-filter:blur(8px);
  transition:border-color .15s,color .15s,background .15s
}
.custom-page-open:hover {
  border-color:var(--accent);
  background:var(--bg2);
  color:var(--accent)
}
.custom-iframe {
  flex:1;
  width:100%;
  border:none;
  border-radius:8px;
  background:var(--bg2)
}
</style>
