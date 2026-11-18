import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Limit } from '../types'

const limits = atom({ plugin: 'usage-band', key: 'limits' } as const, [] as Limit[])
const tick = atom({ plugin: 'usage-band', key: 'tick' } as const, 0)

// ダークモード向けパステル配色(白は使わない)
const TRACK = '#3b3950'
const OK = '#8fd9bd'
const WARN = '#f2a093'
const MARK = '#c4b5fd'
const TEXT = '#cfcbe0'
const SUB = '#8f8ba3'
const IDLE = '#5f5c73'
const DOT_ON = '#8fd9bd'
const DOT_OFF = '#44425a'
const DOT_SLOW = '#f5d28a'
const DOT_STUCK = '#f2a093'

const PX_PER_CELL = 8

// 細く、角を丸めたバー。縦線は細く、バーより少しだけ高い
const barSvg = (used: number, pace: number, fill: string, W: number) => {
  const u = (used / 100) * W
  const m = Math.max(0, Math.min(W - 2, (pace / 100) * W - 1))
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="12" viewBox="0 0 ${W} 12">` +
    `<rect x="0" y="4" width="${W}" height="4" rx="2" fill="${TRACK}"/>` +
    (u > 0 ? `<rect x="0" y="4" width="${Math.max(4, u)}" height="4" rx="2" fill="${fill}"/>` : '') +
    `<rect x="${m}" y="1" width="2" height="10" rx="1" fill="${MARK}"/>` +
    `</svg>`
  )
}

const WINDOWS = [
  { kind: 'five_hour', label: '5時間', ms: 5 * 3600_000, withDate: false },
  { kind: 'seven_day', label: '今週', ms: 7 * 24 * 3600_000, withDate: true },
] as const

const pad = (n: number) => String(n).padStart(2, '0')
const clamp = (n: number) => Math.max(0, Math.min(100, n))

const resetText = (iso: string | undefined, withDate: boolean) => {
  if (!iso) return ''
  const d = new Date(iso)
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return withDate ? `${d.getMonth() + 1}/${d.getDate()} ${hm}` : hm
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${pad(s % 60)}`
}

const SID = Math.random().toString(36).slice(2, 10)

// デスクトップ版が読む状態ファイルを書き出す
const flush = async ($: any, dir: string, snap: Record<string, unknown>) => {
  if (!dir) return
  try {
    const ls = await read($, limits)
    await $.fs.write(`${dir}\\${SID}.json`, JSON.stringify({ id: SID, updatedAt: Date.now(), ...snap, limits: ls }))
  } catch {
    // 書き出しに失敗しても帯の表示には影響させない
  }
}

