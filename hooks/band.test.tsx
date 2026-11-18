import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'usage-band',
  component: 'AbovePrompt',
  props: { hasSurvey: false },
} as const

// 下層(エンジン)の代役
const engine = (on: any, rateLimits: unknown[]) => {
  const store = new Map<string, { value: unknown; version: number }>()
  const keyOf = (e: any) => `${e.plugin}/${e.key}/${e.id ?? ''}`
  on('clock.now', () => ({ value: Date.now() }))
  on('clock.every', () => ({ value: { cancel() {} } }))
  on('state.get', (_: unknown, e: any) => ({
    value: store.get(keyOf(e)) ?? { value: undefined, version: 0 },
  }))
  on('state.set', (_: unknown, e: any) => {
    const version = (store.get(keyOf(e))?.version ?? 0) + 1
    store.set(keyOf(e), { value: e.value, version })
    return { value: { isSet: true, version } }
  })
  on('session.usage', () => ({ value: { startedAt: 0, context: {}, rateLimits } }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('ui.render', ($: any, e: any) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

test('両方の枠のラベルとリセット時刻が出る', async ($, on) => {
  const soon = new Date(Date.now() + 3600_000).toISOString()
  const later = new Date(Date.now() + 3 * 24 * 3600_000).toISOString()
  engine(on, [
    { kind: 'five_hour', percentUsed: 30, resetsAt: soon },
    { kind: 'seven_day', percentUsed: 80, resetsAt: later },
  ])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /5時間/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /今週/ })).toBeDefined()
    await ui.unmount()
  }
})

test('データがなければ帯を描かない', async ($, on) => {
  engine(on, [])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /5時間/ })).toBeUndefined()
  await ui.unmount()
})
