<script setup>
import { computed, reactive, watch } from 'vue'
import SvgIcon from '../../components/SvgIcon.vue'
import AppIcon from './AppIcon.vue'
import ReportDistribution from './ReportDistribution.vue'
import ReportLineChart from './ReportLineChart.vue'

const props = defineProps({
  appid: { type: String, required: true },
  request: { type: Function, required: true },
  download: { type: Function, required: true },
})
const emit = defineEmits(['details', 'error'])

const RANGES = [{ value: 0, label: '最近 7 天' }, { value: 1, label: '最近 14 天' }, { value: 2, label: '最近 30 天' }]
const COUNT = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 })
const DECIMAL = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const HELP = {
  core: '按自然日统计。活跃指标统计向机器人发送消息的用户、群和频道。日环比为指标相对前一日的变化。',
  profile: '按统计日展示用户和群的聚合分布，地域展示占比最高的六个地区。',
  quality: '应答率按成功回复的消息比例计算，响应耗时以秒展示，对话轮数按活跃用户计算。',
}
const sections = [
  { key: 'core', title: '核心数据', type: 4, metrics: [
    { label: '活跃用户数', field: 'active_user_cnt', change: 'active_user_cnt_chain', tip: '当天向机器人发送消息的用户数。' },
    { label: '活跃群数', field: 'active_group_cnt', change: 'active_group_cnt_chain', tip: '当天有用户向机器人发送消息的群数。' },
    { label: '活跃频道数', field: 'active_guild_cnt', change: 'active_guild_cnt_chain', tip: '当天有用户向机器人发送消息的频道数。' },
    { label: '上行消息量', group: 'up_msg', field: 'total', change: 'up_msg_cnt_chain', details: [['单聊', 'c2c'], ['群聊', 'group']], tip: '当天机器人收到的单聊和群聊消息总量。' },
    { label: '总好友数', group: 'friends', field: 'stock_cnt', change: 'stock_friends_chain', details: [['新增', 'add_cnt'], ['移除', 'remove_cnt']], tip: '截至统计日，与机器人保持好友关系的用户数。' },
    { label: '总群数', group: 'groups', field: 'stock_cnt', change: 'stock_groups_chain', details: [['新增', 'add_cnt'], ['移除', 'remove_cnt']], tip: '截至统计日，机器人所在的群数。' },
    { label: '总频道数', group: 'guilds', field: 'stock_cnt', change: 'stock_guilds_chain', details: [['新增', 'add_cnt'], ['移除', 'remove_cnt']], tip: '截至统计日，机器人所在的频道数。' },
  ] },
  { key: 'quality', title: '互动质量', type: 5, metrics: [
    { label: '应答成功率', field: 'reply_rate', change: 'reply_rate_chain', scale: 100, unit: '%', tip: '用户发送的消息中，机器人成功回复的比例。' },
    { label: '首轮应答率', field: 'first_reply_rate', change: 'first_reply_rate_chain', scale: 100, unit: '%', tip: '用户首次发送的消息中，机器人成功回复的比例。' },
    { label: '响应耗时', field: 'avg_response_time', change: 'avg_response_time_chain', scale: 0.001, unit: '秒', tip: '机器人回复消息的平均耗时。' },
    { label: '人均有效对话轮数', field: 'avg_rounds', change: 'avg_rounds_chain', unit: '轮', tip: '当天有效对话轮数除以活跃对话用户数。' },
  ] },
]
const reports = reactive(Object.fromEntries(sections.map(section => [section.key, {
  range: 0, loading: false, downloading: false, error: '', trends: false, rows: [], version: 0,
}])))

function formatDate(value) {
  const date = String(value ?? '')
  return /^\d{8}$/.test(date) ? date.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3') : date
}

function number(value) {
  return value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value)
}

function format(value, unit = '') {
  if (value == null) return '--'
  return unit ? DECIMAL.format(value) + (unit === '%' ? unit : '') : COUNT.format(value)
}

function metricValue(row, metric) {
  const source = metric.group ? row?.[metric.group] : row
  const value = number(source?.[metric.field])
  return value == null ? null : value * (metric.scale ?? 1)
}

function reportLabel(report) {
  if (report.loading) return '正在更新'
  const date = formatDate(report.rows.at(-1)?.report_date)
  return date ? `更新于 ${date.replace(/^\d{4}-/, '')}` : '暂无数据'
}

function trendRows(rows, metric) {
  return rows.map(row => ({
    date: formatDate(row.report_date),
    value: metricValue(row, metric),
    ...Object.fromEntries((metric.details ?? []).map(([, field]) => [field, number(row[metric.group]?.[field])])),
  })).filter(row => row.date && row.value != null)
}

