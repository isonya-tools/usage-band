import type { Register } from 'claude-code'

// Windows デスクトップアプリ(UsageBand)用: 使用率と実行状況を状態ファイルに書き出す。
// Claude Code の画面には何も表示しない。
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
  let turnStart = 0
  let lastSignal = 0
  let current = ''
  let running = false
  let subagents = 0
  let limitsAt = 0
  let limits: Limit[] = []
  // %USERPROFILE%\.claude\usage-band\state
  let stateDir = ''

  const touch = () => {
    lastSignal = Date.now()
  }
  const snap = () => ({ running, turnStart, lastSignal, current, subagents, limitsAt, limits })

  on('session.start', async ($, e, next) => {
    try {
      const usage = await $.session.usage()
      limits = usage.rateLimits.map(r => ({ ...r })) as Limit[]
      limitsAt = Date.now()
    } catch {
      limits = []
    }
    try {
      const home = await $.env.get('USERPROFILE')
      stateDir = home ? `${home}\\.claude\\usage-band\\state` : ''
    } catch {
      stateDir = ''
    }
    void flush($, stateDir, snap())

    // 動作中は1秒ごと、待機中は30秒ごとに書き出す
    let n = 0
    $.clock.every(500, () => {
      n += 1
      if ((running && n % 2 === 0) || n % 60 === 0) void flush($, stateDir, snap())
    })

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      limits = e.rateLimits.map(r => ({ ...r })) as Limit[]
      limitsAt = Date.now()
      void flush($, stateDir, snap())
    }
    return next(e)
  })

  on('turn.start', ($, e, next) => {
    if (e.agentId) {
      subagents += 1
    } else {
      running = true
      turnStart = Date.now()
      current = ''
      touch()
    }
    void flush($, stateDir, snap())
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    if (e.agentId) {
      subagents = Math.max(0, subagents - 1)
    } else {
      running = false
      current = ''
      subagents = 0
    }
    void flush($, stateDir, snap())
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const stream = next(e)
    let r = await stream.next()
    while (!r.done) {
      touch()
      yield r.value
      r = await stream.next()
    }
    return r.value
  })

  on('tool.call', async ($, e, next) => {
    if (!e.agentId) current = e.tool
    touch()
    const result = await next(e)
    if (!e.agentId) current = ''
    touch()
    return result
  })
}
