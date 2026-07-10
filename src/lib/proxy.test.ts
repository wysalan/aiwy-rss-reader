import { test, expect, vi, afterEach } from 'vitest'
import { fetchText } from './proxy'

afterEach(() => vi.restoreAllMocks())

test('主代理掛掉時自動換備援', async () => {
  const fetchMock = vi.fn((input: string) => {
    if (input.includes('corsproxy.io')) return Promise.reject(new TypeError('network down'))
    return Promise.resolve(new Response('<rss>ok</rss>', { status: 200 }))
  })
  vi.stubGlobal('fetch', fetchMock)

  expect(await fetchText('https://blog.example/feed')).toBe('<rss>ok</rss>')
  // 第一個代理失敗、第二個成功：至少嘗試過兩次
  expect(fetchMock.mock.calls.some(([u]) => String(u).includes('allorigins'))).toBe(true)
})

test('來源回 404 時直接報錯、不浪費時間換代理', async () => {
  const fetchMock = vi.fn(() => Promise.resolve(new Response('', { status: 404 })))
  vi.stubGlobal('fetch', fetchMock)

  await expect(fetchText('https://dead.example/feed')).rejects.toThrow('404')
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
