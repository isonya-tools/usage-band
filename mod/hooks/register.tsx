import type { Register } from 'claude-code'

// Windows デスクトップアプリ(UsageBand)用: Claude Code が持っている使用率を、状態ファイルに書き出す。
// Claude Code の画面には何も表示しない。UsageBand は、このファイルが新しいあいだは API を呼ばない。
type Limit = { kind: string; percentUsed: number; resetsAt?: string }

const SID = Math.random().toString(36).slice(2, 10)

const flush = async ($: any, dir: string, snap: Record<string, unknown>) => {
  if (!dir) return
  try {
    await $.fs.write(`${dir}\\${SID}.json`, JSON.stringify({ id: SID, updatedAt: Date.now(), ...snap }))
  } catch {
    // 書き出しに失敗しても Claude Code の動作には影響させない
  }
}

export const register: Register = on => {
  let limits: Limit[] = []
  let limitsAt = 0
  let lastFlush = 0
  // %USERPROFILE%\.claude\usage-band\state
  let stateDir = ''

  const snap = () => ({ limitsAt, limits })

  on('session.start', async ($, e, next) => {
    try {
      const usage = await $.session.usage()
      if (usage.rateLimits.length) {
        limits = usage.rateLimits.map(r => ({ ...r })) as Limit[]
        limitsAt = Date.now()
      }
    } catch {
      limits = []
    }
    try {
      const home = await $.env.get('USERPROFILE')
      stateDir = home ? `${home}\\.claude\\usage-band\\state` : ''
    } catch {
      stateDir = ''
    }
    lastFlush = Date.now()
    void flush($, stateDir, snap())
    return next(e)
  })

  // 使用率が測り直されるたびに、更新時刻を進めて書き出す(値が同じでも、新しいことが分かるように)
  on('session.measure', async ($, e, next) => {
    if (e.rateLimits.length) {
      limits = e.rateLimits.map(r => ({ ...r })) as Limit[]
      limitsAt = Date.now()
      if (limitsAt - lastFlush >= 2000 || e.changed.includes('rateLimits')) {
        lastFlush = limitsAt
        void flush($, stateDir, snap())
      }
    }
    return next(e)
  })
}
