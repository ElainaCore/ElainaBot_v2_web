<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import yaml from 'js-yaml'
import SvgIcon from '../../components/SvgIcon.vue'
import MessageContent from '../../components/messages/MessageContent.vue'
import MessageAvatar from '../../components/messages/MessageAvatar.vue'

const props = defineProps({ source: { type: String, default: '' }, bots: { type: Array, default: () => [] }, active: Boolean })
const emit = defineEmits(['update:source', 'invalid'])
const LABELS = {
  welcome: ['群欢迎', '机器人被邀请入群', 'chat-group'],
  user_welcome: ['新用户欢迎', '新用户首次交互', 'person-add'],
  friend_add: ['添加好友', '添加好友自动回复', 'person-heart'],
  group_only: ['群聊专用', '群聊专用命令提示', 'group'],
  default: ['无指令回复', '未匹配到命令时', 'chatbubbles'],
  owner_only: ['主人权限', '仅主人可用的命令', 'crown'],
  maintenance: ['维护模式', '维护期间的回复', 'settings'],
  blacklist: ['用户黑名单', '用户被限制使用时', 'person-remove'],
  group_blacklist: ['群黑名单', '群被限制使用时', 'shield'],
  api_error: ['API 错误', '消息发送失败时', 'alert-circle'],
}
const CONTENT_FIELDS = [{ key: 'markdown', label: 'Markdown' }, { key: 'text', label: '纯文本' }, { key: 'content', label: '通用内容' }]
const variables = reactive({ user_id: '10001', user_count: '128', reason: '触发群管理规则', error_code: '400', error_message: '请求失败，请稍后重试', appid: '102134274', group_id: '20001' })
const selectedKey = ref('')
const variantIndex = ref(0)
const search = ref('')
const contentField = ref('markdown')
const previewMode = ref('markdown')
const contentEditor = ref(null)
const buttonDrafts = reactive({})
const previewImage = ref('')

function parse(source) { try { const data = yaml.load(source); return data && typeof data === 'object' && !Array.isArray(data) ? data : {} } catch { return {} } }
function dump(data) { return yaml.dump(data, { lineWidth: -1, noRefs: true, sortKeys: false, quotingType: '"' }) }
const templates = computed(() => parse(props.source))
const keys = computed(() => Object.keys(templates.value))
const filteredKeys = computed(() => keys.value.filter(key => `${key} ${LABELS[key]?.join(' ') || ''}`.toLowerCase().includes(search.value.trim().toLowerCase())))
const selectedTemplate = computed(() => templates.value[selectedKey.value])
const variants = computed(() => Array.isArray(selectedTemplate.value) ? selectedTemplate.value : [selectedTemplate.value])
const currentEntry = computed(() => variants.value[variantIndex.value])
const selectedLabel = computed(() => LABELS[selectedKey.value]?.[0] || selectedKey.value)
const draftKey = computed(() => JSON.stringify([selectedKey.value, variantIndex.value]))
const currentBot = computed(() => props.bots.find(bot => String(bot.appid) === String(currentEntry.value?.appid || variables.appid)) || props.bots[0])

watch(keys, value => { if (!value.includes(selectedKey.value)) selectedKey.value = value[0] || '' }, { immediate: true })
watch(selectedKey, () => { variantIndex.value = 0 })
watch(variants, value => { if (variantIndex.value >= value.length) variantIndex.value = 0 })
watch([selectedKey, variantIndex], () => {
  const entry = currentEntry.value
  contentField.value = typeof entry === 'string' ? 'content' : CONTENT_FIELDS.find(field => Object.hasOwn(entry || {}, field.key))?.key || 'markdown'
  variables.appid = String(entry?.appid || props.bots[0]?.appid || '102134274')
}, { immediate: true })
watch(() => props.source, () => { if (!props.active) Object.keys(buttonDrafts).forEach(key => delete buttonDrafts[key]) })

function getContent(field) {
  if (typeof currentEntry.value === 'string') return field === 'content' ? currentEntry.value : ''
  return String(currentEntry.value?.[field] ?? '')
}
function updateEntry(mutate) {
  const data = parse(props.source)
  const original = Array.isArray(data[selectedKey.value]) ? data[selectedKey.value][variantIndex.value] : data[selectedKey.value]
  const entry = original && typeof original === 'object' && !Array.isArray(original) ? original : (typeof original === 'string' ? { content: original } : {})
  mutate(entry)
  if (Array.isArray(data[selectedKey.value])) data[selectedKey.value][variantIndex.value] = entry
  else data[selectedKey.value] = entry
  emit('update:source', dump(data))
}
function updateContent(event) { if (!event.isComposing) updateEntry(entry => { entry[contentField.value] = event.target.value }) }
function updateAppid(event) {
  if (event.isComposing) return
  updateEntry(entry => { if (event.target.value) entry.appid = event.target.value; else delete entry.appid })
}
function useFallback() { updateEntry(entry => { delete entry[contentField.value] }) }
const hasCurrentField = computed(() => typeof currentEntry.value === 'string' ? contentField.value === 'content' : Object.hasOwn(currentEntry.value || {}, contentField.value))

