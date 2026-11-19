const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage, powerMonitor } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { getUsage } = require('./usage')

const BASE_W = 400 // 表示の基準の幅(この幅を 100% とする)
const MIN_W = 240
const MAX_W = 1600
// 使用率 API は非公式で、回数制限が厳しい(429 が数分〜数時間続く報告がある)ため、間隔は長く取る
const POLL_MS = 5 * 60_000 // 通常の取得間隔
const BACKOFF_FIRST = 5 * 60_000 // 429 のあとの最初の待ち。続けて断られるたびに倍にする
const BACKOFF_MAX = 30 * 60_000
const RETRY_QUICK_MS = 60_000 // 通信できない・未ログインのとき(API には触れない)
// Claude Code の mod が書き出す状態ファイル。これが新しいあいだは API を呼ばない
const MOD_DIR = path.join(os.homedir(), '.claude', 'usage-band', 'state')
const MOD_FRESH_MS = 5 * 60_000
const argv = process.argv
const SAMPLE = argv.includes('--sample')
const SHOT = argv.includes('--shot') ? argv[argv.indexOf('--shot') + 1] : null

const DEFAULTS = {
  visible: true,
  alwaysOnTop: true, // true: 常に最前面 + クリック透過(位置・大きさは変えられない)
  lockPosition: false, // true: 動かせない
  lockSize: false, // true: 大きさを変えられない
  opacityMode: 'none', // 'none': 不透明 / '50': 背景の不透明度 50% / '80': 背景の不透明度 80%(文字とバーははっきり)
  // 位置: ウィンドウの左上の座標と、そのときのディスプレイの構成。null は右上
  // (ディスプレイの ID は再起動で変わるため、大きさと位置で見分ける)
  pos: null, // { x, y, display: { x, y, width, height, scaleFactor } }
  width: BASE_W, // ウィンドウの幅。表示全体がこの幅に比例して拡大・縮小する
  margin: 12,
  v: 4, // 設定の版
}

let settings = { ...DEFAULTS }
let settingsFile
let win = null
let tray = null
let menu = null
let placing = false
let contentH = 50
let suppressMoveUntil = 0 // この時刻まで、ウィンドウの移動を位置として保存しない

// ---- 設定 -----------------------------------------------------------------

const saveSettings = () => {
  try {
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true })
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2))
  } catch {}
}

const loadSettings = () => {
  let raw = {}
  try {
    raw = JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
  } catch {}
  settings = { ...DEFAULTS, ...raw }
  // 透過の旧設定(全体を透過は廃止。背景のみは 50% に引き継ぐ)
  if (raw.opacityMode === 'bg') settings.opacityMode = '50'
  else if (!['none', '50', '80'].includes(settings.opacityMode)) settings.opacityMode = 'none'
  if ((raw.v || 0) < 4) {
    // 旧版(動作表示つき)から: 大きさは新しい基準に合わせて戻す。位置は引き継ぐ
    settings.width = BASE_W
    settings.v = 4
    for (const k of ['pattern', 'custom', 'displayId', 'anchor', 'scale', 'clickThrough']) delete settings[k]
    saveSettings()
  }
}

// ---- 使用率の取得 ---------------------------------------------------------

let usageState = { limits: [], updatedAt: 0, error: null, nextPollAt: 0 }
let lastSent = ''
let nextPollAt = 0
let backoffMs = 0
let polling = false
let cacheFile

// 前回の値と待ち状態を保存して、再起動・更新のたびに API を叩かないようにする
const saveCache = () => {
  try {
    fs.writeFileSync(
      cacheFile,
      JSON.stringify({ limits: usageState.limits, updatedAt: usageState.updatedAt, nextPollAt, backoffMs }),
    )
  } catch {}
}
const loadCache = () => {
  try {
    const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
    if (Array.isArray(c.limits)) usageState = { limits: c.limits, updatedAt: c.updatedAt || 0, error: null, nextPollAt: c.nextPollAt || 0 }
    nextPollAt = c.nextPollAt || 0
    backoffMs = c.backoffMs || 0
  } catch {}
}

const sampleState = () => {
  const now = Date.now()
  return {
    limits: [
      { kind: 'five_hour', percentUsed: 38, resetsAt: new Date(now + 2 * 3600e3 + 20 * 60e3).toISOString() },
      { kind: 'seven_day', percentUsed: 71, resetsAt: new Date(now + 3 * 24 * 3600e3).toISOString() },
    ],
    updatedAt: now,
    error: null,
    nextPollAt: 0,
  }
}

