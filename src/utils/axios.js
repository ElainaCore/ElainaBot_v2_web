import axios from 'axios'
import { responseMessage } from './api'

const instance = axios.create({
  baseURL: '',
  timeout: 30000,
})

instance.interceptors.response.use(
  res => res,
  error => {
    error.normalizedMessage = responseMessage(error.response, error.message || '请求失败')
    if (error.response?.status === 401 && !['/api/auth/login', '/api/auth/check'].includes(error.config?.url)) {
      window.location.href = '/web/login'
    }
    return Promise.reject(error)
  }
)

export default instance
