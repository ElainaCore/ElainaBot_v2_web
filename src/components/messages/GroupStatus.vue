<script setup>
defineProps({ fullAccess: Boolean, proactive: Boolean })
</script>

<template>
  <span class="group-status" aria-label="群功能状态">
    <span
      class="group-status-dot full-access-dot"
      :class="{ enabled: fullAccess }"
      role="img"
      :title="`全量接入：${fullAccess ? '已开启' : '未开启'}`"
      :aria-label="`全量接入：${fullAccess ? '已开启' : '未开启'}`"
    />
    <span
      class="group-status-dot proactive-dot"
      :class="{ enabled: proactive }"
      role="img"
      :title="`主动消息：${proactive ? '已开启' : '未开启'}`"
      :aria-label="`主动消息：${proactive ? '已开启' : '未开启'}`"
    />
  </span>
</template>

<style scoped>
.group-status {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 3px;
}
.group-status-dot {
  width: 8px;
  height: 8px;
  border: 1px solid var(--text3);
  border-radius: 50%;
  background: var(--bg2);
}
.full-access-dot.enabled {
  border-color: var(--success);
  background: var(--success);
}
.proactive-dot.enabled {
  border-color: #eab308;
  background: #eab308;
}
</style>
