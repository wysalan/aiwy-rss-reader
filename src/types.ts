// 全專案共用型別

export interface Item {
  id: string
  title: string
  link: string
  date: string
  summary: string
}

export interface ParsedFeed {
  title: string
  items: Item[]
}

// 只需持久化的訂閱 meta
export interface FeedMeta {
  url: string
  title: string
  category: string
  icon?: string // 自訂圖示網址，選填；空則回退 favicon
}

// 執行期的訂閱（含抓回來的內容與狀態）
export interface Feed extends FeedMeta {
  items: Item[]
  loading: boolean
  error: string
  siteTitle?: string // 從 feed 讀到的原始名稱；不持久化，重抓時補回
}

// 文章列表用：item 攤平後附上來源
export interface ArticleItem extends Item {
  source: string
  feedUrl: string
}

export type ThemeName = 'auto' | 'light' | 'dark'

export interface Settings {
  theme: ThemeName
  interval: number
}

export interface State {
  feeds: Feed[]
  readIds: Set<string>
  // 收藏存整篇快照，才能在移除訂閱／重開／文章掉出 feed 後仍可讀
  starred: Map<string, ArticleItem>
  settings: Settings
}

// 側邊欄的篩選選取狀態
export type Selection =
  | { type: 'all' }
  | { type: 'unread' }
  | { type: 'starred' }
  | { type: 'feed'; value: string }
  | { type: 'category'; value: string }
