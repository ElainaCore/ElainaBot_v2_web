<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: { default: '' },
  prefix: { type: String, default: 'config' },
})
const emit = defineEmits(['update:modelValue'])
const focused = ref(false)
const inputId = `${props.prefix}-${props.field.path.replaceAll('.', '-')}`

function format(value) {
  if (props.field.type === 'blacklist') {
    if (Array.isArray(value)) return value.join('\n')
    return Object.entries(value || {}).map(([id, reason]) => reason ? `${id} ${reason}` : id).join('\n')
  }
  if (Array.isArray(value)) return value.join(', ')
  return String(value ?? '')
}
const draft = ref(format(props.modelValue))
watch(() => props.modelValue, value => { if (!focused.value) draft.value = format(value) })

function update(event) {
  draft.value = event.target.value
  if (event.isComposing) return
  let value = draft.value
  if (props.field.type === 'number') {
    if (!value.trim() || !Number.isFinite(Number(value))) return
    value = Number(value)
  } else if (props.field.type === 'list') {
    value = value.split(',').map(item => item.trim()).filter(Boolean)
  } else if (props.field.type === 'host') {
    const hosts = value.split(',').map(item => item.trim()).filter(Boolean)
    value = hosts.length > 1 ? hosts : (hosts[0] || '')
  } else if (props.field.type === 'blacklist') {
    value = Object.fromEntries(value.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
      const match = /^(\S+)(?:\s+(.*))?$/.exec(line)
      return [match[1], match[2] || null]
    }))
  }
  emit('update:modelValue', value)
}
function blur() { focused.value = false; draft.value = format(props.modelValue) }
</script>

<template>
  <div class="cfg-field" :class="{ 'cfg-field--switch': field.type === 'boolean', 'cfg-field--full': field.full }">
    <label :for="inputId" class="cfg-field-label">{{ field.label }}</label>
    <label v-if="field.type === 'boolean'" class="cfg-switch" :class="{ 'is-on': !!modelValue }">
      <input :id="inputId" type="checkbox" role="switch" :checked="!!modelValue" @change="emit('update:modelValue', $event.target.checked)" />
      <span aria-hidden="true" />
    </label>
    <select v-else-if="field.type === 'select'" :id="inputId" :value="modelValue" @change="emit('update:modelValue', $event.target.value)">
      <option v-for="option in field.options" :key="option.value ?? option" :value="option.value ?? option">{{ option.label ?? option }}</option>
    </select>
    <textarea v-else-if="field.type === 'blacklist' || field.type === 'textarea'" :id="inputId" :value="draft" :rows="field.rows || 3" :placeholder="field.placeholder" @focus="focused = true" @blur="blur" @input="update" @compositionend="update" />
    <input v-else :id="inputId" :type="['password', 'number', 'time'].includes(field.type) ? field.type : 'text'" :value="draft" :min="field.min" :max="field.max" :step="field.step" :placeholder="field.placeholder" :autocomplete="field.type === 'password' ? 'new-password' : 'off'" @focus="focused = true" @blur="blur" @input="update" @compositionend="update" />
    <p v-if="field.hint" class="cfg-field-hint">{{ field.hint }}</p>
  </div>
</template>
