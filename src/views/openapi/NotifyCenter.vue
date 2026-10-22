<script setup>
import { computed, ref, watch } from 'vue'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import AppIcon from './AppIcon.vue'

const props = defineProps({ developerId: String, request: { type: Function, required: true } })
const emit = defineEmits(['toast'])
const PAGE_SIZE = 10
const page = ref(0)
const total = ref(0)
const messages = ref([])
const loading = ref(false)
const marking = ref(false)
const error = ref('')
const detail = ref(null)
const pages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
let requestId = 0

function html(value, inline = false) {
  const source = String(value || '')
  return DOMPurify.sanitize(inline ? marked.parseInline(source) : marked.parse(source), {
    FORBID_TAGS: ['style', 'iframe', 'form', 'input', 'button'],
    FORBID_ATTR: ['style'],
  })
}
function time(value) {
  const date = new Date(Number(value) * 1000)
  if (!value || Number.isNaN(date.getTime())) return ''
  const pad = number => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
function mediaLinks(content) {
  return [...String(content || '').matchAll(/@ocdl-s-(.+?)-e/g)].map(match => match[1]).filter(value => {
    try {
      const url = new URL(value)
      return url.protocol === 'https:' && ['qq.com', 'qpic.cn', 'myqcloud.com', 'gtimg.cn'].some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`))
    } catch { return false }
  })
}
const detailHtml = computed(() => html(detail.value?.content?.replace(/@ocdl-s-.+?-e/g, '')))

async function load(target = page.value) {
  const id = ++requestId
  loading.value = true
  error.value = ''
  try {
    const result = await props.request('/pb/AppFetchPrivateMsg', { receiver: props.developerId, page_num: target, page_size: PAGE_SIZE, appType: 2 })
    if (id !== requestId) return
    messages.value = (result.privateMsgs || []).filter(item => item.status !== 2)
    total.value = Number(result.total_count || 0)
    page.value = target
  } catch (e) {
    if (id === requestId) error.value = e.message || '获取通知失败'
  } finally { if (id === requestId) loading.value = false }
}
async function markRead(records) {
  if (marking.value || !records.length) return
  marking.value = true
  try {
    await props.request('/pb/AppOperatePrivateMsg', {
      operator: props.developerId, operation: 1,
      privateMsgs: records.map(item => ({ ...item, status: 1 })),
    })
    records.forEach(item => { item.status = 1 })
    return true
  } catch (e) { emit('toast', e.message || '标记已读失败，请重试') }
  finally { marking.value = false }
}
async function open(item) {
  detail.value = item
  if (item.status === 0) await markRead([item])
}
async function markAll() {
  if (await markRead(messages.value)) emit('toast', '已全部标记为已读')
}
watch(() => props.developerId, () => { page.value = 0; detail.value = null; load(0) }, { immediate: true })
</script>

<template>
  <section class="notify-center sec-group">
    <div class="notify-center-head"><div class="notify-center-title">全部通知</div><button class="notify-center-markall" :disabled="loading || marking || !messages.length" @click="markAll">全部已读</button></div>
    <div class="notify-center-body">
      <div v-if="loading" class="notify-empty">加载中…</div>
      <div v-else-if="error" class="notify-empty">{{ error }}<button class="btn ghost" @click="load()">重试</button></div>
      <div v-else-if="!messages.length" class="notify-empty">暂无通知</div>
      <div v-for="message in (loading || error ? [] : messages)" :key="message.message_id" :class="['notify-item', { unread: message.status === 0 }]" role="button" tabindex="0" @click="open(message)" @keydown.enter="open(message)" @keydown.space.prevent="open(message)">
        <div class="notify-item-main"><div class="notify-item-title" v-html="html(message.title, true)"></div><div class="notify-item-time">{{ time(message.send_time) }}</div></div>
      </div>
    </div>
    <div class="notify-center-foot"><span class="notify-center-count">共 {{ total }} 条</span><div v-if="pages > 1" class="notify-center-pager"><button class="notify-center-pager-btn" aria-label="上一页" :disabled="page === 0 || loading" @click="load(page - 1)"><AppIcon class="notify-center-pager-prev" name="chevron" :size="16" /></button><span class="notify-center-pager-info">{{ page + 1 }} / {{ pages }}</span><button class="notify-center-pager-btn" aria-label="下一页" :disabled="page >= pages - 1 || loading" @click="load(page + 1)"><AppIcon name="chevron" :size="16" /></button></div></div>
  </section>
  <div v-if="detail" class="modal-root">
    <div class="modal-mask" @click="detail = null"></div>
    <section class="modal notify-detail-modal" role="dialog" aria-modal="true" aria-label="通知详情">
      <button class="nd-close" aria-label="关闭" @click="detail = null"><AppIcon name="close" :size="16" /></button>
      <div class="nd-head"><h3 class="nd-title" v-html="html(detail.title, true)"></h3><div class="nd-meta"><span class="nd-time">{{ time(detail.send_time) }}</span></div></div>
      <div class="nd-body"><div class="html-body" v-html="detailHtml"></div><a v-for="url in mediaLinks(detail.content)" :key="url" :href="url" target="_blank" rel="noopener noreferrer">点击下载附件</a></div>
      <div class="nd-foot"><button class="nd-ok" @click="detail = null">我知道了</button></div>
    </section>
  </div>
</template>
