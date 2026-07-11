import { test, expect, vi, afterEach } from 'vitest'
import { fetchText } from './proxy'

afterEach(() => vi.restoreAllMocks())

test('經 allorigins 代理抓取內容', async () => {
  const fetchMock = vi.fn(() => Promise.resolve(new Response('<rss>ok</rss>', { status: 200 })))
  vi.stubGlobal('fetch', fetchMock)

  expect(await fetchText('https://blog.example/feed')).toBe('<rss>ok</rss>')
  expect(String(fetchMock.mock.calls[0])).toContain('allorigins')
})

test('來源回 404 時回報人話錯誤', async () => {
  const fetchMock = vi.fn(() => Promise.resolve(new Response('', { status: 404 })))
  vi.stubGlobal('fetch', fetchMock)

  await expect(fetchText('https://dead.example/feed')).rejects.toThrow('404')
})
