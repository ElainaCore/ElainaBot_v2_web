<script setup>
import { onBeforeUnmount, onMounted, ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useMessage } from 'naive-ui'
import { useAuthStore } from '../stores/auth'
import { useThemeStore } from '../stores/theme'
import SvgIcon from '../components/SvgIcon.vue'

const router = useRouter()
const route = useRoute()
const message = useMessage()
const auth = useAuthStore()
const themeStore = useThemeStore()

const loading = ref(false)
const passwordVisible = ref(false)
const currentYear = new Date().getFullYear()
const appearanceMode = ref(localStorage.getItem('elaina_appearance_mode') || 'auto')
const form = reactive({ password: '' })
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')

function applyAppearance(mode, event) {
  const wantsDark = mode === 'dark' || (mode === 'auto' && systemTheme.matches)
  if (themeStore.darkMode !== wantsDark) themeStore.toggleDark(event)
}

function setAppearance(mode, event) {
  appearanceMode.value = mode
  localStorage.setItem('elaina_appearance_mode', mode)
  applyAppearance(mode, event)
}

function handleSystemThemeChange() {
  if (appearanceMode.value === 'auto') applyAppearance('auto')
}

systemTheme.addEventListener('change', handleSystemThemeChange)
applyAppearance(appearanceMode.value)
onMounted(() => document.documentElement.classList.add('login-viewport-locked'))
onBeforeUnmount(() => {
  systemTheme.removeEventListener('change', handleSystemThemeChange)
  document.documentElement.classList.remove('login-viewport-locked')
})

async function handleLogin() {
  if (!form.password) { message.warning('请输入管理员密码'); return }
  loading.value = true
  try {
    await auth.login(form.password)
    message.success('登录成功')
    const redirect = route.query.redirect || '/'
    router.push(redirect)
  } catch (e) {
    message.error(e.message || '登录失败')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <div class="pattern-layer pattern-layer-left" aria-hidden="true" />
    <div class="pattern-layer pattern-layer-right" aria-hidden="true" />

    <div class="appearance-switch" role="group" aria-label="外观模式">
      <button type="button" :class="{ active: appearanceMode === 'auto' }" title="跟随系统" :aria-pressed="appearanceMode === 'auto'" @click="setAppearance('auto', $event)">
        <SvgIcon name="desktop" :size="19" />
      </button>
      <button type="button" :class="{ active: appearanceMode === 'light' }" title="浅色模式" :aria-pressed="appearanceMode === 'light'" @click="setAppearance('light', $event)">
        <SvgIcon name="sunny" :size="19" />
      </button>
      <button type="button" :class="{ active: appearanceMode === 'dark' }" title="深色模式" :aria-pressed="appearanceMode === 'dark'" @click="setAppearance('dark', $event)">
        <SvgIcon name="moon" :size="19" />
      </button>
    </div>

    <section class="login-shell" aria-labelledby="login-title">
      <div class="brand-block">
        <div class="brand-mark"><img src="/favicon.svg" alt="" /></div>
        <div class="brand-title-row">
          <h1 id="login-title">ElainaBot v2</h1>
        </div>
        <p>QQ官方机器人框架 · 安全登录</p>
      </div>

      <form class="login-form" @submit.prevent="handleLogin">
        <label class="sr-only" for="admin-password">管理员密码</label>
        <div class="password-field">
          <SvgIcon class="field-icon" name="key" :size="22" />
          <input id="admin-password" v-model="form.password" :type="passwordVisible ? 'text' : 'password'" name="password" autocomplete="current-password" placeholder="输入管理员密码" autofocus />
          <button type="button" class="visibility-button" :title="passwordVisible ? '隐藏密码' : '显示密码'" :aria-label="passwordVisible ? '隐藏密码' : '显示密码'" @click="passwordVisible = !passwordVisible">
            <SvgIcon :name="passwordVisible ? 'eye-off' : 'eye'" :size="21" />
          </button>
        </div>

        <button class="login-button" type="submit" :disabled="loading">
          <span>{{ loading ? '正在验证...' : '进入控制台' }}</span>
          <SvgIcon v-if="!loading" name="arrow-forward" :size="20" />
          <span v-else class="loading-ring" aria-hidden="true" />
        </button>
      </form>

      <p class="copyright">© {{ currentYear }} Elaina Core. All rights reserved.</p>
    </section>

    <div class="help-wrap">
      <div id="login-help" class="help-panel" role="tooltip">
        请在项目目录的 <code>/config/settings.yaml</code> 中修改 <code>web.admin_password</code>，然后重启框架。
      </div>
      <button type="button" class="help-trigger" aria-describedby="login-help">
        <SvgIcon name="sparkles" :size="19" />
        <span>登录遇到问题？</span>
      </button>
    </div>
  </main>
</template>

<style scoped>
.login-page {
  --login-surface: rgba(255, 255, 255, .94);
  --login-line: color-mix(in srgb, var(--accent) 26%, transparent);
  position: relative;
  isolation: isolate;
  min-height: 100vh;
  min-height: 100dvh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  overflow: hidden;
  padding: 24px;
  background: color-mix(in srgb, var(--bg) 97%, var(--accent) 3%);
}

.login-page::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -3;
  opacity: .78;
  background-image:
    repeating-radial-gradient(ellipse 64% 82% at -8% 30%, transparent 0 17px, var(--login-line) 18px 19px, transparent 20px 34px),
    repeating-radial-gradient(ellipse 58% 76% at 108% 58%, transparent 0 19px, color-mix(in srgb, var(--accent) 21%, transparent) 20px 21px, transparent 22px 38px),
    repeating-radial-gradient(ellipse 74% 46% at 48% 112%, transparent 0 22px, color-mix(in srgb, var(--accent) 15%, transparent) 23px 24px, transparent 25px 44px);
}

.login-page::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -2;
  background:
    radial-gradient(75% 55% at 50% 0%, color-mix(in srgb, var(--accent) 15%, transparent), transparent 68%),
    radial-gradient(circle at center, color-mix(in srgb, var(--bg) 8%, transparent), var(--bg) 94%);
  opacity: .32;
}

