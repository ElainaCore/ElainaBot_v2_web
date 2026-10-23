<script setup>
import { computed, onUnmounted } from 'vue'
import { renderMessageMarkdown, safeResourceUrl } from '../../utils/messageMarkdown'
import { copyText } from '../../utils/clipboard'

const props = defineProps({
  content: { type: String, default: '' },
  mentions: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['preview-image', 'media-load'])
const html = computed(() => renderMessageMarkdown(props.content, props.mentions))
const timers = new Set()

async function onClick(event) {
  const target = event.target instanceof Element ? event.target : null
  const copy = target?.closest('[data-copy-code]')
  if (copy) {
    const code = copy.closest('.md-code-block')?.querySelector('pre code')?.textContent || ''
    copy.textContent = (await copyText(code)) ? '已复制' : '复制失败'
    const timer = setTimeout(() => {
      copy.textContent = '复制代码'
      timers.delete(timer)
    }, 1800)
    timers.add(timer)
    return
  }
  const placeholder = target?.closest('[data-image-src]')
  if (placeholder) {
    const url = safeResourceUrl(placeholder.dataset.imageSrc)
    if (!url) return
    const image = document.createElement('img')
    image.src = url
    image.alt = placeholder.dataset.imageAlt || '消息图片'
    image.className = 'md-image'
    image.referrerPolicy = 'no-referrer'
    image.tabIndex = 0
    image.setAttribute('role', 'button')
    image.setAttribute('aria-label', `预览图片：${image.alt}`)
    placeholder.replaceWith(image)
    image.focus({ preventScroll: true })
    return
  }
  const image = target?.closest('img.md-image')
  if (image) emit('preview-image', image.src)
}

function onKeydown(event) {
  if (event.target?.matches('img.md-image') && ['Enter', ' '].includes(event.key)) {
    event.preventDefault()
    emit('preview-image', event.target.src)
  }
}

function onImageError(event) {
  if (!(event.target instanceof HTMLImageElement)) return
  const image = event.target
  const fallback = document.createElement('span')
  fallback.className = 'md-image-error'
  fallback.textContent = `图片加载失败 · ${image.alt || '消息图片'}`
  image.replaceWith(fallback)
  emit('media-load')
}

onUnmounted(() => {
  timers.forEach(clearTimeout)
})
</script>

<template>
  <div
    class="message-markdown"
    @click="onClick"
    @keydown="onKeydown"
    @load.capture="emit('media-load')"
    @error.capture="onImageError"
    v-html="html"
  />
</template>

<style scoped>
.message-markdown {
  min-width: 0;
  max-width: 100%;
  font-size: 14px;
  line-height: 1.65;
  color: inherit;
  overflow-wrap: anywhere;
  word-break: normal;
}
.message-markdown :deep(> :first-child) {
  margin-top: 0;
}
.message-markdown :deep(> :last-child) {
  margin-bottom: 0;
}
.message-markdown :deep(p) {
  margin: 0.4em 0;
  white-space: break-spaces;
}
.message-markdown :deep(h1),
.message-markdown :deep(h2),
.message-markdown :deep(h3),
.message-markdown :deep(h4),
.message-markdown :deep(h5),
.message-markdown :deep(h6) {
  margin: 0.75em 0 0.35em;
  font-weight: 650;
  line-height: 1.45;
  letter-spacing: -0.02em;
}
.message-markdown :deep(h1) {
  font-size: 1.55em;
}
.message-markdown :deep(h2) {
  font-size: 1.3em;
}
.message-markdown :deep(h3) {
  font-size: 1.13em;
}
.message-markdown :deep(h4),
.message-markdown :deep(h5),
.message-markdown :deep(h6) {
  font-size: 1em;
}
.message-markdown :deep(a) {
  color: var(--accent);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--accent) 40%, transparent);
  text-underline-offset: 3px;
}
.message-markdown :deep(a:hover) {
  text-decoration-color: currentColor;
}
.message-markdown :deep(code) {
  font-family: 'Cascadia Code', 'SFMono-Regular', Consolas, monospace;
  font-size: 0.88em;
}
.message-markdown :deep(:not(pre) > code) {
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: color-mix(in srgb, var(--bg3) 65%, transparent);
  color: var(--text);
}
.message-markdown :deep(.md-code-block) {
  margin: 0.6em 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg2);
  color: var(--text);
}
.message-markdown :deep(.md-code-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 7px 13px;
  border-bottom: 1px solid var(--border);
  background: var(--bg3);
  color: var(--text2);
  font-size: 11px;
  line-height: 1.5;
  font-family: 'Cascadia Code', Consolas, monospace;
}
.message-markdown :deep(.md-code-header button) {
  padding: 2px 4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text2);
  font: inherit;
  cursor: pointer;
}
.message-markdown :deep(.md-code-header button:hover) {
  color: var(--accent);
  background: var(--accent-soft);
}
.message-markdown :deep(pre) {
  margin: 0;
  max-width: 100%;
  padding: 10px 12px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  white-space: pre;
  word-break: normal;
  overflow-wrap: normal;
  line-height: 1.75;
  tab-size: 4;
}
.message-markdown :deep(pre code) {
  display: block;
  min-width: max-content;
  font-size: 12px;
}
.message-markdown :deep(blockquote) {
  margin: 0.7em 0;
  padding: 7px 12px;
  border-left: 2px solid color-mix(in srgb, var(--text2) 28%, var(--border));
  border-radius: 0 7px 7px 0;
  background: color-mix(in srgb, var(--text2) 5%, var(--bg2));
  color: var(--text2);
  font-size: 0.9em;
  line-height: 1.65;
}
.message-markdown :deep(blockquote > :first-child) {
  margin-top: 0;
}
.message-markdown :deep(blockquote > :last-child) {
  margin-bottom: 0;
}
.message-markdown :deep(ul),
.message-markdown :deep(ol) {
  margin: 0.45em 0;
  padding-left: 1.65em;
}
.message-markdown :deep(li) {
  padding-left: 0.15em;
}
.message-markdown :deep(li + li) {
  margin-top: 0.2em;
}
.message-markdown :deep(li > ul),
.message-markdown :deep(li > ol) {
  margin: 0.25em 0;
}
.message-markdown :deep(li > input[type='checkbox']) {
  margin-right: 7px;
  accent-color: var(--accent);
  vertical-align: middle;
}
.message-markdown :deep(li:has(> input[type='checkbox'])) {
  list-style: none;
}
.message-markdown :deep(.md-table-scroll) {
  max-width: 100%;
  overflow-x: auto;
  margin: 0.85em 0;
  border: 1px solid var(--border);
  border-radius: 9px;
  overscroll-behavior-x: contain;
}
.message-markdown :deep(table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  line-height: 1.65;
}
.message-markdown :deep(th),
.message-markdown :deep(td) {
  min-width: 80px;
  padding: 9px 13px;
  border-bottom: 1px solid var(--border);
  border-right: 1px solid var(--border);
}
.message-markdown :deep(th) {
  background: var(--bg3);
  font-weight: 600;
  white-space: nowrap;
}
.message-markdown :deep(th:not([align])),
.message-markdown :deep(td:not([align])) {
  text-align: left;
}
.message-markdown :deep(tr:last-child td) {
  border-bottom: 0;
}
.message-markdown :deep(th:last-child),
.message-markdown :deep(td:last-child) {
  border-right: 0;
}
.message-markdown :deep(tbody tr:nth-child(even)) {
  background: color-mix(in srgb, var(--bg3) 35%, transparent);
}
.message-markdown :deep(hr) {
  border: 0;
  border-top: 1px solid var(--border);
  margin: 1.2em 0;
}
.message-markdown :deep(mark) {
  padding: 1px 4px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--warning) 22%, var(--bg2));
  color: var(--text);
}
.message-markdown :deep(.md-mention) {
  display: inline;
  padding: 2px 5px;
  border-radius: 5px;
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 550;
}
.message-markdown :deep(.md-command),
.message-markdown :deep(.md-footnote) {
  color: var(--accent);
}
.message-markdown :deep(.md-image) {
  display: block;
  width: auto;
  max-width: min(100%, 240px);
  max-height: 160px;
  height: auto;
  object-fit: contain;
  margin: 4px 0;
  border-radius: 8px;
  cursor: zoom-in;
}
.message-markdown :deep(.md-image:only-child) {
  margin: 0;
}
.message-markdown :deep(.md-image-placeholder) {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 8px 12px;
  margin: 4px 0;
  border: 1px dashed color-mix(in srgb, var(--accent) 40%, var(--border));
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--accent);
  font: inherit;
  font-size: 12px;
  line-height: 1.6;
  text-align: left;
  cursor: pointer;
}
.message-markdown :deep(.md-image-placeholder small) {
  display: block;
  opacity: 0.75;
  font-size: 10px;
}
.message-markdown :deep(.md-image-symbol) {
  font-size: 26px;
}
.message-markdown :deep(.md-image-error) {
  display: block;
  padding: 10px;
  color: var(--text2);
  font-size: 12px;
}
.message-markdown :deep(.md-keyboard) {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 8px;
}
.message-markdown :deep(.md-keyboard-row) {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.message-markdown :deep(.md-keyboard-button) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  flex: 1 1 auto;
  padding: 4px 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border));
  border-radius: 7px;
  background: var(--bg2);
  color: var(--accent);
  font-size: 12px;
  text-align: center;
}
.message-markdown :deep(.md-keyboard-button.primary) {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.message-markdown :deep(.md-forward) {
  max-width: min(100%, 760px);
  margin: 4px 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg3) 38%, var(--bg2));
}
.message-markdown :deep(.md-forward-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border);
  color: var(--text2);
  font-size: 11px;
}
.message-markdown :deep(.md-forward-header span) {
  color: var(--message-muted, var(--text2));
  font-size: 10px;
}
.message-markdown :deep(.md-forward-list) {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-height: 560px;
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}
.message-markdown :deep(.md-forward-item) {
  min-width: 0;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border);
}
.message-markdown :deep(.md-forward-item:last-child) {
  border-bottom: 0;
}
.message-markdown :deep(.md-forward-meta) {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 3px;
  font-size: 10px;
}
.message-markdown :deep(.md-forward-number) {
  color: var(--text2);
  font-variant-numeric: tabular-nums;
}
.message-markdown :deep(.md-forward-sender) {
  color: var(--accent);
  font-weight: 600;
  overflow-wrap: anywhere;
}
.message-markdown :deep(.md-forward-body),
.message-markdown :deep(.md-forward-details) {
  color: var(--text);
  font-size: 12px;
  line-height: 1.65;
}
.message-markdown :deep(.md-forward-body > :first-child),
.message-markdown :deep(.md-forward-details > :first-child) {
  margin-top: 0;
}
.message-markdown :deep(.md-forward-body > :last-child),
.message-markdown :deep(.md-forward-details > :last-child) {
  margin-bottom: 0;
}
.message-markdown :deep(.md-forward-details) {
  margin-top: 5px;
  color: var(--text2);
}
.message-markdown :deep(.md-forward-empty) {
  margin: 0;
  color: var(--text2);
  font-style: italic;
}
.message-markdown :deep(button:focus-visible),
.message-markdown :deep([tabindex]:focus-visible),
.message-markdown :deep(a:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
@media (max-width: 767px) {
  .message-markdown {
    font-size: 13px;
  }
  .message-markdown :deep(.md-image) {
    max-width: min(100%, 200px);
    max-height: 140px;
  }
  .message-markdown :deep(pre) {
    padding: 12px;
  }
  .message-markdown :deep(th),
  .message-markdown :deep(td) {
    padding: 7px 10px;
  }
}
</style>