export const register: Register = on => {
  // 動作状況(モジュール内の値。描画ごとに読む)
  let turnStart = 0
  let lastSignal = 0
  let current = ''
  let running = false
  let subagents = 0
  let limitsAt = 0
  // デスクトップ版が読む状態ファイルの置き場(%USERPROFILE%\.claude\usage-band\state)
  let stateDir = ''

  const touch = () => {
    lastSignal = Date.now()
  }

  const snap = () => ({ running, turnStart, lastSignal, current, subagents, limitsAt })

  on('session.start', async ($, e, next) => {
    const usage = await $.session.usage()
    await update($, limits, () => usage.rateLimits.map(r => ({ ...r })))
    limitsAt = Date.now()

    try {
      const home = await $.env.get('USERPROFILE')
      stateDir = home ? `${home}\\.claude\\usage-band\\state` : ''
    } catch {
      stateDir = ''
    }
    void flush($, stateDir, snap())

    // 動作中は0.5秒ごと、待機中は30秒ごとに描き直す。状態ファイルは動作中1秒ごと、待機中30秒ごと
    let n = 0
    $.clock.every(500, () => {
      n += 1
      if (running || n % 60 === 0) void update($, tick, v => v + 1)
      if ((running && n % 2 === 0) || n % 60 === 0) void flush($, stateDir, snap())
    })

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await update($, limits, () => e.rateLimits.map(r => ({ ...r })))
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
      void update($, tick, v => v + 1)
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

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const beat = await read($, tick)
    const ls = await read($, limits)
    if (e.props.hasSurvey || (ls.length === 0 && !running)) return next(e)

    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const Svg = (ui as any).Svg
    const now = await $.clock.now()

    // 幅に応じて縮む: 狭いほど余白・間隔・各列を詰め、バーが残りを受け持つ
    const cols = e.props.bodyColumns > 0 ? e.props.bodyColumns : 120
    const tight = cols < 110
    const gapN = tight ? 2 : 4
    const padN = tight ? 1 : 3
    const resetW = tight ? 20 : 22
    const actW = tight ? 16 : 20
    const fixedCells = padN * 2 + 6 + 5 + resetW + gapN * 3 + actW + 6
    const barW = Math.max(60, Math.min(460, (cols - fixedCells) * PX_PER_CELL))

    const bars = WINDOWS.map(w => {
      const l = ls.find(x => x.kind === w.kind)
      if (!l) return null
      const used = clamp(l.percentUsed)
      const resetAt = l.resetsAt ? new Date(l.resetsAt).getTime() : now + w.ms
      const pace = clamp(100 - ((resetAt - now) / w.ms) * 100)
      const isOver = used > pace
      const fill = isOver ? WARN : OK
      const lo = Math.min(used, pace)
      const hi = Math.max(used, pace)

      return (
        <Box key={w.kind} flexDirection="row" gap={gapN} alignItems="center">
          <Box width={6} flexShrink={0}>
            <Text color={TEXT}>{w.label}</Text>
          </Box>
          {Svg ? (
            <Box flexShrink={0}>
              <Svg source={barSvg(used, pace, fill, barW)} alt={`${w.label} ${Math.round(used)}%`} width={barW} height={12} />
            </Box>
          ) : (
            <Box flexGrow={1} minWidth={10} height={1} flexDirection="row" overflow="hidden" backgroundColor={TRACK}>
              <Box flexGrow={lo} backgroundColor={fill} />
              <Box flexGrow={hi - lo} backgroundColor={isOver ? fill : TRACK} />
              <Box width={1} flexShrink={0} backgroundColor={MARK} />
              <Box flexGrow={100 - hi} />
            </Box>
          )}
          <Box width={5} flexShrink={0} justifyContent="flex-end">
            <Text color={TEXT}>{Math.round(used)}%</Text>
          </Box>
          <Box width={resetW} flexShrink={0} justifyContent="flex-end">
            <Text color={SUB}>{resetText(l.resetsAt, w.withDate)} にリセット</Text>
          </Box>
        </Box>
      )
    })

    // 動作表示: 3つの点が順に光る。無反応が続くと色が変わる
    // 待機中は丸を全部暗く、0:00、「待機中」を薄く表示する
    const quiet = running ? now - lastSignal : 0
    const dotColor = quiet > 90_000 ? DOT_STUCK : quiet > 20_000 ? DOT_SLOW : DOT_ON
    // 描画の時刻ではなく拍の数で進める: 左→真ん中→右を固定の順で繰り返す
    const phase = beat % 3
    const what = !running ? '待機中' : current || (subagents > 0 ? 'サブ' : '考え中')
    const activity = (
      <Box flexDirection="column" width={actW} flexShrink={0} justifyContent="center" alignItems="center">
        <Text color={running ? TEXT : IDLE} wrap="truncate-end">
          {what}
          {running && subagents > 0 ? ` ×${subagents}` : ''}
        </Text>
        <Box flexDirection="row" gap={2} alignItems="center" flexShrink={0}>
          <Box flexDirection="row" gap={1}>
            {[0, 1, 2].map(i => (
              <Text key={i} color={running && i === phase ? dotColor : DOT_OFF}>
                ●
              </Text>
            ))}
          </Box>
          <Text color={running ? SUB : IDLE} wrap="truncate-end">
            {clock(running ? now - turnStart : 0)}
          </Text>
        </Box>
        {quiet > 20_000 ? (
          <Text color={dotColor} wrap="truncate-end">
            無反応 {Math.round(quiet / 1000)}s
          </Text>
        ) : null}
      </Box>
    )

    // 細く、角を丸めた縦線
    const divider = Svg ? (
      <Box flexShrink={0} justifyContent="center">
        <Svg
          source={`<svg xmlns="http://www.w3.org/2000/svg" width="2" height="30" viewBox="0 0 2 30"><rect x="0" y="0" width="2" height="30" rx="1" fill="${TRACK}"/></svg>`}
          alt=""
          width={2}
          height={30}
        />
      </Box>
    ) : (
      <Box width={1} flexShrink={0} backgroundColor={TRACK} />
    )

    // 左: 4列を等間隔。リセット時刻と動作表示の真ん中に縦線
    return (
      <Box flexDirection="row" paddingLeft={padN} paddingRight={padN} overflow="hidden">
        <Box flexDirection="column" flexShrink={0}>
          {bars}
        </Box>
        <Box flexGrow={1} />
        {divider}
        <Box flexGrow={1} />
        {activity}
      </Box>
    )
  })
}
