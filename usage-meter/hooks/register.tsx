import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, StepStatus, TaskTiming } from '../types'

// The plan's rate-limit windows, as the engine reports them with each response.
const limits = atom({ plugin: 'usage-meter', key: 'limits' } as const, [] as Limit[])
// Windows already warned about at 90%, so the toast shows once per window.
const warned = atom({ plugin: 'usage-meter', key: 'warned' } as const, [] as string[])
// Claude's task list in the desktop app (update_plan), one status per step.
const steps = atom({ plugin: 'usage-meter', key: 'steps' } as const, [] as StepStatus[])
// When the task list started and when its latest step was checked off, for the time-left guess.
const timing = atom({ plugin: 'usage-meter', key: 'timing' } as const, { startedAt: 0, lastDoneAt: 0, done: 0, base: 0 } as TaskTiming)

const PLAN_TOOL = 'mcp__ccd_turn__update_plan'
const WRAP_TOOL = 'mcp__ccd_turn__wrap_up'

const NAMES: Record<string, string> = { five_hour: 'Session', seven_day: 'Week', spend_limit: 'Spend' }
const ORDER = ['five_hour', 'seven_day', 'spend_limit']
// "Midnight" style: black band, purple as the normal colour. Each label takes its bar's colour.
const MIDNIGHT = { bg: '#0b0b0b', purple: '#9d7bff', yellow: '#ffd84d', red: '#ff5c5c', muted: '#777777', divider: '#555555' }

