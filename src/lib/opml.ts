// OPML 匯入 / 匯出，純原生（DOMParser + Blob）。

import type { FeedMeta } from '../types'

// 解析 OPML 字串 -> [{ url, title, category }]
export function parseOpml(xml: string): FeedMeta[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('OPML 解析失敗')
  const feeds: FeedMeta[] = []
  for (const o of doc.querySelectorAll('outline[xmlUrl]')) {
    const url = o.getAttribute('xmlUrl') || ''
    // 巢狀 outline：父層 outline 的 title/text 當分類
    const parent = o.parentElement
    const category =
      parent && parent.tagName.toLowerCase() === 'outline'
        ? parent.getAttribute('title') || parent.getAttribute('text') || ''
        : ''
    feeds.push({
      url,
      title: o.getAttribute('title') || o.getAttribute('text') || url,
      category,
    })
  }
  return feeds
}

// 由對話框的勾選與覆寫組出最終匯入清單（純函式，方便測試）
// override: null = 沿用來源分類；'' = 未分類；其他 = 指定分類名
export function resolveImportFeeds(
  feeds: FeedMeta[],
  selectedUrls: Set<string>,
  override: string | null
): FeedMeta[] {
  return feeds
    .filter((f) => selectedUrls.has(f.url))
    .map((f) => (override === null ? f : { ...f, category: override }))
}

const esc = (s: string) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

// feeds: [{url,title,category}] -> OPML 字串，依分類分組巢狀
export function buildOpml(feeds: FeedMeta[]): string {
  const byCat = new Map<string, FeedMeta[]>()
  for (const f of feeds) {
    const c = f.category || ''
    if (!byCat.has(c)) byCat.set(c, [])
    byCat.get(c)!.push(f)
  }
  const lines: string[] = []
  const feedLine = (f: FeedMeta) =>
    `    <outline type="rss" text="${esc(f.title)}" title="${esc(f.title)}" xmlUrl="${esc(f.url)}"/>`
  for (const [cat, list] of byCat) {
    if (cat) {
      lines.push(`    <outline text="${esc(cat)}" title="${esc(cat)}">`)
      for (const f of list) lines.push('  ' + feedLine(f))
      lines.push('    </outline>')
    } else {
      for (const f of list) lines.push(feedLine(f))
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>aiwy RSS 訂閱</title></head>
  <body>
${lines.join('\n')}
  </body>
</opml>
`
}

// 觸發瀏覽器下載
export function downloadOpml(feeds: FeedMeta[], filename = 'aiwy-rss.opml'): void {
  const blob = new Blob([buildOpml(feeds)], { type: 'text/xml' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
