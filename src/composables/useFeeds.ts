import { reactive, computed } from 'vue'
import { fetchText } from '../lib/proxy'
import { parseFeed } from '../lib/rss'
import type { ArticleItem, Feed, FeedMeta, Item, State, ThemeName } from '../types'

const LS_KEY = 'aiwy-rss'

// 只持久化輕量 meta，不存全文；item 啟動時重抓
function load(): State {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
    return {
      feeds: (s.feeds || []).map((f: FeedMeta) => ({ ...f, items: [], loading: false, error: '' })),
      readIds: new Set<string>(s.readIds || []),
      // ponytail: 舊版只存 starredIds（無內容），無法還原快照，直接捨棄
      starred: new Map<string, ArticleItem>((s.starred || []).map((it: ArticleItem) => [it.id, it])),
      settings: { theme: 'auto', interval: 15, ...(s.settings || {}) },
    }
  } catch {
    return { feeds: [], readIds: new Set(), starred: new Map(), settings: { theme: 'auto', interval: 15 } }
  }
}

const state = reactive<State>(load())
let pollTimer: ReturnType<typeof setInterval> | null = null

const catOf = (f: { category: string }) => f.category || '未分類'

// 純函式：把 fromUrl 那筆移到 toUrl 前/後；跨分類時採用目標的 category
export function reorder<T extends { url: string; category: string }>(
  feeds: T[],
  fromUrl: string,
  toUrl: string,
  after: boolean
): T[] {
  const from = feeds.findIndex((f) => f.url === fromUrl)
  const to = feeds.findIndex((f) => f.url === toUrl)
  if (from < 0 || to < 0 || fromUrl === toUrl) return feeds
  const next = feeds.slice()
  const [dragged] = next.splice(from, 1)
  dragged.category = feeds[to].category
  let insert = next.findIndex((f) => f.url === toUrl)
  if (after) insert++
  next.splice(insert, 0, dragged)
  return next
}

// 純函式：依分類區塊重排 feeds；分類內部順序不變
export function reorderCategories<T extends { category: string }>(
  feeds: T[],
  fromName: string,
  toName: string,
  after: boolean
): T[] {
  const order: string[] = []
  for (const f of feeds) if (!order.includes(catOf(f))) order.push(catOf(f))
  const from = order.indexOf(fromName)
  if (from < 0 || order.indexOf(toName) < 0 || fromName === toName) return feeds
  order.splice(from, 1)
  let insert = order.indexOf(toName)
  if (after) insert++
  order.splice(insert, 0, fromName)
  return order.flatMap((c) => feeds.filter((f) => catOf(f) === c))
}

function persist() {
  localStorage.setItem(
    LS_KEY,
    JSON.stringify({
      feeds: state.feeds.map(({ url, title, category, icon }) => ({ url, title, category, icon })),
      readIds: [...state.readIds],
      starred: [...state.starred.values()],
      settings: state.settings,
    })
  )
}

async function refreshFeed(feed: Feed) {
  feed.loading = true
  feed.error = ''
  try {
    const { title, items } = parseFeed(await fetchText(feed.url))
    if (title) feed.siteTitle = title
    if (title && (!feed.title || feed.title === feed.url)) feed.title = title
    feed.items = items
  } catch (e) {
    feed.error = e instanceof Error ? e.message : '抓取失敗'
  } finally {
    feed.loading = false
  }
  persist()
}

