<script setup>
import SvgIcon from '../SvgIcon.vue'
import Sparkline from './Sparkline.vue'
import { formatNumber } from '../../utils/statistics'

defineProps({
  label: String,
  value: [Number, String],
  icon: String,
  color: { type: String, default: 'primary' },
  values: { type: Array, default: () => [] },
  loading: Boolean,
  featured: Boolean,
  active: Boolean,
  interactive: Boolean
})
defineEmits(['select'])
</script>

<template>
  <component
    :is="interactive ? 'button' : 'article'"
    :type="interactive ? 'button' : undefined"
    :class="['metric-card', `metric-${color}`, { featured, selected: active, interactive }]"
    :aria-busy="loading"
    :aria-pressed="interactive ? active : undefined"
    @click="$emit('select')"
  >
    <div class="metric-top">
      <span>{{ label }}</span
      ><span class="metric-icon"><SvgIcon :name="icon" :size="18" /></span>
    </div>
    <div class="metric-main">
      <div v-if="loading && value == null" class="metric-skeleton" aria-label="加载中" />
      <div
        v-else
        :class="['metric-number', { 'metric-number-long': formatNumber(value).length > 8 }]"
        :title="formatNumber(value)"
      >
        {{ formatNumber(value) }}
      </div>
      <Sparkline v-if="values.length > 1" :values="values" color="var(--metric-accent)" />
    </div>
  </component>
</template>

<style scoped>
.metric-card {
  --metric-accent: var(--accent);
  container-type: inline-size;
  position: relative;
  min-width: 0;
  padding: 16px 18px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg2);
  color: var(--text);
  text-align: left;
  font: inherit;
  box-shadow: var(--shadow-sm);
  transition:
    border-color 0.18s,
    box-shadow 0.18s,
    transform 0.18s;
}
.metric-blue {
  --metric-accent: #5b8def;
}
.metric-purple {
  --metric-accent: #9b83db;
}
.metric-amber {
  --metric-accent: #d9a34f;
}
.metric-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text2);
}
.metric-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: var(--metric-accent);
  background: color-mix(in srgb, var(--metric-accent) 9%, transparent);
}
.metric-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
}
.metric-number {
  font-size: clamp(26px, 2.2vw, 32px);
  font-weight: 650;
  letter-spacing: -1px;
  line-height: 1.2;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.metric-number-long {
  font-size: clamp(22px, 2vw, 28px);
  letter-spacing: -1px;
}
.sparkline {
  width: 68px;
  height: 28px;
}
.metric-card.featured {
  --metric-accent: #fff;
  background: var(--accent);
  border-color: transparent;
  color: white;
  box-shadow: 0 5px 16px var(--accent-soft);
}
.featured .metric-top {
  color: #ffffffb8;
}
.featured .metric-icon {
  background: #ffffff1c;
}
.interactive {
  cursor: pointer;
}
.interactive:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}
.interactive.selected:not(.featured) {
  border-color: color-mix(in srgb, var(--metric-accent) 55%, var(--border));
}
.metric-skeleton {
  width: 92px;
  height: 38px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--text3) 14%, transparent);
  animation: skeleton-pulse 1.3s ease-in-out infinite alternate;
}
.featured .metric-skeleton {
  background: #ffffff2b;
}
@keyframes skeleton-pulse {
  from { opacity: 0.35; }
  to { opacity: 0.75; }
}
@container (max-width: 230px) {
  .sparkline {
    display: none;
  }
}
@media (max-width: 600px) {
  .metric-card {
    padding: 12px;
  }
  .metric-number {
    font-size: 26px;
  }
  .metric-top {
    font-size: 11px;
    gap: 4px;
  }
  .metric-icon {
    width: 24px;
    height: 24px;
    border-radius: 7px;
  }
  .metric-number-long {
    font-size: clamp(18px, 5vw, 23px);
  }
}
</style>
