<script setup>
import { h, ref, reactive, computed, defineComponent, onMounted, watch } from 'vue'
import { useMessage } from 'naive-ui'
import axios from '../utils/axios'
import { useAppStore } from '../stores/app'
import { formatFileSize } from '../utils/format'
import SvgIcon from '../components/SvgIcon.vue'

const msg = useMessage()
const appStore = useAppStore()
const dirs = ref([])
const modules = ref([])
const search = ref('')
const mode = ref('all')
const fileView = ref(localStorage.getItem('plugins_file_view') || 'main')
watch(fileView, v => localStorage.setItem('plugins_file_view', v))
const loading = ref(false)
const expanded = reactive({})
const botBindOpen = reactive({})
const deletedBotIds = new WeakMap()
const MAX_EDIT = 50 * 1024

const editor = reactive({ show: false, filename: '', content: '', originalContent: '', path: '', readonly: false, modified: false, saving: false })
const cfgEditor = reactive({ show: false, filename: '', path: '', format: 'raw', raw: '', parsed: null, comments: {}, viewMode: 'visual', modified: false, saving: false })

const ConfigNode = defineComponent({
  name: 'ConfigNode',
  props: { data: { required: true }, path: { type: Array, default: () => [] }, comments: { type: Object, default: () => ({}) } },
  emits: ['update'],
  setup(props, { emit }) {
    function update(p, v) { emit('update', p, v) }
    function comment(p) { return props.comments[p.join('.')] || '' }
    return () => {
      const d = props.data
      if (d == null) return h('div', { class: 'cfg-row' }, [h('span', { class: 'cfg-key' }, props.path.length ? props.path[props.path.length - 1] : 'null'), h('span', { class: 'cfg-val null' }, 'null')])
      if (typeof d === 'object' && !Array.isArray(d)) {
        const entries = Object.entries(d)
        return h('div', { class: 'cfg-section' }, entries.map(([k, v]) => {
          const np = [...props.path, k], c = comment(np)
          return v !== null && typeof v === 'object'
            ? h('details', { class: 'cfg-group', open: true }, [
                h('summary', { class: 'cfg-group-title' }, [k, c ? h('span', { class: 'cfg-comment' }, c) : null]),
                h(ConfigNode, { data: v, path: np, comments: props.comments, onUpdate: update })
              ])
            : h(ConfigNode, { data: v, path: np, comments: props.comments, onUpdate: update })
        }))
      }
      if (Array.isArray(d)) {
        const items = d.map((v, i) => {
          const np = [...props.path, i]
          return h('div', { class: 'cfg-array-item' }, [
            h('span', { class: 'cfg-idx' }, `[${i}]`),
            h(ConfigNode, { data: v, path: np, comments: props.comments, onUpdate: update }),
            h('button', { class: 'cfg-arr-btn remove', title: '删除', onClick: () => { const a = [...d]; a.splice(i, 1); update(props.path, a) } }, '×')
          ])
        })
        const defVal = () => {
          if (!d.length) return ''
          const f = d[0]
          if (f && typeof f === 'object' && !Array.isArray(f)) return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, typeof v === 'boolean' ? false : typeof v === 'number' ? 0 : '']))
          return typeof f === 'boolean' ? false : typeof f === 'number' ? 0 : ''
        }
        items.push(h('button', { class: 'cfg-arr-btn add', onClick: () => update(props.path, [...d, defVal()]) }, '+ 添加'))
        return h('div', { class: 'cfg-section' }, items)
      }
      const key = props.path.length ? props.path[props.path.length - 1] : ''
      const cmt = comment(props.path), isBool = typeof d === 'boolean', isNum = typeof d === 'number'
      return h('div', { class: 'cfg-row' }, [
        h('span', { class: 'cfg-key' }, String(key)),
        isBool
          ? h('label', { class: 'cfg-toggle' }, [h('input', { type: 'checkbox', checked: d, onChange: e => update(props.path, e.target.checked) }), h('span', { class: 'cfg-toggle-slider' }), h('span', { class: 'cfg-toggle-label' }, d ? 'true' : 'false')])
          : h('input', { class: 'cfg-input' + (isNum ? ' num' : ''), type: isNum ? 'number' : 'text', value: String(d), onInput: e => { let v = e.target.value; if (isNum) v = Number(v) || 0; update(props.path, v) } }),
        cmt ? h('span', { class: 'cfg-comment' }, cmt) : null,
      ])
    }
  }
})

const filteredModules = computed(() => {
  if (mode.value === 'plugin') return []
  const q = search.value.trim().toLowerCase()
  let list = modules.value
  if (q) list = list.filter(m => m.name.toLowerCase().includes(q) || (m.display_name || '').toLowerCase().includes(q) || (m.description || '').toLowerCase().includes(q))
  return list
})
const filteredDirs = computed(() => {
  if (mode.value === 'module') return []
  const q = search.value.trim().toLowerCase()
  if (!q) return dirs.value
  return dirs.value.filter(d => [d.directory, d.meta?.name, d.meta?.author, d.meta?.description, d.description].some(value => (value || '').toLowerCase().includes(q)) || d.files.some(f => f.name.toLowerCase().includes(q)) || (d.commands || []).some(c => (c.name || '').toLowerCase().includes(q)))
})
const allItems = computed(() => [...filteredModules.value, ...filteredDirs.value])
const totalCount = computed(() => dirs.value.length + modules.value.length)
const pluginCount = computed(() => dirs.value.length)
const moduleCount = computed(() => modules.value.length)
// 排序: 小型插件在前, 大型插件在后 (模块在模板中排最后)
const sortedDirs = computed(() => [...filteredDirs.value].sort((a, b) => (a.is_large ? 1 : 0) - (b.is_large ? 1 : 0)))

function cleanPattern(s) {
  return s
    .replace(/^\^/, '').replace(/\$$/, '')
    .replace(/\(\?:([^|)]+)(?:\|[^)]*)*\)/g, '$1')
    .replace(/\(([^|)]+)(?:\|[^)]+)+\)/g, '$1')
    .replace(/\\s\*/g, '').replace(/\\s\+/g, ' ')
    .replace(/\([^)]*\)\?/g, '').replace(/\([^)]*\)/g, '…')
    .replace(/-\?/g, '').replace(/\?/g, '')
    .replace(/\\/g, '').replace(/…+/g, '…').trim()
}
function toggle(key) { expanded[key] = !expanded[key] }
function fileBase(f) { let n = f.name; if (n.endsWith('.py')) n = n.slice(0, -3); return n }
function entryFile(d) { return d.files.find(f => ['main.py','index.py','app.py'].includes(f.name)) }
function entryDisabled(d) { if (!d.is_large) return false; const ef = entryFile(d); return ef ? !ef.enabled : false }
function visibleFiles(d) { if (!d.is_large || fileView.value === 'all') return d.files; const ef = entryFile(d); return ef ? [ef] : d.files.filter(f => !isSubFile(f)) }
async function toggleDir(d) { const ef = entryFile(d); if (!ef) { msg.error('未找到主入口文件'); return } await toggleFile(ef, d) }
function isSubFile(f) { return f.name.startsWith('app/') }
function toggleBotBind(key) { botBindOpen[key] = !botBindOpen[key] }
function isBotBound(target, appid) {
  const id = String(appid)
  return (target.allowed_bots || []).some(value => String(value) === id)
}
function botBindingOptions(target) {
  const activeBots = appStore.bots.map(bot => ({ ...bot, appid: String(bot.appid), deleted: false }))
  const activeIds = new Set(activeBots.map(bot => bot.appid))
  let cachedIds = deletedBotIds.get(target)
  if (!cachedIds) {
    cachedIds = new Set()
    deletedBotIds.set(target, cachedIds)
  }
  for (const value of target.allowed_bots || []) {
    const id = String(value)
    if (id && !activeIds.has(id)) cachedIds.add(id)
  }
  const deletedBots = [...cachedIds]
    .filter(id => !activeIds.has(id))
    .map(appid => ({ appid, name: '已删除机器人', avatar: '', deleted: true }))
  return [...activeBots, ...deletedBots]
}