function comparison(row, metric) {
  const delta = number(row?.[metric.change])
  return {
    label: `${delta > 0 ? '+' : ''}${format(delta, '%')}`,
    color: delta > 0 ? 'positive' : delta < 0 ? 'negative' : '',
  }
}

async function load(section, range = reports[section.key].range) {
  const report = reports[section.key]
  const version = ++report.version
  const appid = props.appid
  report.range = range
  report.loading = true
  report.error = ''
  report.rows = []
  try {
    const result = await props.request('/cgi-bin/v2/datareport/query', {
      bot_appid: Number(appid), data_range: range, data_type: section.type,
    })
    if (version !== report.version) return
    const rows = result.developer_metrics_data ?? result.data?.developer_metrics_data ?? []
    if (!Array.isArray(rows)) throw new Error('QQ 返回的报表格式异常')
    report.rows = [...rows].sort((a, b) => Number(a.report_date) - Number(b.report_date))
  } catch (error) {
    if (version === report.version) report.error = error.message || '报表加载失败'
  } finally {
    if (version === report.version) report.loading = false
  }
}

async function download(section) {
  const report = reports[section.key]
  report.downloading = true
  try {
    await props.download(section.type, report.range, 1, section.title)
  } catch (error) {
    emit('error', error.message || '下载失败')
  } finally {
    report.downloading = false
  }
}

const metricCards = computed(() => Object.fromEntries(sections.map(section => {
  const report = reports[section.key]
  const latest = report.rows.at(-1)
  const cards = section.metrics.map(metric => ({
    ...metric,
    value: metricValue(latest, metric),
    comparison: comparison(latest, metric),
    submetrics: (metric.details ?? []).map(([label, field]) => ({
      label, key: field, value: number(latest?.[metric.group]?.[field]),
    })),
    trend: report.trends ? trendRows(report.rows, metric) : [],
  }))
  return [section.key, cards]
})))

function distribution(rows, type) {
  const entries = Array.isArray(rows) ? rows : []
  return entries.filter(row => row?.type === type)
    .map(row => ({ label: row.key, ratio: number(row.ratio), count: number(row.cnt) }))
    .filter(row => row.ratio != null && row.ratio >= 0 && row.ratio <= 1)
    .map(row => ({ label: row.label, value: row.ratio * 100, count: row.count }))
}

const profile = computed(() => {
  const row = reports.core.rows.at(-1) || {}
  const profiles = row.user_profile
  const active = number(row.active_user_cnt)
  const activity = distribution(profiles, 'activity')
  const counts = [['新用户', row.new_user_cnt], ['持续活跃用户', row.returning_user_cnt], ['唤醒用户', row.reactivated_user_cnt]]
  return [
    { title: '性别分布', items: distribution(profiles, 'gender'), donut: true },
    { title: '活跃用户分布', donut: true, items: activity.length ? activity : counts
      .filter(([, value]) => active > 0 && number(value) != null)
      .map(([label, count]) => ({ label, count, value: Math.min(100, Number(count) / active * 100) })) },
    { title: '年龄分布', items: distribution(profiles, 'age') },
    { title: '地域分布', rank: true, items: distribution(profiles, 'region').sort((a, b) => b.value - a.value).slice(0, 6) },
    { title: '群类型分布', items: distribution(row.group_dist, 'category'), scale: distribution(row.group_dist, 'scale') },
  ]
})

watch(() => props.appid, () => sections.forEach(section => load(section)), { immediate: true })
</script>

