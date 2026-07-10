import '@fontsource-variable/inter'
import '@fontsource-variable/noto-sans-tc'
import './assets/css/main.css'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import ui from '@nuxt/ui/vue-plugin'
import App from './App.vue'

const app = createApp(App)
// Nuxt UI 元件內部會用到 RouterLink；本 app 無路由，掛空路由即可
app.use(createRouter({ history: createWebHistory(), routes: [] }))
app.use(ui)
app.mount('#app')
