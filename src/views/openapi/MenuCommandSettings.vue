<script setup>
import { ref, reactive, computed, watch } from 'vue'
import draggable from 'vuedraggable'
import AppIcon from './AppIcon.vue'

const props = defineProps({ appid: { type: String, required: true }, request: { type: Function, required: true } })
const emit = defineEmits(['back', 'toast'])
const LIMIT = 20
const scene = ref('c2c')
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const menus = ref([])
const panels = reactive({ c2c: [], group: [] })
const metadata = reactive({ menu: {}, c2c: {}, group: {} })
const draft = reactive({ visible: false, kind: 'menu', index: -1, value: {} })
const currentCommands = computed(() => panels[scene.value])
const clone = value => JSON.parse(JSON.stringify(value))
let key = 0
const withKeys = items => (items || []).map(item => ({ ...item, _key: ++key }))
const stripKeys = items => items.map(({ _key, ...item }) => item)
const types = computed(() => draft.kind === 'menu' ? [
  { value: 'send_message', title: '发送指令', sub: '向机器人发送预设文字', icon: 'message' },
  { value: 'link', title: '打开页面', sub: '跳转到 HTTPS 服务页', icon: 'external' },
  { value: 'switch', title: '功能开关', sub: '快速开启或关闭能力', icon: 'settings' },
  { value: 'menu', title: '二级菜单', sub: '收纳多个常用入口', icon: 'grid' },
] : [
  { value: 'command', title: '发送指令', sub: '向机器人发送指令', icon: 'message' },
  { value: 'link', title: '打开页面', sub: '跳转到 HTTPS 服务页', icon: 'external' },
])
const typeText = item => ({ send_message: '发送指令', command: '发送指令', link: '打开页面', switch: '功能开关', menu: '二级菜单' })[item.type] || '发送指令'
const targetText = item => item.send_message || item.link || item.switch?.switch_id || item.desc || ''
function allRecord(records) { return (records || []).find(item => !item.target_type || item.target_type === 'all') }

async function load() {
  loading.value = true
  error.value = ''
  try {
    const result = await props.request('/cgi-bin/v2/info/query', { bot_appid: Number(props.appid), filter: { menus: 1, panels: 1 } })
    const menu = allRecord(result.menus?.menu_records)
    metadata.menu = menu || {}
    menus.value = withKeys(menu?.menu?.items)
    for (const scope of ['c2c', 'group']) {
      const panel = allRecord((result.panels?.panel_records || []).filter(item => item.scope === scope))
      metadata[scope] = panel || {}
      panels[scope] = withKeys(panel?.panel?.items)
    }
  } catch (e) { error.value = e.message }
  loading.value = false
}

async function persist(kind) {
  const scope = scene.value
  const meta = kind === 'menu' ? metadata.menu : metadata[scope]
  const items = stripKeys(kind === 'menu' ? menus.value : panels[scope])
  if (items.length > LIMIT) throw new Error(`最多支持 ${LIMIT} 条`)
  const payload = { bot_appid: Number(props.appid), filter: { [kind]: 1 } }
  if (kind === 'menu') payload.menu = [{ menu_id: meta.menu_id || '', version: meta.version || 0, menu: { items } }]
  else payload.panel = [{ panel_id: meta.panel_id || '', scope, version: meta.version || 0, panel: { items } }]
  saving.value = true
  try {
    const result = await props.request('/cgi-bin/v2/info/panel_menu/modify', payload)
    const updated = kind === 'menu' ? result.menu?.[0] : result.panel?.find(item => item.scope === scope)
    // Reload if the server omits a new version; the next write must use its current version.
    if (updated) Object.assign(meta, updated)
    else await load()
    emit('toast', '配置已保存')
    return true
  } catch (e) {
    emit('toast', e.message)
    await load()
    return false
  } finally { saving.value = false }
}