<template>
  <div class="operations-dashboard">
    <template v-for="section in sections" :key="section.key">
      <section class="ops-panel" :aria-labelledby="`ops-${section.key}`" :aria-busy="reports[section.key].loading">
        <header class="ops-header">
          <div class="ops-heading">
            <h2 :id="`ops-${section.key}`">{{ section.title }}</h2>
            <details class="ops-help">
              <summary :aria-label="`${section.title}统计说明`"><AppIcon name="info" :size="15" /></summary>
              <p>{{ HELP[section.key] }}</p>
            </details>
            <span>{{ reportLabel(reports[section.key]) }}</span>
          </div>
          <div class="ops-controls">
            <button type="button" class="btn small ghost ops-trend" :title="reports[section.key].trends ? '收起趋势图' : '显示趋势图'" :aria-label="reports[section.key].trends ? '收起趋势图' : '显示趋势图'" :aria-pressed="reports[section.key].trends" @click="reports[section.key].trends = !reports[section.key].trends">
              <SvgIcon name="stats-chart" :size="15" />
            </button>
            <button v-if="section.key === 'core'" type="button" class="btn small ops-details-button" @click="emit('details')">数据明细</button>
            <div class="ops-ranges" role="group" :aria-label="`${section.title}时间范围`">
              <button v-for="range in RANGES" :key="range.value" type="button" :aria-pressed="reports[section.key].range === range.value" @click="load(section, range.value)">{{ range.label }}</button>
            </div>
            <button type="button" class="btn small" :disabled="!reports[section.key].rows.length || reports[section.key].downloading" @click="download(section)">
              {{ reports[section.key].downloading ? '生成中' : '下载数据' }}
            </button>
          </div>
        </header>
        <div v-if="reports[section.key].error" class="ops-error" role="status">
          <span>{{ reports[section.key].error }}</span>
          <button type="button" class="btn small" @click="load(section)">重新加载</button>
        </div>
        <div class="ops-metrics" :class="`ops-${section.key}-grid`">
          <article v-for="metric in metricCards[section.key]" :key="metric.label" class="ops-card">
            <header class="ops-metric-heading">
              <h3>{{ metric.label }}</h3>
              <details class="ops-help">
                <summary :aria-label="`${metric.label}统计说明`" :title="metric.tip"><AppIcon name="info" :size="14" /></summary>
                <p>{{ metric.tip }}</p>
              </details>
            </header>
            <div v-if="reports[section.key].loading" class="ops-loading" aria-hidden="true">
              <span class="ops-skeleton ops-value-placeholder"></span>
              <div class="ops-metric-details">
                <span v-for="index in metric.submetrics.length + 1" :key="index" class="ops-skeleton ops-detail-placeholder"></span>
              </div>
              <span v-if="reports[section.key].trends" class="ops-skeleton ops-trend-placeholder"></span>
            </div>
            <template v-else>
              <p class="ops-value"><strong>{{ format(metric.value, metric.unit) }}<small v-if="metric.unit && metric.unit !== '%' && metric.value != null">{{ metric.unit }}</small></strong></p>
              <dl class="ops-metric-details">
                <div><dt>日环比</dt><dd :class="metric.comparison.color">{{ metric.comparison.label }}</dd></div>
                <div v-for="item in metric.submetrics" :key="item.key"><dt>{{ item.label }}</dt><dd>{{ format(item.value) }}</dd></div>
              </dl>
              <ReportLineChart v-if="reports[section.key].trends" compact :rows="metric.trend"
                :columns="[{ key: 'value', label: metric.label, suffix: metric.unit }]" :detail-columns="metric.submetrics" />
            </template>
          </article>
        </div>
      </section>
      <section v-if="section.key === 'core'" class="ops-panel" aria-labelledby="ops-profile" :aria-busy="reports.core.loading">
        <header class="ops-header ops-heading">
          <h2 id="ops-profile">用户画像</h2>
          <details class="ops-help"><summary aria-label="用户画像统计说明"><AppIcon name="info" :size="15" /></summary><p>{{ HELP.profile }}</p></details>
          <span>{{ reportLabel(reports.core) }}</span>
        </header>
        <div class="ops-profiles">
          <article v-for="group in profile" :key="group.title" class="ops-profile" :class="{ 'ops-group-profile': group.scale }">
            <h3>{{ group.title }}</h3>
            <div :class="{ 'ops-group-charts': group.scale }">
              <ReportDistribution v-if="group.scale" title="群规模分布" :items="group.scale" :loading="reports.core.loading" donut />
              <ReportDistribution :title="group.title" :items="group.items" :loading="reports.core.loading" :donut="group.donut" :rank="group.rank" />
            </div>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.operations-dashboard { display: grid; gap: 16px; min-width: 0; container-type: inline-size; }
