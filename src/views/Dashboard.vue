<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { Line } from 'vue-chartjs'
import { useAppStore } from '../stores/app'
import { useThemeStore } from '../stores/theme'
import { on, off } from '../utils/ws'
import axios from '../utils/axios'
import { responsePayload } from '../utils/api'
import { chartOptions, lineDataset } from '../utils/charts'
import { formatNumber, formatTime, normalizeHourly, numeric, sum } from '../utils/statistics'
import SvgIcon from '../components/SvgIcon.vue'

const app = useAppStore()
const theme = useThemeStore()
const sys = computed(() => app.systemInfo || {})
const clock = ref(Date.now())
const todayHourly = ref([])
const yesterdayHourly = ref([])
const chartLoading = ref(true)
const chartError = ref(false)
const chartPending = ref(false)
const chartUpdatedAt = ref(0)
const depsInfo = ref(null)
const depsLoading = ref(true)
const depsError = ref(false)

const statCards = computed(() => [
  { label: '今日消息', value: sys.value.today_messages, icon: 'chatbubbles', tone: 'blue', hint: '全部机器人 · 今日累计', unit: '条' },
  { label: '插件处理器', value: sys.value.plugins_count, icon: 'extension-puzzle', tone: 'purple', hint: '已加载的消息处理器', unit: '个' },
  { label: '全部用户', value: sys.value.total_users, icon: 'people', tone: 'teal', active: sys.value.today_active, unit: '人' },
  { label: '全部群聊', value: sys.value.total_groups, icon: 'group', tone: 'amber', active: sys.value.active_groups, unit: '个' },
])

function fmtMemory(value) {
  const amount = numeric(value)
  if (amount === null) return '—'
  return amount >= 1024 ? `${(amount / 1024).toFixed(1)} GB` : `${amount.toFixed(1)} MB`
}

function fmtUptime(value) {
  const seconds = numeric(value)
  if (seconds === null) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return d > 0 ? `${d} 天 ${h} 时 ${m} 分` : h > 0 ? `${h} 时 ${m} 分` : `${m} 分`
}

function fmtPercent(value) {
  const amount = numeric(value)
  return amount === null ? '—' : amount.toFixed(1)
}

function percentLabel(value) {
  return numeric(value) === null ? '—' : `${fmtPercent(value)}%`
}

function usageColor(value, fallback = 'var(--accent)') {
  return value >= 90 ? 'var(--danger)' : value >= 70 ? 'var(--warning)' : fallback
}

const resources = computed(() => [
  {
    key: 'cpu', label: 'CPU', icon: 'chip', percent: numeric(sys.value.cpu_percent),
    framework: percentLabel(sys.value.framework_cpu_percent),
    detail: `${formatNumber(sys.value.cpu_cores)} 核心`,
    description: sys.value.cpu_model || '处理器信息尚未获取',
    color: usageColor(sys.value.cpu_percent),
  },
  {
    key: 'memory', label: '内存', icon: 'memory', percent: numeric(sys.value.memory_percent),
    framework: numeric(sys.value.framework_memory_total) === null ? '—' : `${fmtMemory(sys.value.framework_memory_total)} · ${percentLabel(sys.value.framework_memory_percent)}`,
    detail: `${fmtMemory(sys.value.memory_used)} / ${fmtMemory(sys.value.memory_total)}`,
    description: '系统已用 / 总内存',
    color: usageColor(sys.value.memory_percent, 'var(--dash-teal)'),
  },
])

const resourceStatus = computed(() => {
  const values = resources.value.map(item => item.percent).filter(value => value !== null)
  if (!values.length) return { label: '等待数据', tone: 'neutral' }
  const max = Math.max(...values)
  return max >= 90 ? { label: '负载过高', tone: 'danger' }
    : max >= 70 ? { label: '负载偏高', tone: 'warning' }
      : { label: '负载正常', tone: 'success' }
})

const runtimeItems = computed(() => [
  { label: '启动时间', value: sys.value.start_time || '—', icon: 'time' },
  { label: '框架运行', value: fmtUptime(sys.value.uptime), icon: 'rocket' },
  { label: '系统运行', value: fmtUptime(sys.value.system_uptime), icon: 'server' },
])