async function fetchAll() {
  loading.value = true
  try {
    const [s, t] = await Promise.all([axios.get('/api/plugins/scan-dirs'), axios.get('/api/modules/scan')])
    dirs.value = (s.data.dirs || []).map(d => ({ ...d, _reloading: false, files: d.files.map(f => ({ ...f, _toggling: false })) }))
    modules.value = (t.data.modules || []).map(m => ({ ...m, _toggling: false, persist_enabled: m.persist_enabled ?? false }))
  } catch { msg.error('获取列表失败') } finally { loading.value = false }
}

async function toggleFile(file, dir) {
  file._toggling = true
  try {
    const action = file.enabled ? 'disable' : 'enable'
    const res = await axios.post('/api/plugins/toggle', { name: dir.directory, file: fileBase(file), action })
    if (res.data.success) {
      file.enabled = !file.enabled
      const ef = dir.files.find(f => ['main.py','index.py','app.py'].includes(f.name))
      dir.enabled = ef ? ef.enabled : dir.files.some(f => f.enabled)
      msg.success(`${file.name} 已${file.enabled ? '启用' : '禁用'}`)
    } else msg.error(res.data.message || '操作失败')
  } catch { msg.error('操作失败') } finally { file._toggling = false }
}

async function reloadPlugin(dir) {
  if (!dir.enabled || dir._reloading) return
  dir._reloading = true
  try {
    const res = await axios.post('/api/plugins/reload', { name: dir.directory })
    if (!res.data.success) {
      msg.error(res.data.message || '插件重载失败')
      return
    }
    msg.success(res.data.message || `插件 ${dir.directory} 已重载`)
    await fetchAll()
  } catch (e) {
    msg.error(e.normalizedMessage || e.message || '插件重载失败')
  } finally {
    dir._reloading = false
  }
}

async function toggleModule(mod) {
  mod._toggling = true
  const action = mod.persist_enabled ? 'disable' : 'enable'
  try {
    const res = await axios.post('/api/modules/toggle', { name: mod.name, action })
    if (res.data.success) { mod.persist_enabled = !mod.persist_enabled; mod.enabled = mod.persist_enabled; msg.success(`模块 ${mod.display_name} 已${mod.persist_enabled ? '开启' : '关闭'}`); setTimeout(() => fetchAll(), 500) }
    else msg.error(res.data.message || '操作失败')
  } catch { msg.error('模块切换失败') } finally { mod._toggling = false }
}

async function upload(e, { extensions, url, invalidMessage, successMessage, errorMessage, standalone = false }) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  if (!extensions.some(extension => file.name.endsWith(extension))) {
    msg.error(invalidMessage)
    return
  }
  const data = new FormData()
  data.append('file', file)
  if (standalone && file.name.endsWith('.py')) data.append('directory', 'alone')
  try {
    const config = file.name.endsWith('.zip') ? { timeout: 120000 } : {}
    const response = await axios.post(url, data, config)
    if (!response.data.success) {
      msg.error(response.data.message || errorMessage)
      return
    }
    msg.success(response.data.message || successMessage)
    await fetchAll()
  } catch {
    msg.error(errorMessage)
  }
}

function uploadPlugin(e) {
  return upload(e, {
    extensions: ['.py', '.zip'],
    url: '/api/plugins/upload',
    invalidMessage: '仅支持 .py 或 .zip 文件',
    successMessage: '上传成功',
    errorMessage: '上传失败',
    standalone: true,
  })
}

function uploadModule(e) {
  return upload(e, {
    extensions: ['.zip'],
    url: '/api/modules/upload',
    invalidMessage: '模块仅支持 .zip 格式',
    successMessage: '模块上传成功',
    errorMessage: '模块上传失败',
  })
}

const uninstallConfirm = reactive({ show: false, name: '', type: 'plugin', keepData: true, loading: false })

function showUninstall(name, type) {
  Object.assign(uninstallConfirm, { show: true, name, type, keepData: true, loading: false })
}

async function doUninstall() {
  uninstallConfirm.loading = true
  try {
    const res = await axios.post('/api/market/uninstall', { name: uninstallConfirm.name, type: uninstallConfirm.type, keep_data: uninstallConfirm.keepData })
    if (res.data.success) { msg.success(res.data.message || '已卸载'); uninstallConfirm.show = false; await fetchAll() }
    else msg.error(res.data.message || '卸载失败')
  } catch { msg.error('卸载请求失败') }
  finally { uninstallConfirm.loading = false }
}

async function readFile(file) {
  if (!file.path) { msg.error('无文件路径'); return }
  try {
    const res = await axios.post('/api/plugins/read', { path: file.path })
    if (!res.data.success) { msg.error(res.data.message || '读取失败'); return }
    const content = res.data.content || '', size = new Blob([content]).size
    Object.assign(editor, { show: true, filename: res.data.filename || file.name, content, originalContent: content, path: file.path, readonly: size > MAX_EDIT, modified: false, saving: false })
  } catch { msg.error('读取失败') }
}
async function saveFile() {
  if (editor.readonly || editor.saving) return
  editor.saving = true
  try { const r = await axios.post('/api/plugins/save', { path: editor.path, content: editor.content }); r.data.success ? (msg.success('保存成功，重载后生效'), editor.originalContent = editor.content, editor.modified = false) : msg.error(r.data.message || '保存失败') }
  catch { msg.error('保存失败') } finally { editor.saving = false }
}
function closeEditor() { if (editor.modified && !confirm('有未保存的修改，确定关闭？')) return; editor.show = false }