function parseButtons(source) {
  if (!source.trim()) return { value: [], error: '' }
  try {
    const value = yaml.load(source)
    if (!Array.isArray(value) || value.some(row => !Array.isArray(row) || row.some(button => !button || typeof button !== 'object' || Array.isArray(button)))) {
      return { value: [], error: '按钮应为二维数组，例如 [[{text: "菜单", data: "/菜单"}]]' }
    }
    return { value, error: '' }
  } catch (error) { return { value: [], error: `按钮 YAML 格式有误${error.mark ? `（第 ${error.mark.line + 1} 行）` : ''}` } }
}
const buttonsText = computed(() => {
  if (draftKey.value in buttonDrafts) return buttonDrafts[draftKey.value]
  const buttons = currentEntry.value?.buttons
  return buttons ? yaml.dump(buttons, { flowLevel: 0, lineWidth: -1, noRefs: true }).trim() : ''
})
const parsedButtons = computed(() => parseButtons(buttonsText.value))
const buttonsInvalid = computed(() => Object.values(buttonDrafts).some(source => !!parseButtons(source).error))
watch(buttonsInvalid, invalid => emit('invalid', invalid), { immediate: true })
function updateButtons(event) {
  if (event.isComposing) return
  const source = event.target.value
  buttonDrafts[draftKey.value] = source
  const parsed = parseButtons(source)
  if (!parsed.error) updateEntry(entry => { if (parsed.value.length) entry.buttons = parsed.value; else delete entry.buttons })
}

