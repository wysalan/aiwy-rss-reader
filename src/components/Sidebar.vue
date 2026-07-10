<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick } from 'vue'
import type { ContextMenuItem } from '@nuxt/ui'
import type { Feed, Selection } from '../types'

const props = defineProps<{
  categories: Map<string, Feed[]>
  selection: Selection
  unreadOf: (feed: Feed) => number
  totalUnread: number
  totalCount: number
  starredCount: number
  collapsible?: boolean
}>()

// 收合成窄軌（rail）；只有桌機常駐欄（collapsible）才有效，手機抽屜永遠展開
const rail = ref(localStorage.getItem('sidebar-rail') === '1')
watch(rail, (v) => localStorage.setItem('sidebar-rail', v ? '1' : '0'))
const isRail = computed(() => !!props.collapsible && rail.value)
const emit = defineEmits<{
  select: [sel: Selection]
  add: [url: string, cat: string]
  remove: [url: string]
  reorder: [fromUrl: string, toUrl: string, after: boolean]
  reorderCategory: [fromName: string, toName: string, after: boolean]
  rename: [url: string, title: string]
  changeUrl: [oldUrl: string, newUrl: string]
  setIcon: [url: string, icon: string]
  setCategory: [url: string, category: string]
  renameCategory: [oldName: string, newName: string]
  deleteCategory: [name: string]
}>()

const url = ref('')
const cat = ref('未分類')
// 使用者當下新建、尚未落地成真正分類的暫存名稱
const extraCats = reactive<string[]>([])
// 下拉選項＝「未分類」固定置頂＋既有分類＋當下新建者，去重
const catItems = computed(() => [
  '未分類',
  ...new Set([...extraCats, ...props.categories.keys()].filter((k) => k !== '未分類')),
])

// 從訂閱網址推導網域，交給 Google favicon 服務（sz=64 在 retina 下夠銳利）
function faviconUrl(feedUrl: string): string {
  try {
    return `https://www.google.com/s2/favicons?domain=${new URL(feedUrl).hostname}&sz=64`
  } catch {
    return ''
  }
}
// 記錄載入失敗的訂閱 url，供 fallback 判斷。沿用檔內既有的 ref(new Set) 模式（見 collapsed）
const iconFailed = ref(new Set<string>())

// 記錄「已折疊」的分類名稱；預設全部展開（維持現有行為）
const collapsed = ref(new Set<string>())
function toggleCollapse(name: string) {
  collapsed.value.has(name) ? collapsed.value.delete(name) : collapsed.value.add(name)
}
// 第一下先選取檢視；已選取時再點才折疊／展開（rail 模式不折疊）
function onCategoryClick(name: string) {
  if (isSel('category', name)) toggleCollapse(name)
  else emit('select', { type: 'category', value: name })
}

// 側欄根節點（即捲動容器），供跨分類定位來源／落點列，並把查詢限縮在此實例
const root = ref<HTMLElement | null>(null)
// 飛行中的訂閱 url：期間把真實落點列設為 invisible，避免落地前提早顯示
const flyingUrl = ref<string | null>(null)
// 用 data-feed-url 找列；避開 URL 內特殊字元的選擇器轉義問題
function findRow(u: string): HTMLElement | null {
  const els = root.value?.querySelectorAll<HTMLElement>('[data-feed-url]')
  if (els) for (const el of els) if (el.dataset.feedUrl === u) return el
  return null
}

// 側欄捲簾展開（grid-rows 0fr→1fr）的時長，耦合模板中的 duration-200。
// ponytail: 與模板的 transition 時長綁定，該處若調整需同步（+20 緩衝確保動畫已收斂）
const EXPAND_MS = 220