.pattern-layer {
  position: absolute;
  z-index: -1;
  width: 76vw;
  min-width: 680px;
  height: 138%;
  top: -19%;
  opacity: .36;
  border: 0;
  background: repeating-radial-gradient(ellipse at center, transparent 0 18px, var(--login-line) 19px 20px, transparent 21px 37px);
  mask-image: linear-gradient(to bottom, transparent, #000 16%, #000 84%, transparent);
  pointer-events: none;
}
.pattern-layer-left { left: -43%; transform: rotate(8deg) scaleY(1.14); }
.pattern-layer-right { right: -43%; transform: rotate(-9deg) scaleY(1.12); }

.appearance-switch {
  position: fixed;
  z-index: 5;
  top: max(16px, env(safe-area-inset-top));
  right: max(16px, env(safe-area-inset-right));
  display: grid;
  grid-template-columns: repeat(3, 40px);
  height: 45px;
  box-sizing: border-box;
  padding: 3px;
  border: 1px solid rgba(31, 39, 51, .1);
  border-radius: 23px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(38, 74, 91, .08);
}
.appearance-switch button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 18px;
  background: transparent;
  color: #8a95a3;
  cursor: pointer;
  transition: color .18s;
}
.appearance-switch button::before {
  content: '';
  position: absolute;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: transparent;
  transition: background .18s, box-shadow .18s;
}
.appearance-switch button svg { position: relative; z-index: 1; width: 14px; height: 14px; }
.appearance-switch button:hover { color: #1f2733; }
.appearance-switch button.active {
  color: var(--accent);
  background: transparent;
  box-shadow: none;
}
.appearance-switch button.active::before {
  background: #fff;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent), 0 3px 10px rgba(38, 74, 91, .12);
}

.login-shell {
  width: min(448px, 100%);
  box-sizing: border-box;
  padding: 38px 40px;
  border: 1px solid rgba(31, 39, 51, .08);
  border-radius: 16px;
  background: var(--login-surface);
  color: #1f2733;
  box-shadow: 0 20px 48px rgba(38, 74, 91, .1);
}

.brand-block { text-align: center; }
.brand-mark {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  margin: 0 auto 10px;
}
.brand-mark img { width: 56px; height: 56px; object-fit: contain; }
.brand-title-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.brand-title-row h1 {
  margin: 0;
  color: #1f2733;
  font-size: 24px;
  font-weight: 650;
  line-height: 32px;
}
.brand-block p { margin: 4px 0 0; color: #5f6b7a; font-size: 12px; line-height: 16px; }

.login-form { margin-top: 24px; }
.password-field {
  height: 48px;
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) 32px;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  padding: 0 8px 0 14px;
  border: 1px solid rgba(31, 39, 51, .14);
  border-radius: 16px;
  background: #fff;
  color: #5f6b7a;
  transition: border-color .18s, box-shadow .18s, background .18s;
}
.password-field:focus-within {
  border-color: var(--accent);
  background: #fff;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent), 0 1px 2px rgba(0, 0, 0, .05);
}
.field-icon { width: 16px; height: 16px; color: #667384; }
.password-field input {
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #1f2733;
  font: inherit;
  font-size: 14px;
}
.password-field input::placeholder { color: #98a2b0; opacity: 1; }
.visibility-button {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #667384;
  cursor: pointer;
}
.visibility-button svg { width: 16px; height: 16px; }
.visibility-button:hover { background: #f3f6f9; color: #1f2733; }

.login-button {
  width: 100%;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 14px;
  border: 1px solid rgba(31, 39, 51, .12);
  border-radius: 16px;
  background: #fff;
  color: #1f2733;
  box-shadow: 0 5px 16px rgba(38, 74, 91, .1);
  font-size: 15px;
  font-weight: 550;
  cursor: pointer;
  transition: background .18s, transform .18s, box-shadow .18s;
}
.login-button svg { width: 16px; height: 16px; }
.login-button:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent) 48%, transparent);
  background: #fff;
  color: var(--accent);
  box-shadow: 0 8px 20px rgba(38, 74, 91, .13);
  transform: translateY(-1px);
}
.login-button:active:not(:disabled) { transform: translateY(0); }
.login-button:disabled { cursor: wait; opacity: .72; }
.loading-ring {
  width: 17px;
  height: 17px;
  border: 2px solid rgba(88, 101, 242, .2);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin .75s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.copyright { margin: 28px 0 0; color: #8a95a3; text-align: center; font-size: 11px; line-height: 16px; }
.help-wrap { position: relative; display: flex; flex-direction: column; align-items: center; }
.help-trigger {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 16px;
  border: 1px solid rgba(31, 39, 51, .1);
  border-radius: 18px;
  background: #fff;
  color: #5f6b7a;
  box-shadow: 0 8px 20px rgba(52, 89, 103, .08);
  font-size: 12px;
  cursor: pointer;
  transition: color .18s, border-color .18s, transform .18s;
}
.help-trigger svg { width: 14px; height: 14px; }
.help-trigger svg { color: var(--accent); }
.help-trigger:hover { color: #1f2733; border-color: var(--accent); transform: translateY(-1px); }
.help-panel {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 50%;
  width: min(430px, calc(100vw - 40px));
  box-sizing: border-box;
  padding: 14px 18px;
  border: 1px solid rgba(31, 39, 51, .1);
  border-radius: 12px;
  background: #fff;
  box-shadow: var(--shadow);
  color: #5f6b7a;
  font-size: 13px;
  line-height: 1.7;
  text-align: center;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translate(-50%, 6px);
  transition: opacity .18s, visibility .18s, transform .18s;
}
.help-panel::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  width: 9px;
  height: 9px;
  border-right: 1px solid rgba(31, 39, 51, .1);
  border-bottom: 1px solid rgba(31, 39, 51, .1);
  background: #fff;
  transform: translate(-50%, -5px) rotate(45deg);
}
.help-wrap:hover .help-panel,
.help-wrap:focus-within .help-panel {
  opacity: 1;
  visibility: visible;
  transform: translate(-50%, 0);
}
.help-panel code { color: var(--accent); font-size: 12px; }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 640px) {
  :global(html.login-viewport-locked),
  :global(html.login-viewport-locked body),
  :global(html.login-viewport-locked body #app) {
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    overscroll-behavior: none;
  }

  .login-page {
    width: 100%;
    height: 100vh;
    height: 100svh;
    min-height: 0;
    max-height: 100svh;
    justify-content: center;
    gap: 18px;
    padding: max(62px, calc(env(safe-area-inset-top) + 50px)) 16px max(16px, env(safe-area-inset-bottom));
    overflow: hidden;
    overscroll-behavior: none;
    touch-action: manipulation;
  }
  .appearance-switch {
    position: absolute;
    top: max(16px, calc(env(safe-area-inset-top) + 8px));
    right: max(16px, env(safe-area-inset-right));
    grid-template-columns: repeat(3, 40px);
    height: 45px;
    border-radius: 23px;
    box-shadow: 0 7px 22px rgba(38, 74, 91, .07);
  }
  .appearance-switch button { border-radius: 20px; }
  .login-shell {
    width: min(448px, 100%);
    padding: 32px 28px;
    border-radius: 16px;
    box-shadow: 0 22px 44px -14px color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .brand-mark { width: 56px; height: 56px; margin-bottom: 10px; }
  .brand-mark img { width: 56px; height: 56px; }
  .brand-title-row h1 { font-size: 24px; line-height: 32px; }
  .brand-block p { margin-top: 4px; font-size: 12px; }
  .login-form { margin-top: 24px; }
  .password-field {
    height: 48px;
    grid-template-columns: 16px minmax(0, 1fr) 32px;
    gap: 10px;
    padding: 0 8px 0 14px;
    border-radius: 16px;
  }
  .password-field input { font-size: 14px; }
  .visibility-button { width: 32px; height: 32px; }
  .login-button {
    height: 48px;
    gap: 8px;
    margin-top: 14px;
    border-radius: 16px;
    font-size: 15px;
  }
  .copyright { margin-top: 28px; font-size: 11px; }
  .help-trigger {
    min-height: 36px;
    gap: 7px;
    padding: 0 16px;
    border-radius: 18px;
    font-size: 12px;
  }
  .help-panel {
    width: min(360px, calc(100vw - 32px));
    padding: 12px 14px;
    font-size: 12px;
  }
}

@media (max-width: 640px) and (max-height: 700px) {
  .login-page {
    gap: 14px;
    padding-top: max(58px, calc(env(safe-area-inset-top) + 48px));
    padding-bottom: max(12px, env(safe-area-inset-bottom));
  }
  .appearance-switch {
    top: max(12px, calc(env(safe-area-inset-top) + 6px));
    grid-template-columns: repeat(3, 36px);
    height: 41px;
  }
  .login-shell { padding: 24px; border-radius: 15px; }
  .brand-mark { width: 48px; height: 48px; margin-bottom: 8px; }
  .brand-mark img { width: 48px; height: 48px; }
  .brand-title-row h1 { font-size: 22px; line-height: 29px; }
  .brand-block p { margin-top: 3px; font-size: 11px; }
  .login-form { margin-top: 18px; }
  .password-field, .login-button { height: 46px; border-radius: 14px; }
  .login-button { margin-top: 10px; }
  .copyright { margin-top: 20px; font-size: 10px; }
  .help-trigger { min-height: 34px; }
}

@media (max-height: 720px) and (min-width: 641px) {
  .login-page { justify-content: center; overflow: hidden; padding: 58px 20px 18px; }
  .login-shell { padding-top: 30px; padding-bottom: 30px; }
  .brand-mark { width: 48px; height: 48px; margin-bottom: 8px; }
  .brand-mark img { width: 48px; height: 48px; }
  .login-form { margin-top: 18px; }
  .copyright { margin-top: 22px; }
}

@media (prefers-reduced-motion: reduce) {
  .login-page *, .login-page *::before, .login-page *::after {
    scroll-behavior: auto !important;
    transition-duration: .01ms !important;
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
  }
}
</style>
