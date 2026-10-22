<script setup>
import { ref, computed } from 'vue'
import guides from './service-guides'
import AppIcon from './AppIcon.vue'
const props = defineProps({ appid: String, secret: String })
const emit = defineEmits(['back', 'reset-secret', 'toast'])
const active = ref('WorkBuddy')
const manual = ref(false)
const config = computed(() => guides.find(item => item.name === active.value))
async function copy(value) {
  try { await navigator.clipboard.writeText(value); emit('toast', '已复制到剪贴板') }
  catch { emit('toast', '复制失败，请手动复制') }
}
</script>
<template>
  <div class="switch-service-panel">
    <nav class="breadcrumb-bar" aria-label="面包屑导航"><button class="breadcrumb-parent" aria-label="返回高级设置" @click="emit('back')"><AppIcon name="back" :size="14" />高级设置</button><span class="breadcrumb-sep">/</span><span class="breadcrumb-current">设置机器人服务</span></nav>
    <div class="connect-grid"><div class="guide-card"><div class="guide-title">推荐连接指引（不仅限连接使用以下 Agent 服务，可自行查阅更多网络教程）</div>
      <div class="guide-tabs" role="tablist"><button v-for="guide in guides" :key="guide.name" :class="['guide-tab', { active: active === guide.name }]" role="tab" :aria-selected="active === guide.name" @click="active = guide.name"><img class="guide-tab-icon" :src="guide.icon" alt="" /><span class="guide-tab-label">{{ guide.name }}</span></button></div>
      <div class="guide-pane"><div class="guide-shell"><div class="guide-overview"><div class="guide-overview-copy"><div class="guide-overview-kicker">服务接入</div><h3 class="guide-overview-title">{{ config.name }}</h3><p class="guide-summary">{{ config.description }}</p></div><div class="guide-links"><a v-for="link in config.links" :key="link.url" class="guide-link" :href="link.url" target="_blank" rel="noopener noreferrer"><AppIcon class="guide-link-icon" name="external" :size="15" />{{ link.label }}</a></div></div>
        <div class="guide-workbench has-side"><section class="guide-section guide-section-steps"><div class="guide-section-head"><div><div class="guide-section-title">连接步骤</div><div class="guide-section-sub">按照以下步骤操作，用 <strong>手机 QQ 扫码</strong> 绑定服务。</div></div></div><ol class="guide-steps"><li v-for="(step, index) in config.steps" :key="index" :class="{ 'is-tip': step.tip }"><div v-if="!step.tip" class="guide-step-index">{{ index + 1 }}</div><div class="guide-step-body"><div v-if="step.title" class="guide-step-title">{{ step.title }}</div><div v-if="step.code" class="guide-code-card"><code>{{ step.code }}</code><button class="guide-copy-btn" aria-label="复制命令" @click="copy(step.code)"><AppIcon name="copy" :size="15" /></button></div><div v-if="step.tip" class="guide-manual-title">{{ step.tip }}</div></div></li></ol></section>
          <aside class="guide-section guide-section-manual"><div class="guide-section-head guide-manual-trigger" role="button" tabindex="0" :aria-expanded="manual" @click="manual = !manual" @keydown.enter="manual = !manual" @keydown.space.prevent="manual = !manual"><div><div class="guide-section-title">⚠️ 若低版本 Agent 服务不支持使用QQ扫码接入</div><div class="guide-section-sub">可使用AppID+AppSecret根据接入指引设置绑定连接</div></div><span class="guide-manual-trigger-state"><span class="guide-manual-trigger-text">{{ manual ? '收起手动连接参数' : '查看手动连接参数' }}</span><AppIcon name="chevron" :size="16" :style="{ transform: manual ? 'rotate(90deg)' : '' }" /></span></div><div v-if="manual" class="guide-manual-card"><div v-for="credential in [{ label: 'AppID', value: appid }, { label: 'AppSecret', value: secret }]" :key="credential.label" class="guide-manual-row"><span class="guide-manual-label">{{ credential.label }}</span><code :class="['guide-manual-value', { 'is-secret-hidden': !credential.value }]">{{ credential.value || '••••••••••••' }}</code><button class="guide-copy-btn" :aria-label="credential.value ? `复制 ${credential.label}` : '重置并查看 AppSecret'" @click="credential.value ? copy(credential.value) : emit('reset-secret')"><AppIcon :name="credential.value ? 'copy' : 'eye'" :size="15" /></button></div></div></aside>
        </div>
      </div></div>
    </div></div>
  </div>
</template>
