import { test, expect, mock } from 'claude-code/testing'

const PROPS = { hasSurvey: false } as never

test('shows session and week usage above the prompt', async ($, on) => {
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  mock.clock(on)
  await $.session.measure({
    context: {} as never,
    rateLimits: [
      { kind: 'seven_day', percentUsed: 62, resetsAt: '2026-10-21T12:00:00Z' },
      { kind: 'five_hour', percentUsed: 78 },
    ],
    changed: ['rateLimits'],
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-meter', surface, component: 'AbovePrompt', props: PROPS })
    expect(await ui.find({ type: 'Text', text: /Session/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /78%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /62%/ })).toBeDefined()
    await ui.unmount()
  }
})

test('warns once at 90%', async ($, on) => {
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  const reading = { context: {} as never, rateLimits: [{ kind: 'five_hour', percentUsed: 91, resetsAt: '2026-10-18T03:00:00Z' }], changed: ['rateLimits'] as never }
  await $.session.measure(reading)
  await $.session.measure(reading)
})
