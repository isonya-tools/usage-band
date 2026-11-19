// 5時間枠・週間枠の使用率バーを描く
const TRACK = '#6c6990' // バーの下地: 背景が透けても右端が分かるよう、明るめにする
const OK = '#8fd9bd'
const WARN = '#f2a093'
const MARK = '#c4b5fd'

const WINDOWS = [
  { kind: 'five_hour', label: '5時間', ms: 5 * 3600e3, withDate: false },
  { kind: 'seven_day', label: '今週', ms: 7 * 24 * 3600e3, withDate: true },
]

const panel = document.getElementById('panel')
let S = { limits: [], updatedAt: 0, error: null }
let lastH = 0

const pad = n => String(n).padStart(2, '0')
const clamp = n => Math.max(0, Math.min(100, n))
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const resetText = (iso, withDate) => {
  if (!iso) return ''
  const d = new Date(iso)
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  return withDate ? `${d.getMonth() + 1}/${d.getDate()} ${hm}` : hm
}

// 週間のバーを 1 日ごと(24 時間ごと)に区切る、オレンジの細い線。days が 7 なら 6 本
const DAY_LINE = '#f5a25d'
const dayLines = (W, days) => {
  let s = ''
  for (let k = 1; k < days; k++) {
    // バーの中は控えめに(薄め)、そのまま下へ少しだけ飛び出させる
    s += `<rect x="${(k * W) / days - 0.5}" y="4" width="1" height="10" fill="${DAY_LINE}" opacity="0.8"/>`
  }
  return s
}

// 細く、角を丸めたバー。縦線はバーより少しだけ高い
const barSvg = (used, pace, fill, W, days = 0) => {
  const u = (used / 100) * W
  const m = Math.max(0, Math.min(W - 3, (pace / 100) * W - 1.5))
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="14" viewBox="0 0 ${W} 14">` +
    `<rect x="0" y="4" width="${W}" height="6" rx="3" fill="${TRACK}"/>` +
    (u > 0 ? `<rect x="0" y="4" width="${Math.max(6, u)}" height="6" rx="3" fill="${fill}"/>` : '') +
    dayLines(W, days) +
    `<rect x="${m}" y="1" width="3" height="12" rx="1.5" fill="${MARK}"/>` +
    `</svg>`
  )
}

const NOTES = {
  login: 'Claude にログインしてください(PowerShell で claude auth login)',
  network: '通信できません。再試行しています…',
  http: '使用率を取得できません。再試行しています…',
}
// アクセスが多すぎて断られたとき(429): 次に取りに行くまでの目安を出す
const rateNote = () => {
  const min = Math.max(1, Math.ceil(((S.nextPollAt || 0) - Date.now()) / 60e3))
  return `取得を待っています(約${min}分後に再試行します)`
}

const render = () => {
  const now = Date.now()
  let rows = ''
  const bars = []
  for (const w of WINDOWS) {
    const l = S.limits.find(x => x.kind === w.kind)
    if (!l) continue
    const expired = l.resetsAt && Date.parse(l.resetsAt) < now
    const used = expired ? 0 : clamp(l.percentUsed)
    const resetAt = l.resetsAt ? Date.parse(l.resetsAt) : now + w.ms
    const pace = expired ? 0 : clamp(100 - ((resetAt - now) / w.ms) * 100)
    const fill = used > pace ? WARN : OK
    bars.push({ id: w.kind, used, pace, fill, days: w.kind === 'seven_day' ? 7 : 0 })
    rows +=
      `<div class="row"><div class="label">${w.label}</div><div class="bar" id="bar-${w.kind}"></div>` +
      `<div class="pct">${Math.round(used)}%</div>` +
      `<div class="reset">${expired ? '--' : esc(resetText(l.resetsAt, w.withDate))}</div></div>`
  }

  if (!rows) {
    // データがまだないとき: 2行分の高さを保って、理由を出す
    const note = S.error === 'rate' ? rateNote() : NOTES[S.error] || '使用率を取得しています…'
    rows = `<div class="note">${esc(note)}</div>`
  }
  // 取得に失敗している間は、前回の値を薄く表示する
  // 取得に失敗している、または 15 分以上更新できていないときは薄くする
  const stale = S.limits.length > 0 && (!!S.error || (S.updatedAt && now - S.updatedAt > 15 * 60e3))
  panel.className = stale ? 'stale' : ''
  panel.innerHTML = `<div class="left">${rows}</div>`

  for (const b of bars) {
    const el = document.getElementById('bar-' + b.id)
    const W = Math.max(60, Math.round(el.clientWidth))
    el.innerHTML = barSvg(b.used, b.pace, b.fill, W, b.days)
  }

  const h = Math.ceil(panel.getBoundingClientRect().height)
  if (h !== lastH) {
    lastH = h
    window.api.reportSize(h)
  }
}

window.api.onState(s => {
  S = s
  render()
})
window.api.onConfig(c => {
  document.body.classList.toggle('draggable', c.canDrag)
  document.body.classList.toggle('resizable', c.canResize)
  document.body.classList.toggle('op-50', c.opacityMode === '50')
  document.body.classList.toggle('op-80', c.opacityMode === '80')
})

// ウィンドウ上の右クリックでも、タスクトレイと同じメニューを出す
document.addEventListener('contextmenu', e => {
  e.preventDefault()
  window.api.showMenu()
})

// 左右の端をつかんで大きさを変える
for (const g of document.querySelectorAll('.grip')) {
  g.addEventListener('pointerdown', e => {
    g.setPointerCapture(e.pointerId)
    window.api.resizeStart(g.dataset.edge)
  })
  g.addEventListener('pointermove', e => {
    if (g.hasPointerCapture(e.pointerId)) window.api.resizeMove()
  })
  const end = e => {
    if (g.hasPointerCapture(e.pointerId)) {
      g.releasePointerCapture(e.pointerId)
      window.api.resizeEnd()
    }
  }
  g.addEventListener('pointerup', end)
  g.addEventListener('pointercancel', end)
}

// リセットまでの時間が進むので、ペースの縦線は 10 秒ごとに描き直す(API は呼ばない)
setInterval(render, 10_000)
render()
