const numberFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 })
const compactFormatter = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 })

export function numeric(value) {
  if (value === null || value === undefined || value === '') return null
  const result = Number(value)
  return Number.isFinite(result) ? Math.max(0, result) : null
}

export function formatNumber(value) {
  const result = numeric(value)
  return result === null ? '—' : numberFormatter.format(result)
}

export function formatCompact(value) {
  return compactFormatter.format(numeric(value) ?? 0)
}

export function sum(values = []) {
  return values.reduce((total, value) => total + (numeric(value) ?? 0), 0)
}

export function normalizeHourly(values) {
  if (!Array.isArray(values) || !values.length) return []
  return Array.from({ length: 24 }, (_, index) => numeric(values[index]) ?? 0)
}

export function dayChange(current, previous) {
  const now = numeric(current)
  const before = numeric(previous)
  if (now === null || before === null) return { label: '暂无昨日对比', direction: 'neutral' }
  if (before === 0) return { label: now > 0 ? '昨日暂无基数' : '与昨日持平', direction: 'neutral' }
  const change = ((now - before) / before) * 100
  if (Math.abs(change) < 0.05) return { label: '与昨日持平', direction: 'neutral' }
  return {
    label: `${change > 0 ? '+' : '−'}${Math.abs(change).toFixed(1)}% 较昨日`,
    direction: change > 0 ? 'up' : 'down'
  }
}

export function percent(value, total) {
  return total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0
}

export function formatTime(value) {
  return value
    ? new Intl.DateTimeFormat('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(value)
    : '尚未更新'
}

export const TREND_SERIES = {
  msg: [
    { key: 'msg_total', label: '总消息量', color: 'primary', fill: true },
    { key: 'msg_received', label: '上行消息', color: 'blue' },
    { key: 'msg_sent', label: '下行消息', color: 'purple' },
    { key: 'msg_private', label: '私聊消息', color: 'amber', hidden: true },
    { key: 'msg_group', label: '群聊消息', color: 'teal', hidden: true }
  ],
  active: [
    { key: 'active_users', label: '活跃用户', color: 'primary', fill: true },
    { key: 'active_groups', label: '活跃群聊', color: 'purple' }
  ],
  event: [
    { key: 'ev_group_join', label: '进群', color: 'primary', fill: true },
    { key: 'ev_group_leave', label: '退群', color: 'rose' },
    { key: 'ev_friend_add', label: '加好友', color: 'blue' },
    { key: 'ev_friend_remove', label: '删好友', color: 'amber' }
  ]
}

// Keep identifiers and plugin names as text when opening the export in spreadsheet apps.
export function csvCell(value) {
  let text = String(value ?? '')
  if (/^[\s\uFEFF]*[=+\-@\t\r\n]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

export function trendCsv(data) {
  const series = Object.values(TREND_SERIES).flat()
  const rows = [['日期', ...series.map((item) => item.label)]]
  for (let index = 0; index < (data?.labels?.length || 0); index++) {
    rows.push([
      data.dates?.[index] || data.labels[index],
      ...series.map((item) => data[item.key]?.[index] ?? '')
    ])
  }
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export function downloadTrend(data, scope, days) {
  const url = URL.createObjectURL(new Blob([trendCsv(data)], { type: 'text/csv;charset=utf-8;' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `Elaina-统计-${String(scope || '全部机器人').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')}-${days}天.csv`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
