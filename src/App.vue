<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useFeeds } from './composables/useFeeds'
import { useKeyNav } from './composables/useKeyNav'
import { parseOpml, downloadOpml } from './lib/opml'
import type { FeedMeta, Selection } from './types'
import { zh_tw } from '@nuxt/ui/locale'
import Sidebar from './components/Sidebar.vue'
import Toolbar from './components/Toolbar.vue'
import ArticleList from './components/ArticleList.vue'
import ImportDialog from './components/ImportDialog.vue'

const f = useFeeds()
const { helpOpen } = useKeyNav() // 全鍵盤導航（WASD 漫遊 + 快速鍵）；helpOpen 由 ? 開啟

// 快速鍵說明內容（與 useKeyNav 的實際綁定對應）
const shortcutGroups = [
  { title: '導航', items: [
    { desc: '移動選取框（側欄／工具列／列表間漫遊）', keys: ['W', 'A', 'S', 'D'] },
    { desc: '同上（方向鍵亦可）', keys: ['↑', '←', '↓', '→'] },
    { desc: '開啟／選取目前項目', keys: ['Enter'] },
    { desc: '離開／退回上一層', keys: ['Esc'] },
  ] },
  { title: '文章', items: [
    { desc: '下一篇 / 上一篇', keys: ['J', 'K'] },
    { desc: '開啟原文', keys: ['O', 'Enter'] },
    { desc: '收藏 / 取消收藏', keys: ['B'] },
    { desc: '標示已讀', keys: ['M'] },
  ] },
  { title: '全域', items: [
    { desc: '全部重新整理', keys: ['R'] },
    { desc: '聚焦搜尋框', keys: ['/'] },
    { desc: '開啟訂閱選單（改名／刪除／分類…）', keys: ['E'] },
    { desc: '顯示這份說明', keys: ['?'] },
  ] },
  { title: '選單開啟時', items: [
    { desc: '在選單內移動', keys: ['W', 'A', 'S', 'D'] },
    { desc: '同上（使用方向鍵）', keys: ['↑', '←', '↓', '→'] },
    { desc: '選擇', keys: ['Enter'] },
    { desc: '關閉', keys: ['Esc'] },
  ] },
]
const selection = ref<Selection>({ type: 'all' })
const search = ref('')
const sidebarOpen = ref(false) // 手機抽屜開關；桌機 md 以上常駐

// OPML 匯入對話框
const importOpen = ref(false)
const pendingFeeds = ref<FeedMeta[]>([])
const existingUrls = computed(() => new Set(f.state.feeds.map((x) => x.url)))
const existingCategories = computed(() => [...f.categories.value.keys()].filter((c) => c !== '未分類'))

function select(sel: Selection) {
  selection.value = sel
  sidebarOpen.value = false // 選取後收起手機抽屜
}

async function onChangeUrl(oldUrl: string, newUrl: string) {
  const finalUrl = await f.changeFeedUrl(oldUrl, newUrl)
  // 變更成功且正選取此訂閱時，同步選取到新網址避免失效
  if (finalUrl && selection.value.type === 'feed' && selection.value.value === oldUrl)
    selection.value = { type: 'feed', value: finalUrl }
}

// 把所有 item 攤平、附上來源 feed 標題
const allItems = computed(() =>
  f.state.feeds.flatMap((feed) => feed.items.map((it) => ({ ...it, source: feed.title, feedUrl: feed.url })))
)

const visibleItems = computed(() => {
  const sel = selection.value
  // 收藏用持久化快照，不依賴目前訂閱
  let list = sel.type === 'starred' ? [...f.state.starred.values()] : allItems.value
  if (sel.type === 'feed') list = list.filter((it) => it.feedUrl === sel.value)
  else if (sel.type === 'category')
    list = list.filter((it) => {
      const feed = f.state.feeds.find((x) => x.url === it.feedUrl)
      return (feed?.category || '未分類') === sel.value
    })
  else if (sel.type === 'unread') list = list.filter((it) => !f.isRead(it.id))

  const q = search.value.trim().toLowerCase()
  if (q) list = list.filter((it) => (it.title + ' ' + it.summary).toLowerCase().includes(q))

  return [...list].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
})

const totalUnread = computed(() => allItems.value.filter((it) => !f.isRead(it.id)).length)
const totalCount = computed(() => allItems.value.length)
const starredCount = computed(() => f.state.starred.size)

// 只在選取單一訂閱源且該源抓取失敗時，於文章區顯示失敗原因
const currentError = computed(() => {
  const sel = selection.value
  if (sel.type !== 'feed') return null
  const feed = f.state.feeds.find((x) => x.url === sel.value)
  return feed?.error ? { title: feed.title, url: feed.url, error: feed.error } : null
})
function retry(url: string) {
  const feed = f.state.feeds.find((x) => x.url === url)
  if (feed) f.refreshFeed(feed)
}

