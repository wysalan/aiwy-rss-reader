// 全鍵盤導航：WASD 在三個固定區域（sidebar / toolbar / list）間漫遊，
// 用原生 focus 當選取框，DOM 當唯一狀態來源（不自建座標狀態）。
import { onBeforeUnmount, onMounted, ref } from 'vue'

export type Region = 'sidebar' | 'toolbar' | 'list'
export type Dir = 'w' | 'a' | 's' | 'd'

// 純函式：區域圖轉換規則。回傳 index<0 代表「跨到另一區，落點由 DOM 決定」。
// count = 目前區域內的可導航目標數。抽出來是為了單測邊界規則（見 useKeyNav.test.ts）。
export function moveIndex(region: Region, index: number, count: number, dir: Dir): { region: Region; index: number } {
  const down = () => ({ region, index: Math.min(index + 1, count - 1) })
  const up = () => (index > 0 ? { region, index: index - 1 } : null)
  if (region === 'list') {
    if (dir === 's') return down()
    if (dir === 'w') return up() ?? { region: 'toolbar', index: -1 }
    if (dir === 'a') return { region: 'sidebar', index: -1 }
    return { region, index } // d：無動作
  }
  if (region === 'toolbar') {
    if (dir === 'd') return down()
    if (dir === 'a') return up() ?? { region: 'sidebar', index: -1 }
    if (dir === 's') return { region: 'list', index: -1 }
    return { region, index } // w：無動作
  }
  // sidebar
  if (dir === 's') return down()
  if (dir === 'w') return up() ?? { region: 'toolbar', index: -1 }
  if (dir === 'd') return { region: 'list', index: -1 }
  return { region, index } // a：無動作
}

const REGIONS: Region[] = ['sidebar', 'toolbar', 'list']
const DIRS: Record<string, Dir> = {
  w: 'w', a: 'a', s: 's', d: 'd',
  arrowup: 'w', arrowleft: 'a', arrowdown: 's', arrowright: 'd',
}

// 記住每區最後停留的位置，跨區時回到上次落點（lazy，用不到結構化狀態）
const last: Record<Region, number> = { sidebar: 0, toolbar: 0, list: 0 }

function targets(region: Region): HTMLElement[] {
  const root = document.querySelector(`[data-nav-region="${region}"]`)
  if (!root) return []
  // 只算「看得見」的目標：排除桌機側欄在手機時的 display:none、折疊分類內的項目
  return [...root.querySelectorAll<HTMLElement>('[data-navi]')].filter((el) => el.offsetParent !== null)
}

function locate(): { region: Region; index: number } | null {
  const el = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-navi]')
  if (!el) return null
  const region = el.closest<HTMLElement>('[data-nav-region]')?.dataset.navRegion as Region | undefined
  if (!region || !REGIONS.includes(region)) return null
  const i = targets(region).indexOf(el)
  return { region, index: i < 0 ? 0 : i }
}

function focusAt(region: Region, index: number) {
  const list = targets(region)
  if (!list.length) return
  const i = Math.max(0, Math.min(index, list.length - 1))
  list[i].focus()
  last[region] = i
}

function currentArticle(): HTMLElement | null {
  const el = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('article[data-navi]')
  return el || targets('list')[0] || null
}

// 對目前聚焦元素派發 contextmenu 事件，觸發 Nuxt UI 的 UContextMenu（唯一的鍵盤入口）
function openContextMenu() {
  const el = document.activeElement as HTMLElement | null
  if (!el) return
  const r = el.getBoundingClientRect()
  el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 12, clientY: r.bottom }))
}

// 打字中或在對話框裡：完全放行原生鍵盤
function isPassthrough(): boolean {
  const a = document.activeElement as HTMLElement | null
  if (!a) return false
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName) || a.isContentEditable) return true
  return !!a.closest('[role="dialog"]')
}