function edit(kind, index = -1) {
  const list = kind === 'menu' ? menus.value : currentCommands.value
  if (index < 0 && list.length >= LIMIT) return
  draft.kind = kind
  draft.index = index
  draft.value = {
    name: '', type: kind === 'menu' ? 'send_message' : 'command',
    send_message: '', link: '', desc: '', disabled: false, only_admin: false,
    switch: { switch_id: '', default: true }, sub_menu_items: [],
    ...(index >= 0 ? clone(list[index]) : {}),
  }
  draft.visible = true
}
function setType(type) {
  draft.value.type = type
  if (type === 'switch' && !draft.value.switch) draft.value.switch = { switch_id: '', default: true }
  if (type === 'menu' && !draft.value.sub_menu_items) draft.value.sub_menu_items = []
}
function validCommand(command) { return /^\/\S{1,14}$/.test(command || '') }
function validLink(link) { try { return new URL(link).protocol === 'https:' } catch { return false } }
const validation = computed(() => {
  const item = draft.value
  if (!item.name?.trim()) return '请填写名称'
  if (item.type === 'command') {
    if (!validCommand(item.name)) return '指令需以 / 开头，后面最多 14 个字符，不含空格'
  } else if (item.name.length > 10) return '名称最多 10 个字'
  if (item.type === 'send_message' && !validCommand(item.send_message)) return '指令需以 / 开头，后面最多 14 个字符，不含空格'
  if (item.type === 'link' && !validLink(item.link)) return '请填写有效的 HTTPS 地址'
  if (item.type === 'switch' && !item.switch?.switch_id?.trim()) return '请填写开关标识'
  if (item.type === 'menu') {
    if (!item.sub_menu_items?.length) return '请至少添加一个子菜单'
    for (const child of item.sub_menu_items) {
      if (!child.name?.trim() || child.name.length > 10) return '子菜单名称需为 1~10 个字'
      if (child.type === 'link' ? !validLink(child.link) : !validCommand(child.send_message)) return '请填写有效的子菜单指令或 HTTPS 地址'
    }
  }
  return ''
})
async function saveDraft() {
  if (validation.value || saving.value) return
  const item = clone(draft.value)
  item.name = item.name.trim()
  const list = draft.kind === 'menu' ? menus.value : currentCommands.value
  const record = { name: item.name, type: item.type, disabled: !!item.disabled, _key: item._key || ++key }
  if (draft.kind === 'panel') {
    record.desc = item.desc || ''
    record.only_admin = !!item.only_admin
  }
  if (item.type === 'send_message') record.send_message = item.send_message.trim()
  if (item.type === 'link') record.link = item.link.trim()
  if (item.type === 'switch') record.switch = item.switch
  if (item.type === 'menu') record.sub_menu_items = item.sub_menu_items.map(child => child.type === 'link'
    ? { name: child.name.trim(), type: 'link', link: child.link.trim() }
    : { name: child.name.trim(), type: 'send_message', send_message: child.send_message.trim() })
  if (draft.index < 0) list.push(record)
  else list.splice(draft.index, 1, record)
  if (await persist(draft.kind)) draft.visible = false
}
async function toggle(kind, item) {
  if (saving.value) return
  item.disabled = !item.disabled
  await persist(kind)
}
async function remove(kind, index) {
  if (saving.value || !window.confirm('确认删除此配置？')) return
  const list = kind === 'menu' ? menus.value : currentCommands.value
  list.splice(index, 1)
  await persist(kind)
}
watch(() => props.appid, load, { immediate: true })
</script>

