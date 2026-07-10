import { test, expect } from 'vitest'
import { parseFeed } from './rss'
import { parseOpml, buildOpml, resolveImportFeeds } from './opml'

test('parse RSS 2.0', () => {
  const xml = `<?xml version="1.0"?>
  <rss version="2.0"><channel>
    <title>My Blog</title>
    <item>
      <title>Hello</title>
      <link>https://ex.com/1</link>
      <guid>id-1</guid>
      <pubDate>Mon, 01 Jan 2024 10:00:00 GMT</pubDate>
      <description>&lt;p&gt;world &lt;b&gt;bold&lt;/b&gt;&lt;/p&gt;</description>
    </item>
  </channel></rss>`
  const { title, items } = parseFeed(xml)
  expect(title).toBe('My Blog')
  expect(items).toHaveLength(1)
  expect(items[0]).toMatchObject({ id: 'id-1', title: 'Hello', link: 'https://ex.com/1' })
  expect(items[0].summary).toBe('world bold') // HTML 去乾淨
})

test('parse Atom', () => {
  const xml = `<?xml version="1.0"?>
  <feed xmlns="http://www.w3.org/2005/Atom">
    <title>Atom Feed</title>
    <entry>
      <title>Post A</title>
      <id>urn:a</id>
      <link rel="alternate" href="https://ex.com/a"/>
      <updated>2024-02-02T08:00:00Z</updated>
      <summary>summary text</summary>
    </entry>
  </feed>`
  const { title, items } = parseFeed(xml)
  expect(title).toBe('Atom Feed')
  expect(items[0]).toMatchObject({ id: 'urn:a', title: 'Post A', link: 'https://ex.com/a', summary: 'summary text' })
})

test('OPML round-trip 保留分類', () => {
  const feeds = [
    { url: 'https://a.com/feed', title: 'A', category: 'Tech' },
    { url: 'https://b.com/feed', title: 'B', category: '' },
  ]
  const back = parseOpml(buildOpml(feeds))
  expect(back).toHaveLength(2)
  expect(back.find((f) => f.url === 'https://a.com/feed')).toMatchObject({ title: 'A', category: 'Tech' })
  expect(back.find((f) => f.url === 'https://b.com/feed')).toMatchObject({ title: 'B', category: '' })
})

test('resolveImportFeeds 篩選與覆寫分類', () => {
  const feeds = [
    { url: 'https://a.com/feed', title: 'A', category: 'Tech' },
    { url: 'https://b.com/feed', title: 'B', category: 'News' },
    { url: 'https://c.com/feed', title: 'C', category: '' },
  ]
  const sel = new Set(['https://a.com/feed', 'https://c.com/feed'])

  // 沿用來源分類：只留勾選者，分類不動
  const keep = resolveImportFeeds(feeds, sel, null)
  expect(keep.map((f) => f.url)).toEqual(['https://a.com/feed', 'https://c.com/feed'])
  expect(keep[0].category).toBe('Tech')

  // 覆寫成指定分類
  expect(resolveImportFeeds(feeds, sel, 'Fun').every((f) => f.category === 'Fun')).toBe(true)

  // 覆寫成未分類（''）
  expect(resolveImportFeeds(feeds, sel, '').every((f) => f.category === '')).toBe(true)
})