// 變更分類：讓該訂閱從原位「飛」到新分類的落點。用 position:fixed 浮動複本疊在 body 上，
// 不受各分類 overflow-hidden（捲簾折疊）裁切。rail 窄欄或抓不到來源列則不動畫、走原路。
async function changeCategoryAnimated(u: string, category: string) {
  const src = isRail.value ? null : findRow(u)
  if (!src) return emit('setCategory', u, category)

  const first = src.getBoundingClientRect()
  const clone = src.cloneNode(true) as HTMLElement // emit 前先快照來源外觀

  emit('setCategory', u, category) // 同步重排 state.feeds

  const bucket = category || '未分類' // '' 對應顯示桶「未分類」
  const wasCollapsed = collapsed.value.has(bucket)
  collapsed.value.delete(bucket) // 目標分類若折疊 → 展開
  await nextTick()

  const dest = findRow(u)
  if (!dest) return // 落點不存在（理論上不會發生）→ 不動畫

  try {
    // 先隱藏真實落點列，並把複本停在原位，避免展開等待期間項目憑空消失
    flyingUrl.value = u
    Object.assign(clone.style, {
      position: 'fixed',
      margin: '0',
      top: `${first.top}px`,
      left: `${first.left}px`,
      width: `${first.width}px`,
      height: `${first.height}px`,
      pointerEvents: 'none',
      zIndex: '50',
    })
    document.body.appendChild(clone)

    // 目標分類剛從折疊展開 → 等捲簾動畫跑完再量落點，否則量到的是尚未展開的錯位（會瞬移）
    if (wasCollapsed) await new Promise((r) => setTimeout(r, EXPAND_MS))
    dest.scrollIntoView({ block: 'nearest' }) // 落點捲入可視範圍
    const last = dest.getBoundingClientRect()

    await clone.animate(
      [
        { transform: 'translate(0, 0)' },
        { transform: `translate(${last.left - first.left}px, ${last.top - first.top}px)` },
      ],
      { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    ).finished
  } finally {
    clone.remove()
    flyingUrl.value = null // 無論是否被打斷都清理，避免幽靈節點或某列永久隱藏
  }
}
function add() {
  if (!url.value.trim()) return
  emit('add', url.value, cat.value === '未分類' ? '' : cat.value)
  url.value = ''
  cat.value = '未分類'
}

const isSel = (type: Selection['type'], value?: string) =>
  props.selection.type === type &&
  (value === undefined || ('value' in props.selection && props.selection.value === value))

// 只有游標移到列的最左約 1/5 時才顯示刪除按鈕（CSS 的 hover 無法偵測區域，故用 mousemove）
const hoverDeleteUrl = ref<string | null>(null)
function onRowMove(e: MouseEvent, url: string) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const armed = (e.clientX - rect.left) / rect.width <= 0.2
  const target = armed ? url : null
  if (hoverDeleteUrl.value !== target) hoverDeleteUrl.value = target
}

// 原生 HTML5 拖曳排序。ponytail: 觸控裝置支援有限，此為桌機功能
type DragKind = 'feed' | 'category'
const dragKind = ref<DragKind | null>(null)
const dragKey = ref('') // 來源 feed url 或分類名
const dragOverKey = ref('') // 目前懸停的目標
const dragAfter = ref(false) // 落在目標下半 → 插在其後

