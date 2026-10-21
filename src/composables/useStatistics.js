import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '../stores/app'
import axios from '../utils/axios'
import { responsePayload, responseOk } from '../utils/api'
import { normalizeHourly } from '../utils/statistics'

const SECTION_NAMES = {
  core: '今日指标',
  chart: '周期趋势',
  hourly: '小时分布',
  top: '活跃排行',
  events: '事件统计',
  totals: '累计数据'
}

export function useStatistics({ sections = Object.keys(SECTION_NAMES), auto = false } = {}) {
  const app = useAppStore()
  const days = ref(7)
  const autoRefresh = ref(auto)
  const data = reactive(Object.fromEntries(sections.map((key) => [key, null])))
  const state = reactive(
    Object.fromEntries(
      sections.map((key) => [key, { loading: false, pending: false, error: '', updatedAt: null }])
    )
  )
  const controllers = new Map()
  const loading = computed(() => Object.values(state).some((item) => item.loading))
  const errors = computed(() =>
    Object.entries(state)
      .filter(([, item]) => item.error)
      .map(([key]) => SECTION_NAMES[key])
  )
  const updatedAt = computed(() => {
    const times = Object.values(state).map((item) => item.updatedAt?.getTime() || 0)
    const latest = Math.max(0, ...times)
    return latest ? new Date(latest) : null
  })
  const summary = computed(() => data.core?.summary || {})
  const active = computed(() => data.core?.active || {})
  const hourly = computed(() => normalizeHourly(data.hourly?.today_hourly_distribution))
  const yesterdayHourly = computed(() => normalizeHourly(data.hourly?.yesterday_hourly_distribution))
  let ready = false
  let disposed = false
  let timer
  let preparationTimer

  async function load(key) {
    controllers.get(key)?.abort()
    const controller = new AbortController()
    controllers.set(key, controller)
    const scope = app.currentBotId || ''
    state[key].loading = true
    state[key].error = ''
    try {
      const response = await axios.get(`/api/statistics/${key}`, {
        params: { appid: scope, ...(key === 'chart' ? { days: days.value } : {}) },
        signal: controller.signal
      })
      if (!responseOk(response)) throw new Error('统计服务暂不可用')
      const payload = responsePayload(response)
      if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        throw new Error('统计数据格式异常')
      if (controller.signal.aborted || disposed || scope !== (app.currentBotId || '')) return
      state[key].pending = !!payload.pending
      // 不把后台尚未完成的补算计数展示成完整结果。
      data[key] = payload.pending ? null : payload
      if (!payload.pending) state[key].updatedAt = new Date()
    } catch (error) {
      if (!controller.signal.aborted && !disposed) {
        state[key].pending = false
        state[key].error = error.normalizedMessage || error.message || '请求失败'
      }
    } finally {
      if (controllers.get(key) === controller) {
        controllers.delete(key)
        state[key].loading = state[key].pending
      }
    }
  }

  async function refresh(requested = sections) {
    if (!ready || disposed) return
    const keys = Array.isArray(requested) ? requested : sections
    await Promise.allSettled(keys.filter((key) => sections.includes(key)).map(load))
    clearTimeout(preparationTimer)
    const preparing = sections.filter((key) => state[key].pending)
    if (!disposed && preparing.length) preparationTimer = setTimeout(() => refresh(preparing), 2000)
  }

  function reset() {
    clearTimeout(preparationTimer)
    controllers.forEach((controller) => controller.abort())
    controllers.clear()
    for (const key of sections) {
      data[key] = null
      state[key] = { loading: false, pending: false, error: '', updatedAt: null }
    }
  }

  watch(
    () => app.currentBotId,
    () => {
      if (!ready) return
      reset()
      refresh()
    }
  )
  watch(days, () => {
    if (ready && sections.includes('chart')) {
      data.chart = null
      state.chart.updatedAt = null
      refresh(['chart'])
    }
  })
  onMounted(async () => {
    await app.ensureBots()
    if (disposed) return
    ready = true
    refresh()
    timer = setInterval(() => {
      if (autoRefresh.value && document.visibilityState === 'visible' && !loading.value) refresh()
    }, 60000)
  })
  onUnmounted(() => {
    disposed = true
    clearInterval(timer)
    clearTimeout(preparationTimer)
    controllers.forEach((controller) => controller.abort())
    controllers.clear()
  })

  return {
    days,
    autoRefresh,
    data,
    state,
    loading,
    errors,
    updatedAt,
    summary,
    active,
    hourly,
    yesterdayHourly,
    refresh
  }
}