.ops-panel { min-width: 0; padding: 18px; border: 1px solid var(--line); border-radius: 18px; background: var(--bg-elev); box-shadow: var(--shadow-sm); }
.ops-header, .ops-heading, .ops-controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.ops-header { justify-content: space-between; margin-bottom: 16px; }
.ops-heading { gap: 6px; }
.ops-header.ops-heading { justify-content: flex-start; }
.ops-heading h2 { margin: 0; font-size: 18px; font-weight: 700; color: var(--ink); }
.ops-heading > span { color: var(--ink-4); font-size: 11px; }
.ops-help { position: relative; color: var(--ink-4); }
.ops-help summary { display: grid; place-items: center; width: 22px; height: 25px; cursor: pointer; list-style: none; }
.ops-help summary::-webkit-details-marker { display: none; }
.ops-help p { position: absolute; z-index: 3; top: 100%; left: -20px; width: min(250px, 65vw); margin: 4px 0 0; padding: 10px 12px; color: var(--ink-2); background: var(--bg-elev); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow); font-size: 12px; line-height: 1.55; }
.ops-trend[aria-pressed="true"] { color: var(--accent); background: var(--accent-soft); }
.ops-ranges { display: inline-flex; flex-wrap: wrap; padding: 3px; border-radius: 9px; background: var(--bg-sunken); }
.ops-ranges button { padding: 5px 9px; border: 0; border-radius: 7px; background: transparent; color: var(--ink-3); font-size: 12px; cursor: pointer; }
.ops-ranges button[aria-pressed="true"] { color: var(--ink); background: var(--bg-elev); box-shadow: var(--shadow-sm); }
.ops-metrics { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 12px; }
.ops-metrics .ops-card { grid-column: span 3; }
.ops-core-grid .ops-card:nth-child(n+5) { grid-column: span 4; }
.ops-card, .ops-profile { min-width: 0; border: 1px solid var(--line); }
.ops-card { position: relative; padding: 16px 18px 14px; border-radius: 14px; }
.ops-metric-heading { display: flex; align-items: center; gap: 3px; min-height: 20px; margin-bottom: 8px; }
.ops-metric-heading h3 { margin: 0; color: var(--ink-2); font-size: 13px; font-weight: 600; }
.ops-metric-heading .ops-help { position: static; }
.ops-metric-heading .ops-help summary { width: 18px; height: 20px; }
.ops-metric-heading .ops-help p { top: 36px; left: 12px; width: min(166px, calc(100% - 24px)); }
.ops-value { min-height: 34px; margin: 0; color: var(--ink); font-size: 28px; line-height: 1.2; font-variant-numeric: tabular-nums; letter-spacing: -.025em; overflow-wrap: anywhere; }
.ops-value strong { font-weight: 650; }
.ops-value small { margin-left: 5px; color: var(--ink-3); font-size: 12px; font-weight: 500; letter-spacing: normal; }
.ops-metric-details { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px 16px; min-height: 36px; margin: 9px 0 0; font-size: 12px; }
.ops-metric-details dt { margin-bottom: 3px; color: var(--ink-3); font-size: 11px; }
.ops-metric-details dd { margin: 0; color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }
.ops-metric-details .positive { color: #139460; }
.ops-metric-details .negative { color: var(--danger); }
.ops-skeleton { display: block; border-radius: 6px; background: var(--bg-sunken); animation: ops-loading 1.2s ease-in-out alternate infinite; }
.ops-value-placeholder { width: 44%; height: 30px; margin-bottom: 4px; }
.ops-detail-placeholder { flex: 0 1 46px; height: 30px; }
.ops-trend-placeholder { height: 52px; margin: 10px 0 4px; }
.ops-profiles { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 12px; }
.ops-profile { grid-column: span 4; padding: 20px; border-radius: 24px; }
.ops-profile h3 { margin: 0 0 10px; color: var(--ink); font-size: 14px; font-weight: 700; }
.ops-group-profile { grid-column: span 8; }
.ops-group-charts { display: grid; grid-template-columns: minmax(110px, 2fr) minmax(0, 3fr); gap: 16px; }
.ops-error { display: flex; gap: 10px; justify-content: space-between; align-items: center; margin-bottom: 12px; color: var(--danger); font-size: 13px; }
@keyframes ops-loading { to { opacity: .46; } }
@media (prefers-reduced-motion: reduce) { .ops-skeleton { animation: none; } }
@media (max-width: 1280px) {
  .ops-quality-grid .ops-card { grid-column: span 6; }
}
@media (max-width: 900px) {
  .ops-core-grid .ops-card, .ops-core-grid .ops-card:nth-child(n+5) { grid-column: span 6; }
}
@container (max-width: 796px) {
  .ops-profile { grid-column: span 6; }
  .ops-group-profile { grid-column: 1 / -1; }
}
@container (max-width: 680px) {
  .ops-metrics .ops-card, .ops-core-grid .ops-card:nth-child(n+5) { grid-column: 1 / -1; }
}
@container (max-width: 556px) {
  .ops-profile { grid-column: 1 / -1; }
}
@container (max-width: 440px) {
  .ops-panel, .ops-card, .ops-profile { padding: 12px; }
  .ops-controls { gap: 6px; }
  .ops-ranges button { padding-inline: 5px; }
  .ops-metrics { gap: 8px; }
  .ops-group-charts { grid-template-columns: minmax(0, 1fr); }
}
</style>
