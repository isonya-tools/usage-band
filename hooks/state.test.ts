import { expect, test } from 'claude-code/testing'

// 下層(エンジン)の代役。fs.write で書かれた内容を集める
const engine = (on: any, writes: { path: string; text: string }[], rateLimits: unknown[]) => {
  on('clock.every', () => ({ value: { cancel() {} } }))
  on('env.get', () => ({ value: 'C:\\Users\\test' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits } }))
  on('fs.write', (_: unknown, e: any) => {
    writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
}

test('session.start で使用率を状態ファイルに書き出す', async ($, on) => {
  const writes: { path: string; text: string }[] = []
  engine(on, writes, [{ kind: 'five_hour', percentUsed: 30, resetsAt: '2099-01-01T00:00:00Z' }])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect(writes.length).toBeGreaterThan(0)
  expect(writes[0].path).toContain('.claude\\usage-band\\state\\')
  const data = JSON.parse(writes[0].text)
  expect(data.running).toBe(false)
  expect(data.limits[0].kind).toBe('five_hour')
  expect(data.limits[0].percentUsed).toBe(30)
})
