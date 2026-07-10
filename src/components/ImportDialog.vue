<script setup lang="ts">
import { reactive, computed, watch } from 'vue'
import { resolveImportFeeds } from '../lib/opml'
import type { FeedMeta } from '../types'

const props = defineProps<{
  open: boolean
  feeds: FeedMeta[]
  existingUrls: Set<string>
  categories: string[]
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: [list: FeedMeta[]]
}>()

const KEEP = '沿用來源分類'
const UNCAT = '未分類'

// 勾選中的 url（已訂閱者永遠不在內、且禁用）
const selected = reactive(new Set<string>())
const overrideChoice = reactive({ value: KEEP })
const catItems = reactive<string[]>([])

const isExisting = (url: string) => props.existingUrls.has(url)

// 依分類分組，'' 顯示為未分類
const groups = computed(() => {
  const m = new Map<string, FeedMeta[]>()
  for (const f of props.feeds) {
    const c = f.category || UNCAT
    if (!m.has(c)) m.set(c, [])
    m.get(c)!.push(f)
  }
  return [...m.entries()]
})

// 可勾選（排除已訂閱）的 url 清單
const selectableUrls = computed(() => props.feeds.filter((f) => !isExisting(f.url)).map((f) => f.url))

// 開啟或換檔時，預設全勾（已訂閱除外），重設覆寫與分類選項
watch(
  () => [props.open, props.feeds] as const,
  ([open]) => {
    if (!open) return
    selected.clear()
    for (const url of selectableUrls.value) selected.add(url)
    overrideChoice.value = KEEP
    catItems.splice(0, catItems.length, KEEP, UNCAT, ...props.categories)
  },
  { immediate: true }
)

function toggleFeed(url: string, on: boolean | 'indeterminate') {
  on === true ? selected.add(url) : selected.delete(url)
}

// 某組 / 全體的三態
function groupState(urls: string[]): boolean | 'indeterminate' {
  const sel = urls.filter((u) => !isExisting(u) && selected.has(u)).length
  const total = urls.filter((u) => !isExisting(u)).length
  if (total === 0) return false
  return sel === 0 ? false : sel === total ? true : 'indeterminate'
}
function toggleGroup(urls: string[]) {
  const targets = urls.filter((u) => !isExisting(u))
  const allOn = targets.every((u) => selected.has(u))
  for (const u of targets) (allOn ? selected.delete(u) : selected.add(u))
}

const allUrls = computed(() => props.feeds.map((f) => f.url))
const allState = computed(() => groupState(allUrls.value))
const selectableCount = computed(() => selectableUrls.value.length)

function onConfirm() {
  const override = overrideChoice.value === KEEP ? null : overrideChoice.value === UNCAT ? '' : overrideChoice.value
  emit('confirm', resolveImportFeeds(props.feeds, selected as unknown as Set<string>, override))
}
</script>

<template>
  <UModal
    :open="open"
    title="匯入 OPML 訂閱"
    :description="`共 ${feeds.length} 個來源，已選 ${selected.size} / ${selectableCount}`"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-3 flex-wrap">
          <UCheckbox
            :model-value="allState"
            label="全選 / 全不選"
            @update:model-value="toggleGroup(allUrls)"
          />
          <span class="flex-1" />
          <span class="text-sm text-muted">套用分類</span>
          <USelectMenu
            v-model="overrideChoice.value"
            :items="catItems"
            create-item
            class="min-w-40"
            @create="(v: string) => { catItems.push(v); overrideChoice.value = v }"
          />
        </div>

        <div class="max-h-[50vh] overflow-y-auto flex flex-col gap-3 pr-1">
          <div v-for="[cat, list] in groups" :key="cat" class="flex flex-col gap-1.5">
            <UCheckbox
              :model-value="groupState(list.map((f) => f.url))"
              :label="cat"
              :ui="{ label: 'font-semibold' }"
              @update:model-value="toggleGroup(list.map((f) => f.url))"
            />
            <div class="pl-6 flex flex-col gap-1">
              <div v-for="f in list" :key="f.url" class="flex items-center gap-2">
                <UCheckbox
                  :model-value="!isExisting(f.url) && selected.has(f.url)"
                  :disabled="isExisting(f.url)"
                  :label="f.title"
                  :description="f.url"
                  @update:model-value="toggleFeed(f.url, $event)"
                />
                <UBadge v-if="isExisting(f.url)" color="neutral" variant="subtle" size="sm">已訂閱</UBadge>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton color="neutral" variant="ghost" @click="emit('update:open', false)">取消</UButton>
        <UButton :disabled="selected.size === 0" @click="onConfirm">
          匯入 {{ selected.size }} 個來源
        </UButton>
      </div>
    </template>
  </UModal>
</template>
