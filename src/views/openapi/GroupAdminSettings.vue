<script setup>
import { ref, reactive, computed } from 'vue'
import AppIcon from './AppIcon.vue'
const props = defineProps({ appid: String, all: Object, whitelist: Object, groups: Array, request: Function })
const emit = defineEmits(['saved', 'toast', 'manage-groups'])
const permissions = [
  { id: 202, title: '撤回消息', apis: [['撤回群聊消息', 'DELETE', '/v2/groups/{group_openid}/messages/{message_id}', 'v2_groups_group_openid_messages_message_id.delete.html']] },
  { id: 101, title: '进群管理', apis: [['入群申请列表拉取', 'GET', '/v2/groups/{group_openid}/join_request_list', 'v2_groups_group_openid_join_request_list.get.html'], ['入群申请审批', 'POST', '/v2/groups/{group_openid}/approval_join_request/{member_openid}', 'v2_groups_group_openid_approval_join_request_member_openid.post.html'], ['执行入群自动审批策略', 'POST', '/v2/groups/join_approval_strategy/{strategy_id}/execute', 'v2_groups_join_approval_strategy_strategy_id_execute.post.html']] },
  { id: 201, title: '发言管理', apis: [['查询群禁言状态', 'GET', '/v2/groups/{group_openid}/restrict_chat_setting', 'v2_groups_group_openid_restrict_chat_setting.get.html'], ['设置群成员禁言', 'POST', '/v2/groups/{group_openid}/restrict_chat_setting', 'v2_groups_group_openid_restrict_chat_setting.post.html']] },
  { id: 102, title: '移除群成员', apis: [['群成员批量移除', 'POST', '/v2/groups/{group_openid}/batch_remove_members', 'v2_groups_group_openid_batch_remove_members.post.html']] },
]
const modal = reactive({ visible: false, scope: 'all', switches: {}, expanded: [] })
const saving = ref(false)
const count = computed(() => permissions.filter(item => modal.switches[item.id]).length)
function open(scope) {
  modal.scope = scope
  modal.switches = { ...(scope === 'all' ? props.all : props.whitelist) }
  modal.expanded = []
  modal.visible = true
}
function setAll(value) { permissions.forEach(item => { modal.switches[item.id] = value }) }
function reset() { permissions.forEach(item => { modal.switches[item.id] = modal.scope === 'whitelist' || item.id !== 102 }) }
function expand(id) { modal.expanded = modal.expanded.includes(id) ? modal.expanded.filter(item => item !== id) : [...modal.expanded, id] }
async function save() {
  saving.value = true
  try {
    await props.request('/cgi-bin/v2/bot_scope_manager/dev_capability/modify', {
      bot_appid: String(props.appid), set_dev_filter: { set_group_admin_config: 1 },
      group_admin_action: { admin_scope: modal.scope === 'all' ? 2 : 1, add_group_ids: [], remove_group_ids: [], switches: permissions.map(item => ({ switch_id: item.id, current_value: modal.switches[item.id] ? 1 : 2 })) },
    })
    emit('toast', '群管理权限已保存')
    modal.visible = false
    emit('saved')
  } catch (e) { emit('toast', e.message) }
  saving.value = false
}
</script>
<template>
  <div class="group-admin-card">
    <div class="group-admin-card__header"><div class="row-label">允许机器人使用的群管理能力</div><div class="row-sub">实际使用上述能力，仍需群主在群聊内单独授权。</div></div>
    <section v-for="target in [{ key: 'all', title: '所有群聊', description: '以下权限针对除白名单群之外的群聊生效' }, { key: 'whitelist', title: '白名单群聊', description: '以下权限针对白名单群聊生效' }]" :key="target.key" class="group-admin-card__panel">
      <div class="group-admin-card__panel-head"><div class="group-admin-card__panel-copy"><div class="group-admin-card__panel-title">{{ target.title }}</div><div class="group-admin-card__panel-desc">{{ target.description }}</div></div><div class="group-admin-card__panel-actions"><button v-if="target.key === 'whitelist'" class="group-admin-card__action-button" @click="emit('manage-groups')">管理白名单群 <span>{{ groups.length }}</span></button><button class="group-admin-card__action-button" :aria-label="`设置${target.title}权限`" @click="open(target.key)">设置权限</button></div></div>
      <div class="group-admin-card__chips"><span v-for="permission in permissions" :key="permission.id" :class="['group-admin-card__chip', { 'is-on': (target.key === 'all' ? all : whitelist)[permission.id] }]"><span>{{ (target.key === 'all' ? all : whitelist)[permission.id] ? '✓' : '−' }}</span>{{ permission.title }}</span></div>
    </section>
    <div v-if="modal.visible" class="modal-root"><div class="modal-mask" @click="!saving && (modal.visible = false)"></div><section class="modal group-admin-card__modal" role="dialog" aria-modal="true" :aria-label="`编辑${modal.scope === 'all' ? '所有群聊' : '白名单群聊'}管理能力`"><div class="group-admin-card__modal-head"><div><h3 class="group-admin-card__modal-title">编辑{{ modal.scope === 'all' ? '所有群聊' : '白名单群聊' }}管理能力</h3><p class="group-admin-card__modal-sub">选择机器人可申请的权限；实际使用仍需群主在群聊内单独授权</p></div><button class="group-admin-card__close" aria-label="关闭" :disabled="saving" @click="modal.visible = false"><AppIcon name="close" :size="16" /></button></div>
      <div class="group-admin-card__modal-body"><div class="group-admin-card__editor-label">权限</div><div class="group-admin-card__permission-options"><div class="group-admin-card__selection-bar"><div class="group-admin-card__selection-summary"><label class="group-admin-card__select-all"><input class="group-admin-card__round-check" type="checkbox" :checked="count === permissions.length" :indeterminate="count > 0 && count < permissions.length" :disabled="saving" @change="setAll($event.target.checked)" />全选</label><span class="group-admin-card__selection-count">已选 {{ count }} / {{ permissions.length }} 项</span></div><button class="group-admin-card__reset" :disabled="saving" @click="reset">恢复默认设置</button></div>
        <div v-for="permission in permissions" :key="permission.id" class="group-admin-card__permission-group"><div class="group-admin-card__permission-option"><label class="group-admin-card__permission-select"><input v-model="modal.switches[permission.id]" class="group-admin-card__round-check" type="checkbox" :disabled="saving" />{{ permission.title }}</label><button class="group-admin-card__permission-expand" :aria-expanded="modal.expanded.includes(permission.id)" @click="expand(permission.id)">查看 API<AppIcon name="chevron" :size="13" :style="{ transform: modal.expanded.includes(permission.id) ? 'rotate(90deg)' : '' }" /></button></div><div :class="['group-admin-card__api-collapse', { 'is-expanded': modal.expanded.includes(permission.id) }]" :aria-hidden="!modal.expanded.includes(permission.id)"><div class="group-admin-card__api-clip"><div class="group-admin-card__api-details"><p class="group-admin-card__api-count">相关 API <span>{{ permission.apis.length }} 项</span></p><ul class="group-admin-card__api-list"><li v-for="api in permission.apis" :key="api[0]" class="group-admin-card__api-item"><div class="group-admin-card__api-heading"><span class="group-admin-card__api-name">{{ api[0] }}</span><a class="group-admin-card__api-link" :href="`https://bot.q.qq.com/wiki/develop/api-v2/autogen/api/${api[3]}`" target="_blank" rel="noopener noreferrer">查看文档<AppIcon name="external" :size="12" /></a></div><div class="group-admin-card__api-endpoint"><span>{{ api[1] }}</span><code class="group-admin-card__api-path">{{ api[2] }}</code></div></li></ul></div></div></div></div>
      </div></div><div class="group-admin-card__modal-foot"><button class="btn" :disabled="saving" @click="modal.visible = false">取消</button><button class="btn primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button></div>
    </section></div>
  </div>
</template>
