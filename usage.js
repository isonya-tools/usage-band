// Claude の使用率(5時間・週間)を、使用率 API から取得する。
// 認証には、Claude Code のログイン(claude auth login)で作られる ~/.claude/.credentials.json を使う。
// トークンはこのパソコンの中でだけ使い、Claude の API 以外には送らない。
const fs = require('fs')
const path = require('path')
const os = require('os')

const CRED_FILE = path.join(os.homedir(), '.claude', '.credentials.json')
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
const TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token'
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e' // Claude Code の公開クライアント ID
const BETA = 'oauth-2025-04-20'

class UsageError extends Error {
  constructor(code, message, retryAfterSec) {
    super(message || code)
    this.code = code // 'login' | 'rate' | 'network' | 'http'
    this.retryAfterSec = retryAfterSec
  }
}

const readCreds = () => {
  try {
    const j = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'))
    if (!j.claudeAiOauth || !j.claudeAiOauth.accessToken) throw new Error('no token')
    return j
  } catch {
    throw new UsageError('login', 'not logged in')
  }
}

// 書き込み途中で壊れないよう、一時ファイルに書いてから置き換える
const writeCreds = j => {
  const tmp = CRED_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(j), { mode: 0o600 })
  fs.renameSync(tmp, CRED_FILE)
}

const refresh = async j => {
  const o = j.claudeAiOauth
  if (!o.refreshToken) throw new UsageError('login', 'no refresh token')
  let res
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: o.refreshToken, client_id: CLIENT_ID }),
    })
  } catch {
    throw new UsageError('network', 'refresh failed')
  }
  if (res.status === 400 || res.status === 401) throw new UsageError('login', 'refresh rejected')
  if (!res.ok) throw new UsageError('http', `refresh ${res.status}`)
  const t = await res.json()
  o.accessToken = t.access_token
  if (t.refresh_token) o.refreshToken = t.refresh_token
  o.expiresAt = Date.now() + (t.expires_in || 3600) * 1000
  writeCreds(j)
}

const call = token =>
  fetch(USAGE_URL, { headers: { Authorization: `Bearer ${token}`, 'anthropic-beta': BETA } })

const normalize = d => {
  const out = []
  for (const kind of ['five_hour', 'seven_day']) {
    const w = d && d[kind]
    if (w && typeof w.utilization === 'number') out.push({ kind, percentUsed: w.utilization, resetsAt: w.resets_at })
  }
  return out
}

// 使用率を取得する。失敗したときは UsageError を投げる
const getUsage = async ({ forceRefresh = false } = {}) => {
  const j = readCreds()
  if (forceRefresh || !j.claudeAiOauth.expiresAt || j.claudeAiOauth.expiresAt - Date.now() < 2 * 60e3) await refresh(j)
  let res
  try {
    res = await call(j.claudeAiOauth.accessToken)
    if (res.status === 401) {
      await refresh(j)
      res = await call(j.claudeAiOauth.accessToken)
    }
  } catch (e) {
    if (e instanceof UsageError) throw e
    throw new UsageError('network', 'request failed')
  }
  if (res.status === 429) throw new UsageError('rate', 'rate limited', Number(res.headers.get('retry-after')) || 0)
  if (res.status === 401 || res.status === 403) throw new UsageError('login', 'unauthorized')
  if (!res.ok) throw new UsageError('http', `usage ${res.status}`)
  const limits = normalize(await res.json())
  if (!limits.length) throw new UsageError('http', 'no limits in response')
  return limits
}

module.exports = { getUsage, UsageError, CRED_FILE }
