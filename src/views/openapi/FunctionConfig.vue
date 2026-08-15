<script setup>
import { computed, onMounted, ref } from 'vue'
import Draggable from 'vuedraggable'
import axios from '../../utils/axios'
import SvgIcon from '../../components/SvgIcon.vue'

const SCOPES = [
  { key: 'c2c', short: '单聊', label: 'c2c 单聊' },
  { key: 'group', short: '群聊', label: 'group 群聊' },
  { key: 'channel', short: '子频道', label: 'channel 子频道' },
  { key: 'dm', short: '频道私信', label: 'dm 频道私信' },
]
const MENU_TYPES = [
  { value: 'send_message', label: '发送消息' },
  { value: 'link', label: '链接跳转' },
  { value: 'switch', label: '开关' },
  { value: 'menu', label: '折叠菜单' },
]
const CHILD_TYPES = MENU_TYPES.filter(item => ['send_message', 'link'].includes(item.value))
const MENU_EXAMPLE = [
  { type: 'send_message', name: '帮助', send_message: '/help' },
  { type: 'link', name: '官网', link: 'https://example.com' },
  { type: 'menu', name: '更多', sub_menu_items: [{ type: 'send_message', name: '设置', send_message: '/settings' }] },
]

const activeTab = ref('menu')
const bots = ref([])
const appid = ref('')
const busy = ref(false)
const notice = ref({ text: '', type: '' })
const menuDraft = ref([])
const menuOriginal = ref([])
const menuVersion = ref(null)
const menuOpen = ref(new Set())
const childOpen = ref(new Set())
const previewMenuOpen = ref(null)
const previewSwipeState = { pointerId: null, startX: 0, startScrollLeft: 0, moved: false }
let previewSwipeResetTimer = null
const sortKeys = new WeakMap()
let sortKeyCounter = 0

const scope = ref('c2c')
const panels = ref([])
const panelsLoadedKey = ref('')
const panelsLoadingKey = ref('')
const panelOpen = ref(new Set())
let draftCounter = 0

const currentBot = computed(() => bots.value.find(bot => bot.appid === appid.value) || {})
const botName = computed(() => currentBot.value.name || '机器人')
const menuDirty = computed(() => JSON.stringify(menuDraft.value) !== JSON.stringify(menuOriginal.value))
const panelChanges = computed(() => panels.value.filter(draftChanged).length)
const activePanels = computed(() => panels.value.filter(record => !record._deleted))
const displayedCommands = computed(() => activePanels.value.map(record => {
  const item = panelItem(record)
  return {
    name: item.name || '未命名指令',
    command: item.desc || (item.type === 'link' ? item.link : item.name) || '未填写指令',
  }
}))
const previewMenu = computed(() => menuDraft.value.slice(0, 10))
const openedPreviewMenu = computed(() => {
  const item = previewMenu.value[previewMenuOpen.value]
  return item?.type === 'menu' ? item : null
})

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function showNotice(text, type = '') {
  notice.value = { text, type }
}

function errorText(error) {
  return error?.response?.data?.message || error?.normalizedMessage || error?.message || '请求失败'
}

async function api(method, url, config = {}) {
  const response = await axios({ method, url, ...config })
  const body = response.data || {}
  if (body.success === false) throw new Error(body.message || '请求失败')
  return body.data
}

function withAppid(params = {}) {
  return { appid: appid.value, ...params }
}

function menuDefault() {
  return { type: 'send_message', name: '', send_message: '' }
}

function childDefault() {
  return { type: 'send_message', name: '', send_message: '' }
}

function panelItemDefault() {
  return { type: 'command', name: '', desc: '', only_admin: false }
}

function scopeLabel(value) {
  return SCOPES.find(item => item.key === value)?.label || value || '未知场景'
}

function typeLabel(type) {
  return ({ send_message: '发送消息', link: '链接跳转', switch: '开关', menu: '折叠菜单', command: '指令' })[type] || '未设置'
}

function menuTypeIcon(type) {
  return ({ send_message: 'msg-up', link: 'link', switch: 'settings', menu: 'menu', command: 'code' })[type] || 'code'
}

function menuSummary(item) {
  if (item.type === 'send_message') return item.send_message || '未填写指令'
  if (item.type === 'link') return item.link || '未填写链接'
  if (item.type === 'switch') return item.switch?.switch_id || '未设置标识'
  if (item.type === 'menu') return `${(item.sub_menu_items || []).length} 个子菜单`
  return '未设置'
}

function childSummary(item) {
  return item.type === 'link' ? (item.link || '未填写链接') : (item.send_message || '未填写指令')
}

function panelItem(record) {
  if (!record.panel) record.panel = { items: [panelItemDefault()], remark: '' }
  if (!Array.isArray(record.panel.items) || !record.panel.items.length) record.panel.items = [panelItemDefault()]
  return record.panel.items[0]
}

function panelTitle(record) {
  return panelItem(record).name || '未命名指令'
}

function panelSummary(record) {
  const item = panelItem(record)
  const detail = item.desc || (item.type === 'link' ? item.link : item.name) || '未填写指令'
  return detail === item.name ? typeLabel(item.type) : `${typeLabel(item.type)} · ${detail}`
}

function draftKey(record) {
  return record._draftKey || String(record.panel_id || '')
}

