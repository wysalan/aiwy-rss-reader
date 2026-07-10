import { test, expect } from 'vitest'
import { moveIndex } from './useKeyNav'

test('區域內移動與邊界夾限', () => {
  expect(moveIndex('list', 1, 5, 's')).toEqual({ region: 'list', index: 2 })
  expect(moveIndex('list', 4, 5, 's')).toEqual({ region: 'list', index: 4 }) // 底部不動
  expect(moveIndex('list', 2, 5, 'w')).toEqual({ region: 'list', index: 1 })
  expect(moveIndex('toolbar', 0, 3, 'd')).toEqual({ region: 'toolbar', index: 1 })
})

test('觸邊界跨區', () => {
  expect(moveIndex('list', 0, 5, 'w')).toEqual({ region: 'toolbar', index: -1 }) // 列表最上 W → 工具列
  expect(moveIndex('list', 3, 5, 'a')).toEqual({ region: 'sidebar', index: -1 }) // 列表 A → 側欄
  expect(moveIndex('toolbar', 2, 3, 's')).toEqual({ region: 'list', index: -1 }) // 工具列 S → 列表
  expect(moveIndex('toolbar', 0, 3, 'a')).toEqual({ region: 'sidebar', index: -1 }) // 工具列最左 A → 側欄
  expect(moveIndex('sidebar', 0, 4, 'w')).toEqual({ region: 'toolbar', index: -1 }) // 側欄最上 W → 工具列
  expect(moveIndex('sidebar', 1, 4, 'd')).toEqual({ region: 'list', index: -1 }) // 側欄 D → 列表
})

test('無動作方向維持原位', () => {
  expect(moveIndex('list', 2, 5, 'd')).toEqual({ region: 'list', index: 2 })
  expect(moveIndex('toolbar', 1, 3, 'w')).toEqual({ region: 'toolbar', index: 1 })
  expect(moveIndex('sidebar', 1, 4, 'a')).toEqual({ region: 'sidebar', index: 1 })
})
