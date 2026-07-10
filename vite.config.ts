import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import ui from '@nuxt/ui/vite'

// base: './' 讓 build 後可直接丟靜態主機/子路徑
export default defineConfig({
  // colorMode: false → 深淺色由 useFeeds 自行切換 .dark class，避免與 Nuxt UI 內建搶控
  plugins: [
    vue(),
    tailwindcss(),
    ui({
      colorMode: false,
      ui: { colors: { primary: 'blue', neutral: 'slate' } },
    }),
  ],
  base: './',
  test: { environment: 'jsdom' }, // 規範正確的 DOMParser，供 rss/opml 測試
})