function draftChanged(record) {
  return !!(record._isNew || record._deleted || record._dirty || record._targetDirty)
}

function setMenuOpen(item) {
  const key = sortKey(item)
  const next = new Set(menuOpen.value)
  next.has(key) ? next.delete(key) : next.add(key)
  menuOpen.value = next
}

function setChildOpen(item) {
  const key = sortKey(item)
  const next = new Set(childOpen.value)
  next.has(key) ? next.delete(key) : next.add(key)
  childOpen.value = next
}

function addMenu() {
  if (menuDraft.value.length >= 10) return showNotice('一级菜单最多 10 项', 'error')
  menuDraft.value.push(menuDefault())
  const item = menuDraft.value[menuDraft.value.length - 1]
  menuOpen.value = new Set([sortKey(item)])
}

function removeMenu(index) {
  menuDraft.value.splice(index, 1)
  menuOpen.value = new Set()
  childOpen.value = new Set()
  if (previewMenuOpen.value === index) previewMenuOpen.value = null
}

function moveMenu(index, offset) {
  const target = index + offset
  if (target < 0 || target >= menuDraft.value.length) return
  ;[menuDraft.value[index], menuDraft.value[target]] = [menuDraft.value[target], menuDraft.value[index]]
}

function sortKey(item) {
  if (!item || typeof item !== 'object') return String(item)
  if (!sortKeys.has(item)) sortKeys.set(item, `sort-${++sortKeyCounter}`)
  return sortKeys.get(item)
}

function finishMenuSort(event) {
  if (event.oldIndex === event.newIndex || event.newIndex == null) return
  previewMenuOpen.value = null
}

function changeMenuType(item) {
  if (item.type === 'menu' && !Array.isArray(item.sub_menu_items)) item.sub_menu_items = []
  if (item.type === 'switch' && !item.switch) item.switch = { switch_id: '', default: false }
}

function addChild(item) {
  if ((item.sub_menu_items || []).length >= 5) return
  item.sub_menu_items = [...(item.sub_menu_items || []), childDefault()]
  const child = item.sub_menu_items[item.sub_menu_items.length - 1]
  childOpen.value = new Set([sortKey(child)])
}

function removeChild(item, childIndex) {
  item.sub_menu_items.splice(childIndex, 1)
  childOpen.value = new Set()
}

function moveChild(item, childIndex, offset) {
  const target = childIndex + offset
  if (target < 0 || target >= item.sub_menu_items.length) return
  ;[item.sub_menu_items[childIndex], item.sub_menu_items[target]] = [item.sub_menu_items[target], item.sub_menu_items[childIndex]]
}

function serializeMenuItem(item) {
  const value = { type: item.type, name: String(item.name || '').trim() }
  if (item.type === 'send_message') value.send_message = String(item.send_message || '').trim()
  if (item.type === 'link') value.link = String(item.link || '').trim()
  if (item.type === 'switch') value.switch = { switch_id: String(item.switch?.switch_id || '').trim(), default: !!item.switch?.default }
  if (item.type === 'menu') value.sub_menu_items = (item.sub_menu_items || []).map(serializeMenuItem)
  return value
}

