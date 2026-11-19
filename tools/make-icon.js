// assets/icon.png (256x256) を生成する。外部ライブラリなしで PNG を書き出す
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const N = 256
const px = Buffer.alloc(N * N * 4)

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const BG = hex('#2a2840')
const TRACK = hex('#3b3950')
const OK = hex('#8fd9bd')
const WARN = hex('#f2a093')
const MARK = hex('#c4b5fd')

// 角丸矩形の内側までの距離(負なら内側)
const sdRound = (x, y, cx, cy, hw, hh, r) => {
  const dx = Math.abs(x - cx) - (hw - r)
  const dy = Math.abs(y - cy) - (hh - r)
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r
}

const put = (x, y, c, a) => {
  const i = (y * N + x) * 4
  const k = a / 255
  px[i] = Math.round(px[i] * (1 - k) + c[0] * k)
  px[i + 1] = Math.round(px[i + 1] * (1 - k) + c[1] * k)
  px[i + 2] = Math.round(px[i + 2] * (1 - k) + c[2] * k)
  px[i + 3] = Math.max(px[i + 3], a)
}

const shape = (cx, cy, hw, hh, r, c) => {
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = sdRound(x + 0.5, y + 0.5, cx, cy, hw, hh, r)
      const a = Math.max(0, Math.min(1, 0.5 - d))
      if (a > 0) put(x, y, c, Math.round(a * 255))
    }
  }
}

shape(128, 128, 124, 124, 48, BG)
// 2本のバー(トラック + 使用分)と、ペースの縦線
shape(128, 92, 88, 11, 11, TRACK)
shape(128 - 88 + 40, 92, 40, 11, 11, OK)
shape(128, 164, 88, 11, 11, TRACK)
shape(128 - 88 + 62, 164, 62, 11, 11, WARN)
shape(128 - 88 + 100, 128, 5, 56, 5, MARK)

const crcTable = zlib.crc32 ? null : null
const crc = buf => zlib.crc32(buf)
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const c = Buffer.alloc(4)
  c.writeUInt32BE(crc(td) >>> 0)
  return Buffer.concat([len, td, c])
}

const raw = Buffer.alloc((N * 4 + 1) * N)
for (let y = 0; y < N; y++) {
  raw[y * (N * 4 + 1)] = 0
  px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4)
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(N, 0)
ihdr.writeUInt32BE(N, 4)
ihdr[8] = 8
ihdr[9] = 6
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])
const out = path.join(__dirname, '..', 'assets', 'icon.png')
fs.writeFileSync(out, png)
console.log('wrote', out, png.length, 'bytes')