async function insertVariable(key) {
  const editor = contentEditor.value
  const value = getContent(contentField.value)
  const start = editor?.selectionStart ?? value.length
  const end = editor?.selectionEnd ?? start
  const variable = `{${key}}`
  updateEntry(entry => { entry[contentField.value] = value.slice(0, start) + variable + value.slice(end) })
  await nextTick()
  editor?.focus()
  editor?.setSelectionRange(start + variable.length, start + variable.length)
}
function substitute(value) { return String(value ?? '').replace(/\{([a-z_]+)\}/g, (match, key) => Object.hasOwn(variables, key) ? variables[key] : match) }
function variableToken(key) { return '{' + key + '}' }
const previewContent = computed(() => {
  const entry = currentEntry.value
  if (typeof entry === 'string') return substitute(entry)
  const order = previewMode.value === 'markdown' ? ['markdown', 'text', 'content'] : ['text', 'content', 'markdown']
  const field = order.find(key => Object.hasOwn(entry || {}, key))
  return substitute(field ? entry[field] : '')
})
const previewButtons = computed(() => parsedButtons.value.value.filter(row => row.length))
const previewSource = computed(() => {
  if (typeof currentEntry.value === 'string') return '通用内容'
  const order = previewMode.value === 'markdown' ? ['markdown', 'text', 'content'] : ['text', 'content', 'markdown']
  const key = order.find(field => Object.hasOwn(currentEntry.value || {}, field))
  return CONTENT_FIELDS.find(field => field.key === key)?.label || '未设置内容'
})
function variantLabel(entry, index) { return entry?.appid ? `AppID · ${entry.appid}` : `通用模板${variants.value.length > 1 ? ` · #${index + 1}` : ''}` }
function excerpt(key) {
  const raw = templates.value[key]
  const entry = Array.isArray(raw) ? raw.find(item => !item?.appid) || raw[0] : raw
  if (typeof entry === 'string') return entry
  return String(entry?.markdown ?? entry?.text ?? entry?.content ?? '暂未设置内容')
}
</script>

<template>
  <div class="tpl-layout" aria-label="消息模板编辑器">
    <aside class="tpl-sidebar" aria-label="选择消息模板">
      <header class="tpl-list-heading"><h2>消息模板</h2><span>{{ keys.length }}</span></header>
      <label class="tpl-search"><SvgIcon name="search" :size="15" /><input v-model="search" aria-label="搜索模板" placeholder="搜索模板…" type="search" /><button v-if="search" aria-label="清除模板搜索" @click="search = ''"><SvgIcon name="x" :size="13" /></button></label>
      <div class="tpl-list">
        <button v-for="key in filteredKeys" :key="key" class="tpl-list-item" :class="{ active: selectedKey === key }" :aria-pressed="selectedKey === key" @click="selectedKey = key">
          <span class="tpl-list-icon"><SvgIcon :name="LABELS[key]?.[2] || 'chatbubbles'" :size="16" /></span>
          <span class="tpl-list-copy"><strong>{{ LABELS[key]?.[0] || key }}</strong><code>{{ key }}</code><small>{{ excerpt(key) }}</small></span>
          <span v-if="Array.isArray(templates[key])" class="tpl-variants-count" title="多个模板版本">{{ templates[key].length }}</span>
        </button>
        <p v-if="!filteredKeys.length" class="tpl-no-results">{{ keys.length ? '没有匹配的模板' : '暂无消息模板' }}</p>
      </div>
      <footer class="tpl-list-footer"><SvgIcon name="information-circle" :size="13" /><span>选择模板后编辑<br />右侧同步查看消息效果</span></footer>
    </aside>
    <div class="tpl-mobile-picker"><label for="tpl-select">选择模板</label><select id="tpl-select" v-model="selectedKey"><option v-for="key in keys" :key="key" :value="key">{{ LABELS[key]?.[0] || key }} · {{ key }}</option></select></div>
    <template v-if="selectedKey && variants.length">
      <section class="tpl-editor" aria-label="模板内容编辑">
        <header class="tpl-editor-heading"><span class="tpl-heading-icon"><SvgIcon name="edit" :size="17" /></span><div><h2>{{ selectedLabel }}</h2><span>{{ LABELS[selectedKey]?.[1] || '自定义消息模板' }}</span></div><code>{{ selectedKey }}</code></header>
        <div class="tpl-editor-body">
          <div v-if="Array.isArray(selectedTemplate)" class="tpl-variant-row"><label for="tpl-variant">模板版本</label><select id="tpl-variant" v-model="variantIndex"><option v-for="(entry, index) in variants" :key="index" :value="index">{{ variantLabel(entry, index) }}</option></select><label for="tpl-appid">AppID</label><input id="tpl-appid" :value="currentEntry?.appid || ''" placeholder="留空为通用模板" @input="updateAppid" @compositionend="updateAppid" /></div>
          <div class="tpl-section-heading"><h3>消息内容</h3><span>支持 Markdown 与模板变量</span></div>
          <div class="tpl-content-card">
            <div class="tpl-content-tabs" aria-label="编辑消息格式"><button v-for="field in CONTENT_FIELDS" :key="field.key" :aria-pressed="contentField === field.key" :class="{ active: contentField === field.key }" @click="contentField = field.key">{{ field.label }}<i v-if="typeof currentEntry === 'string' ? field.key === 'content' : Object.hasOwn(currentEntry || {}, field.key)" /></button><span class="tpl-char-count">{{ getContent(contentField).length }} 字</span></div>
            <textarea ref="contentEditor" class="tpl-content-input" :value="getContent(contentField)" :aria-label="`${contentField} 消息内容`" :placeholder="`输入${CONTENT_FIELDS.find(field => field.key === contentField)?.label}内容…`" rows="9" spellcheck="false" @input="updateContent" @compositionend="updateContent" />
            <div class="tpl-content-footer"><span>{{ hasCurrentField ? '当前格式已单独设置' : '未单独设置，预览使用其他格式的内容' }}</span><button v-if="hasCurrentField && typeof currentEntry !== 'string'" title="删除当前格式字段，恢复使用其他格式的内容" @click="useFallback">使用回退内容</button></div>
          </div>
          <div class="tpl-variables"><span>插入变量</span><div><button v-for="(_, key) in variables" :key="key" :title="`在光标处插入 {${key}}`" @click="insertVariable(key)">{{ variableToken(key) }}</button></div></div>
          <div class="tpl-section-heading tpl-buttons-heading"><h3><SvgIcon name="grid" :size="14" />交互按钮</h3><span>YAML · 每个数组为一行按钮</span></div>
          <textarea class="tpl-buttons-input" :class="{ 'is-invalid': parsedButtons.error }" :value="buttonsText" aria-label="模板按钮 YAML" :aria-invalid="!!parsedButtons.error" :aria-describedby="parsedButtons.error ? 'tpl-buttons-error' : undefined" rows="4" spellcheck="false" placeholder='[[{text: "菜单", data: "/菜单", enter: true, style: 1}]]' @input="updateButtons" @compositionend="updateButtons" />
          <p v-if="parsedButtons.error" id="tpl-buttons-error" class="tpl-error" role="alert"><SvgIcon name="alert-circle" :size="13" />{{ parsedButtons.error }}</p>
          <details class="tpl-button-help"><summary>按钮格式说明<SvgIcon name="chevron-forward" :size="12" /></summary><p><code>text</code> 按钮文字，<code>data</code> 回调内容，<code>link</code> 跳转链接；<code>style: 1</code> 为蓝色，<code>enter: true</code> 自动发送。支持多行按钮。</p><pre>[[{text: "菜单", data: "/菜单", style: 1}],
 [{text: "帮助", data: "/帮助", enter: true}]]</pre></details>
          <div class="tpl-editor-note"><SvgIcon name="information-circle" :size="14" /><span>修改会保留在当前页面，点击右上角「保存配置」后生效。</span></div>
        </div>
      </section>
      <aside class="tpl-preview" aria-label="消息预览">
        <header class="tpl-preview-heading"><h3><SvgIcon name="eye" :size="17" />消息预览</h3><span><i />实时</span></header>
        <div class="tpl-preview-modes" aria-label="预览消息格式"><button :class="{ active: previewMode === 'markdown' }" :aria-pressed="previewMode === 'markdown'" @click="previewMode = 'markdown'">Markdown</button><button :class="{ active: previewMode === 'text' }" :aria-pressed="previewMode === 'text'" @click="previewMode = 'text'">纯文本</button></div>
        <div class="tpl-preview-body">
          <div class="tpl-chat-date"><span>{{ selectedLabel }}</span></div>
          <article class="tpl-chat-message">
            <MessageAvatar src="/web/favicon.png" :name="currentBot?.name || 'Elaina'" :size="31" />
            <div class="tpl-chat-main"><div class="tpl-chat-meta"><strong>{{ currentBot?.name || 'Elaina' }}</strong><span>机器人</span><small>刚刚</small></div><div class="tpl-bubble">
              <MessageContent v-if="previewMode === 'markdown' && previewContent" :content="previewContent" :mentions="{ [variables.user_id]: '示例用户' }" @preview-image="previewImage = $event" />
              <div v-else-if="previewContent" class="tpl-plain-text">{{ previewContent }}</div>
              <p v-else class="tpl-empty-content">在左侧输入内容，这里会同步显示消息效果</p>
              <div v-if="previewMode === 'markdown' && previewButtons.length" class="tpl-keyboard"><div v-for="(row, rowIndex) in previewButtons" :key="rowIndex" class="tpl-keyboard-row"><button v-for="(button, index) in row" :key="index" type="button" :class="{ primary: Number(button.style) === 1 }" :title="`${substitute(button.link || button.data || button.text)} · 仅预览`" @click.prevent><span>{{ substitute(button.text || '未命名按钮') }}</span><SvgIcon v-if="button.link" name="open-outline" :size="11" /></button></div></div>
            </div></div>
          </article>
          <p v-if="parsedButtons.error" class="tpl-preview-warning">按钮格式有误，修正后将显示按钮预览</p>
          <div class="tpl-preview-caption"><SvgIcon name="information-circle" :size="12" /><span>当前使用{{ previewSource }}{{ previewMode === 'text' ? ' · 纯文本模式不显示按钮' : '' }}<br />预览效果以实际 QQ 客户端为准</span></div>
          <details class="tpl-sample-values"><summary><SvgIcon name="code" :size="14" />预览变量<span>仅影响预览</span><SvgIcon name="chevron-forward" :size="12" /></summary><div><label v-for="(_, key) in variables" :key="key"><code>{{ variableToken(key) }}</code><input v-model="variables[key]" :aria-label="`预览变量 ${key}`" /></label></div></details>
        </div>
      </aside>
    </template>
    <div v-else class="tpl-empty"><SvgIcon name="chatbubbles" :size="30" /><h3>暂无可编辑的消息模板</h3><p>可以在 YAML 模式中添加模板，再切回可视化编辑。</p></div>
    <div v-if="previewImage" class="tpl-image-overlay" role="dialog" aria-modal="true" aria-label="图片预览" @click="previewImage = ''"><button aria-label="关闭图片预览" @click="previewImage = ''"><SvgIcon name="x" :size="22" /></button><img :src="previewImage" alt="模板消息图片" /></div>
  </div>
</template>

<style scoped src="./templates.css"></style>