const send = () => {
  if (!win || win.isDestroyed()) return
  const j = JSON.stringify(usageState)
  if (j !== lastSent) {
    lastSent = j
    win.webContents.send('state', usageState)
  }
}

// mod が書き出した使用率のうち、いちばん新しいものを返す
const readMod = () => {
  let best = null
  let files = []
  try {
    files = fs.readdirSync(MOD_DIR).filter(f => f.endsWith('.json'))
  } catch {
    return null
  }
  const now = Date.now()
  for (const f of files) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(MOD_DIR, f), 'utf8'))
      if (now - (d.updatedAt || 0) > 24 * 3600e3) {
        fs.unlinkSync(path.join(MOD_DIR, f)) // 古いセッションの残り
        continue
      }
      if (Array.isArray(d.limits) && d.limits.length && (!best || (d.limitsAt || 0) > (best.limitsAt || 0))) best = d
    } catch {}
  }
  return best
}

const poll = async () => {
  if (SAMPLE) {
    usageState = sampleState()
    return send()
  }
  // Claude Code の mod が 5 分以内に更新していれば、その値を使う(API は呼ばない)
  const mod = readMod()
  if (mod && Date.now() - (mod.limitsAt || 0) < MOD_FRESH_MS) {
    if ((mod.limitsAt || 0) >= usageState.updatedAt) {
      usageState = { limits: mod.limits, updatedAt: mod.limitsAt, error: null, nextPollAt: 0 }
      send()
    }
    return
  }
  // mod が更新されていない(Claude Code が止まっている、mod が未導入など)ときは API で取る。
  // API の結果より新しい mod の値があれば、それを先に表示しておく
  if (mod && (mod.limitsAt || 0) > usageState.updatedAt) {
    usageState = { ...usageState, limits: mod.limits, updatedAt: mod.limitsAt }
  }
  if (polling || Date.now() < nextPollAt) return
  polling = true
  try {
    const limits = await getUsage()
    backoffMs = 0
    nextPollAt = Date.now() + POLL_MS
    usageState = { limits, updatedAt: Date.now(), error: null, nextPollAt }
  } catch (e) {
    // 取得できなかったときは、前回の値を残したまま理由だけ伝える
    const code = e.code || 'http'
    if (code === 'rate') {
      // 断られたら待ちを倍にする(5→10→20→30分)。サーバーが待ち時間を返したら、それ以上待つ
      backoffMs = backoffMs ? Math.min(backoffMs * 2, BACKOFF_MAX) : BACKOFF_FIRST
      nextPollAt = Date.now() + Math.max(backoffMs, (e.retryAfterSec || 0) * 1000)
    } else if (code === 'login' || code === 'network') {
      nextPollAt = Date.now() + RETRY_QUICK_MS
    } else {
      nextPollAt = Date.now() + POLL_MS
    }
    usageState = { ...usageState, error: code, nextPollAt }
  } finally {
    polling = false
  }
  saveCache()
  send()
}

// ---- ウィンドウの位置・大きさ ----------------------------------------------

const zoom = () => settings.width / BASE_W

// 常に前面のあいだは、クリックが透過するので位置も大きさも変えられない
const lockedPos = () => settings.alwaysOnTop || settings.lockPosition
const lockedSize = () => settings.alwaysOnTop || settings.lockSize

// 保存した位置のディスプレイを探す。ID は再起動で変わるので、座標と大きさが同じものを探す
const resolveSaved = () => {
  const p = settings.pos
  if (!p) return null
  const all = screen.getAllDisplays()
  const same = (a, b) => a.width === b.width && a.height === b.height
  const d =
    all.find(x => x.bounds.x === p.display.x && x.bounds.y === p.display.y && same(x.bounds, p.display)) ||
    all.find(x => same(x.bounds, p.display) && x.scaleFactor === p.display.scaleFactor)
  if (!d) return null // そのディスプレイが今はつながっていない(あとで接続されたら、また置き直す)
  return { d, x: d.bounds.x + (p.x - p.display.x), y: d.bounds.y + (p.y - p.display.y) }
}

