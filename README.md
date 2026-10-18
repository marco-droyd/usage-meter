# usage-meter

A Claude Code mod that shows your plan's usage right above the message box:

- **Session** (the 5-hour window) and **Week**, each with a bar, a percentage and when it resets
- Black band with purple bars. The bar and its label turn yellow in the 80s and red from 90%
- A one-time pop-up warning when a window reaches 90%
- **Task**: how far Claude is through its current task list, as the share of steps checked off.
  It counts steps, not effort, and clears when you send your next message after a finished task.
  The task list comes from the Claude desktop app's Code tab, so Task only shows there.

Works in Claude Code in the terminal and in the Code tab of the Claude desktop app. It needs a
Claude subscription (the usage numbers come from your plan's rate limits).

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install usage-meter --marketplace marco-droyd/usage-meter
```

Answer `y` to add the marketplace, then pick the user scope.

From a shell:

```
claude plugin install usage-meter --marketplace marco-droyd/usage-meter
```

In the Claude desktop app (where `/plugin` doesn't run): click **+** next to the prompt box, then
**Plugins**, **Add marketplace** with `marco-droyd/usage-meter`, then **Add plugin**.

## Changing the colours

The colours live in one line near the top of `usage-meter/hooks/register.tsx`:

```ts
const MIDNIGHT = { bg: '#0b0b0b', purple: '#9d7bff', yellow: '#ffd84d', red: '#ff5c5c', ... }
```

## License

MIT, see [LICENSE](LICENSE).