const STATUS_TEXT = { low: '版本偏低', high: '版本偏高', missing: '未安装' }
const dependencies = computed(() => {
  if (!depsInfo.value) return []
  const python = depsInfo.value.python
  return [
    ...(python ? [{ name: 'Python', installed: python.version, required: python.required, status: python.status }] : []),
    ...(depsInfo.value.dependencies || []),
  ]
})
const abnormalDeps = computed(() => dependencies.value.filter(item => item.status !== 'ok'))
const abnormalTips = computed(() => abnormalDeps.value.map(item => `${item.name} ${STATUS_TEXT[item.status] || '状态未知'}`).join('、'))
function dependencyTitle(item) {
  return `${item.name} ${item.installed || '未安装'} · 要求 ${item.required || '不限'}${item.status !== 'ok' ? ` · ${STATUS_TEXT[item.status] || '状态未知'}` : ''}`
}

const chartScope = computed(() => app.currentBot?.name || app.currentBotId || '全部机器人')
const chartBuckets = computed(() => {
  const date = new Date(clock.value)
  const hour = date.getHours()
  const today = todayHourly.value
  const yesterday = yesterdayHourly.value
  return Array.from({ length: 12 }, (_, index) => {
    const offset = hour - 11 + index
    const h = (offset + 24) % 24
    const label = `${String(h).padStart(2, '0')}:00`
    return {
      label,
      title: `${offset < 0 ? '昨天' : '今天'} ${label} – ${String((h + 1) % 24).padStart(2, '0')}:00`,
      value: (offset < 0 ? yesterday[h] : today[h]) || 0,
    }
  })
})
const chartValues = computed(() => chartBuckets.value.map(item => item.value))
const chartReady = computed(() => todayHourly.value.length === 24 && yesterdayHourly.value.length === 24)
const hasChart = computed(() => chartReady.value && chartValues.value.some(value => value > 0))
const chartTotal = computed(() => chartReady.value && !chartError.value && !chartPending.value ? sum(chartValues.value) : null)
const chartPeak = computed(() => {
  if (!hasChart.value || chartError.value || chartPending.value) return null
  return chartBuckets.value.reduce((peak, bucket) => bucket.value > peak.value ? bucket : peak)
})
const chartDataset = computed(() => ({
  labels: chartBuckets.value.map(item => item.label),
  datasets: [lineDataset('消息数', chartValues.value, theme.theme.accent, {
    fill: true,
    borderWidth: 2.5,
    pointRadius: 2.5,
    pointBorderWidth: 2,
    pointBorderColor: theme.theme.bgPanel,
    pointHoverRadius: 5,
  })],
}))
const lineOptions = computed(() => {
  const options = chartOptions(theme.theme)
  return {
    ...options,
    layout: { padding: { top: 12, right: 8 } },
    plugins: {
      ...options.plugins,
      tooltip: {
        ...options.plugins.tooltip,
        callbacks: {
          ...options.plugins.tooltip.callbacks,
          title: items => chartBuckets.value[items[0]?.dataIndex]?.title || '',
        },
      },
    },
    scales: {
      x: { ...options.scales.x, ticks: { ...options.scales.x.ticks, maxTicksLimit: 6, padding: 8 } },
      y: { ...options.scales.y, ticks: { ...options.scales.y.ticks, padding: 8, maxTicksLimit: 4 } },
    },
  }
})

let disposed = false
let ready = false
let timer = null
let depsRetryTimer = null
let depsController = null
let chartController = null
let chartRequest = 0
let lastChartAttempt = 0
let chartDate = ''

async function fetchDeps() {
  if (disposed || (depsController && depsLoading.value)) return
  clearTimeout(depsRetryTimer)
  depsRetryTimer = null
  depsLoading.value = true
  depsError.value = false
  depsController = new AbortController()
  try {
    const data = responsePayload(await axios.get('/api/system/dependencies', { signal: depsController.signal }))
    if (!disposed) depsInfo.value = data
  } catch (error) {
    if (disposed || error.code === 'ERR_CANCELED') return
    depsError.value = true
    depsRetryTimer = setTimeout(fetchDeps, 15000)
  } finally {
    if (!disposed) depsLoading.value = false
  }
}

