// 用瀏覽器內建 DOMParser 解析 RSS 2.0 / Atom，正規化成統一結構。

import type { Item, ParsedFeed } from '../types'

const text = (parent: ParentNode, sel: string) =>
  parent.querySelector(sel)?.textContent?.trim() || ''

// 摘要去 HTML 標籤、截斷，避免列表塞滿整篇內文
function plain(html: string, max = 280): string {
  const s = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return s.length > max ? s.slice(0, max) + '…' : s
}

function parseRss(doc: Document): ParsedFeed {
  const channelTitle = text(doc, 'channel > title')
  const items: Item[] = [...doc.querySelectorAll('item')].map((it) => {
    const link = text(it, 'link')
    return {
      id: text(it, 'guid') || link || text(it, 'title'),
      title: text(it, 'title') || '(無標題)',
      link,
      date: text(it, 'pubDate'),
      summary: plain(text(it, 'description')),
    }
  })
  return { title: channelTitle, items }
}

function parseAtom(doc: Document): ParsedFeed {
  const feedTitle = text(doc, 'feed > title')
  const items: Item[] = [...doc.querySelectorAll('entry')].map((en) => {
    // 取 rel=alternate 或第一個 link 的 href
    const links = [...en.querySelectorAll('link')]
    const link =
      (links.find((l) => l.getAttribute('rel') === 'alternate') || links[0])
        ?.getAttribute('href') || ''
    return {
      id: text(en, 'id') || link || text(en, 'title'),
      title: text(en, 'title') || '(無標題)',
      link,
      date: text(en, 'updated') || text(en, 'published'),
      summary: plain(text(en, 'summary') || text(en, 'content')),
    }
  })
  return { title: feedTitle, items }
}

export function parseFeed(xml: string): ParsedFeed {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('XML 解析失敗')
  if (doc.querySelector('feed > entry, feed > title')) return parseAtom(doc)
  if (doc.querySelector('rss, channel')) return parseRss(doc)
  throw new Error('不是有效的 RSS/Atom feed')
}
