export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type StepStatus = 'pending' | 'in_progress' | 'completed'

declare module 'claude-code' {
  interface PluginState {
    'usage-meter': { limits: Limit[]; warned: string[]; steps: StepStatus[] }
  }
}