const place = () => {
  if (!win || win.isDestroyed()) return
  const [w, h] = win.getSize()
  const saved = resolveSaved()
  const d = saved ? saved.d : screen.getPrimaryDisplay()
  const wa = d.workArea
  let x = saved ? saved.x : wa.x + wa.width - w - settings.margin
  let y = saved ? saved.y : wa.y + settings.margin
  // 画面の外に出ないようにする(保存した値は変えない)
  x = Math.max(wa.x, Math.min(x, wa.x + wa.width - w))
  y = Math.max(wa.y, Math.min(y, wa.y + wa.height - h))
  placing = true
  win.setPosition(Math.round(x), Math.round(y))
  setTimeout(() => (placing = false), 300)
}

const resize = () => {
  if (!win || win.isDestroyed()) return
  const z = zoom()
  win.webContents.setZoomFactor(z)
  win.setContentSize(Math.round(settings.width), Math.max(20, Math.round(contentH * z)))
  place()
}

const sendConfig = () => {
  if (!win || win.isDestroyed()) return
  win.webContents.send('config', { canDrag: !lockedPos(), canResize: !lockedSize(), opacityMode: settings.opacityMode })
}

const applyWindowSettings = () => {
  if (!win || win.isDestroyed()) return
  win.setIgnoreMouseEvents(settings.alwaysOnTop, { forward: true })
  win.setAlwaysOnTop(settings.alwaysOnTop, 'screen-saver')
  sendConfig()
  if (settings.visible) win.showInactive()
  else win.hide()
  resize()
}

const rememberPosition = () => {
  const b = win.getBounds()
  const d = screen.getDisplayMatching(b)
  settings.pos = {
    x: b.x,
    y: b.y,
    display: { x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height, scaleFactor: d.scaleFactor },
  }
  saveSettings()
}

// ディスプレイの増減・スリープ・ロックのときは、Windows がウィンドウを動かすことがある。
// それは自分で動かした位置ではないので、保存しない
const suppressMove = (ms = 15000) => {
  suppressMoveUntil = Math.max(suppressMoveUntil, Date.now() + ms)
}

const createWindow = () => {
  win = new BrowserWindow({
    width: Math.round(settings.width),
    height: contentH,
    useContentSize: true,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false },
  })
  win.setMenuBarVisibility(false)
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  // ドラッグで動かしたら、その位置を保存する(ディスプレイをまたいで動かせる)
  win.on('moved', () => {
    if (placing || !win || Date.now() < suppressMoveUntil) return
    rememberPosition()
  })

  // ウィンドウ上の右クリックは、タスクトレイと同じメニューを出す
  win.on('system-context-menu', e => {
    e.preventDefault()
    showMenu()
  })
}

// ---- トレイメニュー -------------------------------------------------------

const showMenu = () => {
  if (menu && win && !win.isDestroyed()) menu.popup({ window: win })
}

