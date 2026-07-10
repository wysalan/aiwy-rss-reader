/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

// Fontsource 純 CSS 套件無型別宣告，補上讓 side-effect import 通過 vue-tsc
declare module '@fontsource-variable/*'