export function useFeeds() {
  const refreshAll = () => Promise.all(state.feeds.map(refreshFeed))

  async function addFeed(url: string, category = '') {
    url = url.trim()
    if (!url) return
    if (!/^https?:\/\//.test(url)) url = 'https://' + url
    if (state.feeds.some((f) => f.url === url)) return
    const feed = reactive<Feed>({ url, title: url, category: category.trim(), items: [], loading: false, error: '' })
    state.feeds.push(feed)
    persist()
    await refreshFeed(feed)
  }

  function removeFeed(url: string) {
    const i = state.feeds.findIndex((f) => f.url === url)
    if (i >= 0) state.feeds.splice(i, 1)
    persist()
  }

  function importFeeds(list: FeedMeta[]) {
    for (const f of list) addFeed(f.url, f.category)
  }

  function moveFeed(fromUrl: string, toUrl: string, after: boolean) {
    state.feeds = reorder(state.feeds, fromUrl, toUrl, after)
    persist()
  }
  function moveCategory(fromName: string, toName: string, after: boolean) {
    state.feeds = reorderCategories(state.feeds, fromName, toName, after)
    persist()
  }

  function renameFeed(url: string, title: string) {
    title = title.trim()
    const feed = state.feeds.find((f) => f.url === url)
    if (!feed) return
    feed.title = title || feed.siteTitle || feed.url // 留空→回原始網站名稱
    persist()
  }

  // 回傳最終網址（含正規化）；若被忽略則回傳 undefined，供呼叫端同步選取狀態
  async function changeFeedUrl(oldUrl: string, newUrl: string): Promise<string | undefined> {
    newUrl = newUrl.trim()
    if (!newUrl) return
    if (!/^https?:\/\//.test(newUrl)) newUrl = 'https://' + newUrl
    const feed = state.feeds.find((f) => f.url === oldUrl)
    if (!feed || newUrl === oldUrl) return
    if (state.feeds.some((f) => f.url === newUrl)) return // 與其他訂閱衝突
    feed.url = newUrl
    persist()
    await refreshFeed(feed)
    return newUrl
  }

  function setFeedIcon(url: string, icon: string) {
    const feed = state.feeds.find((f) => f.url === url)
    if (!feed) return
    feed.icon = icon.trim() || undefined
    persist()
  }

  // 設定分類並移到目標分類的最後一筆之後（無同分類則置於陣列尾端）
  function setFeedCategory(url: string, category: string) {
    category = category.trim()
    const i = state.feeds.findIndex((f) => f.url === url)
    if (i < 0 || state.feeds[i].category === category) return
    const [feed] = state.feeds.splice(i, 1)
    feed.category = category
    let last = -1
    state.feeds.forEach((f, idx) => { if (f.category === category) last = idx })
    state.feeds.splice(last + 1, 0, feed)
    persist()
  }

  function renameCategory(oldName: string, newName: string) {
    newName = newName.trim()
    if (!newName || newName === oldName) return
    state.feeds.forEach((f) => { if (f.category === oldName) f.category = newName })
    persist()
  }

  function deleteCategory(name: string) {
    state.feeds.forEach((f) => { if (f.category === name) f.category = '' })
    persist()
  }

  const markRead = (id: string, read = true) => {
    read ? state.readIds.add(id) : state.readIds.delete(id)
    persist()
  }
  const markAllRead = (items: readonly Pick<Item, 'id'>[]) => {
    items.forEach((it) => state.readIds.add(it.id))
    persist()
  }
  const isRead = (id: string) => state.readIds.has(id)

  function toggleStar(item: ArticleItem) {
    state.starred.has(item.id) ? state.starred.delete(item.id) : state.starred.set(item.id, { ...item })
    persist()
  }
  const isStarred = (id: string) => state.starred.has(id)

  // 分類 -> feeds，'' 視為「未分類」
  const categories = computed(() => {
    const m = new Map<string, Feed[]>()
    for (const f of state.feeds) {
      const c = f.category || '未分類'
      if (!m.has(c)) m.set(c, [])
      m.get(c)!.push(f)
    }
    return m
  })

  const unreadOf = (feed: Feed) => feed.items.filter((it) => !state.readIds.has(it.id)).length

  function setupPolling() {
    if (pollTimer) clearInterval(pollTimer)
    const mins = Number(state.settings.interval) || 0
    if (mins > 0) pollTimer = setInterval(refreshAll, mins * 60 * 1000)
  }
  function setInterval_(mins: number) {
    state.settings.interval = mins
    persist()
    setupPolling()
  }

  function applyTheme() {
    const t = state.settings.theme
    const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
    // Nuxt UI / Tailwind v4 以 html 的 .dark class 判斷深色
    document.documentElement.classList.toggle('dark', dark)
  }
  function toggleTheme() {
    const order: ThemeName[] = ['auto', 'light', 'dark']
    state.settings.theme = order[(order.indexOf(state.settings.theme) + 1) % 3]
    persist()
    applyTheme()
  }

  return {
    state,
    categories,
    unreadOf,
    addFeed,
    removeFeed,
    importFeeds,
    moveFeed,
    moveCategory,
    renameFeed,
    changeFeedUrl,
    setFeedIcon,
    setFeedCategory,
    renameCategory,
    deleteCategory,
    refreshFeed,
    refreshAll,
    markRead,
    markAllRead,
    isRead,
    toggleStar,
    isStarred,
    setInterval: setInterval_,
    setupPolling,
    applyTheme,
    toggleTheme,
  }
}