async function readConfig(file) {
  try {
    const res = await axios.post('/api/config-file/read', { path: file.path })
    if (!res.data.success) { msg.error(res.data.message || '读取失败'); return }
    const canVisual = ['yaml', 'json'].includes(res.data.format) && res.data.parsed !== null
    Object.assign(cfgEditor, { show: true, filename: res.data.filename, path: file.path, format: res.data.format, raw: res.data.raw, parsed: res.data.parsed ? JSON.parse(JSON.stringify(res.data.parsed)) : null, comments: res.data.comments || {}, viewMode: canVisual ? 'visual' : 'raw', modified: false, saving: false })
  } catch { msg.error('读取配置失败') }
}
function openModuleConfig(mod) { expanded['m_' + mod.name] = true; if (mod.config_files?.length === 1) readConfig(mod.config_files[0]) }
async function openDirConfig(dir) {
  const key = 'cfg_' + dir.directory
  if (expanded[key]) { expanded[key] = false; return }
  try {
    const res = await axios.post('/api/plugins/config-files', { name: dir.directory })
    if (res.data.success && res.data.config_files?.length) {
      dir._config_files = res.data.config_files
      if (res.data.config_files.length === 1) readConfig(res.data.config_files[0])
      else { expanded[dir.directory] = true; expanded[key] = true }
    }
    else msg.info('暂无配置文件')
  } catch { msg.error('获取配置失败') }
}
function onCfgUpdate(path, value) {
  if (!cfgEditor.parsed) return
  let obj = cfgEditor.parsed
  for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]]
  obj[path[path.length - 1]] = value
  cfgEditor.modified = true
  if (cfgEditor.format === 'json') cfgEditor.raw = JSON.stringify(cfgEditor.parsed, null, 2)
  else if (cfgEditor.format === 'yaml') cfgEditor.raw = toYaml(cfgEditor.parsed)
}
function toYaml(obj, indent = 0) {
  const pad = '  '.repeat(indent)
  if (obj == null) return pad + 'null\n'
  if (typeof obj !== 'object') return typeof obj === 'string' ? (obj === '' ? "''" : /[:#\[\]{}|>&*!?,]/.test(obj) || /^\s|\s$/.test(obj) ? (obj.includes("'") ? `"${obj.replace(/"/g, '\\"')}"` : `'${obj}'`) : obj) : String(obj)
  let out = ''
  if (Array.isArray(obj)) { if (!obj.length) return pad + '[]\n'; for (const v of obj) out += typeof v === 'object' && v !== null ? pad + '-\n' + toYaml(v, indent + 1) : pad + '- ' + toYaml(v) + '\n' }
  else { for (const [k, v] of Object.entries(obj)) out += typeof v === 'object' && v !== null ? pad + k + ':\n' + toYaml(v, indent + 1) : pad + k + ': ' + toYaml(v) + '\n' }
  return out
}
async function saveCfg() {
  if (cfgEditor.saving) return
  cfgEditor.saving = true
  try {
    const content = cfgEditor.viewMode === 'visual' && cfgEditor.parsed && cfgEditor.format === 'json' ? JSON.stringify(cfgEditor.parsed, null, 2) : cfgEditor.raw
    const r = await axios.post('/api/config-file/save', { path: cfgEditor.path, content, format: cfgEditor.format })
    r.data.success ? (msg.success(r.data.message || '保存成功'), cfgEditor.modified = false) : msg.error(r.data.message || '保存失败')
  } catch { msg.error('保存失败') } finally { cfgEditor.saving = false }
}
function closeCfg() { if (cfgEditor.modified && !confirm('有未保存的修改，确定关闭？')) return; cfgEditor.show = false }

async function saveBotBindings() {
  const map = {}
  for (const d of dirs.value) { if (d.allowed_bots?.length) map[d.directory] = [...d.allowed_bots]; for (const f of d.files) if (f.allowed_bots?.length) map[`${d.directory}/${fileBase(f)}`] = [...f.allowed_bots] }
  try { await axios.post('/api/plugins/bots', { plugin_bots: map }) } catch { msg.error('保存机器人绑定失败') }
}
function bindBot(target, bot, checked) {
  if (bot.deleted && checked) return
  const appid = String(bot.appid)
  const bots = (target.allowed_bots || []).map(String)
  target.allowed_bots = checked ? [...new Set([...bots, appid])] : bots.filter(id => id !== appid)
  saveBotBindings()
}

onMounted(() => { appStore.fetchBots(); fetchAll() })
</script>

<template>
  <div class="plugins-page">
    <div class="plugin-layout">
      <section class="plugin-main-panel">
        <div class="plugin-toolbar">
          <div class="plugin-toolbar-filters">
            <div class="plugin-mode-tabs" role="group" aria-label="插件类型">
              <button type="button" :class="{ active: mode === 'all' }" :aria-pressed="mode === 'all'" @click="mode = 'all'">全部 <small>{{ totalCount }}</small></button>
              <button type="button" :class="{ active: mode === 'plugin' }" :aria-pressed="mode === 'plugin'" @click="mode = 'plugin'">插件 <small>{{ pluginCount }}</small></button>
              <button type="button" :class="{ active: mode === 'module' }" :aria-pressed="mode === 'module'" @click="mode = 'module'">模块 <small>{{ moduleCount }}</small></button>
            </div>
            <div class="plugin-search">
              <SvgIcon name="search" :size="14" />
              <input v-model="search" type="search" placeholder="搜索名称、文件或命令" aria-label="搜索插件或模块" />
              <button v-if="search" type="button" aria-label="清除搜索" @click="search = ''"><SvgIcon name="x" :size="13" /></button>
            </div>
          </div>
          <div class="plugin-toolbar-actions">
            <div v-if="sortedDirs.some(d => d.is_large)" class="plugin-file-view" role="group" aria-label="文件显示方式" title="大型插件文件显示方式">
              <button type="button" :class="{ active: fileView === 'main' }" :aria-pressed="fileView === 'main'" @click="fileView = 'main'">主入口</button>
              <button type="button" :class="{ active: fileView === 'all' }" :aria-pressed="fileView === 'all'" @click="fileView = 'all'">全部文件</button>
            </div>
            <label v-if="mode !== 'module'" class="plugin-tool-button"><SvgIcon name="upload" :size="14" /><span>上传插件</span><input type="file" accept=".py,.zip" hidden @change="uploadPlugin" /></label>
            <label v-if="mode !== 'plugin'" class="plugin-tool-button"><SvgIcon name="upload" :size="14" /><span>上传模块</span><input type="file" accept=".zip" hidden @change="uploadModule" /></label>
            <button class="plugin-icon-button" type="button" title="刷新" :disabled="loading" @click="fetchAll"><SvgIcon name="refresh" :size="15" :class="{ 'reload-spinning': loading }" /></button>
          </div>
        </div>

        <div v-if="loading" class="plugin-state"><SvgIcon name="refresh" :size="17" class="reload-spinning" /><span>正在读取插件列表…</span></div>
        <div v-else-if="!allItems.length" class="plugin-state plugin-state-empty"><SvgIcon name="link" :size="22" /><strong>没有匹配的内容</strong><span>{{ search ? '换个关键词试试' : '上传插件或模块后会显示在这里' }}</span></div>
        <div v-else class="plugin-items">
          <article v-for="d in sortedDirs" :key="d.directory" :class="['plugin-entry', { expanded: expanded[d.directory], inactive: !d.enabled }]">
            <div class="plugin-entry-head" @click="toggle(d.directory)">
              <button class="plugin-expand-button" type="button" :aria-label="expanded[d.directory] ? '收起' : '展开'" :aria-expanded="!!expanded[d.directory]"><SvgIcon name="chevron-forward" :size="14" :class="{ rotated: expanded[d.directory] }" /></button>
              <div class="plugin-entry-icon"><SvgIcon name="link" :size="22" /></div>
              <div class="plugin-entry-main">
                <div class="plugin-entry-title"><strong>{{ d.is_large ? (d.meta?.name || d.directory) : d.directory }}</strong><span class="plugin-tag">插件</span><span v-if="d.is_system" class="neutral-tag">系统</span><span :class="['status-tag', d.enabled ? 'online' : 'offline']">{{ d.enabled ? '已加载' : '未加载' }}</span></div>
                <div class="plugin-entry-meta"><span v-if="d.is_large && d.meta?.author">{{ d.meta.author }}</span><span v-if="d.is_large && (d.meta?.description || d.description)">{{ d.meta?.description || d.description }}</span><span v-else-if="!d.is_large">{{ d.files.length }} 个文件</span><a v-if="d.is_large && d.meta?.github" :href="d.meta.github" target="_blank" rel="noreferrer" @click.stop><SvgIcon name="globe" :size="12" /> 项目主页</a></div>
              </div>
              <div class="plugin-entry-actions" @click.stop>
                <span v-if="d.is_large && d.meta?.version" class="version-tag">v{{ d.meta.version }}</span>
                <span v-else-if="d.is_large" class="version-tag">{{ d.files.length }} 文件</span>
                <button class="plugin-action-button" type="button" :disabled="!d.enabled || d._reloading" title="重载插件" @click="reloadPlugin(d)"><SvgIcon name="refresh" :size="14" :class="{ 'reload-spinning': d._reloading }" /></button>
                <label v-if="d.is_large && entryFile(d)" class="plugin-switch" :title="entryDisabled(d) ? '启用插件' : '禁用插件'"><input type="checkbox" :checked="!entryDisabled(d)" :disabled="entryFile(d)._toggling" @change="toggleDir(d)" /><span /></label>
                <button class="plugin-action-button" type="button" :class="{ active: expanded['cfg_' + d.directory] }" title="配置" @click="openDirConfig(d)"><SvgIcon name="settings" :size="14" /></button>
                <button class="plugin-action-button" :class="{ active: d.allowed_bots?.length }" type="button" :title="d.allowed_bots?.length ? `${d.allowed_bots.length} 个机器人` : '全部机器人'" @click="toggleBotBind(d.directory)"><SvgIcon name="people" :size="14" /></button>
                <button v-if="d.is_large && !d.is_system" class="plugin-action-button danger" type="button" title="卸载" @click="showUninstall(d.directory, 'plugin')"><SvgIcon name="trash" :size="14" /></button>
              </div>
            </div>
            <div v-if="botBindOpen[d.directory]" class="plugin-bot-panel" @click.stop>
              <div class="plugin-detail-label">选择允许触发的机器人 <span>不选则允许全部机器人</span></div>
              <label v-for="bot in botBindingOptions(d)" :key="bot.appid" :class="['plugin-bot-item', { deleted: bot.deleted, locked: bot.deleted && !isBotBound(d, bot.appid) }]" :title="bot.deleted ? (isBotBound(d, bot.appid) ? '该机器人已删除，只能取消绑定' : '已解除绑定，无法重新选择') : ''"><input type="checkbox" :checked="isBotBound(d, bot.appid)" :disabled="bot.deleted && !isBotBound(d, bot.appid)" @change="e => bindBot(d, bot, e.target.checked)" /><span v-if="bot.deleted" class="plugin-bot-avatar deleted-avatar"><SvgIcon name="person" :size="12" /></span><img v-else-if="bot.avatar" :src="bot.avatar" class="plugin-bot-avatar" /><span>{{ bot.name || bot.appid }}</span><span v-if="bot.deleted" class="plugin-bot-deleted">已删除</span><span class="plugin-bot-id">{{ bot.appid }}</span></label>
            </div>
            <div v-if="expanded[d.directory]" class="plugin-entry-detail">
              <div v-if="d.commands?.length" class="plugin-detail-block"><div class="plugin-detail-heading"><span>命令</span><small>{{ d.commands.length }}</small></div><div class="plugin-command-list"><span v-for="cmd in d.commands" :key="cmd.pattern" :class="['plugin-command', { owner: cmd.owner_only, group: cmd.group_only && !cmd.owner_only }]" :title="(cmd.owner_only ? '[主人专用] ' : cmd.group_only ? '[群聊专用] ' : '[所有人] ') + (cmd.name ? cmd.name + ' | ' : '') + (cmd.desc ? cmd.pattern + ' — ' + cmd.desc : cmd.pattern)"><SvgIcon :name="cmd.owner_only ? 'shield' : cmd.group_only ? 'group' : 'globe'" :size="11" />{{ cmd.name || cleanPattern(cmd.pattern) }}</span></div></div>
              <div v-if="expanded['cfg_' + d.directory] && d._config_files?.length" class="plugin-detail-block"><div class="plugin-detail-heading"><span>配置文件</span><small>{{ d._config_files.length }}</small></div><div v-for="cf in d._config_files" :key="cf.path" class="plugin-file-row"><div class="plugin-file-info"><SvgIcon name="settings" :size="14" /><strong>{{ cf.name }}</strong><span :class="['format-tag', 'fmt-' + cf.format]">{{ cf.format.toUpperCase() }}</span><small>{{ formatFileSize(cf.size) }}</small></div><button class="plugin-action-button" type="button" title="编辑配置" @click="readConfig(cf)"><SvgIcon name="settings" :size="14" /></button></div></div>
              <div class="plugin-detail-block"><div class="plugin-detail-heading"><span>文件</span><small>{{ visibleFiles(d).length }}{{ fileView === 'main' && d.is_large ? ' / ' + d.files.length : '' }}</small></div><template v-for="f in visibleFiles(d)" :key="f.path"><div :class="['plugin-file-row', { 'plugin-file-disabled': entryDisabled(d) && isSubFile(f) }]" ><div class="plugin-file-info"><SvgIcon name="file" :size="14" /><strong>{{ f.name }}</strong><span v-if="!d.is_large && f.meta?.name" class="plugin-file-meta">{{ f.meta.name }}<template v-if="f.meta?.version"> · v{{ f.meta.version }}</template></span><small>{{ formatFileSize(f.size) }}<template v-if="f.last_modified"> · {{ f.last_modified }}</template></small></div><div class="plugin-file-actions"><button v-if="!d.is_large" :class="['plugin-mini-tag', { active: f.allowed_bots?.length }]" type="button" @click.stop="toggleBotBind(d.directory + '/' + fileBase(f))"><SvgIcon name="people" :size="11" />{{ f.allowed_bots?.length || '全部' }}</button><label v-if="!d.is_large" class="plugin-switch small" :title="f.enabled ? '禁用' : '启用'"><input type="checkbox" :checked="f.enabled" :disabled="f._toggling" @change="toggleFile(f, d)" /><span /></label><button class="plugin-action-button" type="button" title="查看代码" @click="readFile(f)"><SvgIcon name="code" :size="14" /></button><button v-if="!d.is_large && !d.is_system" class="plugin-action-button danger" type="button" title="卸载" @click.stop="showUninstall(d.directory === 'alone' ? fileBase(f) : d.directory, 'plugin')"><SvgIcon name="trash" :size="14" /></button></div></div><div v-if="!d.is_large && botBindOpen[d.directory + '/' + fileBase(f)]" class="plugin-bot-panel file-level" @click.stop><div class="plugin-detail-label">{{ f.name }} · 选择允许触发的机器人</div><label v-for="bot in botBindingOptions(f)" :key="bot.appid" :class="['plugin-bot-item', { deleted: bot.deleted, locked: bot.deleted && !isBotBound(f, bot.appid) }]" :title="bot.deleted ? (isBotBound(f, bot.appid) ? '该机器人已删除，只能取消绑定' : '已解除绑定，无法重新选择') : ''"><input type="checkbox" :checked="isBotBound(f, bot.appid)" :disabled="bot.deleted && !isBotBound(f, bot.appid)" @change="e => bindBot(f, bot, e.target.checked)" /><span v-if="bot.deleted" class="plugin-bot-avatar deleted-avatar"><SvgIcon name="person" :size="12" /></span><img v-else-if="bot.avatar" :src="bot.avatar" class="plugin-bot-avatar" /><span>{{ bot.name || bot.appid }}</span><span v-if="bot.deleted" class="plugin-bot-deleted">已删除</span><span class="plugin-bot-id">{{ bot.appid }}</span></label></div></template></div>
            </div>
          </article>

          <article v-for="m in filteredModules" :key="'m_' + m.name" :class="['plugin-entry', 'module-entry', { expanded: expanded['m_' + m.name], inactive: !m.enabled }]">
            <div class="plugin-entry-head" @click="toggle('m_' + m.name)">
              <button class="plugin-expand-button" type="button" :aria-label="expanded['m_' + m.name] ? '收起' : '展开'" :aria-expanded="!!expanded['m_' + m.name]"><SvgIcon name="chevron-forward" :size="14" :class="{ rotated: expanded['m_' + m.name] }" /></button>
              <div class="plugin-entry-icon module"><SvgIcon name="cube" :size="18" /></div>
              <div class="plugin-entry-main"><div class="plugin-entry-title"><strong>{{ m.display_name }}</strong><span class="module-tag">模块</span><span :class="['status-tag', m.enabled ? 'online' : 'offline']">{{ m.enabled ? '运行中' : '未启用' }}</span><span v-if="m.error" class="status-tag offline" :title="m.error">异常</span></div><div class="plugin-entry-meta"><span v-if="m.description">{{ m.description }}</span><span v-else>模块依赖</span></div></div>
              <div class="plugin-entry-actions" @click.stop><span class="version-tag">v{{ m.version }}</span><label class="plugin-switch" :title="m.persist_enabled ? '关闭模块' : '开启模块'"><input type="checkbox" :checked="m.persist_enabled" :disabled="m._toggling" @change="toggleModule(m)" /><span /></label><button v-if="m.config_files?.length" class="plugin-action-button" type="button" title="配置" @click="openModuleConfig(m)"><SvgIcon name="settings" :size="14" /></button><button class="plugin-action-button danger" type="button" title="卸载" @click="showUninstall(m.name, 'module')"><SvgIcon name="trash" :size="14" /></button></div>
            </div>
            <div v-if="expanded['m_' + m.name]" class="plugin-entry-detail"><div class="plugin-detail-block"><div class="plugin-detail-heading"><span>配置文件</span><small>{{ m.config_files?.length || 0 }}</small></div><div v-if="!m.config_files?.length" class="plugin-empty-inline">暂无配置文件</div><div v-for="cf in m.config_files" :key="cf.path" class="plugin-file-row"><div class="plugin-file-info"><SvgIcon name="file" :size="14" /><strong>{{ cf.name }}</strong><span :class="['format-tag', 'fmt-' + cf.format]">{{ cf.format.toUpperCase() }}</span><small>{{ formatFileSize(cf.size) }}</small></div><button class="plugin-action-button" type="button" title="编辑配置" @click="readConfig(cf)"><SvgIcon name="settings" :size="14" /></button></div></div></div>
          </article>
        </div>
      </section>
    </div>

    <div v-if="uninstallConfirm.show" class="p-modal-overlay" @click.self="uninstallConfirm.show = false">
      <div class="p-uninstall-confirm">
        <div class="p-uninstall-title">确认卸载</div>
        <div class="p-uninstall-msg">确定卸载 <b>{{ uninstallConfirm.name }}</b> 吗？</div>
        <label class="p-uninstall-check">
          <input type="checkbox" v-model="uninstallConfirm.keepData" />
          <span>保留插件数据</span>
        </label>
        <div class="p-uninstall-btns">
          <button class="p-btn" @click="uninstallConfirm.show = false">取消</button>
          <button class="p-btn danger" @click="doUninstall" :disabled="uninstallConfirm.loading">{{ uninstallConfirm.loading ? '卸载中...' : '卸载' }}</button>
        </div>
      </div>
    </div>

    <div v-if="editor.show" class="p-modal-overlay" @click.self="closeEditor">
      <div class="p-modal">
        <div class="p-modal-head">
          <div class="p-modal-title"><SvgIcon name="file" :size="16" /><span>{{ editor.filename }}</span><span v-if="editor.readonly" class="p-tag warn">只读 (文件过大)</span><span v-if="editor.modified" class="p-tag accent">已修改</span></div>
          <div class="p-modal-actions">
            <button v-if="!editor.readonly && editor.modified" class="p-btn save-btn" @click="saveFile"><SvgIcon name="save" :size="14" /> 保存 </button>
            <button class="p-btn close-btn" @click="closeEditor"><SvgIcon name="x" :size="14" /> 关闭 </button>
          </div>
        </div>
        <div class="p-modal-body"><textarea v-model="editor.content" class="p-code-editor" spellcheck="false" :readonly="editor.readonly" @input="editor.modified = true" /></div>
      </div>
    </div>

    <div v-if="cfgEditor.show" class="p-modal-overlay" @click.self="closeCfg">
      <div class="p-modal cfg-modal">
        <div class="p-modal-head">
          <div class="p-modal-title">
            <SvgIcon name="settings" :size="16" />
            <span>{{ cfgEditor.filename }}</span>
            <span :class="['p-tag', 'fmt-' + cfgEditor.format]">{{ cfgEditor.format.toUpperCase() }}</span>
            <span v-if="cfgEditor.modified" class="p-tag accent">已修改</span>
          </div>
          <div class="p-modal-actions">
            <div v-if="cfgEditor.format === 'yaml' || cfgEditor.format === 'json'" class="cv-mode-tabs">
              <button :class="['cv-mode-tab', { active: cfgEditor.viewMode === 'visual' }]" @click="cfgEditor.viewMode = 'visual'"><SvgIcon name="grid" :size="12" /> 可视化</button>
              <button :class="['cv-mode-tab', { active: cfgEditor.viewMode === 'raw' }]" @click="cfgEditor.viewMode = 'raw'"><SvgIcon name="code" :size="12" /> 源码</button>
            </div>
            <button v-if="cfgEditor.modified" class="p-btn save-btn" @click="saveCfg"><SvgIcon name="save" :size="14" /> 保存</button>
            <button class="p-btn close-btn" @click="closeCfg"><SvgIcon name="x" :size="14" /> 关闭</button>
          </div>
        </div>
        <div class="p-modal-body cfg-body">
          <div v-if="cfgEditor.viewMode === 'visual' && cfgEditor.parsed" class="cfg-visual">
            <ConfigNode :data="cfgEditor.parsed" :path="[]" :comments="cfgEditor.comments" @update="onCfgUpdate" />
          </div>
          <textarea v-else v-model="cfgEditor.raw" class="p-code-editor cfg-editor" spellcheck="false" @input="cfgEditor.modified = true" />
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped>
.plugins-page {
  --plugin-line: color-mix(in srgb, var(--text) 8%, var(--bg2));
  --plugin-muted: color-mix(in srgb, var(--text2) 72%, var(--text3));
  display: flex;
  height: calc(100vh - 92px);
  height: calc(100dvh - 92px - env(safe-area-inset-bottom, 0px));
  min-height: 0;
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif;
}
.plugins-page *, .plugins-page *::before, .plugins-page *::after { box-sizing: border-box; }
.plugins-page button, .plugins-page input, .plugins-page select { font: inherit; }
.plugins-page button { cursor: pointer; }
.plugins-page :is(button, input, select, a):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.plugin-layout {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--plugin-line);
  border-radius: 18px;
  background: var(--bg2);
  box-shadow: 0 4px 24px color-mix(in srgb, var(--text) 3%, transparent);
}
.plugin-mode-tabs {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 2px;
  padding: 3px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: var(--bg3);
}
.plugin-mode-tabs button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 0;
  min-height: 28px;
  padding: 4px 11px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text2);
  font-size: 12px;
  white-space: nowrap;
  transition: background .15s, color .15s;
}
.plugin-mode-tabs button:hover { color: var(--accent); }
.plugin-mode-tabs button.active {
  background: var(--bg2);
  color: var(--accent);
  font-weight: 650;
  box-shadow: 0 1px 4px color-mix(in srgb, var(--text) 7%, transparent);
}
.plugin-mode-tabs small { min-width: 12px; color: var(--text3); font-size: 10px; font-variant-numeric: tabular-nums; }
.plugin-mode-tabs button.active small { color: var(--accent); }
.plugin-search {
  display: flex;
  align-items: center;
  flex: 1;
  gap: 8px;
  min-width: 140px;
  max-width: 280px;
  height: 34px;
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--bg3);
  color: var(--text3);
  transition: border-color .15s, background .15s;
}
.plugin-search:focus-within { border-color: color-mix(in srgb, var(--accent) 45%, var(--plugin-line)); background: var(--bg2); }
.plugin-search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--text); font-size: 12px; }
.plugin-search input::placeholder { color: var(--text3); }
.plugin-search input::-webkit-search-cancel-button { display: none; }
.plugin-search > button { display: inline-flex; padding: 0; border: 0; background: transparent; color: var(--text3); }
.plugin-search > button:hover { color: var(--text); }
.plugin-main-panel { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; background: var(--bg); }
.plugin-toolbar { display: flex; flex-shrink: 0; flex-wrap: wrap; align-items: center; gap: 12px 20px; padding: 14px 18px; border-bottom: 1px solid var(--plugin-line); background: var(--bg2); }
.plugin-toolbar-filters { display: flex; align-items: center; flex: 1 1 390px; gap: 14px; min-width: 0; }
.plugin-toolbar-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; }
.plugin-file-view { display: inline-flex; align-items: center; gap: 2px; padding: 3px; border: 1px solid var(--plugin-line); border-radius: 8px; background: var(--bg); }
.plugin-file-view button { min-height: 26px; padding: 3px 9px; border: 0; border-radius: 5px; background: transparent; color: var(--text3); font-size: 11px; line-height: 1.5; white-space: nowrap; transition: background .15s, color .15s, box-shadow .15s; }
.plugin-file-view button:hover { color: var(--text); }
.plugin-file-view button.active { background: var(--bg2); color: var(--text); font-weight: 600; box-shadow: 0 1px 4px color-mix(in srgb, var(--text) 9%, transparent); }
.plugin-tool-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--plugin-line);
  border-radius: 8px;
  background: var(--bg2);
  color: var(--text2);
  font-size: 12px;
  cursor: pointer;
  transition: border-color .15s, background .15s, color .15s;
}
.plugin-tool-button:hover, .plugin-tool-button:focus-within { border-color: color-mix(in srgb, var(--accent) 32%, var(--plugin-line)); color: var(--accent); background: var(--accent-soft); }
.plugin-tool-button:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
.plugin-icon-button, .plugin-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text2);
  transition: background .15s, color .15s;
}
.plugin-icon-button { width: 34px; height: 34px; border: 1px solid var(--plugin-line); }
.plugin-icon-button:hover:not(:disabled), .plugin-action-button:hover:not(:disabled), .plugin-action-button.active { background: var(--accent-soft); color: var(--accent); }
.plugin-icon-button:disabled, .plugin-action-button:disabled { cursor: not-allowed; opacity: .4; }
.plugin-action-button.danger:hover:not(:disabled) { background: color-mix(in srgb, #ff453a 10%, transparent); color: #ff6258; }
.plugin-items { flex: 1; min-height: 0; overflow: auto; padding: 16px 18px 20px; scrollbar-gutter: stable; }
.plugin-entry { margin-bottom: 9px; border: 1px solid var(--plugin-line); border-radius: 12px; background: var(--bg2); transition: border-color .15s, box-shadow .15s, background .15s; }
.plugin-entry:hover { border-color: color-mix(in srgb, var(--accent) 22%, var(--plugin-line)); }
.plugin-entry.expanded { border-color: color-mix(in srgb, var(--accent) 32%, var(--plugin-line)); box-shadow: 0 2px 12px color-mix(in srgb, var(--text) 4%, transparent); }
.plugin-entry.inactive .plugin-entry-icon { opacity: .55; }
.plugin-entry-head { display: flex; align-items: center; gap: 10px; min-height: 76px; padding: 13px 14px 13px 10px; cursor: pointer; }
.plugin-expand-button { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 22px; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--text3); }
.plugin-expand-button:hover { background: var(--bg3); color: var(--accent); }
.plugin-expand-button svg { transition: transform .18s; }
.plugin-expand-button svg.rotated { transform: rotate(90deg); }
.plugin-entry-icon { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 34px; width: 34px; height: 34px; border-radius: 10px; background: var(--bg3); color: var(--text); }
.plugin-entry-icon.module { background: color-mix(in srgb, #9a7bff 14%, var(--bg3)); color: #a58aff; }
.plugin-entry-main { flex: 1; min-width: 0; }
.plugin-entry-title { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; }
.plugin-entry-title strong { max-width: 100%; }
.plugin-entry-title strong { overflow: hidden; color: var(--text); font-size: 13px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.plugin-tag, .module-tag, .neutral-tag, .status-tag, .version-tag, .format-tag { display: inline-flex; align-items: center; flex-shrink: 0; min-height: 19px; padding: 1px 6px; border-radius: 5px; font-size: 10px; line-height: 1.5; white-space: nowrap; }
.plugin-tag { background: color-mix(in srgb, var(--accent) 13%, var(--bg3)); color: var(--accent); }
.module-tag { background: color-mix(in srgb, #9a7bff 15%, var(--bg3)); color: #a58aff; }
.neutral-tag, .version-tag { background: var(--bg3); color: var(--text3); }
.status-tag.online { background: color-mix(in srgb, var(--success, #27ae60) 12%, var(--bg3)); color: var(--success, #27ae60); }
.status-tag.offline { background: color-mix(in srgb, var(--text3) 13%, var(--bg3)); color: var(--text3); }
.plugin-entry-meta { display: flex; align-items: center; gap: 8px; min-width: 0; margin-top: 5px; color: var(--plugin-muted); font-size: 11px; }
.plugin-entry-meta > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plugin-entry-meta a { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; color: var(--accent); text-decoration: none; }
.plugin-entry-meta a:hover { text-decoration: underline; }
.plugin-entry-actions { display: flex; align-items: center; gap: 3px; flex-shrink: 0; }
.plugin-entry-actions > .version-tag { margin-right: 3px; }
.plugin-switch { position: relative; display: inline-flex; flex-shrink: 0; width: 28px; height: 17px; margin: 0 4px; cursor: pointer; }
.plugin-switch input { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.plugin-switch input:disabled { cursor: not-allowed; }
.plugin-switch span { position: absolute; inset: 0; border-radius: 10px; background: var(--bg3); pointer-events: none; transition: background .15s; }
.plugin-switch span::after { position: absolute; top: 3px; left: 3px; width: 11px; height: 11px; border-radius: 50%; background: var(--text3); content: ''; transition: transform .15s, background .15s; }
.plugin-switch input:checked + span { background: color-mix(in srgb, var(--accent) 65%, var(--bg3)); }
.plugin-switch input:checked + span::after { transform: translateX(11px); background: #fff; }
.plugin-switch input:disabled + span { opacity: .45; cursor: not-allowed; }
.plugin-switch input:focus-visible + span { outline: 2px solid var(--accent); outline-offset: 3px; }
.plugin-switch.small { width: 25px; height: 15px; margin: 0 2px; }
.plugin-switch.small span::after { width: 9px; height: 9px; }
.plugin-switch.small input:checked + span::after { transform: translateX(10px); }
.plugin-entry-detail { margin: 0 12px 12px 51px; padding: 2px 0 0; border-top: 1px solid var(--plugin-line); }
.plugin-detail-block { padding: 12px 0 2px; }
.plugin-detail-block + .plugin-detail-block { border-top: 1px solid var(--plugin-line); }
.plugin-detail-heading { display: flex; align-items: center; gap: 7px; margin-bottom: 8px; color: var(--text2); font-size: 11px; font-weight: 650; }
.plugin-detail-heading small { display: inline-flex; min-width: 18px; justify-content: center; padding: 1px 5px; border-radius: 5px; background: var(--bg3); color: var(--text3); font-size: 10px; font-weight: 500; }
.plugin-command-list { display: flex; flex-wrap: wrap; gap: 6px; }
.plugin-command { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; padding: 5px 8px; border: 1px solid var(--plugin-line); border-radius: 7px; background: var(--bg); color: var(--text2); font-size: 11px; }
.plugin-command.owner { border-color: color-mix(in srgb, #f39c12 28%, var(--plugin-line)); color: #d99015; }
.plugin-command.group { border-color: color-mix(in srgb, var(--accent) 28%, var(--plugin-line)); color: var(--accent); }
.plugin-file-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 38px; padding: 5px 7px; border-top: 1px solid color-mix(in srgb, var(--plugin-line) 75%, transparent); }
.plugin-file-row:first-of-type { border-top: 0; }
.plugin-file-info { display: flex; align-items: center; gap: 7px; min-width: 0; color: var(--text2); }
.plugin-file-info > svg { flex-shrink: 0; color: var(--text3); }
.plugin-file-info strong { overflow: hidden; color: var(--text2); font-size: 12px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.plugin-file-info small { color: var(--text3); font-size: 10px; overflow-wrap: anywhere; }
.plugin-file-meta { overflow: hidden; color: var(--text3); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.plugin-file-disabled { opacity: .45; }
.plugin-file-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.format-tag { padding: 1px 5px; background: var(--bg3); color: var(--text3); font-size: 9px; }
.format-tag.fmt-json { color: #d59b43; }
.format-tag.fmt-yaml { color: #6db1ec; }
.plugin-mini-tag { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 6px; border: 0; border-radius: 6px; background: transparent; color: var(--text3); font-size: 10px; }
.plugin-mini-tag:hover, .plugin-mini-tag.active { background: var(--accent-soft); color: var(--accent); }
.plugin-empty-inline { padding: 7px; color: var(--text3); font-size: 11px; }
.plugin-bot-panel { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin: 0 12px 10px 51px; padding: 9px 10px; border: 1px solid var(--plugin-line); border-radius: 9px; background: var(--bg); }
.plugin-bot-panel.file-level { margin: 0 0 7px; border-radius: 7px; }
.plugin-detail-label { display: inline-flex; align-items: baseline; gap: 6px; width: 100%; color: var(--text2); font-size: 11px; font-weight: 600; }
.plugin-detail-label span { color: var(--text3); font-size: 10px; font-weight: 400; }
.plugin-bot-item { display: inline-flex; align-items: center; gap: 6px; min-height: 26px; padding: 3px 7px 3px 5px; border: 1px solid var(--plugin-line); border-radius: 7px; background: var(--bg2); color: var(--text2); font-size: 11px; cursor: pointer; }
.plugin-bot-item:hover { border-color: color-mix(in srgb, var(--accent) 35%, var(--plugin-line)); }
.plugin-bot-item.deleted { opacity: .72; }
.plugin-bot-item.locked { cursor: not-allowed; }
.plugin-bot-item input { accent-color: var(--accent); }
.plugin-bot-avatar { width: 18px; height: 18px; border-radius: 5px; object-fit: cover; }
.plugin-bot-avatar.deleted-avatar { display: inline-flex; align-items: center; justify-content: center; background: var(--bg3); color: var(--text3); }
.plugin-bot-deleted, .plugin-bot-id { color: var(--text3); font-size: 9px; }
.plugin-state { display: flex; align-items: center; justify-content: center; gap: 9px; flex: 1; color: var(--text3); font-size: 12px; }
.plugin-state-empty { flex-direction: column; gap: 6px; }
.plugin-state-empty svg { color: var(--text3); }
.plugin-state-empty strong { color: var(--text2); font-size: 13px; font-weight: 600; }
.plugin-state-empty span { font-size: 11px; }
.reload-spinning { animation: plugin-spin .8s linear infinite; }
@keyframes plugin-spin { to { transform: rotate(360deg); } }

@media (max-width: 900px) {
  .plugin-toolbar { padding-inline: 14px; }
  .plugin-items { padding-inline: 14px; }
}
@media (max-width: 700px) {
  .plugins-page { height: auto; min-height: calc(100vh - 78px); }
  .plugin-layout { flex-direction: column; overflow: visible; border-radius: 14px; }
  .plugin-toolbar { gap: 10px; padding: 12px; border-radius: 14px 14px 0 0; }
  .plugin-toolbar-filters { flex-basis: 100%; flex-wrap: wrap; gap: 10px; }
  .plugin-mode-tabs { flex: 1; justify-content: space-between; }
  .plugin-mode-tabs button { flex: 1; }
  .plugin-search { flex: 1 1 180px; max-width: none; }
  .plugin-toolbar-actions { flex: 1; flex-wrap: wrap; gap: 6px; }
  .plugin-file-view { margin-right: auto; }
  .plugin-file-view button { padding-inline: 8px; }
  .plugin-items { overflow: visible; padding: 10px 12px 14px; }
  .plugin-entry-head { flex-wrap: wrap; gap: 8px; padding-right: 8px; }
  .plugin-entry-main { min-width: calc(100% - 94px); }
  .plugin-entry-actions { width: 100%; justify-content: flex-end; padding-left: 32px; }
  .plugin-entry-actions > .version-tag { margin-right: auto; }
  .plugin-entry-detail { margin-left: 10px; margin-right: 10px; }
  .plugin-bot-panel { margin-left: 10px; margin-right: 10px; }
}
@media (max-width: 440px) {
  .plugin-mode-tabs, .plugin-search { flex-basis: 100%; }
  .plugin-tool-button { justify-content: center; gap: 5px; padding-inline: 8px; font-size: 11px; }
  .plugin-file-view { flex: 1 1 100%; margin: 0 0 2px; }
  .plugin-file-view button { flex: 1; }
  .plugin-toolbar-actions > .plugin-tool-button { flex: 1; }
  .plugin-entry-meta { display: block; line-height: 1.45; }
  .plugin-entry-meta > span { display: block; max-width: 100%; }
  .plugin-entry-meta a { margin-top: 2px; }
  .plugin-file-row { align-items: flex-start; }
  .plugin-file-info { flex-wrap: wrap; }
}

/* File and configuration dialogs. */
.p-btn {
  display:flex;
  align-items:center;
  gap:5px;
  height:32px;
  box-sizing:border-box;
  padding:0 12px;
  border:1px solid var(--border);
  border-radius:6px;
  background:transparent;
  color:var(--text2);
  cursor:pointer;
  font-size:13px
}
.p-btn:hover {
  color:var(--text);
  border-color:var(--text3)
}
.p-btn:disabled {
  opacity:.4;
  cursor:default
}
.p-btn.active-mode {
  background:var(--accent);
  color:#fff;
  border-color:var(--accent)
}
.save-btn {
  background:var(--accent);
  color:#fff;
  border-color:var(--accent)
}
.save-btn:hover {
  opacity:.9
}
.p-tag {
  font-size:10px;
  padding:1px 6px;
  border-radius:4px;
  background:var(--bg3);
  color:var(--text3);
  white-space:nowrap
}
.p-tag.ok {
  background:#34c7591f;
  color:#34c759
}
.p-tag.off {
  background:#ff453a1a;
  color:#ff453a
}
.p-tag.warn {
  background:#ffaa0026;
  color:#e8a000
}
.p-tag.accent {
  background:rgba(var(--accent-rgb,99,102,241),.15);
  color:var(--accent)
}
.p-tag.module-tag {
  background:rgba(var(--accent-rgb,99,102,241),.15);
  color:var(--accent);
  font-weight:600
}
.p-tag.plugin-tag {
  background:#34c7591f;
  color:#34c759;
  font-weight:600
}
.p-tag.config-tag {
  cursor:pointer;
  background:rgba(var(--accent-rgb,99,102,241),.1);
  color:var(--accent);
  display:inline-flex;
  align-items:center;
  gap:2px
}
.p-tag.config-tag:hover {
  background:rgba(var(--accent-rgb,99,102,241),.25)
}
.p-tag.fmt-yaml {
  background:#ffaa001f;
  color:#e8a000
}
.p-tag.fmt-json {
  background:#34c7591a;
  color:#34c759
}
.p-tag.fmt-toml {
  background:#6496ff1f;
  color:#6496ff
}
.p-tag.fmt-ini {
  background:#c864c81f;
  color:#c864c8
}
.p-tag.fmt-text,.p-tag.fmt-raw {
  background:var(--bg3);
  color:var(--text3)
}
.p-modal-overlay {
  position:fixed;
  top:0;
  right:0;
  bottom:0;
  left:0;
  z-index:1000;
  background:#00000073;
  display:flex;
  align-items:center;
  justify-content:center
}
.p-modal {
  width:92vw;
  max-width:1100px;
  height:82vh;
  background:var(--bg);
  border:1px solid var(--border);
  border-radius:12px;
  display:flex;
  flex-direction:column;
  overflow:hidden
}
.cfg-modal {
  max-width:900px;
  height:78vh
}
.p-modal-head {
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:10px 14px;
  background:var(--bg2);
  border-bottom:1px solid var(--border);
  gap:8px;
  flex-wrap:wrap
}
.p-modal-title {
  display:flex;
  align-items:center;
  gap:6px;
  font-size:13px;
  font-weight:600;
  color:var(--text);
  min-width:0
}
.p-modal-actions {
  display:flex;
  align-items:center;
  gap:6px;
  flex-shrink:0;
  flex-wrap:wrap
}
.p-modal-body {
  flex:1;
  display:flex;
  min-height:0
}
.p-code-editor {
  flex:1;
  resize:none;
  padding:14px 16px;
  margin:0 8px 8px;
  background:#1a1a2e;
  color:#e0e0e0;
  border:1px solid rgba(255,255,255,.08);
  border-radius:8px;
  outline:none;
  font-family:Cascadia Code,Fira Code,Consolas,monospace;
  font-size:13px;
  line-height:1.7;
  -moz-tab-size:4;
  -o-tab-size:4;
  tab-size:4
}
.p-code-editor[readonly] {
  opacity:.8;
  cursor:default
}
.close-btn {
  color:var(--text);
  background:var(--bg3);
  border-color:var(--border)
}
.close-btn:hover {
  color:#ff453a;
  border-color:#ff453a;
  background:#ff453a1a
}
.cfg-body {
  flex-direction:column;
  background:var(--bg)
}
.cfg-visual {
  flex:1;
  overflow-y:auto;
  padding:12px 16px;
  background:var(--bg)
}
.cfg-editor {
  margin-top:0
}
.cv-mode-tabs {
  display:flex;
  background:var(--bg3);
  border-radius:8px;
  padding:2px;
  gap:2px
}
.cv-mode-tab {
  display:flex;
  align-items:center;
  gap:4px;
  padding:5px 12px;
  border:none;
  border-radius:6px;
  background:transparent;
  color:var(--text3);
  font-size:12px;
  cursor:pointer;
  transition:all .2s;
  white-space:nowrap
}
.cv-mode-tab:hover { color:var(--text) }
.cv-mode-tab.active {
  background:var(--accent);
  color:#fff;
  box-shadow:0 1px 4px rgba(0,0,0,.2)
}
@media(max-width:767px) {
.p-modal {
  width:100vw;
  height:100vh;
  max-width:none;
  border-radius:0
}
.cfg-modal {
  max-width:none;
  height:100vh
}
.p-modal-head {
  padding:10px 12px;
  flex-direction:column;
  align-items:flex-start;
  gap:8px
}
.p-modal-title {
  flex-wrap:wrap;
  font-size:12px
}
.p-modal-actions {
  width:100%;
  justify-content:flex-end
}
.p-code-editor {
  font-size:12px;
  padding:10px 12px;
  margin:0 4px 4px;
  line-height:1.5
}
.cfg-visual {
  padding:10px 12px
}
}
</style>

<style>
/* ===== Config Tree (unscoped for ConfigNode child component) ===== */
.cfg-section {
  display:flex;
  flex-direction:column;
  gap:2px
}
.cfg-group {
  margin-bottom:4px
}
.cfg-group-title {
  font-size:13px;
  font-weight:600;
  color:var(--accent);
  cursor:pointer;
  padding:6px 0 4px;
  -webkit-user-select:none;
  -moz-user-select:none;
  user-select:none;
  list-style:none;
  display:flex;
  align-items:center;
  gap:4px
}
.cfg-group-title:before {
  content:"▶";
  font-size:9px;
  transition:.15s
}
details[open]>.cfg-group-title:before {
  transform:rotate(90deg)
}
.cfg-group>.cfg-section {
  padding-left:16px;
  margin-left:4px
}
.cfg-row {
  display:flex;
  align-items:center;
  gap:10px;
  padding:4px 0;
  min-height:32px
}
.cfg-key {
  font-size:12px;
  color:var(--text2);
  font-family:Cascadia Code,Fira Code,monospace;
  min-width:140px;
  flex-shrink:0
}
.cfg-comment {
  font-size:10px;
  color:var(--text3);
  opacity:.5;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  flex-shrink:1;
  min-width:0
}
.cfg-group-title .cfg-comment {
  font-size:10px;
  font-weight:400;
  margin-left:6px
}
.cfg-val.null {
  font-size:12px;
  color:var(--text3);
  font-style:italic
}
.cfg-input {
  flex:1;
  max-width:400px;
  padding:4px 8px;
  font-size:12px;
  background:var(--bg2);
  color:var(--text);
  border:1px solid var(--border);
  border-radius:4px;
  outline:none;
  font-family:Cascadia Code,Fira Code,monospace
}
.cfg-input:focus {
  border-color:var(--accent)
}
.cfg-input.num {
  max-width:160px
}
.cfg-toggle {
  display:flex;
  align-items:center;
  gap:6px;
  cursor:pointer
}
.cfg-toggle input {
  display:none
}
.cfg-toggle-slider {
  position:relative;
  width:32px;
  height:18px;
  background:var(--border);
  border-radius:9px;
  transition:.2s
}
.cfg-toggle-slider:after {
  content:"";
  position:absolute;
  left:2px;
  top:2px;
  width:14px;
  height:14px;
  background:#fff;
  border-radius:50%;
  transition:.2s
}
.cfg-toggle input:checked+.cfg-toggle-slider {
  background:var(--accent)
}
.cfg-toggle input:checked+.cfg-toggle-slider:after {
  left:16px
}
.cfg-toggle-label {
  font-size:11px;
  color:var(--text3);
  font-family:monospace
}
.cfg-array-item {
  display:flex;
  align-items:center;
  gap:6px
}
.cfg-idx {
  font-size:10px;
  color:var(--text3);
  min-width:28px;
  font-family:monospace
}
.cfg-arr-btn {
  border:1px solid var(--border);
  border-radius:4px;
  background:transparent;
  cursor:pointer;
  font-size:11px;
  padding:2px 8px;
  color:var(--text2);
  transition:.15s
}
.cfg-arr-btn:hover {
  border-color:var(--accent);
  color:var(--accent)
}
.cfg-arr-btn.remove {
  padding:2px 6px;
  color:var(--text3);
  flex-shrink:0
}
.cfg-arr-btn.remove:hover {
  color:#e74c3c;
  border-color:#e74c3c
}
.cfg-arr-btn.add {
  margin-top:4px;
  align-self:flex-start
}
@media(max-width:767px) {
  .cfg-row {
  flex-wrap:wrap;
  gap:4px
}
.cfg-key {
  min-width:80px;
  max-width:none;
  width:100%;
  font-size:11px
}
.cfg-input {
  max-width:none;
  width:100%
}
.cfg-input.num {
  max-width:none
}
.cfg-comment {
  width:100%;
  white-space:normal
}
.cfg-group>.cfg-section {
  padding-left:10px
}
.cfg-array-item {
  flex-wrap:wrap
}
}
.uninstall-tag {
  color:#ff453a !important;
  border-color:#ff453a4d !important;
  cursor:pointer
}
.uninstall-tag:hover {
  border-color:#ff453a !important;
  background:#ff453a1a
}
.p-uninstall-confirm {
  background:var(--bg);
  border:1px solid var(--border);
  border-radius:12px;
  padding:20px 24px;
  width:340px;
  max-width:90vw
}
.p-uninstall-title {
  font-size:15px;
  font-weight:600;
  color:var(--text);
  margin-bottom:8px
}
.p-uninstall-msg {
  font-size:13px;
  color:var(--text2);
  margin-bottom:14px;
  line-height:1.5
}
.p-uninstall-check {
  display:flex;
  align-items:center;
  gap:6px;
  font-size:13px;
  color:var(--text2);
  margin-bottom:16px;
  cursor:pointer
}
.p-uninstall-check input[type="checkbox"] {
  width:15px;
  height:15px;
  accent-color:var(--accent)
}
.p-uninstall-btns {
  display:flex;
  justify-content:flex-end;
  gap:8px
}
.p-btn.danger {
  color:#fff;
  background:#ff453a;
  border-color:#ff453a
}
.p-btn.danger:hover {
  background:#e03e34
}
.p-btn.danger:disabled {
  opacity:.5;
  cursor:default
}
.p-file-meta {
  font-size:11px;
  color:var(--text3);
  margin-left:4px
}
.p-act-btn.danger-btn {
  color:#ff453a
}
.p-act-btn.danger-btn:hover {
  background:#ff453a1a
}
</style>