async function fetchChart(reset = false) {
  if (disposed) return
  const request = ++chartRequest
  chartController?.abort()
  chartController = new AbortController()
  const date = new Date().toDateString()
  if (reset || (chartDate && chartDate !== date)) {
    todayHourly.value = []
    yesterdayHourly.value = []
    chartUpdatedAt.value = 0
    chartPending.value = false
  }
  chartDate = date
  chartLoading.value = true
  chartError.value = false
  lastChartAttempt = Date.now()
  try {
    const data = responsePayload(await axios.get('/api/statistics/hourly', {
      params: { appid: app.currentBotId || '' }, signal: chartController.signal,
    }))
    if (disposed || request !== chartRequest) return
    if (!Array.isArray(data?.today_hourly_distribution) || !Array.isArray(data?.yesterday_hourly_distribution)) throw new Error('小时统计数据不完整')
    todayHourly.value = normalizeHourly(data.today_hourly_distribution)
    yesterdayHourly.value = normalizeHourly(data.yesterday_hourly_distribution)
    chartPending.value = !!data.pending
    chartUpdatedAt.value = Date.now()
    clock.value = Date.now()
  } catch (error) {
    if (disposed || request !== chartRequest || error.code === 'ERR_CANCELED') return
    chartError.value = true
  } finally {
    if (!disposed && request === chartRequest) chartLoading.value = false
  }
}

watch(() => app.currentBotId, () => { if (ready) fetchChart(true) })
function onSysInfo(data) { app.systemInfo = data }
onMounted(async () => {
  on('system_info', onSysInfo)
  fetchDeps()
  timer = setInterval(() => {
    clock.value = Date.now()
    app.fetchSystemInfo()
    const dateChanged = chartDate && chartDate !== new Date().toDateString()
    if (ready && !chartLoading.value && (dateChanged || Date.now() - lastChartAttempt >= (chartPending.value ? 15000 : 60000))) fetchChart()
  }, 10000)
  await app.ensureBots()
  if (disposed) return
  ready = true
  fetchChart()
})
onUnmounted(() => {
  disposed = true
  off('system_info', onSysInfo)
  clearInterval(timer)
  clearTimeout(depsRetryTimer)
  chartController?.abort()
  depsController?.abort()
})
</script>

