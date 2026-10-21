<script setup>
import SvgIcon from '../SvgIcon.vue'
defineProps({ loading: Boolean, error: Boolean, title: String })
defineEmits(['retry'])
</script>

<template>
  <div class="panel-state" :role="error ? 'alert' : 'status'" :aria-busy="loading">
    <span :class="['state-icon', { 'is-loading': loading }]"
      ><SvgIcon :name="loading ? 'refresh' : error ? 'alert-circle' : 'stats-chart'" :size="20"
    /></span>
    <strong>{{ title || (loading ? '正在整理数据' : error ? '数据暂时不可用' : '暂无数据') }}</strong>
    <button v-if="error" class="ui-btn ui-btn-ghost" type="button" @click="$emit('retry')">
      <SvgIcon name="refresh" :size="13" />重新加载
    </button>
  </div>
</template>

<style scoped>
.panel-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  height: 100%;
  min-height: 128px;
  padding: 16px;
  text-align: center;
  box-sizing: border-box;
}
.state-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  color: var(--text3);
  background: var(--bg3);
}
.panel-state strong {
  font-size: 13px;
  font-weight: 550;
  color: var(--text2);
}
.is-loading svg {
  animation: panel-spin 1.4s linear infinite;
}
@keyframes panel-spin {
  to { transform: rotate(360deg); }
}
</style>
