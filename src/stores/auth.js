import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from '../utils/axios'
import { responseMessage, responsePayload, responseOk } from '../utils/api'

localStorage.removeItem('elaina_token')

export const useAuthStore = defineStore('auth', () => {
  const loggedIn = ref(false)
  const checked = ref(false)
  const isLoggedIn = computed(() => loggedIn.value)
  const isWeakPassword = ref(localStorage.getItem('elaina_weak_pwd') === '1')

  async function login(password) {
    try {
      const res = await axios.post('/api/auth/login', { password })
      const data = responsePayload(res)
      if (responseOk(res)) {
        loggedIn.value = true
        checked.value = true
        setWeakPassword(!!data?.is_weak)
        return true
      }
      throw new Error(responseMessage(res, '登录失败'))
    } catch (e) {
      const msg = e.normalizedMessage || responseMessage(e.response, e.message || '登录失败')
      throw new Error(msg)
    }
  }

  function setWeakPassword(weak) {
    isWeakPassword.value = weak
    if (weak) localStorage.setItem('elaina_weak_pwd', '1')
    else localStorage.removeItem('elaina_weak_pwd')
  }

  function logout() {
    loggedIn.value = false
    checked.value = true
    localStorage.removeItem('elaina_weak_pwd')
    isWeakPassword.value = false
    axios.post('/api/auth/logout').catch(() => {})
  }

  async function checkSession() {
    try {
      loggedIn.value = responseOk(await axios.get('/api/auth/check'))
    } catch {
      loggedIn.value = false
    }
    checked.value = true
    return loggedIn.value
  }

  return { checked, isLoggedIn, isWeakPassword, setWeakPassword, login, logout, checkSession }
})