function untilText(resetsAt: string | undefined, now: number): string {
  if (!resetsAt) return ''
  const ms = Date.parse(resetsAt) - now
  if (!(ms > 0)) return 'resetting'
  const mins = Math.round(ms / 60000)
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function bar(pct: number): string {
  const filled = Math.max(0, Math.min(10, Math.round(pct / 10)))
  return '█'.repeat(filled) + '░'.repeat(10 - filled)
}

// Time left = average time per finished step so far x steps left, minus time already spent on
// the current step. A guess: steps differ in size, so it firms up as more steps finish.
function leftText(plan: StepStatus[], t: TaskTiming, now: number): string {
  const left = plan.filter(s => s !== 'completed').length
  if (left === 0) return ''
  // Only steps finished since the list started count; ones already ticked when it arrived don't.
  const finished = t.done - t.base
  if (finished <= 0) return 'estimating'
  const perStep = (t.lastDoneAt - t.startedAt) / finished
  const ms = perStep * left - (now - t.lastDoneAt)
  const mins = Math.round(ms / 60000)
  if (mins < 1) return '1m left'
  if (mins < 60) return `${mins}m left`
  return `${Math.floor(mins / 60)}h ${mins % 60}m left`
}

type PlanCall = {
  items?: { status: StepStatus }[]
  advance?: boolean
  done?: number[]
  start?: number
}

// Applies one update_plan call to the step list, the way the app reads it.
function applyPlan(prev: StepStatus[], call: PlanCall): StepStatus[] {
  if (call.items) return call.items.map(i => i.status)
  const next = [...prev]
  if (call.advance) {
    const cur = next.indexOf('in_progress')
    if (cur >= 0) next[cur] = 'completed'
    const pending = next.indexOf('pending')
    if (pending >= 0) next[pending] = 'in_progress'
  }
  for (const n of call.done ?? []) if (next[n - 1]) next[n - 1] = 'completed'
  if (call.start && next[call.start - 1]) {
    const cur = next.indexOf('in_progress')
    if (cur >= 0 && cur !== call.start - 1) next[cur] = 'pending'
    next[call.start - 1] = 'in_progress'
  }
  return next
}

async function store($: EngineInterface, list: Limit[]): Promise<void> {
  const clean = list.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))
  await update($, limits, () => clean)
  const already = await read($, warned)
  for (const l of clean) {
    const tag = `${l.kind}@${l.resetsAt ?? ''}`
    if (l.percentUsed >= 90 && !already.includes(tag)) {
      $.ui.toast(`Heads up: ${NAMES[l.kind] ?? l.kind} usage is at ${l.percentUsed}%`)
      await update($, warned, w => [...w, tag])
    }
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    // Redraw every 15 s while a task runs, so the time left counts down. Local only: no model calls.
    $.clock.every(15000, () => {
      void read($, steps).then(list => {
        if (list.some(s => s !== 'completed')) $.ui.invalidate('ui.render')
      })
    })
    try {
      const u = await $.session.usage()
      await store($, u.rateLimits)
    } catch {
      // no reading yet; session.measure fills it in after the first reply
    }
    return r
  })

  on('session.measure', async ($, e, next) => {
    await store($, e.rateLimits)
    return next(e)
  })

  on('tool.call', { tool: PLAN_TOOL }, async ($, e, next) => {
    const r = await next(e)
    if (r.deny === undefined && r.isError !== true) {
      const prev = await read($, steps)
      const now = await $.clock.now()
      const fresh = prev.length === 0 || prev.every(s => s === 'completed')
      const nextSteps = applyPlan(prev, e as unknown as PlanCall)
      const doneNow = nextSteps.filter(s => s === 'completed').length
      await update($, timing, t =>
        fresh ? { startedAt: now, lastDoneAt: now, done: doneNow, base: doneNow }
        : doneNow > t.done ? { ...t, lastDoneAt: now, done: doneNow }
        : t)
      await update($, steps, () => nextSteps)
    }
    return r
  })

  // Wrapping up checks off the whole list.
  on('tool.call', { tool: WRAP_TOOL }, async ($, e, next) => {
    const r = await next(e)
    await update($, steps, prev => prev.map(() => 'completed' as StepStatus))
    return r
  })

  // A finished list clears when you send the next message.
  on('prompt.submit', async ($, e, next) => {
    const list = await read($, steps)
    if (list.length > 0 && list.every(s => s === 'completed')) await update($, steps, () => [])
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, limits)
    const plan = await read($, steps)
    if (e.props.hasSurvey || (list.length === 0 && plan.length === 0)) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const now = await $.clock.now()
    const sorted = [...list].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
    const taskPct = plan.length ? Math.round((plan.filter(s => s === 'completed').length / plan.length) * 100) : 0
    const taskLeft = plan.length ? leftText(plan, await read($, timing), now) : ''
    // Each segment gets an equal share of the band: halves without a task, thirds with one.
    // Task goes last, so Session and Week keep their order when a task starts or ends.
    const segs = sorted.map(l => {
      const color = l.percentUsed >= 90 ? MIDNIGHT.red : l.percentUsed >= 80 ? MIDNIGHT.yellow : MIDNIGHT.purple
      return { key: l.kind, label: NAMES[l.kind] ?? l.kind, pct: l.percentUsed, color, extra: untilText(l.resetsAt, now) }
    })
    if (plan.length > 0) segs.push({ key: 'task', label: 'Task', pct: taskPct, color: MIDNIGHT.purple, extra: taskLeft })
    // Equal-width segments (flex basis 0, grow 1), each centred between its dividers or the band's edge.
    return (
      <Box key="usage" backgroundColor={MIDNIGHT.bg} paddingX={1} width="100%" flexDirection="row">
        {segs.flatMap((s, i) => [
          ...(i > 0 ? [<Text key={`div-${s.key}`} color={MIDNIGHT.divider}>|</Text>] : []),
          <Box key={s.key} width={0} flexGrow={1} flexDirection="row" justifyContent="center">
            <Text>
              <Text weight="bold" color={s.color}>{s.label} </Text>
              <Text color={s.color}>{bar(s.pct)} {s.pct}%</Text>
              {s.extra ? <Text color={MIDNIGHT.muted}>{' ' + s.extra}</Text> : null}
            </Text>
          </Box>,
        ])}
      </Box>
    )
  })
}
