<script setup lang="ts">
import { ref } from 'vue'
import type { ThemeName } from '../types'

const fileInput = ref<HTMLInputElement>()

withDefaults(
  defineProps<{
    search?: string
    loading?: boolean
    theme?: ThemeName
    interval?: number
  }>(),
  { search: '', loading: false, theme: 'auto', interval: 15 }
)
const emit = defineEmits<{
  'update:search': [value: string]
  toggleSidebar: []
  refresh: []
  markAllRead: []
  import: [xml: string]
  export: []
  toggleTheme: []
  setInterval: [mins: number]
}>()

const themeIcon: Record<ThemeName, string> = {
  auto: 'i-lucide-sun-moon',
  light: 'i-lucide-sun',
  dark: 'i-lucide-moon',
}

const intervalItems = [
  { label: '不自動更新', value: 0 },
  { label: '每 5 分鐘', value: 5 },
  { label: '每 15 分鐘', value: 15 },
  { label: '每 30 分鐘', value: 30 },
  { label: '每 60 分鐘', value: 60 },
]

function onImport(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => emit('import', reader.result as string)
  reader.readAsText(file)
  input.value = ''
}
</script>

<template>
  <div class="flex gap-2 items-center flex-wrap px-3.5 py-2.5 border-b border-default">
    <UButton
      icon="i-lucide-menu"
      color="neutral"
      variant="ghost"
      class="md:hidden"
      title="開啟訂閱清單"
      @click="emit('toggleSidebar')"
    />
    <!-- data-navi 包裝：選取框停在外層（第一層），Enter 才聚焦內部 input（第二層） -->
    <div data-navi tabindex="0" class="flex-1 min-w-30 max-w-[320px] rounded-md transition-colors">
      <UInput
        :model-value="search"
        icon="i-lucide-search"
        placeholder="搜尋標題 / 摘要"
        class="w-full"
        @update:model-value="emit('update:search', String($event))"
      />
    </div>
    <UButton
      icon="i-lucide-refresh-cw"
      data-navi
      data-shortcut="refresh"
      color="neutral"
      variant="subtle"
      :loading="loading"
      title="全部重新整理"
      @click="emit('refresh')"
    >
      <span class="hidden sm:inline">重新整理</span>
    </UButton>
    <UButton
      icon="i-lucide-check-check"
      data-navi
      color="neutral"
      variant="subtle"
      title="全部標示為已讀"
      @click="emit('markAllRead')"
    >
      <span class="hidden sm:inline">全部已讀</span>
    </UButton>

    <span class="flex-1" />

    <USelect
      :model-value="interval"
      data-navi
      :items="intervalItems"
      value-key="value"
      color="neutral"
      variant="subtle"
      title="自動更新間隔"
      @update:model-value="emit('setInterval', Number($event))"
    />

    <UButton
      icon="i-lucide-upload"
      data-navi
      color="neutral"
      variant="subtle"
      title="匯入 OPML"
      @click="fileInput?.click()"
    >
      <span class="hidden sm:inline">匯入</span>
    </UButton>
    <input ref="fileInput" type="file" accept=".opml,.xml" class="hidden" @change="onImport" />
    <UButton
      icon="i-lucide-download"
      data-navi
      color="neutral"
      variant="subtle"
      title="匯出 OPML"
      @click="emit('export')"
    >
      <span class="hidden sm:inline">匯出</span>
    </UButton>

    <UButton
      :icon="themeIcon[theme]"
      data-navi
      color="neutral"
      variant="ghost"
      :title="'主題：' + theme"
      @click="emit('toggleTheme')"
    />
  </div>
</template>
