<script setup>
import { computed, ref, watch } from 'vue'
import { Line, Bar, Doughnut } from 'vue-chartjs'
import { useAppStore } from '../stores/app'
import { useThemeStore } from '../stores/theme'
import { useStatistics } from '../composables/useStatistics'
import { chartOptions, chartPalette, lineDataset } from '../utils/charts'
import {
  TREND_SERIES,
  numeric,
  formatNumber,
  formatTime,
  percent,
  sum
} from '../utils/statistics'
import SvgIcon from '../components/SvgIcon.vue'
import MetricCard from '../components/analytics/MetricCard.vue'
import PanelState from '../components/analytics/PanelState.vue'

const app = useAppStore()
const theme = useThemeStore()
const {
  days,
  data,
  state,
  loading,
  updatedAt,
  summary,
  active,
  hourly,
  yesterdayHourly,
  refresh
} = useStatistics()
const chartTab = ref('msg')
const compositionTab = ref('scene')
const hiddenSeries = ref(new Set(['msg_private', 'msg_group']))
const rankTab = ref('commands')
const rankLimit = ref(5)
const trendTitle = ref(null)
const chartTabs = [
  { key: 'msg', label: '消息趋势' },
  { key: 'active', label: '活跃趋势' },
  { key: 'event', label: '事件趋势' }
]
const palette = computed(() => chartPalette(theme.theme))
const scopeName = computed(() => app.currentBot?.name || (app.isAllBots ? '全部机器人' : app.currentBotId))
const scopeKey = computed(() => app.currentBotId || 'all')
const periodLabel = computed(() => {
  const labels = data.chart?.labels || []
  return labels.length
    ? `${labels[0].replace('-', '.')} — ${labels.at(-1).replace('-', '.')}`
    : `最近 ${days.value} 天`
})
const cards = computed(() =>
  [
    {
      label: '今日消息总量',
      value: summary.value.total_messages,
      icon: 'chatbubbles',
      color: 'primary',
      key: 'msg_total',
      tab: 'msg',
      featured: true
    },
    {
      label: '今日活跃用户',
      value: active.value.active_users,
      icon: 'people',
      color: 'blue',
      key: 'active_users',
      tab: 'active'
    },
    {
      label: '今日活跃群聊',
      value: active.value.active_groups,
      icon: 'group',
      color: 'purple',
      key: 'active_groups',
      tab: 'active'
    },
    {
      label: '今日下行消息',
      value: summary.value.sent_messages,
      icon: 'send',
      color: 'amber',
      key: 'msg_sent',
      tab: 'msg'
    }
  ].map((card) => ({
    ...card,
    values: data.chart?.[card.key] || []
  }))
)

const trendSeries = computed(() =>
  TREND_SERIES[chartTab.value].map((item) => ({ ...item, color: palette.value[item.color] }))
)
const lineData = computed(() => ({
  labels: data.chart?.labels || [],
  datasets: trendSeries.value
    .filter((item) => !hiddenSeries.value.has(item.key))
    .map((item) => lineDataset(item.label, data.chart?.[item.key] || [], item.color, { fill: !!item.fill }))
}))
const hasTrend = computed(() =>
  TREND_SERIES[chartTab.value].some((item) =>
    (data.chart?.[item.key] || []).some((value) => numeric(value) > 0)
  )
)
const lineOptions = computed(() => chartOptions(theme.theme))
const periodInsights = computed(() => {
  const series = TREND_SERIES[chartTab.value][0]
  const values = data.chart?.[series.key] || []
  const total = sum(values)
  const max = values.length ? Math.max(...values.map((value) => numeric(value) || 0)) : 0
  const index = values.findIndex((value) => Number(value) === max)
  const isActive = chartTab.value === 'active'
  return [
    {
      label: isActive ? '日均活跃用户' : chartTab.value === 'event' ? '周期进群次数' : '周期消息总量',
      value: values.length ? (isActive ? Math.round(total / values.length) : total) : null,
      suffix: isActive ? '人 / 天' : '次'
    },
    {
      label: isActive ? '最高日活跃' : '每日平均',
      value: values.length ? (isActive ? max : Math.round(total / values.length)) : null,
      suffix: isActive ? '人' : '次 / 天'
    },
    {
      label: '最高峰值日期',
      value: max > 0 ? data.chart.labels[index]?.replace('-', '.') : '—',
      suffix: max > 0 ? `${formatNumber(max)} ${isActive ? '人' : '次'}` : ''
    }
  ]
})