function onDragStart(kind: DragKind, key: string, e: DragEvent) {
  dragKind.value = kind
  dragKey.value = key
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
// 游標在目標下半 → after；回傳是否為有效的同類拖放
function onDragOver(kind: DragKind, key: string, e: DragEvent) {
  if (dragKind.value !== kind) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  dragOverKey.value = key
  dragAfter.value = e.clientY - rect.top > rect.height / 2
}
function onDrop(kind: DragKind, key: string) {
  if (dragKind.value !== kind || dragKey.value === key) return resetDrag()
  if (kind === 'feed') emit('reorder', dragKey.value, key, dragAfter.value)
  else emit('reorderCategory', dragKey.value, key, dragAfter.value)
  resetDrag()
}
function resetDrag() {
  dragKind.value = null
  dragKey.value = ''
  dragOverKey.value = ''
}
// 插入指示線 class：懸停目標依 after 顯示上/下緣
const dropLine = (kind: DragKind, key: string) =>
  dragKind.value === kind && dragOverKey.value === key
    ? dragAfter.value
      ? 'border-b-2 border-primary'
      : 'border-t-2 border-primary'
    : ''

// 共用導覽列 class；選中時反白為主色
const NAV = 'group flex items-center gap-1.5 px-2 py-1.5 mb-1 rounded-md cursor-pointer select-none text-sm transition-colors'
const navClass = (active: boolean, mutedText = false) =>
  active ? `${NAV} bg-primary text-inverted`
         : `${NAV} ${mutedText ? 'text-dimmed' : 'text-highlighted'} hover:bg-elevated`

// 自訂圖示：圖片網址（有圖片副檔名）直接顯示；否則當網站網址取其 favicon。留空回退訂閱本身的 favicon
// ponytail: 靠副檔名判斷圖片，無副檔名的直接圖片網址（如 CDN）會被當成網站取 favicon
const IMG_URL = /\.(svg|png|ico|jpe?g|gif|webp|avif|bmp)(\?|#|$)/i
function feedIcon(f: Feed): string {
  const custom = f.icon?.trim()
  if (!custom) return faviconUrl(f.url)
  return IMG_URL.test(custom) ? custom : faviconUrl(custom)
}

// 共用「編輯單一字串」Modal，供自訂名稱／調整網址／自訂圖示網址三個動作重用
const edit = reactive<{ open: boolean; title: string; value: string; placeholder: string; save: (v: string) => void }>({
  open: false,
  title: '',
  value: '',
  placeholder: '',
  save: () => {},
})
function openEdit(title: string, current: string, save: (v: string) => void, placeholder = '') {
  edit.title = title
  edit.value = current
  edit.placeholder = placeholder
  edit.save = save
  edit.open = true
}
function confirmEdit() {
  const { save, value } = edit
  edit.open = false
  // ponytail: 延後到下一個 macrotask 才呼叫 save，避免 save 同步開出下一個 Modal（如分類衝突確認）時
  // 搶到這次 Enter 按鍵殘留的 keyup 事件，導致新 Modal 剛拿到 focus 的按鈕被誤觸發
  setTimeout(() => save(value), 0)
}

// 共用「二次確認」Modal，供刪除訂閱／移除分類／分類改名衝突三處重用
const confirm = reactive<{
  open: boolean
  title: string
  message: string
  confirmLabel: string
  confirmIcon?: string
  confirmColor: 'error' | 'primary'
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}>({
  open: false,
  title: '',
  message: '',
  confirmLabel: '確定',
  confirmColor: 'primary',
  cancelLabel: '取消',
  onConfirm: () => {},
  onCancel: () => {},
})
function openConfirm(
  title: string,
  message: string,
  opts: { confirmLabel: string; confirmIcon?: string; confirmColor?: 'error' | 'primary'; cancelLabel?: string; onConfirm: () => void; onCancel?: () => void }
) {
  confirm.title = title
  confirm.message = message
  confirm.confirmLabel = opts.confirmLabel
  confirm.confirmIcon = opts.confirmIcon
  confirm.confirmColor = opts.confirmColor ?? 'primary'
  confirm.cancelLabel = opts.cancelLabel ?? '取消'
  confirm.onConfirm = opts.onConfirm
  confirm.onCancel = opts.onCancel ?? (() => {})
  confirm.open = true
}
function doConfirm() {
  confirm.onConfirm()
  confirm.open = false
}
function doCancel() {
  confirm.onCancel()
  confirm.open = false
}
function onDeleteClick(f: Feed, e: MouseEvent) {
  if (e.shiftKey) emit('remove', f.url) // Shift 點擊：繞過確認直接刪除
  else openConfirm('刪除訂閱', `確定要刪除「${f.title}」嗎？此動作無法復原。`, { confirmLabel: '刪除', confirmIcon: 'i-lucide-trash-2', confirmColor: 'error', onConfirm: () => emit('remove', f.url) })
}

// 分類改名：新名稱撞到既有分類（含「未分類」）就先問清楚要合併還是重填，不做無聲合併
function renameCategorySubmit(name: string, v: string) {
  v = v.trim()
  if (!v || v === name) return
  if (props.categories.has(v)) {
    openConfirm('分類名稱重複', `「${v}」分類已存在，是否要合併這兩個分類？`, {
      confirmLabel: '合併',
      cancelLabel: '重新輸入',
      onConfirm: () => emit('renameCategory', name, v),
      onCancel: () => openEdit('變更分類名稱', v, (v2) => renameCategorySubmit(name, v2)),
    })
  } else {
    emit('renameCategory', name, v)
  }
}

// 右鍵情境選單項目
function categoryMenu(name: string): ContextMenuItem[] {
  if (name === '未分類') {
    return [
      { label: '此分類為自動產生，無法修改', icon: 'i-lucide-info', disabled: true },
      { type: 'separator' },
      { label: '取消', icon: 'i-lucide-x', color: 'neutral' },
    ]
  }
  return [
    { label: '變更名稱', icon: 'i-lucide-pencil', onSelect: () => openEdit('變更分類名稱', name, (v) => renameCategorySubmit(name, v)) },
    {
      label: '移除分類',
      icon: 'i-lucide-trash-2',
      color: 'error',
      onSelect: () => openConfirm('移除分類', `確定要移除「${name}」分類嗎？所有網站都將轉移到「未分類」。`, { confirmLabel: '移除', confirmIcon: 'i-lucide-trash-2', confirmColor: 'error', onConfirm: () => emit('deleteCategory', name) }),
    },
    { type: 'separator' },
    { label: '取消', icon: 'i-lucide-x', color: 'neutral' },
  ]
}
function feedMenu(f: Feed): ContextMenuItem[] {
  const cur = f.category || ''
  const named = [...props.categories.keys()].filter((k) => k !== '未分類')
  const catItem = (label: string, value: string): ContextMenuItem => ({
    label,
    type: 'checkbox',
    checked: cur === value,
    disabled: cur === value,
    onSelect: () => changeCategoryAnimated(f.url, value),
  })
  return [
    { label: '修改名稱', icon: 'i-lucide-pencil', onSelect: () => openEdit('修改顯示名稱', f.title, (v) => emit('rename', f.url, v), f.siteTitle || f.title) },
    { label: '變更網址', icon: 'i-lucide-link', onSelect: () => openEdit('調整 RSS 訂閱網址', f.url, (v) => emit('changeUrl', f.url, v)) },
    { label: '自訂圖示', icon: 'i-lucide-image', onSelect: () => openEdit('自訂圖示網址', f.icon ?? '', (v) => emit('setIcon', f.url, v), '網站網址 → Favicon；圖片網址 → 直接顯示；留空 → 自動') },
    {
      label: '設定分類',
      icon: 'i-lucide-folder',
      children: [
        catItem('無分類', ''),
        ...named.map((n) => catItem(n, n)),
        { type: 'separator' },
        {
          label: '新增分類',
          icon: 'i-lucide-folder-plus',
          onSelect: () => openEdit('新增並將訂閱移動到該分類', '', (v) => v.trim() && changeCategoryAnimated(f.url, v.trim())),
        },
      ],
    },
    { label: '刪除訂閱', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => openConfirm('刪除訂閱', `確定要刪除「${f.title}」嗎？此動作無法復原。`, { confirmLabel: '刪除', confirmIcon: 'i-lucide-trash-2', confirmColor: 'error', onConfirm: () => emit('remove', f.url) }) },
    { type: 'separator' },
    { label: '取消', icon: 'i-lucide-x', color: 'neutral' },
  ]
}
</script>

<template>
  <aside
    ref="root"
    class="h-full flex-none border-r border-default bg-muted/40 overflow-y-auto transition-[width] duration-200 ease-out"
    :class="isRail ? 'w-14 p-2' : 'w-67.5 p-3'"
  >
    <!-- 頂部與右側 Toolbar 同高：抵銷 aside 上內距，改用與 Toolbar 相同的 py-2.5 + h-8 內容高度，讓網站圖示垂直置中對齊工具列。ponytail: 高度耦合 Toolbar 的 md 控制項(h-8)，Toolbar 改尺寸時需同步 -->
    <div class="mb-3" :class="isRail ? '-mt-2' : '-mt-3'">
      <div class="flex items-center gap-3 pt-2.5" :class="isRail ? 'flex-col' : 'justify-between mx-1'">
        <h1 class="flex items-center gap-2 h-8 text-lg font-semibold">
          <UIcon name="i-lucide-rss" class="text-primary" />
          <span v-if="!isRail">aiwy RSS</span>
        </h1>
        <button
          v-if="collapsible"
          type="button"
          data-navi
          class="flex items-center justify-center rounded-md cursor-pointer transition-colors text-highlighted hover:bg-primary/10 hover:text-primary"
          :class="isRail ? 'w-full px-2 py-2.5' : 'p-1.5'"
          :title="rail ? '展開側邊欄' : '收合側邊欄'"
          :aria-label="rail ? '展開側邊欄' : '收合側邊欄'"
          @click="rail = !rail"
        >
          <UIcon :name="rail ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'" class="size-4" />
        </button>
      </div>
    </div>

    <template v-if="!isRail">
      <!-- data-navi 包裝：選取框第一層，Enter 進第二層聚焦 input -->
      <div data-navi tabindex="0" class="mb-2 rounded-md transition-colors">
        <UInput v-model="url" placeholder="貼上 RSS 訂閱網址" class="w-full" @keydown.enter="(e: KeyboardEvent) => !e.isComposing && add()" />
      </div>
      <div class="flex gap-1.5 mb-3.5">
        <div data-navi tabindex="0" class="flex-1 min-w-0 rounded-md transition-colors">
          <USelectMenu
            v-model="cat"
            :items="catItems"
            create-item
            placeholder="分類（可留空）"
            class="w-full"
            :ui="{ value: cat === '未分類' ? 'text-dimmed' : '' }"
            @create="(v: string) => { extraCats.push(v); cat = v }"
          />
        </div>
        <UButton icon="i-lucide-plus" data-navi color="primary" size="md" :ui="{ leadingIcon: 'size-4' }" title="新增訂閱" @click="add">新增</UButton>
      </div>
    </template>

    <UTooltip text="全部" :content="{ side: 'right' }" :disabled="!isRail">
      <div data-navi tabindex="0" :class="[navClass(isSel('all')), isRail && 'justify-center py-2.5']" @click="emit('select', { type: 'all' })">
        <UIcon name="i-lucide-library" :class="isRail && 'size-4'" />
        <template v-if="!isRail">
          全部
          <UBadge class="ml-auto" color="neutral" variant="subtle" size="sm">{{ totalCount }}</UBadge>
        </template>
      </div>
    </UTooltip>
    <UTooltip text="未讀" :content="{ side: 'right' }" :disabled="!isRail">
      <div data-navi tabindex="0" :class="[navClass(isSel('unread')), isRail && 'justify-center py-2.5']" @click="emit('select', { type: 'unread' })">
        <UIcon name="i-lucide-circle-dot" :class="isRail && 'size-4'" />
        <template v-if="!isRail">
          未讀
          <UBadge class="ml-auto" color="neutral" variant="subtle" size="sm">{{ totalUnread }}</UBadge>
        </template>
      </div>
    </UTooltip>
    <UTooltip text="收藏" :content="{ side: 'right' }" :disabled="!isRail">
      <div data-navi tabindex="0" :class="[navClass(isSel('starred')), isRail && 'justify-center py-2.5']" @click="emit('select', { type: 'starred' })">
        <UIcon name="i-lucide-star" :class="isRail && 'size-4'" />
        <template v-if="!isRail">
          收藏
          <UBadge class="ml-auto" color="neutral" variant="subtle" size="sm">{{ starredCount }}</UBadge>
        </template>
      </div>
    </UTooltip>
    
    <div class="mt-1.5">
      <div v-for="[name, feeds] in categories" :key="name">
        <UContextMenu :items="categoryMenu(name)">
          <UTooltip :text="name" :content="{ side: 'right' }" :disabled="!isRail">
            <div
              :class="[
                navClass(isSel('category', name), true),
                'uppercase tracking-wide font-semibold',
                isRail ? 'justify-center py-2.5 min-h-10 text-base' : 'text-sm',
                dragKind === 'category' && dragKey === name ? 'opacity-50' : '',
                dropLine('category', name),
              ]"
              data-navi
              tabindex="0"
              draggable="true"
              @click="onCategoryClick(name)"
              @dragstart.stop="onDragStart('category', name, $event)"
              @dragover="onDragOver('category', name, $event)"
              @drop.prevent="onDrop('category', name)"
              @dragend="resetDrag"
            >
              <template v-if="!isRail">
                <!-- size-3.5 = 上方導覽列圖示的 1em(14px)，讓分類名稱左緣切齊「全部/未讀/收藏」文字 -->
                <button
                  type="button"
                  class="shrink-0 rounded cursor-pointer text-inherit transition duration-200"
                  :class="collapsed.has(name) ? '-rotate-90' : ''"
                  :title="collapsed.has(name) ? '展開' : '折疊'"
                  @click.stop="toggleCollapse(name)"
                >
                  <UIcon name="i-lucide-chevron-down" class="block size-3.5" />
                </button>
                {{ name }}
              </template>
              <template v-else>
                <!-- 首字與箭頭疊在同一格，用 opacity 交叉淡入淡出 -->
                <span class="grid place-items-center">
                  <span class="col-start-1 row-start-1 transition-opacity duration-200 group-hover:opacity-0">{{ name.charAt(0) }}</span>
                  <UIcon
                    name="i-lucide-chevron-down"
                    class="col-start-1 row-start-1 size-4 opacity-0 transition duration-200 group-hover:opacity-100"
                    :class="collapsed.has(name) ? '-rotate-90' : ''"
                  />
                </span>
              </template>
            </div>
          </UTooltip>
        </UContextMenu>
        <!-- 高度捲簾：grid-rows 0fr↔1fr 純 CSS 高度動畫 -->
        <div
          class="grid transition-[grid-template-rows] duration-200 ease-out"
          :class="collapsed.has(name) ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'"
        >
          <div class="overflow-hidden">
            <UContextMenu
              v-for="f in feeds"
              :key="f.url"
              :items="feedMenu(f)"
            >
              <div
                :data-feed-url="f.url"
                class="flex items-center transition duration-200 ease-out"
                :class="[
                  !isRail && 'pl-4',
                  collapsed.has(name) ? 'opacity-0 -translate-y-1.5' : 'opacity-100 translate-y-0',
                  flyingUrl === f.url && 'invisible',
                  dragKind === 'feed' && dragKey === f.url ? 'opacity-50' : '',
                  dropLine('feed', f.url),
                ]"
                draggable="true"
                @mousemove="onRowMove($event, f.url)"
                @mouseleave="hoverDeleteUrl = null"
                @dragstart="onDragStart('feed', f.url, $event)"
                @dragover="onDragOver('feed', f.url, $event)"
                @drop.prevent="onDrop('feed', f.url)"
                @dragend="resetDrag"
              >
                <div
                  v-if="!isRail"
                  class="mb-1 overflow-hidden shrink-0 transition-all duration-200 ease-out"
                  :class="hoverDeleteUrl === f.url ? 'w-9' : 'w-0'"
                >
                  <UButton
                    icon="i-lucide-x"
                    color="neutral"
                    variant="ghost"
                    size="md"
                    :ui="{ leadingIcon: 'size-4' }"
                    class="transition-transform duration-200 ease-out"
                    :class="hoverDeleteUrl === f.url ? 'translate-x-0' : '-translate-x-2'"
                    title="刪除（Shift + 左鍵可強制刪除）"
                    @click.stop="onDeleteClick(f, $event)"
                  />
                </div>
                <UTooltip :text="f.title" :content="{ side: 'right' }" :disabled="!isRail">
                <!-- 折疊分類時，被藏起來的訂閱關掉 data-navi/tabindex，鍵盤就不會停到它 -->
                <div
                  :data-navi="collapsed.has(name) ? undefined : ''"
                  :tabindex="collapsed.has(name) ? -1 : 0"
                  :class="[navClass(isSel('feed', f.url)), 'flex-1 min-w-0', isRail && 'justify-center py-2.5']"
                  @click="emit('select', { type: 'feed', value: f.url })"
                >
                  <span class="relative flex">
                    <UIcon v-if="f.loading" name="i-lucide-loader-circle" class="animate-spin shrink-0" :class="isRail && 'size-4'" />
                    <UIcon v-else-if="f.error" name="i-lucide-triangle-alert" class="text-warning shrink-0" :class="isRail && 'size-4'" title="抓取失敗" />
                    <template v-else>
                      <img
                        v-if="feedIcon(f) && !iconFailed.has(f.url)"
                        :src="feedIcon(f)"
                        alt=""
                        class="size-4 rounded-full shrink-0 object-cover"
                        @error="iconFailed.add(f.url)"
                      />
                      <!-- 展開：失敗就不顯示（空 span，與現況一致）；rail：失敗才 fallback 第一個字 -->
                      <span v-else-if="isRail" class="uppercase font-semibold text-base">{{ f.title.charAt(0) }}</span>
                    </template>
                    <span v-if="isRail && !f.loading && unreadOf(f) > 0" class="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary" />
                  </span>
                  <template v-if="!isRail">
                    <span class="overflow-hidden text-ellipsis whitespace-nowrap">{{ f.title }}</span>
                    <UBadge class="ml-auto" color="neutral" variant="subtle" size="sm">{{ unreadOf(f) }}</UBadge>
                  </template>
                </div>
                </UTooltip>
              </div>
              </UContextMenu>
          </div>
        </div>
      </div>
    </div>

    <!-- 共用編輯 Modal：自訂名稱／調整網址／自訂圖示網址 -->
    <UModal v-model:open="edit.open" :title="edit.title">
      <template #body>
        <UInput v-model="edit.value" :placeholder="edit.placeholder" autofocus class="w-full" @keydown.enter="(e: KeyboardEvent) => !e.isComposing && confirmEdit()" />
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="() => { edit.open = false }">取消</UButton>
          <UButton @click="confirmEdit">儲存</UButton>
        </div>
      </template>
    </UModal>

    <!-- 共用二次確認 Modal：刪除訂閱／移除分類／分類改名衝突 -->
    <UModal v-model:open="confirm.open" :title="confirm.title">
      <template #body>
        <p>{{ confirm.message }}</p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton color="neutral" variant="ghost" @click="doCancel">{{ confirm.cancelLabel }}</UButton>
          <UButton :color="confirm.confirmColor" :icon="confirm.confirmIcon" @click="doConfirm">{{ confirm.confirmLabel }}</UButton>
        </div>
      </template>
    </UModal>
  </aside>
</template>