function validateMenu(items, nested = false) {
  if (!nested && items.length > 10) throw new Error('一级菜单最多 10 项')
  items.forEach((item, index) => {
    if (!String(item.name || '').trim()) throw new Error(`第 ${index + 1} 个菜单缺少名称`)
    if (item.type === 'send_message' && !String(item.send_message || '').trim()) throw new Error(`菜单“${item.name}”缺少指令`)
    if (item.type === 'link' && !/^https:\/\//i.test(item.link || '')) throw new Error(`菜单“${item.name}”的链接必须以 https:// 开头`)
    if (item.type === 'menu') {
      if ((item.sub_menu_items || []).length > 5) throw new Error(`菜单“${item.name}”的子项最多 5 个`)
      validateMenu(item.sub_menu_items || [], true)
    }
  })
}

async function loadBots() {
  const data = await api('get', '/api/openapi/menu-panel/bots')
  bots.value = data?.bots || []
  const saved = localStorage.getItem('openapi-function-config.appid')
  appid.value = bots.value.some(bot => bot.appid === saved) ? saved : (bots.value[0]?.appid || '')
  if (!appid.value) showNotice('没有正在运行的机器人', 'error')
}

async function loadMenu(silent = false) {
  if (!appid.value) return
  if (!silent && menuDirty.value && !confirm('放弃当前未保存的菜单修改并重新查询？')) return
  const data = await api('get', '/api/openapi/menu-panel/menu', { params: withAppid() })
  menuDraft.value = clone(data?.menu?.items || [])
  menuOriginal.value = clone(menuDraft.value)
  menuVersion.value = data?.version ?? null
  menuOpen.value = new Set()
  childOpen.value = new Set()
  previewMenuOpen.value = null
  if (!silent) showNotice('菜单已刷新', 'success')
}

async function saveMenu(clear = false) {
  if (!appid.value) return showNotice('请先选择机器人', 'error')
  const items = clear ? [] : menuDraft.value
  try {
    if (!clear) validateMenu(items)
    busy.value = true
    const menu = clear ? null : { items: items.map(serializeMenuItem) }
    const data = await api('put', '/api/openapi/menu-panel/menu', { data: { appid: appid.value, menu } })
    menuDraft.value = clear ? [] : clone(items)
    menuOriginal.value = clone(menuDraft.value)
    menuVersion.value = data?.version ?? menuVersion.value
    menuOpen.value = new Set()
    childOpen.value = new Set()
    showNotice(clear ? '自定义菜单已清空' : '自定义菜单已保存', 'success')
  } catch (error) {
    showNotice(errorText(error), 'error')
  } finally {
    busy.value = false
  }
}

function stageClearMenu() {
  if (!confirm('确认清空全局菜单？保存后将立即停止展示。')) return
  menuDraft.value = []
  menuOpen.value = new Set()
  childOpen.value = new Set()
  previewMenuOpen.value = null
  showNotice('菜单已清空到本地草稿，点击“保存”后生效')
}

function normalizePanelDraft(source, item, itemIndex) {
  const sourcePanel = clone(source.panel || {})
  return {
    ...clone(source),
    panel_id: String(source.panel_id || ''),
    _draftKey: `${source.panel_id || 'panel'}:${itemIndex}`,
    _itemIndex: itemIndex,
    _panelRemark: String(sourcePanel.remark || ''),
    panel: { ...sourcePanel, items: [clone(item || panelItemDefault())] },
    scope: source.scope || scope.value,
    scopes: [source.scope || scope.value],
    target_type: source.target_type || 'all',
    user_openids: clone(source.user_openids || []),
    group_openids: clone(source.group_openids || []),
    _originalTargets: {
      user_openids: clone(source.user_openids || []),
      group_openids: clone(source.group_openids || []),
    },
    _isNew: false,
    _deleted: false,
    _dirty: false,
    _targetDirty: false,
    _targetsLoaded: source.target_type !== 'specific' || source._targetsLoaded === true,
    _targetsLoading: false,
  }
}

async function loadPanels({ preservePending = false, silent = false } = {}) {
  if (!appid.value) return
  if (!silent && panelChanges.value && !confirm('放弃当前未保存的指令修改并重新查询？')) return
  const requestKey = `${appid.value}:${scope.value}`
  if (panelsLoadingKey.value === requestKey) return
  panelsLoadingKey.value = requestKey
  try {
    const pending = preservePending && panelsLoadedKey.value === requestKey ? panels.value.filter(draftChanged) : []
    const data = await api('get', '/api/openapi/menu-panel/panels', { params: withAppid({ scope: scope.value, limit: 50 }) })
    if (`${appid.value}:${scope.value}` !== requestKey) return
    const sources = data?.records || []
    const remote = sources.flatMap(source => (source.panel?.items || []).map((item, index) => normalizePanelDraft(source, item, index)))
    const pendingMap = new Map(pending.filter(item => item.panel_id).map(item => [draftKey(item), item]))
    const merged = remote.map(item => pendingMap.get(draftKey(item)) || item)
    const remoteKeys = new Set(merged.map(draftKey))
    pending.filter(item => item._isNew || !remoteKeys.has(draftKey(item))).forEach(item => merged.push(item))
    panels.value = merged
    panelsLoadedKey.value = requestKey
    panelOpen.value = new Set()
    if (!silent) showNotice('指令列表已刷新', 'success')
  } catch (error) {
    showNotice(errorText(error), 'error')
  } finally {
    if (panelsLoadingKey.value === requestKey) panelsLoadingKey.value = ''
  }
}

async function changeTab(tab) {
  activeTab.value = tab
  showNotice('')
  if (tab === 'panels' && panelsLoadedKey.value !== `${appid.value}:${scope.value}`) await loadPanels({ silent: true })
}

async function changeBot() {
  localStorage.setItem('openapi-function-config.appid', appid.value)
  panels.value = []
  panelsLoadedKey.value = ''
  try {
    busy.value = true
    await loadMenu(true)
    if (activeTab.value === 'panels') await loadPanels({ silent: true })
    showNotice('已切换机器人', 'success')
  } catch (error) {
    showNotice(errorText(error), 'error')
  } finally {
    busy.value = false
  }
}

async function refreshAll() {
  try {
    busy.value = true
    const selected = appid.value
    await loadBots()
    if (bots.value.some(bot => bot.appid === selected)) appid.value = selected
    await loadMenu(true)
    if (activeTab.value === 'panels') await loadPanels({ silent: true })
    showNotice('已刷新', 'success')
  } catch (error) {
    showNotice(errorText(error), 'error')
  } finally {
    busy.value = false
  }
}

async function changeScope(nextScope) {
  if (nextScope === scope.value) return
  if (panelChanges.value && !confirm('切换场景会放弃当前未保存修改，是否继续？')) return
  scope.value = nextScope
  panels.value = []
  panelsLoadedKey.value = ''
  await loadPanels({ silent: true })
}

async function addPanel() {
  if (!appid.value) return showNotice('请先选择机器人', 'error')
  if (panelsLoadedKey.value !== `${appid.value}:${scope.value}`) await loadPanels({ silent: true })
  const key = `draft-${++draftCounter}`
  const record = {
    panel_id: '',
    _draftKey: key,
    _itemIndex: -1,
    _panelRemark: '',
    scope: scope.value,
    scopes: [scope.value],
    target_type: 'all',
    panel: { items: [panelItemDefault()], remark: '' },
    user_openids: [],
    group_openids: [],
    _originalTargets: { user_openids: [], group_openids: [] },
    _isNew: true,
    _deleted: false,
    _dirty: true,
    _targetDirty: false,
    _targetsLoaded: true,
    _targetsLoading: false,
  }
  panels.value.push(record)
  panelOpen.value = new Set([key])
  showNotice(`已保留 ${panels.value.length - 1} 条指令，并新增一条空白草稿`)
}

async function loadPanelTargets(record) {
  if (record._isNew || record.target_type !== 'specific' || record._targetsLoaded || record._targetsLoading) return
  record._targetsLoading = true
  try {
    const detail = await api('get', '/api/openapi/menu-panel/panel', { params: withAppid({ panel_id: record.panel_id }) })
    const userOpenids = clone(detail?.user_openids || [])
    const groupOpenids = clone(detail?.group_openids || [])
    panels.value.filter(item => item.panel_id === record.panel_id).forEach(item => {
      item.user_openids = clone(userOpenids)
      item.group_openids = clone(groupOpenids)
      item._originalTargets = { user_openids: clone(userOpenids), group_openids: clone(groupOpenids) }
      item._targetsLoaded = true
    })
  } catch (error) {
    showNotice(errorText(error), 'error')
  } finally {
    panels.value.filter(item => item.panel_id === record.panel_id).forEach(item => { item._targetsLoading = false })
  }
}

async function setPanelOpen(record) {
  if (record._deleted) return
  const key = draftKey(record)
  const next = new Set(panelOpen.value)
  next.has(key) ? next.delete(key) : next.add(key)
  panelOpen.value = next
  if (next.has(key)) await loadPanelTargets(record)
}

function markPanel(record, targets = false) {
  if (targets) record._targetDirty = true
  else record._dirty = true
}

function toggleScope(record, selectedScope) {
  if (!record._isNew) return
  const values = new Set(record.scopes || [])
  values.has(selectedScope) ? values.delete(selectedScope) : values.add(selectedScope)
  record.scopes = [...values]
  record.scope = record.scopes[0] || scope.value
  markPanel(record)
}

function changeTargetType(record) {
  if (record.target_type === 'specific' && record._isNew) {
    record.scopes = (record.scopes || []).filter(value => ['c2c', 'group'].includes(value))
    if (!record.scopes.length) record.scopes = ['c2c']
    record.scope = record.scopes[0]
  }
  markPanel(record)
}

function targetText(record, key) {
  return (record[key] || []).join('\n')
}

function updateTargets(record, key, value) {
  record[key] = [...new Set(String(value || '').split(/[,\s]+/).map(item => item.trim()).filter(Boolean))]
  markPanel(record, true)
}

function removePanel(record) {
  if (record._isNew) {
    panels.value = panels.value.filter(item => item !== record)
    const next = new Set(panelOpen.value)
    next.delete(draftKey(record))
    panelOpen.value = next
    return
  }
  record._deleted = !record._deleted
  if (record._deleted) {
    const next = new Set(panelOpen.value)
    next.delete(draftKey(record))
    panelOpen.value = next
  }
}

function finishPanelSort(event) {
  if (event.oldIndex === event.newIndex || event.newIndex == null) return
  panels.value.forEach(item => {
    if (!item._deleted) item._dirty = true
  })
}

function serializePanelItem(item) {
  const value = { type: item.type, name: String(item.name || '').trim() }
  if (item.desc) value.desc = String(item.desc).trim()
  if (item.only_admin) value.only_admin = true
  if (item.type === 'link') value.link = String(item.link || '').trim()
  return value
}

function validatePanel(items) {
  if (!items.length) throw new Error('至少添加一个指令')
  if (items.length > 20) throw new Error('单个场景最多配置 20 条指令')
  items.forEach((item, index) => {
    if (!String(item.name || '').trim()) throw new Error(`第 ${index + 1} 个指令缺少名称`)
    if (item.type === 'link' && !/^https:\/\//i.test(item.link || '')) throw new Error(`指令“${item.name}”的链接必须以 https:// 开头`)
  })
}

function buildTargetChanges(record) {
  if (!record._targetDirty || record._isNew || record.target_type !== 'specific') return []
  const key = record.scope === 'c2c' ? 'user_openids' : 'group_openids'
  const before = new Set(record._originalTargets?.[key] || [])
  const after = new Set(record[key] || [])
  const added = [...after].filter(value => !before.has(value))
  const removed = [...before].filter(value => !after.has(value))
  const result = []
  if (added.length) result.push({ op: 'add', [key]: added })
  if (removed.length) result.push({ op: 'del', [key]: removed })
  return result
}

async function savePanels() {
  if (!panelChanges.value) return
  try {
    const changes = []
    const deletedPanelIds = []
    const existingGroups = new Map()
    const appendGroups = new Map()

    panels.value.forEach(record => {
      if (record._isNew) {
        if (record._deleted) return
        const item = panelItem(record)
        validatePanel([item])
        const scopes = [...new Set(record.scopes || [])]
        if (!scopes.length) throw new Error(`指令“${item.name}”至少选择一个生效范围`)
        if (record.target_type === 'specific' && scopes.some(value => !['c2c', 'group'].includes(value))) {
          throw new Error('指定对象仅支持单聊和群聊')
        }
        scopes.forEach(itemScope => {
          const targetKey = itemScope === 'c2c' ? 'user_openids' : 'group_openids'
          const targetSignature = record.target_type === 'specific' ? [...(record[targetKey] || [])].sort().join(',') : ''
          const key = `${itemScope}:${record.target_type}:${targetSignature}`
          if (!appendGroups.has(key)) appendGroups.set(key, { scope: itemScope, target_type: record.target_type, items: [], records: [] })
          appendGroups.get(key).items.push(serializePanelItem(item))
          appendGroups.get(key).records.push(record)
        })
        return
      }
      if (!existingGroups.has(record.panel_id)) existingGroups.set(record.panel_id, [])
      existingGroups.get(record.panel_id).push(record)
    })

    existingGroups.forEach((records, panelId) => {
      const remaining = records.filter(record => !record._deleted)
      if (!remaining.length) {
        deletedPanelIds.push(panelId)
        return
      }
      if (!records.some(draftChanged)) return
      const items = remaining.map(panelItem)
      validatePanel(items)
      const change = {
        panel_id: panelId,
        panel: { items: items.map(serializePanelItem), remark: String(remaining[0]._panelRemark || '').trim() },
      }
      const targetRecord = records.find(record => record._targetDirty)
      const targetChanges = targetRecord ? buildTargetChanges(targetRecord) : []
      if (targetChanges.length) change.target_changes = targetChanges
      changes.push(change)
    })

    appendGroups.forEach(group => {
      const change = { scope: group.scope, target_type: group.target_type, append_items: group.items }
      if (group.target_type === 'specific') {
        const key = group.scope === 'c2c' ? 'user_openids' : 'group_openids'
        change[key] = group.records.flatMap(record => record[key] || []).filter((value, index, values) => values.indexOf(value) === index)
        if (!change[key].length) throw new Error(`${scopeLabel(group.scope)}的指定对象不能为空`)
      }
      changes.push(change)
    })

    busy.value = true
    await api('put', '/api/openapi/menu-panel/panels/save', {
      data: { appid: appid.value, scope: scope.value, changes, deleted_panel_ids: deletedPanelIds },
    })
    panelsLoadedKey.value = ''
    await loadPanels({ silent: true })
    showNotice('指令更改已保存', 'success')
  } catch (error) {
    showNotice(errorText(error), 'error')
  } finally {
    busy.value = false
  }
}

function startPreviewSwipe(event) {
  if (event.button != null && event.button !== 0) return
  previewSwipeState.pointerId = event.pointerId
  previewSwipeState.startX = event.clientX
  previewSwipeState.startScrollLeft = event.currentTarget.scrollLeft
  previewSwipeState.moved = false
  event.currentTarget.setPointerCapture?.(event.pointerId)
  previewSwipeMovedReset()
}

function movePreviewSwipe(event) {
  if (previewSwipeState.pointerId !== event.pointerId) return
  const distance = event.clientX - previewSwipeState.startX
  if (Math.abs(distance) < 3) return
  previewSwipeState.moved = true
  event.currentTarget.scrollLeft = previewSwipeState.startScrollLeft - distance
  if (event.cancelable) event.preventDefault()
  previewSwipeMovedReset()
}

function endPreviewSwipe(event) {
  if (previewSwipeState.pointerId !== event.pointerId) return
  event.currentTarget.releasePointerCapture?.(event.pointerId)
  previewSwipeState.pointerId = null
  previewSwipeMovedReset()
}

function previewSwipeMovedReset() {
  if (previewSwipeResetTimer) clearTimeout(previewSwipeResetTimer)
  previewSwipeResetTimer = setTimeout(() => {
    previewSwipeState.moved = false
    previewSwipeResetTimer = null
  }, 400)
}

function togglePreviewMenu(index, item) {
  if (previewSwipeState.moved) {
    previewSwipeState.moved = false
    if (previewSwipeResetTimer) clearTimeout(previewSwipeResetTimer)
    previewSwipeResetTimer = null
    return
  }
  previewMenuOpen.value = item.type === 'menu' && previewMenuOpen.value !== index ? index : null
}

onMounted(async () => {
  try {
    busy.value = true
    await loadBots()
    await loadMenu(true)
  } catch (error) {
    showNotice(errorText(error), 'error')
  } finally {
    busy.value = false
  }
})
</script>

<template>
  <div class="function-config">
    <div v-if="notice.text" class="config-notice" :class="notice.type" role="status">{{ notice.text }}</div>

    <nav class="feature-tabs" aria-label="功能配置">
      <button :class="['feature-tab', { active: activeTab === 'menu' }]" @click="changeTab('menu')">自定义菜单</button>
      <button :class="['feature-tab', { active: activeTab === 'panels' }]" @click="changeTab('panels')">指令</button>
      <div class="bot-picker">
        <span>机器人</span>
        <select v-model="appid" aria-label="选择机器人" :disabled="busy" @change="changeBot">
          <option v-for="bot in bots" :key="bot.appid" :value="bot.appid">{{ bot.name }} · {{ bot.appid }}</option>
        </select>
        <button class="icon-btn" title="刷新" :disabled="busy" @click="refreshAll"><SvgIcon name="refresh" :size="15" /></button>
      </div>
    </nav>

    <div class="config-workspace">
      <aside class="preview-panel" aria-label="手机预览">
        <div class="preview-title">实际效果预览</div>
        <div class="phone-wrap">
          <div class="phone-shell">
            <div class="phone-screen">
              <template v-if="activeTab === 'menu'">
                <div class="phone-menu-header">
                  <span class="phone-back">‹</span>
                  <img v-if="currentBot.avatar" class="phone-header-avatar" :src="currentBot.avatar" :alt="botName" />
                  <span v-else class="phone-header-avatar fallback">{{ botName.charAt(0) }}</span>
                  <span class="phone-menu-name">{{ botName }}</span>
                  <span class="phone-more">☰</span>
                </div>
                <div class="phone-chat">
                  <div class="phone-time">14:27</div>
                  <div class="phone-bubble">请选择下方菜单</div>
                </div>
                <div v-if="openedPreviewMenu" class="phone-menu-popover">
                  <button v-for="(child, childIndex) in openedPreviewMenu.sub_menu_items || []" :key="childIndex"><SvgIcon v-if="child.type === 'link'" name="link" :size="12" /><span v-else>↗</span> {{ child.name || '未命名子菜单' }}</button>
                </div>
                <div class="phone-menu-strip" @pointerdown="startPreviewSwipe" @pointermove="movePreviewSwipe" @pointerup="endPreviewSwipe" @pointercancel="endPreviewSwipe">
                  <button v-for="(item, index) in previewMenu" :key="index" :class="{ active: previewMenuOpen === index }" @click="togglePreviewMenu(index, item)">
                    <SvgIcon v-if="item.type === 'link'" name="link" :size="13" /><span v-else>{{ item.type === 'menu' ? '☷' : '↗' }}</span><b>{{ item.name || '未命名菜单' }}</b>
                  </button>
                </div>
                <div class="phone-keyboard" />
              </template>

              <template v-else>
                <div class="phone-cover" />
                <div class="phone-command-sheet">
                  <div class="phone-handle" />
                  <div class="phone-command-items">
                    <div v-for="(item, index) in displayedCommands" :key="index" class="phone-command-item">
                      <span>{{ item.name }}</span><b>{{ item.command }}</b>
                    </div>
                    <div v-if="!displayedCommands.length" class="phone-empty">暂无配置内容</div>
                  </div>
                  <div class="phone-keyboard" />
                </div>
              </template>
            </div>
          </div>
        </div>
        <div class="preview-caption">手机预览</div>
      </aside>

      <main class="config-editor">
        <section v-if="activeTab === 'menu'" class="config-surface">
          <header class="surface-header">
            <div>
              <h2>菜单项</h2>
              <p>最多 10 个一级菜单，保存后立即对所有用户生效。<span>{{ menuDraft.length }} / 10</span><span v-if="menuVersion != null"> · 版本 {{ menuVersion }}</span></p>
            </div>
            <div class="toolbar">
              <button class="btn" :disabled="busy" @click="loadMenu()">查询</button>
              <button class="btn primary" :disabled="busy || !menuDirty" @click="saveMenu()"><SvgIcon name="save" :size="14" />保存</button>
            </div>
          </header>
          <div class="surface-body">
            <div class="list-toolbar">
              <div class="toolbar">
                <button class="btn" @click="menuDraft = clone(MENU_EXAMPLE); menuOpen = new Set(); childOpen = new Set()">加载示例</button>
                <button class="btn danger" :disabled="!menuDraft.length" @click="stageClearMenu"><SvgIcon name="trash" :size="14" />清空</button>
              </div>
              <span v-if="menuDirty" class="pending-text">有未保存修改</span>
            </div>

            <Draggable v-if="menuDraft.length" v-model="menuDraft" :item-key="sortKey" tag="div" class="accordion-list sortable-list" handle=".menu-drag-handle" :animation="220" easing="cubic-bezier(.2, .8, .2, 1)" ghost-class="sort-placeholder" chosen-class="sort-chosen" drag-class="sort-dragging" :fallback-tolerance="3" :swap-threshold="0.58" :scroll-sensitivity="70" :scroll-speed="12" @end="finishMenuSort">
              <template #item="{ element: item, index }">
              <article :class="['accordion-item', { open: menuOpen.has(sortKey(item)) }]">
                <div class="accordion-header">
                  <button class="icon-btn drag-handle menu-drag-handle" title="按住并拖动整项排序"><SvgIcon name="grip" :size="14" /></button>
                  <button class="accordion-toggle" @click="setMenuOpen(item)">
                    <span class="chevron">›</span>
                    <span class="item-type-icon"><SvgIcon :name="menuTypeIcon(item.type)" :size="17" /></span>
                    <span class="row-copy"><b>{{ index + 1 }}. {{ item.name || '未命名菜单' }}</b><small>{{ typeLabel(item.type) }} · {{ menuSummary(item) }}</small></span>
                  </button>
                  <div class="row-actions">
                    <button class="btn edit-btn" @click="setMenuOpen(item)">{{ menuOpen.has(sortKey(item)) ? '收起' : '编辑' }}</button>
                    <button class="icon-btn" title="上移" :disabled="index === 0" @click="moveMenu(index, -1)">↑</button>
                    <button class="icon-btn" title="下移" :disabled="index === menuDraft.length - 1" @click="moveMenu(index, 1)">↓</button>
                    <button class="icon-btn danger" title="删除" @click="removeMenu(index)"><SvgIcon name="trash" :size="14" /></button>
                  </div>
                </div>
                <div v-if="menuOpen.has(sortKey(item))" class="accordion-body">
                  <div class="form-grid">
                    <label><span>类型</span><select v-model="item.type" @change="changeMenuType(item)"><option v-for="type in MENU_TYPES" :key="type.value" :value="type.value">{{ type.label }}</option></select></label>
                    <label><span>菜单名称</span><input v-model="item.name" maxlength="20" placeholder="请输入菜单名称" /></label>
                    <label v-if="item.type === 'send_message'"><span>填入聊天框的内容</span><input v-model="item.send_message" placeholder="例如 /help" /></label>
                    <label v-else-if="item.type === 'link'"><span>链接地址</span><input v-model="item.link" placeholder="https://" /></label>
                    <template v-else-if="item.type === 'switch'">
                      <label><span>开关标识</span><input v-model="item.switch.switch_id" placeholder="请输入开关标识" /></label>
                      <label class="check-line"><input v-model="item.switch.default" type="checkbox" /><span>默认开启</span></label>
                    </template>

                    <div v-if="item.type === 'menu'" class="sub-menu-list full">
                      <div class="sub-menu-title"><span>子菜单 · {{ (item.sub_menu_items || []).length }} / 5</span><button class="btn" :disabled="(item.sub_menu_items || []).length >= 5" @click="addChild(item)"><SvgIcon name="plus" :size="13" />添加子项</button></div>
                      <Draggable v-model="item.sub_menu_items" :item-key="sortKey" tag="div" class="sub-menu-sort-list sortable-list" handle=".child-drag-handle" :animation="220" easing="cubic-bezier(.2, .8, .2, 1)" ghost-class="sort-placeholder" chosen-class="sort-chosen" drag-class="sort-dragging" :fallback-tolerance="3" :swap-threshold="0.58">
                        <template #item="{ element: child, index: childIndex }">
                        <article :class="['accordion-item child', { open: childOpen.has(sortKey(child)) }]">
                        <div class="accordion-header">
                          <button class="icon-btn drag-handle child-drag-handle" title="按住并拖动整项排序"><SvgIcon name="grip" :size="13" /></button>
                          <button class="accordion-toggle" @click="setChildOpen(child)"><span class="chevron">›</span><span class="item-type-icon"><SvgIcon :name="menuTypeIcon(child.type)" :size="15" /></span><span class="row-copy"><b>{{ childIndex + 1 }}. {{ child.name || '未命名子项' }}</b><small>{{ typeLabel(child.type) }} · {{ childSummary(child) }}</small></span></button>
                          <div class="row-actions">
                            <button class="btn edit-btn" @click="setChildOpen(child)">{{ childOpen.has(sortKey(child)) ? '收起' : '编辑' }}</button>
                            <button class="icon-btn" title="上移" :disabled="childIndex === 0" @click="moveChild(item, childIndex, -1)">↑</button>
                            <button class="icon-btn" title="下移" :disabled="childIndex === item.sub_menu_items.length - 1" @click="moveChild(item, childIndex, 1)">↓</button>
                            <button class="icon-btn danger" title="删除" @click="removeChild(item, childIndex)"><SvgIcon name="trash" :size="13" /></button>
                          </div>
                        </div>
                        <div v-if="childOpen.has(sortKey(child))" class="accordion-body">
                          <div class="form-grid">
                            <label><span>类型</span><select v-model="child.type"><option v-for="type in CHILD_TYPES" :key="type.value" :value="type.value">{{ type.label }}</option></select></label>
                            <label><span>名称</span><input v-model="child.name" placeholder="请输入子菜单名称" /></label>
                            <label class="full"><span>{{ child.type === 'link' ? '链接地址' : '填入聊天框的内容' }}</span><input v-if="child.type === 'link'" v-model="child.link" placeholder="https://" /><input v-else v-model="child.send_message" placeholder="例如 /settings" /></label>
                          </div>
                        </div>
                        </article>
                        </template>
                      </Draggable>
                    </div>
                  </div>
                </div>
              </article>
              </template>
            </Draggable>
            <div v-else class="empty-state">暂无自定义菜单</div>
            <button class="add-row" :disabled="menuDraft.length >= 10" @click="addMenu"><SvgIcon name="plus" :size="16" />新增菜单项</button>
          </div>
        </section>

        <section v-else class="config-surface">
          <header class="surface-header panel-header">
            <div>
              <h2>指令面板</h2>
              <p>{{ activePanels.length }} 条指令<span v-if="panelChanges"> · {{ panelChanges }} 项未保存</span></p>
            </div>
            <div class="toolbar panel-toolbar">
              <div class="scope-switch">
                <button v-for="item in SCOPES" :key="item.key" :class="{ active: scope === item.key }" @click="changeScope(item.key)">{{ item.label }}</button>
              </div>
              <button class="btn" :disabled="busy" @click="loadPanels()">查询</button>
              <button class="btn primary" :disabled="busy || !panelChanges" @click="savePanels"><SvgIcon name="save" :size="14" />保存更改</button>
            </div>
          </header>
          <div class="surface-body">
            <Draggable v-if="panels.length" v-model="panels" :item-key="draftKey" tag="div" class="panel-list sortable-list" handle=".panel-drag-handle" :animation="220" easing="cubic-bezier(.2, .8, .2, 1)" ghost-class="sort-placeholder" chosen-class="sort-chosen" drag-class="sort-dragging" :fallback-tolerance="3" :swap-threshold="0.58" :scroll-sensitivity="70" :scroll-speed="12" @end="finishPanelSort">
              <template #item="{ element: record, index }">
              <article :class="['panel-row', { open: panelOpen.has(draftKey(record)), dirty: draftChanged(record) && !record._deleted, deleting: record._deleted }]">
                <div class="panel-row-header">
                  <button v-if="!record._deleted" class="icon-btn drag-handle panel-drag-handle" title="按住并拖动整项排序"><SvgIcon name="grip" :size="14" /></button>
                  <button class="accordion-toggle" :disabled="record._deleted" @click="setPanelOpen(record)">
                    <span class="chevron">›</span>
                    <span class="item-type-icon"><SvgIcon :name="menuTypeIcon(panelItem(record).type)" :size="17" /></span>
                    <span class="row-copy"><b>{{ panelTitle(record) }}</b><small>{{ panelSummary(record) }}</small></span>
                    <span v-if="record._deleted" class="draft-badge danger">待删除</span><span v-else-if="record._isNew" class="draft-badge">新建草稿</span><span v-else-if="record._dirty || record._targetDirty" class="draft-badge">待保存</span>
                  </button>
                  <button v-if="!record._deleted" class="btn edit-btn" @click="setPanelOpen(record)">{{ panelOpen.has(draftKey(record)) ? '收起' : '编辑' }}</button>
                  <button :class="['btn', record._deleted ? '' : 'danger']" @click="removePanel(record)">{{ record._deleted ? '撤销删除' : '删除' }}</button>
                </div>
                <div v-if="panelOpen.has(draftKey(record)) && !record._deleted" class="panel-body">
                  <div class="form-grid">
                    <label><span>指令名称 / 内容</span><input v-model="panelItem(record).name" placeholder="请输入指令" @input="markPanel(record)" /></label>
                    <label><span>指令说明</span><input v-model="panelItem(record).desc" placeholder="展示给用户的说明" @input="markPanel(record)" /></label>
                    <label><span>指令类型</span><select v-model="panelItem(record).type" @change="markPanel(record)"><option value="command">指令</option><option value="link">链接跳转</option></select></label>
                    <label v-if="panelItem(record).type === 'link'"><span>链接地址</span><input v-model="panelItem(record).link" placeholder="https://" @input="markPanel(record)" /></label>

                    <div v-if="record._isNew" class="field-group full">
                      <span class="field-label">生效范围（可多选）</span>
                      <div class="scope-checks">
                        <label v-for="item in SCOPES" :key="item.key" :class="{ selected: record.scopes.includes(item.key), disabled: record.target_type === 'specific' && !['c2c', 'group'].includes(item.key) }"><input type="checkbox" :checked="record.scopes.includes(item.key)" :disabled="record.target_type === 'specific' && !['c2c', 'group'].includes(item.key)" @change="toggleScope(record, item.key)" />{{ item.label }}</label>
                      </div>
                    </div>
                    <div v-else class="readonly-field"><span>生效范围</span><b>{{ scopeLabel(record.scope) }}</b></div>

                    <label v-if="record._isNew"><span>适用对象</span><select v-model="record.target_type" @change="changeTargetType(record)"><option value="all">全部用户</option><option value="specific">指定对象</option></select></label>
                    <div v-else class="readonly-field"><span>适用对象</span><b>{{ record.target_type === 'specific' ? '指定对象' : '全部用户' }}</b></div>

                    <template v-if="record.target_type === 'specific'">
                      <label v-if="record._isNew ? record.scopes.includes('c2c') : record.scope === 'c2c'" class="full"><span>用户 openid（每行一个）</span><textarea :value="targetText(record, 'user_openids')" :disabled="record._targetsLoading || (!record._isNew && !record._targetsLoaded)" :placeholder="record._targetsLoading ? '正在加载...' : (record._targetsLoaded ? '请输入用户 openid' : '加载失败，请收起后重试')" @input="updateTargets(record, 'user_openids', $event.target.value)" /></label>
                      <label v-if="record._isNew ? record.scopes.includes('group') : record.scope === 'group'" class="full"><span>群 openid（每行一个）</span><textarea :value="targetText(record, 'group_openids')" :disabled="record._targetsLoading || (!record._isNew && !record._targetsLoaded)" :placeholder="record._targetsLoading ? '正在加载...' : (record._targetsLoaded ? '请输入群 openid' : '加载失败，请收起后重试')" @input="updateTargets(record, 'group_openids', $event.target.value)" /></label>
                    </template>
                  </div>
                </div>
              </article>
              </template>
            </Draggable>
            <div v-else class="empty-state">当前场景暂无指令</div>
            <button class="add-row" @click="addPanel"><SvgIcon name="plus" :size="16" />创建指令面板</button>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>

<style scoped src="./function-config.css"></style>
