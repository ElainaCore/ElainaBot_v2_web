<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  title: { type: String, required: true },
  items: { type: Array, required: true },
  loading: Boolean,
  donut: Boolean,
  rank: Boolean,
})

const COLORS = ['#0099ff', '#14c9c9', '#804fc3', '#165dff', '#9b28aa']
const PERCENT = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const pointerIndex = ref(null)
const focusIndex = ref(null)
const activeIndex = computed(() => pointerIndex.value ?? focusIndex.value)
const maximum = computed(() => Math.max(0, ...props.items.map(item => item.value)))
const chartHeight = computed(() => props.donut ? 140 : Math.max(202, props.items.length * 29))

const segments = computed(() => {
  const total = props.items.reduce((sum, item) => sum + item.value, 0)
  if (!total) return []
  let offset = 0
  return props.items.map((item, index) => {
    const size = item.value / total * 100
    const segment = { color: COLORS[index % COLORS.length], offset: -offset, size }
    offset += size
    return segment
  })
})

function describe(item) {
  const percent = `${PERCENT.format(item.value)}%`
  return item.count == null ? percent : `${percent} · ${Number(item.count).toLocaleString('zh-CN')}`
}
</script>

<template>
  <div class="distribution" :aria-label="title" role="group">
    <div v-if="loading" class="distribution-placeholder" :style="{ minHeight: `${chartHeight}px` }" aria-hidden="true">
      <span v-if="donut" class="distribution-ring-placeholder"></span>
      <span v-for="index in donut ? 0 : 4" :key="index" class="distribution-bar-placeholder"></span>
    </div>
    <div v-else-if="!maximum" class="distribution-empty" :style="{ minHeight: `${chartHeight}px` }">暂无数据</div>
    <template v-else-if="donut">
      <div class="distribution-donut">
        <svg viewBox="0 0 140 140" aria-hidden="true">
          <circle v-for="(segment, index) in segments" :key="index" cx="70" cy="70" r="40.5"
            pathLength="100" fill="none" :stroke="segment.color"
            :stroke-dasharray="`${segment.size} ${100 - segment.size}`" :stroke-dashoffset="segment.offset"
            :class="{ muted: activeIndex !== null && activeIndex !== index, highlighted: activeIndex === index }"
            @pointerenter="pointerIndex = index" @pointerleave="pointerIndex = null" />
        </svg>
        <div v-if="activeIndex !== null && items[activeIndex]" class="distribution-tooltip">
          <b>{{ items[activeIndex].label }}</b>
          <span>{{ describe(items[activeIndex]) }}</span>
        </div>
      </div>
      <ul class="distribution-legend">
        <li v-for="(item, index) in items" :key="item.label">
          <button type="button" :aria-label="`${item.label} ${describe(item)}`" :class="{ highlighted: activeIndex === index }"
            @pointerenter="pointerIndex = index" @pointerleave="pointerIndex = null" @focus="focusIndex = index" @blur="focusIndex = null">
            <i :style="{ background: segments[index].color }"></i>{{ item.label }}
          </button>
        </li>
      </ul>
    </template>
    <ul v-else class="distribution-bars" :style="{ minHeight: `${chartHeight}px` }">
      <li v-for="(item, index) in items" :key="item.label" tabindex="0" :aria-label="`${item.label} ${describe(item)}`">
        <span class="distribution-bar-label"><span v-if="rank" class="distribution-rank">{{ index + 1 }}</span>{{ item.label }}</span>
        <span class="distribution-track" aria-hidden="true"><i :style="{ width: `${item.value / maximum * 100}%` }"></i></span>
        <b>{{ PERCENT.format(item.value) }}%</b>
        <div v-if="item.count != null" class="distribution-tooltip distribution-bar-tooltip" aria-hidden="true">
          <b>{{ item.label }}</b><span>{{ describe(item) }}</span>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.distribution { min-width: 0; color: var(--ink-2); font-size: 12px; }
.distribution-empty, .distribution-placeholder { display: grid; place-content: center; justify-items: center; gap: 12px; border-radius: 12px; color: var(--ink-4); }
.distribution-placeholder { justify-content: stretch; }
.distribution-ring-placeholder { width: 94px; height: 94px; border: 13px solid var(--bg-sunken); border-radius: 50%; }
.distribution-bar-placeholder { width: 85%; height: 10px; border-radius: 8px; background: var(--bg-sunken); }
.distribution-donut { position: relative; display: grid; justify-content: center; }
.distribution-donut svg { display: block; width: 140px; height: 140px; max-width: 100%; }
.distribution-donut circle { stroke-width: 13; transform: rotate(-90deg); transform-origin: center; transition: opacity .15s, stroke-width .15s; }
.distribution-donut circle.muted { opacity: .38; }
.distribution-donut circle.highlighted { stroke-width: 16; }
.distribution-legend, .distribution-bars { list-style: none; margin: 0; padding: 0; }
.distribution-legend { display: flex; justify-content: center; flex-wrap: wrap; gap: 3px 7px; }
.distribution-legend button { display: flex; align-items: center; gap: 5px; padding: 4px 6px; border: 0; border-radius: 5px; background: none; color: inherit; font: inherit; cursor: pointer; }
.distribution-legend button.highlighted { background: var(--bg-sunken); }
.distribution-legend i { width: 8px; height: 8px; flex: none; border-radius: 50%; }
.distribution-bars { display: grid; align-content: center; }
.distribution-bars li { position: relative; display: grid; grid-template-columns: minmax(0, 65px) minmax(22px, 1fr) minmax(40px, auto); gap: 7px; align-items: center; min-height: 29px; border-radius: 5px; }
.distribution-bars li:hover, .distribution-bars li:focus-visible { background: var(--bg-sunken); }
.distribution-bar-label { display: flex; align-items: center; gap: 4px; overflow-wrap: anywhere; }
.distribution-rank { min-width: 14px; color: var(--ink-4); font-variant-numeric: tabular-nums; }
.distribution-bars li > b { justify-self: end; color: var(--ink); font-size: 11px; font-variant-numeric: tabular-nums; }
.distribution-track { height: 10px; overflow: hidden; border-radius: 10px; background: var(--bg-sunken); }
.distribution-track i { display: block; height: 100%; border-radius: inherit; background: #0099ff; }
.distribution-tooltip { position: absolute; z-index: 2; bottom: 2px; left: 50%; display: grid; gap: 3px; max-width: 100%; padding: 7px 10px; transform: translateX(-50%); border: 1px solid var(--line); border-radius: 8px; background: var(--bg-elev); color: var(--ink); box-shadow: var(--shadow-sm); white-space: nowrap; pointer-events: none; }
.distribution-bar-tooltip { display: none; bottom: 100%; }
.distribution-bars li:hover .distribution-bar-tooltip, .distribution-bars li:focus-visible .distribution-bar-tooltip { display: grid; }
@media (prefers-reduced-motion: reduce) { .distribution-donut circle { transition: none; } }
</style>