<template>
  <div class="dash" aria-label="仪表盘">
    <section class="overview-grid" aria-label="关键指标（全部机器人）">
      <article v-for="card in statCards" :key="card.label" :class="['overview-card', `tone-${card.tone}`]">
        <div class="overview-top">
          <span class="overview-label">{{ card.label }}</span>
          <span class="overview-icon"><SvgIcon :name="card.icon" :size="17" /></span>
        </div>
        <div class="overview-value" :title="`${card.label} ${formatNumber(card.value)} ${card.unit}`">
          <strong>{{ formatNumber(card.value) }}</strong><span>{{ card.unit }}</span>
        </div>
        <div class="overview-foot">
          <template v-if="card.hint"><span class="metric-dot" />{{ card.hint }}</template>
          <template v-else><span>今日活跃</span><b>{{ formatNumber(card.active) }}</b><span>{{ card.unit }}</span></template>
        </div>
      </article>
    </section>

    <div class="primary-grid">
      <section class="dash-panel trend-panel" aria-labelledby="trend-title" :aria-busy="chartLoading">
        <div class="panel-heading">
          <h2 id="trend-title"><SvgIcon name="stats-chart" :size="16" />消息趋势<span class="heading-note">最近 12 小时</span></h2>
          <div class="trend-actions">
            <span class="scope-label" :title="chartScope">{{ chartScope }}</span>
            <button class="icon-button" type="button" aria-label="刷新消息趋势" :disabled="chartLoading" @click="fetchChart()">
              <SvgIcon name="refresh" :size="15" :class="{ spinning: chartLoading }" />
            </button>
          </div>
        </div>
        <div class="trend-summary">
          <div class="trend-total"><strong>{{ formatNumber(chartTotal) }}</strong><span>条消息</span></div>
          <span v-if="chartPeak" class="trend-peak">高峰 <b>{{ chartPeak.label }}</b><span class="peak-divider">/</span>{{ formatNumber(chartPeak.value) }} 条</span>
          <span v-else class="trend-peak">每小时消息分布</span>
        </div>
        <div class="chart-wrap">
          <Line v-if="hasChart && !chartError" :data="chartDataset" :options="lineOptions" role="img" :aria-label="`最近 12 小时消息趋势，共 ${formatNumber(sum(chartValues))} 条消息`" />
          <div v-else class="chart-state" :role="chartError ? 'alert' : 'status'">
            <span class="empty-icon"><SvgIcon :name="chartLoading ? 'refresh' : chartError ? 'alert-circle' : 'stats-chart'" :size="23" :class="{ spinning: chartLoading }" /></span>
            <strong>{{ chartLoading ? '正在加载消息趋势' : chartError ? '消息趋势加载失败' : chartPending ? '正在整理消息数据' : '暂无消息' }}</strong>
            <button v-if="chartError" type="button" class="text-button" @click="fetchChart()">重新加载<SvgIcon name="arrow-forward" :size="13" /></button>
            <span v-else>{{ chartLoading || chartPending ? '稍后自动更新' : '最近 12 小时还没有消息记录' }}</span>
          </div>
        </div>
        <div class="trend-footer">
          <span><i class="legend-line" />消息数量</span>
          <span v-if="chartError">数据暂时不可用</span>
          <span v-else-if="chartPending">统计整理中 · 稍后自动更新</span>
          <span v-else>{{ chartUpdatedAt ? `${formatTime(chartUpdatedAt)} 更新` : '等待更新' }}</span>
        </div>
      </section>

      <section class="dash-panel resources-panel" aria-labelledby="resources-title">
        <div class="panel-heading">
          <h2 id="resources-title"><SvgIcon name="chip" :size="16" />资源监控</h2>
          <span :class="['status-badge', resourceStatus.tone]"><i />{{ resourceStatus.label }}</span>
        </div>
        <div class="resource-list">
          <div v-for="resource in resources" :key="resource.key" class="resource" :style="{ '--usage-color': resource.color }">
            <div class="resource-top">
              <span class="resource-label"><SvgIcon :name="resource.icon" :size="17" />{{ resource.label }}<small>系统占用</small></span>
              <strong class="resource-value">{{ fmtPercent(resource.percent) }}<span v-if="resource.percent !== null">%</span></strong>
            </div>
            <div class="usage-track" role="progressbar" :aria-label="`${resource.label}系统占用`" :aria-valuenow="resource.percent ?? undefined" :aria-valuetext="resource.percent === null ? '等待数据' : `${resource.percent}%`" :aria-valuemin="0" :aria-valuemax="100">
              <span :style="{ width: `${Math.min(resource.percent || 0, 100)}%` }" />
            </div>
            <div class="resource-detail"><span :title="resource.description">{{ resource.detail }}</span></div>
            <div class="framework-usage"><span>框架占用</span><b>{{ resource.framework }}</b></div>
          </div>
        </div>
      </section>
    </div>

    <div class="details-grid">
      <section class="dash-panel runtime-panel" aria-labelledby="runtime-title">
        <div class="panel-heading"><h2 id="runtime-title"><SvgIcon name="server" :size="16" />运行状态</h2><span class="heading-note">每 10 秒更新</span></div>
        <dl class="runtime-list">
          <div v-for="item in runtimeItems" :key="item.label" class="runtime-item">
            <dt><SvgIcon :name="item.icon" :size="14" />{{ item.label }}</dt>
            <dd :title="item.value">{{ item.value }}</dd>
          </div>
        </dl>
      </section>

      <section class="dash-panel dependencies-panel" aria-labelledby="dependencies-title" :aria-busy="depsLoading">
        <div class="panel-heading">
          <h2 id="dependencies-title"><SvgIcon name="cube" :size="16" />运行环境</h2>
          <span v-if="depsInfo && dependencies.length" :class="['status-badge', abnormalDeps.length ? 'danger' : 'success']" :title="abnormalTips">
            <SvgIcon v-if="abnormalDeps.length" name="alert-circle" :size="12" /><i v-else />
            {{ abnormalDeps.length ? `${abnormalDeps.length} 项需关注` : `${dependencies.length} 项正常` }}
          </span>
          <span v-else class="heading-note">{{ depsLoading ? '检查中' : '依赖版本' }}</span>
        </div>
        <div v-if="depsInfo && dependencies.length" class="dependencies-grid">
          <div v-for="dep in dependencies" :key="dep.name" :class="['dependency', { 'is-abnormal': dep.status !== 'ok' }]" :title="dependencyTitle(dep)" :aria-label="dependencyTitle(dep)">
            <div class="dependency-top"><span>{{ dep.name }}</span><i :class="['dependency-dot', dep.status === 'ok' ? 'success' : 'danger']" /></div>
            <div class="dependency-versions"><b>{{ dep.installed || '未安装' }}</b><span>要求 {{ dep.required || '不限' }}</span></div>
          </div>
        </div>
        <div v-else class="dependency-state" :role="depsError ? 'alert' : 'status'">
          <SvgIcon :name="depsLoading ? 'refresh' : depsError ? 'alert-circle' : 'cube'" :size="20" :class="{ spinning: depsLoading }" />
          <span>{{ depsLoading ? '正在检查运行环境' : depsError ? '依赖信息暂时不可用' : '暂无依赖信息' }}</span>
          <button v-if="depsError" type="button" class="text-button" @click="fetchDeps()">重试</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.dash {
  --dash-teal: #29a28d;
  --dash-purple: #9273d9;
  --dash-amber: #c28b3e;
  --dash-muted: color-mix(in srgb, var(--text2) 80%, var(--text3));
  display: grid;
  gap: 12px;
  width: 100%;
  min-width: 0;
  font-variant-numeric: tabular-nums;
  container-type: inline-size;
}
.dash *, .dash *::before, .dash *::after { box-sizing: border-box; }
.overview-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.overview-card, .dash-panel {
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg2);
  box-shadow: 0 2px 5px rgb(16 24 40 / 2%);
}
.overview-card { --metric-color: var(--accent); position: relative; overflow: hidden; padding: 12px 16px 11px; }
.overview-card::before { content: ''; position: absolute; inset: 18px auto auto 0; width: 3px; height: 25px; border-radius: 0 3px 3px 0; background: var(--metric-color); }
.tone-purple { --metric-color: var(--dash-purple); }
.tone-teal { --metric-color: var(--dash-teal); }
.tone-amber { --metric-color: var(--dash-amber); }
.overview-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.overview-label { color: var(--text2); font-size: 12px; font-weight: 550; }
.overview-icon { display: grid; place-items: center; width: 29px; height: 29px; border-radius: 9px; background: color-mix(in srgb, var(--metric-color) 10%, transparent); color: var(--metric-color); }
.overview-value { display: flex; align-items: baseline; gap: 6px; margin-top: 0; min-width: 0; }
.overview-value strong { overflow: hidden; color: var(--text); font-size: clamp(24px, 2.2vw, 32px); font-weight: 700; letter-spacing: -.8px; line-height: 1.25; text-overflow: ellipsis; white-space: nowrap; }
.overview-value > span { color: var(--dash-muted); font-size: 11px; }
.overview-foot { display: flex; align-items: center; gap: 5px; min-height: 17px; margin-top: 5px; color: var(--dash-muted); font-size: 11px; }
.overview-foot b { color: var(--metric-color); font-weight: 650; }
.metric-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--metric-color); opacity: .7; }
.primary-grid { display: grid; grid-template-columns: minmax(0, 1.85fr) minmax(280px, 1fr); gap: 12px; }
.dash-panel { padding: 14px 16px; }
.panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 26px; }
.panel-heading h2 { display: flex; align-items: center; gap: 7px; min-width: 0; margin: 0; color: var(--text); font-size: 13px; font-weight: 650; line-height: 1.4; white-space: nowrap; }
.panel-heading h2 > svg { color: var(--text2); }
.heading-note { color: var(--dash-muted); font-size: 11px; font-weight: 400; white-space: nowrap; }
.panel-heading h2 .heading-note { margin-left: 3px; }
.trend-panel, .resources-panel { height: clamp(270px, 38vh, 326px); }
.trend-panel { display: flex; flex-direction: column; }
.trend-actions { display: flex; align-items: center; gap: 8px; min-width: 0; }
.scope-label { overflow: hidden; max-width: 140px; padding: 3px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text2); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.icon-button { display: grid; place-items: center; flex-shrink: 0; width: 26px; height: 26px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--text3); cursor: pointer; }
.icon-button:hover:enabled { background: var(--accent-soft); color: var(--accent); }
.icon-button:disabled { cursor: wait; opacity: .6; }
.icon-button:focus-visible, .text-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.trend-summary { display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; margin-top: 8px; }
.trend-total { display: flex; align-items: baseline; gap: 7px; }
.trend-total strong { color: var(--text); font-size: 25px; font-weight: 700; letter-spacing: -.5px; line-height: 1.35; }
.trend-total > span, .trend-peak { color: var(--dash-muted); font-size: 11px; }
.trend-peak b { margin-left: 3px; color: var(--text2); font-weight: 500; }
.peak-divider { margin: 0 7px; opacity: .5; }
.chart-wrap { position: relative; flex: 1; min-height: 0; margin: 0 -2px 0 -6px; }
.chart-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; height: 100%; min-height: 120px; text-align: center; }
.empty-icon { display: grid; place-items: center; width: 40px; height: 40px; margin-bottom: 2px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg); color: var(--text3); }
.chart-state strong { color: var(--text2); font-size: 12px; font-weight: 500; }
.chart-state > span:last-child { color: var(--text3); font-size: 11px; }
.text-button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 2px 0; border: 0; background: transparent; color: var(--accent); font: inherit; font-size: 11px; cursor: pointer; }
.text-button:hover { color: var(--accent-hover); }
.trend-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 4px; color: var(--dash-muted); font-size: 11px; }
.trend-footer > span:first-child { display: flex; align-items: center; gap: 6px; }
.legend-line { width: 13px; height: 2px; border-radius: 2px; background: var(--accent); }
.status-badge { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; padding: 3px 7px; border-radius: 5px; background: color-mix(in srgb, currentColor 8%, transparent); font-size: 11px; line-height: 1.5; }
.status-badge i, .dependency-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.success { color: color-mix(in srgb, var(--success) 60%, var(--text)); }
.warning { color: color-mix(in srgb, var(--warning) 60%, var(--text)); }
.danger { color: color-mix(in srgb, var(--danger) 75%, var(--text)); }
.neutral { color: var(--text3); }
.resources-panel { display: flex; flex-direction: column; }
.resource-list { display: flex; flex: 1; flex-direction: column; justify-content: space-evenly; }
.resource { padding: 12px 0 10px; }
.resource + .resource { border-top: 1px solid var(--border); }
.resource-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.resource-label { display: flex; align-items: center; gap: 7px; color: var(--text); font-size: 12px; font-weight: 600; }
.resource-label > svg { color: var(--usage-color); }
.resource-label small { margin-left: 2px; color: var(--dash-muted); font-size: 10px; font-weight: 400; }
.resource-value { color: var(--text); font-size: 23px; font-weight: 650; letter-spacing: -.5px; line-height: 1.1; }
.resource-value > span { margin-left: 2px; color: var(--text3); font-size: 11px; font-weight: 400; }
.usage-track { height: 5px; margin-top: 10px; overflow: hidden; border-radius: 4px; background: var(--bg3); }
.usage-track > span { display: block; height: 100%; border-radius: inherit; background: var(--usage-color); transition: width .4s; }
.resource-detail { margin-top: 6px; color: var(--dash-muted); font-size: 11px; }
.resource-detail > span { cursor: default; }
.framework-usage { display: flex; justify-content: space-between; gap: 8px; margin-top: 6px; color: var(--dash-muted); font-size: 11px; }
.framework-usage b { color: var(--text2); font-weight: 500; }
.details-grid { display: grid; grid-template-columns: minmax(270px, 1fr) minmax(0, 2fr); gap: 12px; }
.runtime-panel, .dependencies-panel { min-height: 174px; }
.runtime-list { display: flex; flex-direction: column; justify-content: space-evenly; gap: 0; height: calc(100% - 36px); min-height: 99px; margin: 8px 0 0; }
.runtime-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 33px; }
.runtime-item + .runtime-item { border-top: 1px solid var(--border); }
.runtime-item dt { display: flex; align-items: center; gap: 6px; flex-shrink: 0; color: var(--dash-muted); font-size: 12px; }
.runtime-item dt svg { color: var(--text3); }
.runtime-item dd { min-width: 0; margin: 0; color: var(--text2); font-size: 12px; font-weight: 500; text-align: right; overflow-wrap: anywhere; }
.dependencies-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
.dependency { min-width: 0; padding: 7px 9px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg); }
.dependency-top { display: flex; align-items: center; justify-content: space-between; gap: 7px; }
.dependency-top > span { overflow: hidden; color: var(--text2); font-size: 12px; font-weight: 550; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
.dependency-dot { flex-shrink: 0; }
.dependency-versions { display: flex; justify-content: space-between; align-items: baseline; gap: 4px; margin-top: 3px; font-family: Consolas, Monaco, monospace; line-height: 1.5; }
.dependency-versions b { overflow: hidden; color: var(--text); font-size: 11px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.dependency-versions > span { overflow: hidden; color: var(--dash-muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.dependency.is-abnormal { border-color: color-mix(in srgb, var(--danger) 28%, var(--border)); background: color-mix(in srgb, var(--danger) 4%, var(--bg2)); }
.dependency.is-abnormal .dependency-top > span, .dependency.is-abnormal .dependency-versions b { color: var(--danger); }
.dependency-state { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px; min-height: 110px; color: var(--text3); font-size: 12px; }
.spinning { animation: dash-spin 1.2s linear infinite; }
@keyframes dash-spin { to { transform: rotate(360deg); } }
@container (max-width: 900px) {
  .details-grid { grid-template-columns: minmax(240px, 1fr) minmax(0, 1.7fr); }
  .dependencies-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dependency-versions > span { font-size: 10px; }
  .runtime-panel { align-self: start; }
  .overview-card { padding-right: 12px; padding-left: 12px; }
}
@container (max-width: 680px) {
  .overview-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .primary-grid, .details-grid { grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .trend-panel { height: 280px; }
  .resources-panel { height: auto; }
  .resource-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
  .resource { padding-bottom: 0; }
  .resource + .resource { border-top: 0; }
  .resource-label small { display: none; }
  .framework-usage { flex-wrap: wrap; gap: 2px 8px; }
  .runtime-panel, .dependencies-panel { min-height: 0; }
  .runtime-list { height: auto; min-height: 0; }
  .dependencies-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@container (max-width: 460px) {
  .dash-panel { padding: 12px; border-radius: 12px; }
  .overview-card { border-radius: 12px; padding: 10px 12px; }
  .overview-value strong { font-size: 26px; }
  .overview-icon { width: 26px; height: 26px; border-radius: 8px; }
  .overview-foot { font-size: 10px; gap: 4px; }
  .panel-heading { gap: 8px; }
  .panel-heading h2 { gap: 5px; font-size: 12px; }
  .panel-heading h2 .heading-note { font-size: 10px; margin-left: 0; }
  .trend-actions { gap: 4px; }
  .scope-label { max-width: 90px; padding: 3px 5px; font-size: 9px; }
  .trend-summary { gap: 10px; }
  .trend-total strong { font-size: 24px; }
  .trend-peak { font-size: 10px; }
  .resource-list { gap: 16px; }
  .resource-value { font-size: 22px; }
  .resource-detail { min-height: 15px; font-size: 10px; }
  .framework-usage { font-size: 10px; }
  .dependencies-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dependency-versions > span { font-size: 9px; }
}
@media (prefers-reduced-motion: reduce) {
  .spinning { animation: none; }
  .usage-track > span { transition: none; }
}
</style>