function exportOpml() {
  downloadOpml(f.state.feeds.map(({ url, title, category }) => ({ url, title, category })))
}
function importOpml(xml: string) {
  let list: FeedMeta[]
  try {
    list = parseOpml(xml)
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e))
    return
  }
  if (!list.length) {
    alert('OPML 內找不到訂閱源')
    return
  }
  pendingFeeds.value = list
  importOpen.value = true
}
function onImportConfirm(list: FeedMeta[]) {
  f.importFeeds(list)
  importOpen.value = false
}

onMounted(() => {
  f.applyTheme()
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', f.applyTheme)
  f.setupPolling()
  f.refreshAll()
})
</script>

<template>
  <UApp :locale="zh_tw">
    <div class="flex h-screen overflow-hidden bg-default text-default">
      <!-- 桌機常駐側欄 -->
      <Sidebar
        class="hidden md:flex md:flex-col"
        data-nav-region="sidebar"
        collapsible
        :categories="f.categories.value"
        :selection="selection"
        :unread-of="f.unreadOf"
        :total-unread="totalUnread"
        :total-count="totalCount"
        :starred-count="starredCount"
        @select="select"
        @add="(url, cat) => f.addFeed(url, cat)"
        @remove="f.removeFeed"
        @reorder="f.moveFeed"
        @reorder-category="f.moveCategory"
        @rename="f.renameFeed"
        @change-url="onChangeUrl"
        @set-icon="f.setFeedIcon"
        @set-category="f.setFeedCategory"
        @rename-category="f.renameCategory"
        @delete-category="f.deleteCategory"
      />

      <!-- 手機抽屜 -->
      <USlideover v-model:open="sidebarOpen" side="left" :ui="{ content: 'w-[270px]' }">
        <template #content>
          <Sidebar
            :categories="f.categories.value"
            :selection="selection"
            :unread-of="f.unreadOf"
            :total-unread="totalUnread"
            :total-count="totalCount"
            :starred-count="starredCount"
            @select="select"
            @add="(url, cat) => f.addFeed(url, cat)"
            @remove="f.removeFeed"
            @reorder="f.moveFeed"
            @reorder-category="f.moveCategory"
            @rename="f.renameFeed"
            @change-url="onChangeUrl"
            @set-icon="f.setFeedIcon"
            @set-category="f.setFeedCategory"
            @rename-category="f.renameCategory"
            @delete-category="f.deleteCategory"
          />
        </template>
      </USlideover>

      <main class="flex-1 flex flex-col overflow-hidden min-w-0">
        <Toolbar
          v-model:search="search"
          data-nav-region="toolbar"
          :loading="f.state.feeds.some((x) => x.loading)"
          :theme="f.state.settings.theme"
          :interval="f.state.settings.interval"
          @toggle-sidebar="sidebarOpen = !sidebarOpen"
          @refresh="f.refreshAll"
          @mark-all-read="f.markAllRead(visibleItems)"
          @import="importOpml"
          @export="exportOpml"
          @toggle-theme="f.toggleTheme"
          @set-interval="f.setInterval"
        />
        <ArticleList
          data-nav-region="list"
          :items="visibleItems"
          :is-read="f.isRead"
          :is-starred="f.isStarred"
          :error="currentError"
          @open="(it) => f.markRead(it.id)"
          @toggle-star="f.toggleStar"
          @retry="retry"
        />
      </main>
    </div>

    <ImportDialog
      v-model:open="importOpen"
      :feeds="pendingFeeds"
      :existing-urls="existingUrls"
      :categories="existingCategories"
      @confirm="onImportConfirm"
    />

    <!-- 快速鍵說明：按 ? 開啟 -->
    <UModal v-model:open="helpOpen" title="鍵盤快速鍵說明" :ui="{ content: 'max-w-md' }">
      <template #body>
        <div class="space-y-4 text-sm">
          <section v-for="grp in shortcutGroups" :key="grp.title">
            <h3 class="mb-2 font-semibold text-highlighted">{{ grp.title }}</h3>
            <div class="space-y-1.5">
              <div v-for="row in grp.items" :key="row.desc" class="flex items-center justify-between gap-4">
                <span class="text-muted">{{ row.desc }}</span>
                <span class="flex gap-1 shrink-0">
                  <kbd
                    v-for="key in row.keys"
                    :key="key"
                    class="min-w-6 px-1.5 py-0.5 text-center rounded border border-default bg-elevated text-xs font-mono text-highlighted"
                  >{{ key }}</kbd>
                </span>
              </div>
            </div>
          </section>
        </div>
      </template>
    </UModal>
  </UApp>
</template>