// 展開中的選單/下拉：回傳它，讓 WASD 轉成方向鍵餵給 Reka 自己的導航
function openMenu(): HTMLElement | null {
  return (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[role="menu"],[role="listbox"]') || null
}

const ARROW: Record<string, string> = { w: 'ArrowUp', s: 'ArrowDown', a: 'ArrowLeft', d: 'ArrowRight' }

export function useKeyNav() {
  const helpOpen = ref(false) // 快捷鍵說明 modal，App 綁定它、按 ? 打開

  function handleMove(dir: Dir) {
    const cur = locate()
    if (!cur) return focusAt('list', last.list) // arming：首次按 WASD，先出選取框不移動
    const next = moveIndex(cur.region, cur.index, targets(cur.region).length, dir)
    if (next.region === cur.region) focusAt(cur.region, next.index)
    else focusAt(next.region, last[next.region]) // 跨區回到上次落點
  }

  // j/k：不論焦點在哪，一律聚焦到列表並上下移動
  function moveList(delta: number) {
    const list = targets('list')
    if (!list.length) return
    const cur = locate()
    const base = cur?.region === 'list' ? cur.index : last.list
    focusAt('list', base + (cur?.region === 'list' ? delta : 0))
  }

  function onKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return

    if (e.key === 'Escape') {
      // 選單／對話框開著：交給 Reka 自己用 Esc 關閉，別插手
      if (openMenu() || (document.activeElement as HTMLElement | null)?.closest('[role="dialog"]')) return
      const a = document.activeElement as HTMLElement | null
      // 在輸入框裡（第二層）→ 退回它的選取框包裝（第一層）；否則直接離開
      const wrapper = a?.closest<HTMLElement>('[data-navi]')
      if (a && ['INPUT', 'TEXTAREA'].includes(a.tagName) && wrapper && wrapper !== a) wrapper.focus()
      else a?.blur?.()
      return
    }
    if (isPassthrough()) return // 打字中或對話框：完全放行

    // 選單開著：WASD → 方向鍵，餵給 Reka 自己的鍵盤導航（Enter/Esc/字母 typeahead 交給原生）
    const menu = openMenu()
    if (menu) {
      const arrow = ARROW[e.key.toLowerCase()]
      if (arrow) {
        e.preventDefault()
        document.activeElement?.dispatchEvent(
          new KeyboardEvent('keydown', { key: arrow, code: arrow, bubbles: true, cancelable: true })
        )
      }
      return
    }

    // Enter / Space 啟動目前聚焦的目標
    if (e.key === 'Enter' || e.key === ' ') {
      const a = document.activeElement as HTMLElement | null
      if (!a) return
      const article = a.closest<HTMLElement>('article[data-navi]')
      if (article) {
        e.preventDefault()
        article.querySelector<HTMLElement>('a')?.click() // 文章：開原文（等同 o，順帶標已讀）
      } else if (a.tagName === 'DIV' && a.matches('[data-navi]')) {
        e.preventDefault()
        const input = a.querySelector<HTMLElement>('input, textarea')
        const popup = a.querySelector<HTMLElement>('[aria-haspopup]')
        if (input) input.focus() // 輸入框包裝：進入第二層，聚焦輸入
        else if (popup) popup.click() // 下拉選單包裝（USelectMenu）：點內層 trigger 開選單，之後交給 Reka 原生鍵盤
        else a.click() // 側欄列：選取（原生 button/a 讓瀏覽器自己處理）
      }
      return
    }

    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase()
    const dir = DIRS[k]
    if (dir) {
      e.preventDefault()
      handleMove(dir)
      return
    }

    switch (k) {
      case 'j': e.preventDefault(); moveList(1); break
      case 'k': e.preventDefault(); moveList(-1); break
      case 'o': currentArticle()?.querySelector<HTMLElement>('a')?.click(); break
      case 'b': currentArticle()?.querySelector<HTMLElement>('[data-star]')?.click(); break
      case 'm': currentArticle()?.click(); break // 點文章容器 → emit open → 標已讀，不開分頁
      case 'r': document.querySelector<HTMLElement>('[data-shortcut="refresh"]')?.click(); break
      case 'e': openContextMenu(); break // 對聚焦的訂閱開右鍵選單（改名/刪除/換網址…）
      case '/': e.preventDefault(); document.querySelector<HTMLElement>('[data-nav-region="toolbar"] input')?.focus(); break
      case '?': e.preventDefault(); helpOpen.value = true; break // Shift+/ → 開快捷鍵說明
    }
  }

  onMounted(() => window.addEventListener('keydown', onKey))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

  return { helpOpen }
}