function toggleSeries(key) {
  const next = new Set(hiddenSeries.value)
  if (next.has(key)) next.delete(key)
  else if (trendSeries.value.filter((item) => !next.has(item.key)).length > 1) next.add(key)
  hiddenSeries.value = next
}
watch(chartTab, () => {
  hiddenSeries.value = new Set(
    TREND_SERIES[chartTab.value].filter((item) => item.hidden).map((item) => item.key)
  )
})

const composition = computed(() => {
  const total = numeric(summary.value.total_messages) || 0
  const privateCount = Math.min(total, numeric(summary.value.private_messages) || 0)
  return compositionTab.value === 'scene'
    ? [
        { label: '群聊消息', value: total - privateCount, color: palette.value.primary },
        { label: '私聊消息', value: privateCount, color: palette.value.blue }
      ]
    : [
        {
          label: '上行消息',
          value: numeric(summary.value.received_messages) || 0,
          color: palette.value.primary
        },
        { label: '下行消息', value: numeric(summary.value.sent_messages) || 0, color: palette.value.purple }
      ]
})
const compositionTotal = computed(() => sum(composition.value.map((item) => item.value)))
const doughnutData = computed(() => ({
  labels: composition.value.map((item) => item.label),
  datasets: [
    {
      data: composition.value.map((item) => item.value),
      backgroundColor: composition.value.map((item) => item.color),
      borderColor: theme.theme.bgPanel,
      borderWidth: 5,
      borderRadius: 5,
      hoverOffset: 3
    }
  ]
}))
const doughnutOptions = computed(() => ({
  ...chartOptions(theme.theme),
  scales: {},
  cutout: '78%',
  layout: { padding: 5 },
  plugins: {
    ...chartOptions(theme.theme).plugins,
    tooltip: {
      ...chartOptions(theme.theme).plugins.tooltip,
      callbacks: { label: (item) => ` ${item.label}  ${formatNumber(item.parsed)}` }
    }
  }
}))
const hasHourly = computed(
  () => hourly.value.some((value) => value > 0) || yesterdayHourly.value.some((value) => value > 0)
)
const hourlyData = computed(() => ({
  labels: Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`),
  datasets: [
    {
      label: '今日',
      data: hourly.value,
      backgroundColor: palette.value.primary,
      hoverBackgroundColor: theme.theme.accentHover,
      borderRadius: 4,
      maxBarThickness: 12
    },
    {
      label: '昨日',
      data: yesterdayHourly.value,
      backgroundColor: palette.value.primary + '25',
      hoverBackgroundColor: palette.value.primary + '55',
      borderRadius: 4,
      maxBarThickness: 12
    }
  ]
}))
const hourlyOptions = computed(() => chartOptions(theme.theme))
const peakHour = computed(() => {
  const peak = Math.max(0, ...hourly.value)
  const index = hourly.value.indexOf(peak)
  return peak
    ? `${String(index).padStart(2, '0')}:00 — ${String(index + 1).padStart(2, '0')}:00`
    : ''
})
const rankTabs = [
  { key: 'commands', label: '插件调用', icon: 'extension-puzzle' },
  { key: 'groups', label: '活跃群聊', icon: 'group' },
  { key: 'users', label: '活跃用户', icon: 'person' }
]
const rankItems = computed(() => {
  const items = data.top?.[`top_${rankTab.value}`] || []
  return items
    .map((item) => ({
      label: item.command || item.group_name || item.nickname || item.group_id || item.user_id || '未知',
      id: item.command || item.group_id || item.user_id,
      value: numeric(item.count ?? item.message_count) || 0
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, rankLimit.value)
})
const eventCards = [
  { label: '进群', key: 'group_join_count', icon: 'group', color: 'primary' },
  { label: '退群', key: 'group_leave_count', icon: 'return', color: 'rose' },
  { label: '加好友', key: 'friend_add_count', icon: 'person-add', color: 'blue' },
  { label: '删好友', key: 'friend_remove_count', icon: 'person-remove', color: 'amber' }
]
const cumulative = computed(() => [
  { label: '累计用户', value: data.totals?.total_users, icon: 'people' },
  { label: '累计群聊', value: data.totals?.total_groups, icon: 'group' },
  { label: '已记录成员', value: data.chart?.total_friends, icon: 'person-heart' }
])
function showEvents() {
  chartTab.value = 'event'
  trendTitle.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="stats-page analytics-page" :aria-busy="loading">
    <section class="metrics-grid" aria-label="今日核心指标">
      <MetricCard
        v-for="card in cards"
        :key="card.key"
        v-bind="card"
        :loading="state.core.loading"
        :interactive="true"
        :active="chartTab === card.tab"
        @select="chartTab = card.tab"
      />
    </section>

    <div class="analytics-primary-grid">
      <section class="analytics-panel trend-panel" aria-labelledby="trend-title">
        <div class="panel-heading">
          <div>
            <h2 id="trend-title" ref="trendTitle">
              互动趋势<span class="panel-subtitle">{{ periodLabel }}</span>
            </h2>
          </div>
          <div class="period-switch" role="group" aria-label="统计周期">
            <button
              v-for="period in [7, 14, 30]"
              :key="period"
              type="button"
              :class="{ active: days === period }"
              :aria-pressed="days === period"
              @click="days = period"
            >
              {{ period }} 天
            </button>
          </div>
        </div>
        <div class="trend-toolbar">
          <div class="analysis-tabs" role="tablist" aria-label="趋势类型">
            <button
              v-for="tab in chartTabs"
              :id="`trend-tab-${tab.key}`"
              :key="tab.key"
              type="button"
              role="tab"
              :aria-selected="chartTab === tab.key"
              aria-controls="trend-chart"
              :class="{ active: chartTab === tab.key }"
              @click="chartTab = tab.key"
            >
              {{ tab.label }}
            </button>
          </div>
          <span class="chart-unit">单位：{{ chartTab === 'active' ? '人 / 群' : '次' }}</span>
        </div>
        <div
          id="trend-chart"
          class="trend-chart chart-surface"
          role="tabpanel"
          :aria-labelledby="`trend-tab-${chartTab}`"
          :aria-busy="state.chart.loading"
        >
          <PanelState v-if="state.chart.loading && !data.chart" loading />
          <PanelState v-else-if="state.chart.error && !data.chart" error @retry="refresh(['chart'])" />
          <Line
            v-else-if="hasTrend"
            :key="`${scopeKey}-${chartTab}`"
            :data="lineData"
            :options="lineOptions"
            role="img"
            :aria-label="`近 ${days} 天${chartTabs.find((tab) => tab.key === chartTab).label}，可使用下方图例切换数据系列`"
          />
          <PanelState v-else title="所选周期暂无记录" />
        </div>
        <div class="chart-legend" role="group" aria-label="数据系列">
          <button
            v-for="series in trendSeries"
            :key="series.key"
            type="button"
            :class="{ muted: hiddenSeries.has(series.key) }"
            :aria-pressed="!hiddenSeries.has(series.key)"
            @click="toggleSeries(series.key)"
          >
            <i :style="{ background: series.color }" />{{ series.label }}
          </button>
        </div>
        <div class="trend-insights">
          <div v-for="item in periodInsights" :key="item.label">
            <span>{{ item.label }}</span
            ><strong
              >{{ typeof item.value === 'string' ? item.value : formatNumber(item.value)
              }}<small>{{ item.suffix }}</small></strong
            >
          </div>
        </div>
      </section>

      <section class="analytics-panel composition-panel" aria-labelledby="composition-title">
        <div class="panel-heading">
          <div>
            <h2 id="composition-title">消息构成</h2>
          </div>
        </div>
        <div class="composition-tabs period-switch" role="group" aria-label="消息构成维度">
          <button
            type="button"
            :class="{ active: compositionTab === 'scene' }"
            :aria-pressed="compositionTab === 'scene'"
            @click="compositionTab = 'scene'"
          >
            聊天场景</button
          ><button
            type="button"
            :class="{ active: compositionTab === 'direction' }"
            :aria-pressed="compositionTab === 'direction'"
            @click="compositionTab = 'direction'"
          >
            消息流向
          </button>
        </div>
        <div class="composition-chart">
          <PanelState v-if="state.core.loading && !data.core" loading />
          <PanelState v-else-if="state.core.error && !data.core" error @retry="refresh(['core'])" />
          <template v-else-if="compositionTotal"
            ><Doughnut
              :data="doughnutData"
              :options="doughnutOptions"
              role="img"
              aria-label="今日消息构成，明细见下方列表"
            />
            <div class="doughnut-center">
              <span>{{ compositionTab === 'scene' ? '消息总量' : '收发总量' }}</span
              ><strong>{{ formatNumber(compositionTotal) }}</strong>
            </div></template
          >
          <PanelState v-else title="暂无消息" />
        </div>
        <div class="composition-list">
          <div v-for="item in composition" :key="item.label">
            <span><i :style="{ background: item.color }" />{{ item.label }}</span
            ><strong>{{ data.core ? formatNumber(item.value) : '—' }}</strong
            ><small>{{ percent(item.value, compositionTotal).toFixed(1) }}%</small>
          </div>
        </div>
      </section>
    </div>

    <div class="analytics-secondary-grid">
      <section class="analytics-panel hourly-panel" aria-labelledby="hourly-title">
        <div class="panel-heading">
          <div>
            <h2 id="hourly-title">24 小时活跃分布</h2>
          </div>
          <div class="inline-legend">
            <span><i :style="{ background: palette.primary }" />今日</span
            ><span><i :style="{ background: palette.primary + '35' }" />昨日</span>
          </div>
        </div>
        <div class="hourly-chart chart-surface">
          <PanelState v-if="state.hourly.loading && !data.hourly" loading /><PanelState
            v-else-if="state.hourly.error && !data.hourly"
            error
            @retry="refresh(['hourly'])"
          /><Bar
            v-else-if="hasHourly"
            :key="scopeKey"
            :data="hourlyData"
            :options="hourlyOptions"
            role="img"
            aria-label="今日与昨日每小时消息数量对比"
          /><PanelState v-else title="暂无消息" />
        </div>
        <div class="hourly-footer">
          <span v-if="peakHour"
            ><SvgIcon name="flame" :size="14" />今日高峰 <strong>{{ peakHour }}</strong></span
          ><span>今日 {{ data.hourly ? formatNumber(sum(hourly)) : '—' }} 条</span>
        </div>
      </section>

      <section class="analytics-panel rankings-panel" aria-labelledby="rank-title">
        <div class="panel-heading">
          <div>
            <h2 id="rank-title">
              活跃排行榜<span class="panel-subtitle">TOP {{ rankLimit }}</span>
            </h2>
          </div>
          <SvgIcon name="trophy" :size="20" class="rank-trophy" />
        </div>
        <div class="analysis-tabs rank-tabs" role="tablist" aria-label="排行榜类型">
          <button
            v-for="tab in rankTabs"
            :key="tab.key"
            type="button"
            role="tab"
            :aria-selected="rankTab === tab.key"
            :class="{ active: rankTab === tab.key }"
            @click="rankTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>
        <PanelState v-if="state.top.loading && !data.top" loading /><PanelState
          v-else-if="state.top.error && !data.top"
          error
          @retry="refresh(['top'])"
        />
        <ol v-else-if="rankItems.length" class="rank-list">
          <li v-for="(item, index) in rankItems" :key="item.id">
            <span :class="['rank-number', { first: index === 0 }]">{{
              String(index + 1).padStart(2, '0')
            }}</span>
            <div class="rank-detail">
              <div>
                <span :title="item.label">{{ item.label }}</span
                ><strong>{{ formatNumber(item.value) }}<small>次</small></strong>
              </div>
              <div class="rank-track">
                <span :style="{ width: `${percent(item.value, rankItems[0]?.value)}%` }" />
              </div>
            </div>
          </li>
        </ol>
        <PanelState v-else title="暂无排行" />
        <div v-if="(data.top?.[`top_${rankTab}`] || []).length > 5" class="ranking-actions">
          <button
            type="button"
            class="text-action"
            @click="rankLimit = rankLimit === 5 ? 10 : 5"
          >
            {{ rankLimit === 5 ? '查看前 10 名' : '收起排行' }}
          </button>
        </div>
      </section>
    </div>

    <section class="analytics-panel lifecycle-panel" aria-labelledby="events-title">
      <div class="panel-heading">
        <div>
          <h2 id="events-title">连接与成长</h2>
        </div>
        <button class="text-action" type="button" @click="showEvents">
          查看事件趋势 <SvgIcon name="arrow-forward" :size="14" />
        </button>
      </div>
      <div class="lifecycle-content">
        <div class="event-grid">
          <div v-for="event in eventCards" :key="event.key" class="event-item">
            <span
              class="event-icon"
              :style="{ color: palette[event.color], background: palette[event.color] + '12' }"
              ><SvgIcon :name="event.icon" :size="17"
            /></span>
            <div>
              <span>{{ event.label }}</span
              ><strong>{{ formatNumber(data.events?.[event.key]) }}</strong>
            </div>
          </div>
        </div>
        <div class="cumulative-grid">
          <div v-for="item in cumulative" :key="item.label">
            <span>{{ item.label }}</span
            ><strong>{{ formatNumber(item.value) }}</strong>
          </div>
        </div>
      </div>
    </section>

    <footer class="analytics-footer">
      <span><span class="footer-dot" />{{ scopeName }}</span>
      <span>更新于 {{ formatTime(updatedAt) }}</span>
    </footer>
  </div>
</template>

<style scoped src="../assets/analytics.css"></style>

<style scoped>
.stats-page {
  width: 100%;
}
.analytics-primary-grid {
  display: grid;
  grid-template-columns: minmax(0, 2.25fr) minmax(270px, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}
.analytics-secondary-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(340px, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}
.trend-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0 20px;
  border-bottom: 1px solid var(--border);
  gap: 12px;
}
.chart-unit {
  font-size: 10px;
  white-space: nowrap;
  color: var(--text3);
}
.trend-chart {
  height: 230px;
  padding: 10px 16px 0 8px;
}
.chart-surface {
  position: relative;
  box-sizing: border-box;
}
.chart-legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16px;
  padding: 8px 16px 12px;
}
.chart-legend button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--text2);
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}
.chart-legend .muted {
  opacity: 0.4;
  text-decoration: line-through;
}
.chart-legend i,
.inline-legend i,
.composition-list i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}
.trend-insights {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  border-top: 1px solid var(--border);
  padding: 12px 20px;
  background: color-mix(in srgb, var(--bg) 40%, var(--bg2));
  border-radius: 0 0 14px 14px;
}
.trend-insights > div {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.trend-insights > div + div {
  padding-left: 18px;
  border-left: 1px solid var(--border);
}
.trend-insights span {
  font-size: 10px;
  color: var(--text3);
}
.trend-insights strong {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.4px;
}
.trend-insights small {
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0;
  margin-left: 6px;
  color: var(--text3);
}
.composition-tabs {
  margin: 0 20px;
  display: flex;
}
.composition-tabs button {
  flex: 1;
}
.composition-chart {
  height: 210px;
  max-width: 210px;
  margin: 10px auto 0;
  position: relative;
}
.doughnut-center {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
}
.doughnut-center span {
  font-size: 11px;
  color: var(--text3);
}
.doughnut-center strong {
  font-size: 28px;
  letter-spacing: -1px;
  font-weight: 650;
}
.composition-list {
  padding: 4px 20px 14px;
}
.composition-list > div {
  display: flex;
  align-items: center;
  padding: 8px 0;
  gap: 12px;
  font-size: 11px;
}
.composition-list span {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  color: var(--text2);
}
.composition-list strong {
  font-size: 12px;
  font-weight: 600;
}
.composition-list small {
  width: 42px;
  text-align: right;
  font-size: 10px;
  color: var(--text3);
}
.hourly-chart {
  height: 200px;
  padding: 0 16px 0 8px;
}
.inline-legend {
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--text2);
  font-size: 10px;
}
.inline-legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.hourly-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin: 0 20px;
  padding: 12px 0;
  border-top: 1px solid var(--border);
  color: var(--text3);
  font-size: 10px;
}
.hourly-footer span:first-child {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.hourly-footer svg {
  color: var(--warning);
}
.hourly-footer strong {
  font-weight: 500;
  color: var(--text2);
  margin-left: 3px;
}
.hourly-footer > span:last-child {
  margin-left: auto;
}
.rank-trophy {
  color: #c0a16b;
}
.rank-tabs {
  padding: 0 20px;
  border-bottom: 1px solid var(--border);
  gap: 22px;
}
.rank-list {
  list-style: none;
  padding: 8px 20px 12px;
  margin: 0;
}
.rank-list li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}
.rank-number {
  width: 21px;
  color: var(--text3);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.rank-number.first {
  color: var(--accent);
  font-weight: 650;
}
.rank-detail {
  flex: 1;
  min-width: 0;
}
.rank-detail > div:first-child {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 7px;
  font-size: 11px;
}
.rank-detail > div > span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--text2);
}
.rank-detail strong {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.rank-detail small {
  margin-left: 5px;
  font-size: 9px;
  font-weight: 400;
  color: var(--text3);
}
.rank-track {
  height: 4px;
  border-radius: 10px;
  background: var(--bg3);
  overflow: hidden;
}
.rank-track span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: color-mix(in srgb, var(--accent) 50%, var(--bg2));
}
.rank-list li:first-child .rank-track span {
  background: var(--accent);
}
.ranking-actions {
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--border);
  margin: 0 20px;
  padding: 10px 0;
}
.lifecycle-content {
  display: grid;
  grid-template-columns: 1.25fr 1fr;
  gap: 20px;
  padding: 0 20px 18px;
}
.event-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.event-item {
  display: flex;
  gap: 10px;
  align-items: center;
}
.event-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  flex-shrink: 0;
}
.event-item > div {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.event-item span:not(.event-icon) {
  font-size: 10px;
  color: var(--text3);
}
.event-item strong {
  font-size: 20px;
  font-weight: 600;
}
.cumulative-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  border-left: 1px solid var(--border);
  padding-left: 28px;
}
.cumulative-grid > div {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}
.cumulative-grid span {
  font-size: 10px;
  color: var(--text3);
}
.cumulative-grid strong {
  font-size: 20px;
  font-weight: 600;
}
@media (min-width: 1600px) {
  .trend-chart {
    height: 250px;
  }
  .composition-chart {
    height: 230px;
    max-width: 230px;
  }
  .hourly-chart {
    height: 220px;
  }
}
@media (max-width: 1200px) {
  .metrics-grid {
    gap: 12px;
  }
  .analytics-primary-grid {
    grid-template-columns: minmax(0, 1.8fr) minmax(250px, 1fr);
    gap: 16px;
  }
  .analytics-secondary-grid {
    grid-template-columns: minmax(0, 1.4fr) minmax(300px, 1fr);
    gap: 16px;
  }
  .lifecycle-content {
    grid-template-columns: 1fr;
    gap: 18px;
  }
  .cumulative-grid {
    border-left: 0;
    border-top: 1px solid var(--border);
    padding: 18px 0 0;
  }
  .trend-insights {
    padding: 12px 16px;
  }
  .trend-insights > div + div {
    padding-left: 12px;
  }
  .trend-insights small {
    display: block;
    margin: 4px 0 0;
  }
}
@media (max-width: 1000px) {
  .metrics-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .analytics-primary-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .composition-panel {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .composition-panel .panel-heading {
    grid-column: 1 / -1;
  }
  .composition-tabs {
    grid-column: 1;
    align-self: start;
  }
  .composition-chart {
    grid-column: 2;
    grid-row: 2 / 4;
    width: 180px;
    height: 180px;
    margin: -8px auto 14px;
  }
  .composition-list {
    grid-column: 1;
  }
  .analytics-secondary-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 600px) {
  .metrics-grid {
    gap: 10px;
    margin-bottom: 16px;
  }
  .analytics-primary-grid,
  .analytics-secondary-grid {
    gap: 16px;
    margin-bottom: 16px;
  }
  .trend-toolbar {
    margin: 0 16px;
  }
  .trend-chart {
    height: 200px;
    padding: 8px 7px 0 0;
  }
  .chart-unit {
    display: none;
  }
  .chart-legend {
    gap: 13px;
  }
  .chart-legend button {
    font-size: 9px;
  }
  .trend-insights strong {
    font-size: 18px;
  }
  .trend-insights span {
    font-size: 9px;
  }
  .composition-panel {
    display: block;
  }
  .composition-tabs {
    margin: 0 16px;
  }
  .composition-chart {
    margin: 10px auto 0;
    width: 180px;
    height: 180px;
  }
  .composition-list {
    padding: 0 20px 12px;
  }
  .hourly-chart {
    height: 190px;
    padding-right: 8px;
  }
  .hourly-footer {
    margin: 0 16px;
    flex-wrap: wrap;
    font-size: 9px;
  }
  .rank-tabs {
    padding: 0 16px;
  }
  .rank-list {
    padding: 10px 16px;
  }
  .ranking-actions {
    margin: 0 16px;
  }
  .lifecycle-content {
    padding: 0 16px 16px;
  }
  .event-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
  }
  .cumulative-grid strong {
    font-size: 18px;
  }
  .lifecycle-panel .panel-heading {
    align-items: flex-start;
  }
  .text-action {
    font-size: 9px;
  }
}
</style>
