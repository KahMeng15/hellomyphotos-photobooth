import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import axios from 'axios'

const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '')
axios.interceptors.request.use((config) => {
  if (config.url && config.url.startsWith('/api/')) {
    config.url = baseUrl + config.url
  }
  return config
})

import Vue3Toastify, { type ToastContainerOptions } from 'vue3-toastify';
import 'vue3-toastify/dist/index.css';
import './styles/main.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.use(Vue3Toastify, {
  autoClose: 3000,
  position: 'bottom-right',
  theme: 'dark'
} as ToastContainerOptions);

app.mount('#app')
