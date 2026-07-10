// 依序嘗試多個公開 CORS proxy;主的掛了自動換備援,避免整個 app 一起陣亡。
// ponytail: 公開代理可靠度浮動;真正的解是自架 Cloudflare Worker，之後要穩定再換這條
const PROXIES = [
  (url: string) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
]
let lastOk = 0 // 記住上次成功的索引，下次從它開始，省得每次都從掛掉的那個重試

// 把 HTTP 狀態碼轉成人話，讓使用者看得懂
function httpReason(status: number): string {
  if (status === 404) return '找不到 feed（網址可能已失效，404）'
  if (status === 401 || status === 403) return `存取被拒（需授權或被封鎖，${status}）`
  if (status === 429) return '請求過於頻繁，請稍後再試（429）'
  if (status >= 500) return `來源伺服器錯誤（${status}）`
  return `HTTP ${status}`
}

// 4xx 視為「來源的真實答案」（feed 失效/被擋），不再換代理直接回報。
// ponytail: 無法 100% 分辨「代理轉發的 4xx」與「來源的 4xx」，取後者較常見的情況
class HttpError extends Error {}

async function tryOne(proxied: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(proxied, { signal: AbortSignal.timeout(15000) })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError') throw new Error('連線逾時（站台無回應）')
    throw new Error('無法連線（網路中斷或代理伺服器無回應）')
  }
  if (res.status >= 400 && res.status < 500) throw new HttpError(httpReason(res.status))
  if (!res.ok) throw new Error(httpReason(res.status)) // 5xx：代理或來源出錯，換下一個
  return res.text()
}

export async function fetchText(url: string): Promise<string> {
  let lastErr: Error = new Error('沒有可用的代理伺服器')
  for (let i = 0; i < PROXIES.length; i++) {
    const idx = (lastOk + i) % PROXIES.length
    try {
      const text = await tryOne(PROXIES[idx](url))
      lastOk = idx
      return text
    } catch (e) {
      if (e instanceof HttpError) throw e // 來源的 4xx，換代理也沒用
      lastErr = e instanceof Error ? e : new Error(String(e))
    }
  }
  throw lastErr
}
