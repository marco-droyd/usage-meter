export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type StepStatus = 'pending' | 'in_progress' | 'completed'
export type TaskTiming = { startedAt: number; lastDoneAt: number; done: number; base: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-meter': { limits: Limit[]; warned: string[]; steps: StepStatus[]; timing: TaskTiming }
  }
}
