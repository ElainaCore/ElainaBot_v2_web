<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import axios from '../../utils/axios'
import AppIcon from './AppIcon.vue'
const props = defineProps({ appid: String, info: { type: Object, default: () => ({}) }, request: Function })
const emit = defineEmits(['close', 'saved', 'toast'])
const editing = ref(!props.info.status)
const busy = ref(false)
const images = ref(((props.info.status === 1 ? props.info.auditing_medias : props.info.medias) || []).map(item => ({ url: item.url })))
const preview = ref('')
const statusText = computed(() => ({ 1: '审核中', 2: '已通过', 3: '审核未通过' })[props.info.status] || '未提交')
const statusClass = computed(() => ({ 1: 'reviewing', 2: 'approved', 3: 'rejected' })[props.info.status] || 'none')
const statusDescription = computed(() => ({ 1: '功能介绍图正在审核中，审核通过后将展示在机器人资料页。', 2: '当前功能介绍图已审核通过，正在机器人资料页生效展示。', 3: props.info.reject_reason || '本次提交未通过审核，请调整后重新提交。' })[props.info.status] || '上传图片，帮助用户了解机器人的功能。')
async function upload(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || busy.value || images.value.length >= 5) return
  if (!file.type.startsWith('image/')) return emit('toast', '请选择图片文件')
  if (file.size > 2 * 1024 * 1024) return emit('toast', '图片需小于 2MB')
  busy.value = true
  try {
    const form = new FormData()
    form.append('user_id', 'web_user')
    form.append('bot_appid', props.appid)
    form.append('type', '3')
    form.append('file', file)
    const { data } = await axios.post('/api/openapi/v2/upload-avatar', form)
    if (!data.success || !data.upload_id) throw new Error(data.message || '图片上传失败')
    images.value.push({ url: URL.createObjectURL(file), uploadId: data.upload_id })
  } catch (e) { emit('toast', e.message) }
  busy.value = false
}
function remove(index) {
  const image = images.value.splice(index, 1)[0]
  if (image.url.startsWith('blob:')) URL.revokeObjectURL(image.url)
}
async function submit() {
  if (busy.value) return
  busy.value = true
  try {
    await props.request('/cgi-bin/v2/info/modify', {
      bot_appid: Number(props.appid), filter: { name: 0, avatar: 0, desc: 0, feature_preview: 1 }, name: '', avatar_id: '', desc: '',
      preview_items: images.value.map(item => item.uploadId ? { upload_id: item.uploadId } : { url: item.url }),
    })
    emit('toast', images.value.length ? '功能介绍图已提交审核' : '功能介绍图已清空')
    emit('saved')
    emit('close')
  } catch (e) { emit('toast', e.message) }
  busy.value = false
}
onBeforeUnmount(() => images.value.forEach(item => { if (item.url.startsWith('blob:')) URL.revokeObjectURL(item.url) }))
</script>
<template>
  <div class="modal-root">
    <div class="modal-mask" @click="!busy && emit('close')"></div>
    <section class="modal feature-images-modal" role="dialog" aria-modal="true" aria-label="功能介绍图">
      <button class="support-close" aria-label="关闭" :disabled="busy" @click="emit('close')"><AppIcon name="close" :size="16" /></button>
      <div class="feature-images-head"><h3>功能介绍图</h3><p>最多上传 5 张，提交后需平台审核，通过后展示在机器人资料页</p></div>
      <div class="feature-images-body">
        <template v-if="!editing"><div :class="['fi-status-card', `status-${statusClass}`]"><div class="fi-status-line"><span :class="['fi-status-tag', statusClass]">{{ statusText }}</span></div><div class="fi-status-desc">{{ statusDescription }}</div></div><div class="fi-section-title">{{ info.status === 1 ? '审核中的图片' : '当前生效的图片' }}</div><div class="fi-readonly-list"><div v-for="(image, index) in images" :key="image.url" class="fi-readonly-item"><img :src="image.url" :alt="`功能介绍图 ${index + 1}`" @click="preview = image.url" /><span class="fi-readonly-index">{{ index + 1 }}</span></div></div></template>
        <template v-else><div class="fi-edit-tip">上传图片。当前 {{ images.length }} / 5 张。</div><div class="fi-grid"><div v-for="(image, index) in images" :key="image.url" class="fi-grid-item"><div class="fi-grid-thumb"><img :src="image.url" :alt="`功能介绍图 ${index + 1}`" @click="preview = image.url" /><span class="fi-grid-index">{{ index + 1 }}</span><button class="fi-grid-remove" aria-label="删除" :disabled="busy" @click="remove(index)">×</button></div></div><label v-if="images.length < 5" class="fi-grid-add"><input class="fi-grid-add-input" type="file" accept="image/*" :disabled="busy" @change="upload" /><span class="fi-grid-add-plus">+</span><span class="fi-grid-add-text">{{ busy ? '上传中…' : '添加图片' }}</span></label></div></template>
      </div>
      <div class="feature-images-foot"><span v-if="editing && info.remaining_modify_count !== undefined" class="fi-foot-quota">本月还可提交 {{ info.remaining_modify_count }} 次</span><button class="btn" :disabled="busy" @click="emit('close')">{{ editing ? '取消' : '关闭' }}</button><button v-if="editing" class="btn primary" :disabled="busy || info.remaining_modify_count === 0" @click="submit">{{ busy ? '提交中…' : '提交审核' }}</button><button v-else-if="info.status !== 1" class="btn primary" @click="editing = true">重新编辑</button></div>
    </section>
    <div v-if="preview" class="fi-lightbox" @click="preview = ''"><img :src="preview" alt="功能介绍图预览" /></div>
  </div>
</template>
