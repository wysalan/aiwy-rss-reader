import { test, expect } from 'vitest'
import { reorder, reorderCategories } from './useFeeds'

const mk = (url: string, category: string) => ({ url, title: url, category })
const urls = (fs: { url: string }[]) => fs.map((f) => f.url)

test('reorder：同分類內下移（after=true）', () => {
  const feeds = [mk('a', 'x'), mk('b', 'x'), mk('c', 'x')]
  expect(urls(reorder(feeds, 'a', 'b', true))).toEqual(['b', 'a', 'c'])
})

test('reorder：同分類內上移（after=false）', () => {
  const feeds = [mk('a', 'x'), mk('b', 'x'), mk('c', 'x')]
  expect(urls(reorder(feeds, 'c', 'a', false))).toEqual(['c', 'a', 'b'])
})

test('reorder：跨分類搬移採用目標分類', () => {
  const feeds = [mk('a', 'x'), mk('b', 'y'), mk('c', 'y')]
  const next = reorder(feeds, 'a', 'c', false)
  expect(urls(next)).toEqual(['b', 'a', 'c'])
  expect(next.find((f) => f.url === 'a')!.category).toBe('y')
})

test('reorder：同 url 或找不到時回傳原陣列', () => {
  const feeds = [mk('a', 'x'), mk('b', 'x')]
  expect(reorder(feeds, 'a', 'a', true)).toBe(feeds)
  expect(reorder(feeds, 'zzz', 'a', true)).toBe(feeds)
})

test('reorderCategories：調換區塊順序、內部順序不變', () => {
  const feeds = [mk('a', 'x'), mk('b', 'x'), mk('c', 'y')]
  // 把 y 移到 x 之前
  expect(urls(reorderCategories(feeds, 'y', 'x', false))).toEqual(['c', 'a', 'b'])
})

test('reorderCategories：after=true 插在目標分類之後', () => {
  const feeds = [mk('a', 'x'), mk('c', 'y'), mk('d', 'z')]
  // 把 x 移到 y 之後
  expect(urls(reorderCategories(feeds, 'x', 'y', true))).toEqual(['c', 'a', 'd'])
})

test('reorderCategories：空 category 視為未分類', () => {
  const feeds = [mk('a', ''), mk('b', 'x')]
  expect(urls(reorderCategories(feeds, 'x', '未分類', false))).toEqual(['b', 'a'])
})

test('reorderCategories：同名或找不到時回傳原陣列', () => {
  const feeds = [mk('a', 'x'), mk('b', 'y')]
  expect(reorderCategories(feeds, 'x', 'x', true)).toBe(feeds)
  expect(reorderCategories(feeds, 'zzz', 'x', true)).toBe(feeds)
})
