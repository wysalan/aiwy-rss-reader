// 用公開 CORS proxy 繞過瀏覽器跨域限制。allorigins 對任何來源回 Access-Control-Allow-Origin: *,
// 部署後在正式網域一樣能用,不像 corsproxy.io 部署後需申請 API key。
// ponytail: 單一公開代理可靠度浮動;真正的解是自架 Cloudflare Worker,要穩定再換這條
const proxy = (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`

// 把 HTTP 狀態碼轉成人話，讓使用者看得懂
function httpReason(status: number): string {
  if (status === 404) return '找不到 feed（網址可能已失效，404）'
  if (status === 401 || status === 403) return `存取被拒（需授權或被封鎖，${status}）`
  if (status === 429) return '請求過於頻繁，請稍後再試（429）'
  if (status >= 500) return `來源伺服器錯誤（${status}）`
  return `HTTP ${status}`
}

export async function fetchText(url: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(proxy(url), { signal: AbortSignal.timeout(15000) })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError') throw new Error('連線逾時（站台無回應）')
    throw new Error('無法連線（網路中斷或代理伺服器無回應）')
  }
  if (!res.ok) throw new Error(httpReason(res.status))
  return res.text()
}