<template>
  <div class="mc-panel">
    <div class="breadcrumb-bar"><button type="button" @click="emit('back')">高级设置</button><span>/</span><span>菜单与指令</span></div>
    <div v-if="loading" class="mc-state-card"><span class="mc-spinner"></span>加载中…</div>
    <div v-else-if="error" class="mc-state-card is-error">{{ error }}<button class="mc-retry" @click="load">重试</button></div>
    <template v-else>
      <div class="mc-toolbar">
        <div class="mc-toolbar-head"><div class="mc-toolbar-copy"><h2>使用场景</h2><p>好友（私聊）场景配置菜单和指令，群聊场景配置指令</p></div></div>
        <div class="ec-channel-cards mc-scenes" role="tablist" aria-label="使用场景">
          <button v-for="entry in [{ key: 'c2c', title: '好友场景', sub: '机器人好友（私聊）', icon: 'user' }, { key: 'group', title: '群聊场景', sub: '群内 @机器人', icon: 'group' }]" :key="entry.key" :class="['ec-channel-card', 'mc-scene-tab', { active: scene === entry.key }]" type="button" role="tab" :aria-selected="scene === entry.key" :disabled="saving" @click="scene = entry.key">
            <AppIcon :name="entry.icon" :size="17" class="ec-channel-icon" /><span class="ec-channel-text"><b class="ec-channel-title">{{ entry.title }}</b><small class="ec-channel-desc">{{ entry.sub }}</small></span><i class="ec-channel-check">✓</i>
          </button>
        </div>
      </div>
      <section v-for="kind in (scene === 'c2c' ? ['menu', 'panel'] : ['panel'])" :key="`${scene}-${kind}`" class="mc-section">
        <div class="mc-section-head"><div><div class="mc-section-title"><h3>{{ kind === 'menu' ? '自定义菜单' : '指令面板' }}</h3><span class="mc-preview-help"><button :aria-label="kind === 'menu' ? '查看自定义菜单位置示意' : '查看指令面板位置示意'" :title="kind === 'menu' ? '展示在好友聊天会话底部' : '在聊天页面输入 / 唤起'" type="button"><AppIcon name="info" :size="14" /></button></span></div><p>{{ kind === 'menu' ? '在好友（私聊）会话底部展示菜单项，配置顺序即为用户看到的顺序。' : '展示在机器人资料与聊天页面（输入“/”唤起）中的指令面板，帮助用户快速发现能力。' }}</p></div><button class="sec-group-action" type="button" :disabled="saving || (kind === 'menu' ? menus : currentCommands).length >= LIMIT" @click="edit(kind)"><AppIcon name="plus" :size="14" />添加{{ kind === 'menu' ? '菜单' : '指令' }}</button></div>
        <draggable v-if="(kind === 'menu' ? menus : currentCommands).length" :list="kind === 'menu' ? menus : currentCommands" item-key="_key" handle=".mc-drag-handle" :disabled="saving" :animation="200" class="mc-list" @end="event => event.oldIndex !== event.newIndex && persist(kind)">
          <template #item="{ element: item, index }">
            <article class="mc-item">
              <span class="mc-drag-handle" title="拖动排序"><span><i v-for="n in 6" :key="n"></i></span></span>
              <div class="mc-item-main"><div class="mc-item-name">{{ item.name }}<span>{{ typeText(item) }}</span><span v-if="item.only_admin" class="mc-admin-badge">仅管理员</span></div><div v-if="targetText(item)" class="mc-item-target">{{ targetText(item) }}</div><div v-if="item.type === 'menu'" class="mc-submenu-list"><div v-for="(child, childIndex) in item.sub_menu_items" :key="childIndex" class="mc-submenu-item"><b class="mc-submenu-name">{{ child.name }}</b><span>{{ typeText(child) }}</span><code>{{ targetText(child) }}</code></div></div></div>
              <div class="mc-item-actions"><button :class="['switch', { on: !item.disabled }]" type="button" role="switch" :aria-checked="!item.disabled" :aria-label="`${item.disabled ? '启用' : '停用'}${item.name}`" :disabled="saving" @click="toggle(kind, item)"></button><i class="mc-action-divider"></i><button class="mc-action-button" :aria-label="`编辑${item.name}`" :disabled="saving" @click="edit(kind, index)"><AppIcon name="edit" :size="15" /></button><button class="mc-action-button danger" :aria-label="`删除${item.name}`" :disabled="saving" @click="remove(kind, index)"><AppIcon name="trash" :size="15" /></button></div>
            </article>
          </template>
        </draggable>
        <button v-else class="mc-empty" :disabled="saving" @click="edit(kind)"><span><AppIcon name="plus" :size="20" /></span><b>添加{{ kind === 'menu' ? '菜单' : '指令' }}</b><small>配置后即可展示给用户</small></button>
        <p v-if="(kind === 'menu' ? menus : currentCommands).length >= LIMIT" class="mc-limit-tip">最多支持 {{ LIMIT }} 条{{ kind === 'menu' ? '菜单' : '指令' }}</p>
      </section>
    </template>
    <div v-if="draft.visible" class="mc-modal-mask" @click.self="!saving && (draft.visible = false)">
      <section class="mc-modal" role="dialog" aria-modal="true" :aria-label="`${draft.index < 0 ? '添加' : '编辑'}${draft.kind === 'menu' ? '菜单' : '指令'}`">
        <div class="mc-modal-head"><div><h2>{{ draft.index < 0 ? '添加' : '编辑' }}{{ draft.kind === 'menu' ? '菜单' : '指令' }}</h2><p>{{ draft.kind === 'menu' ? '配置菜单名称和触发动作，保存后即时生效。' : '配置指令入口，帮助用户快速发现机器人能力。' }}</p></div><button class="mc-close" aria-label="关闭" :disabled="saving" @click="draft.visible = false"><AppIcon name="close" :size="18" /></button></div>
        <form class="mc-form" @submit.prevent="saveDraft">
          <fieldset class="mc-fieldset"><legend class="mc-label">触发类型</legend><div class="mc-type-grid"><button v-for="type in types" :key="type.value" :class="['mc-type-card', { active: draft.value.type === type.value }]" type="button" @click="setType(type.value)"><AppIcon :name="type.icon" :size="18" /><span class="mc-type-copy"><b>{{ type.title }}</b><small>{{ type.sub }}</small></span><i>✓</i></button></div></fieldset>
          <label class="mc-field"><span class="mc-label">{{ draft.value.type === 'command' ? '指令' : '名称' }} <em>*</em></span><span class="input-wrap"><input v-model="draft.value.name" :maxlength="draft.value.type === 'command' ? 15 : 10" :placeholder="draft.value.type === 'command' ? '以 / 开头，如 /帮助' : '请输入名称'" /><span class="input-count">{{ draft.value.name.length }}/{{ draft.value.type === 'command' ? 15 : 10 }}</span></span></label>
          <label v-if="draft.value.type === 'send_message'" class="mc-field"><span class="mc-label">发送指令 <em>*</em></span><span class="input-wrap"><input v-model="draft.value.send_message" maxlength="15" placeholder="以 / 开头，如 /帮助" /></span></label>
          <label v-if="draft.value.type === 'link'" class="mc-field"><span class="mc-label">页面地址 <em>*</em></span><span class="input-wrap"><input v-model="draft.value.link" type="url" placeholder="https://" /></span></label>
          <label v-if="draft.value.type === 'switch'" class="mc-field"><span class="mc-label">开关标识 <em>*</em></span><span class="input-wrap"><input v-model="draft.value.switch.switch_id" placeholder="请输入开关标识" /></span><small class="mc-help">机器人可通过该标识识别开关事件</small></label>
          <div v-if="draft.value.type === 'menu'" class="mc-children"><div class="mc-children-head"><div><b class="mc-label">子菜单</b><small>设置二级菜单中的入口</small></div><button class="mc-text-button" type="button" :disabled="draft.value.sub_menu_items.length >= 5" @click="draft.value.sub_menu_items.push({ name: '', type: 'send_message', send_message: '', link: '' })"><AppIcon name="plus" :size="13" />添加子菜单</button></div><div class="mc-child-list"><div v-for="(child, index) in draft.value.sub_menu_items" :key="index" class="mc-child-card"><div class="mc-child-fields"><span class="input-wrap"><input v-model="child.name" maxlength="10" placeholder="菜单名称" /></span><select v-model="child.type" class="mc-child-select"><option value="send_message">发送指令</option><option value="link">打开页面</option></select><span class="input-wrap"><input v-if="child.type === 'link'" v-model="child.link" placeholder="https://" /><input v-else v-model="child.send_message" maxlength="15" placeholder="/指令" /></span></div><button class="mc-icon-button danger" type="button" aria-label="删除子菜单" @click="draft.value.sub_menu_items.splice(index, 1)"><AppIcon name="trash" :size="15" /></button></div></div></div>
          <label v-if="draft.kind === 'panel'" class="mc-field"><span class="mc-label">指令说明</span><textarea v-model="draft.value.desc" maxlength="50" placeholder="描述这条指令的用途"></textarea><span class="mc-count">{{ draft.value.desc.length }}/50</span></label>
          <div v-if="draft.kind === 'panel' && scene === 'group'" class="mc-admin-only-setting"><div><strong>仅群主和管理员可用</strong><small>启用后，仅群主和管理员可使用此指令</small></div><button :class="['switch', { on: draft.value.only_admin }]" type="button" role="switch" :aria-checked="draft.value.only_admin" aria-label="仅群主和管理员可用" @click="draft.value.only_admin = !draft.value.only_admin"></button></div>
          <div class="mc-modal-foot"><span class="mc-created-count">当前已创建 {{ (draft.kind === 'menu' ? menus : currentCommands).length }} / {{ LIMIT }} 个</span><button class="btn" type="button" :disabled="saving" @click="draft.visible = false">取消</button><button class="btn primary" type="submit" :disabled="saving || !!validation" :title="validation">{{ saving ? '保存中…' : draft.index < 0 ? '添加' : '保存' }}</button></div>
        </form>
      </section>
    </div>
  </div>
</template>