const buildMenu = () => {
  if (!tray) return
  const refresh = () => {
    saveSettings()
    applyWindowSettings()
    buildMenu()
  }
  const toggle = key => () => {
    settings[key] = !settings[key]
    refresh()
  }
  menu = Menu.buildFromTemplate([
    { label: '表示', type: 'checkbox', checked: settings.visible, click: toggle('visible') },
    { type: 'separator' },
    {
      label: '常に前面に表示(クリック透過)',
      type: 'checkbox',
      checked: settings.alwaysOnTop,
      click: toggle('alwaysOnTop'),
    },
    {
      label: '位置を固定する',
      type: 'checkbox',
      checked: settings.lockPosition,
      enabled: !settings.alwaysOnTop,
      click: toggle('lockPosition'),
    },
    {
      label: '大きさを固定する',
      type: 'checkbox',
      checked: settings.lockSize,
      enabled: !settings.alwaysOnTop,
      click: toggle('lockSize'),
    },
    { type: 'separator' },
    {
      label: '透過 50%',
      type: 'checkbox',
      checked: settings.opacityMode === '50',
      click: () => {
        settings.opacityMode = settings.opacityMode === '50' ? 'none' : '50'
        refresh()
      },
    },
    {
      label: '透過 80%',
      type: 'checkbox',
      checked: settings.opacityMode === '80',
      click: () => {
        settings.opacityMode = settings.opacityMode === '80' ? 'none' : '80'
        refresh()
      },
    },
    { type: 'separator' },
    {
      label: 'Windows 起動時に自動で起動',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: item => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { label: '終了', click: () => app.quit() },
  ])
  tray.setContextMenu(menu)
}

const createTray = () => {
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png')).resize({ width: 32, height: 32 })
  tray = new Tray(img)
  tray.setToolTip('UsageBand(クリックで表示/非表示)')
  tray.on('click', () => {
    settings.visible = !settings.visible
    saveSettings()
    applyWindowSettings()
    buildMenu()
  })
  buildMenu()
}

// ---- 起動 -----------------------------------------------------------------

ipcMain.on('show-menu', showMenu)

if (!SHOT && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    settings.visible = true
    saveSettings()
    applyWindowSettings()
    buildMenu()
  })

  // 左右の端をつかんで大きさを変える(透過ウィンドウは OS の枠で変えられないため自前で処理)。
  // 幅に比例して、文字もバーも同じ比率で拡大・縮小する
  let rs = null
  ipcMain.on('resize-start', (_e, edge) => {
    if (!win || lockedSize()) return
    const b = win.getBounds()
    rs = { edge, x0: screen.getCursorScreenPoint().x, w0: b.width, right: b.x + b.width }
    placing = true
  })
  ipcMain.on('resize-move', () => {
    if (!rs || !win) return
    const dx = screen.getCursorScreenPoint().x - rs.x0
    const px = rs.edge === 'right' ? rs.w0 + dx : rs.w0 - dx
    settings.width = Math.max(MIN_W, Math.min(MAX_W, Math.round(px)))
    const z = zoom()
    win.webContents.setZoomFactor(z)
    win.setContentSize(settings.width, Math.max(20, Math.round(contentH * z)))
    if (rs.edge === 'left') win.setPosition(rs.right - settings.width, win.getPosition()[1])
  })
  ipcMain.on('resize-end', () => {
    if (!rs || !win) return
    rs = null
    rememberPosition()
    setTimeout(() => (placing = false), 300)
  })

  ipcMain.on('size', (_e, h) => {
    if (typeof h !== 'number' || h < 10 || h > 400) return
    if (Math.abs(h - contentH) < 1) return
    contentH = h
    resize()
  })

  app.whenReady().then(() => {
    settingsFile = path.join(app.getPath('userData'), 'settings.json')
    cacheFile = path.join(app.getPath('userData'), 'usage-cache.json')
    loadSettings()
    if (!SAMPLE && !SHOT) loadCache()
    if (SHOT) {
      settings.pos = null
      settings.visible = true
      settings.alwaysOnTop = false
      settings.lockPosition = false
      settings.lockSize = false
      settings.opacityMode = (argv.find(a => a.startsWith('--op=')) || '--op=none').slice(5)
      settings.width = argv.includes('--wide') ? 800 : argv.includes('--small') ? 280 : BASE_W
    }
    createWindow()
    if (!SHOT) createTray()

    win.webContents.once('did-finish-load', async () => {
      applyWindowSettings()
      await poll()
      if (SHOT) {
        setTimeout(async () => {
          const img = await win.webContents.capturePage()
          fs.writeFileSync(path.resolve(SHOT), img.toPNG())
          app.quit()
        }, 1500)
      }
    })

    setInterval(poll, 2000) // 実際に取りに行くのは POLL_MS ごと
    // 全画面アプリなどの後でも最前面を取り直す
    setInterval(() => {
      if (win && !win.isDestroyed() && settings.visible && settings.alwaysOnTop) win.setAlwaysOnTop(true, 'screen-saver')
    }, 5000)

    suppressMove(20000) // 起動直後は、ディスプレイがそろうまで位置を保存しない
    const onDisplayChange = () => {
      suppressMove()
      place()
    }
    screen.on('display-added', onDisplayChange)
    screen.on('display-removed', onDisplayChange)
    screen.on('display-metrics-changed', onDisplayChange)
    for (const ev of ['suspend', 'resume', 'lock-screen', 'unlock-screen']) {
      powerMonitor.on(ev, () => {
        suppressMove(30000)
        if (ev === 'resume' || ev === 'unlock-screen') {
          // 復帰したら早めに取り直す(ただし 429 の待ちの途中なら待つ)
          if (!backoffMs) nextPollAt = Math.min(nextPollAt, Date.now() + 10_000)
          setTimeout(place, 3000)
        }
      })
    }
  })

  app.on('window-all-closed', () => app.quit())
}
