# dsh-title-agent-indicator

DeepSeek Harness (DSH) Web plugin. It shows **how many subagents run for a
session** as **one number**. The number sits on the sidebar status indicator.
When only subagents run, the number grows and fills the center of the status slot.
This does not depend on the host spinner's presence or DOM structure.
When the main agent runs, its spinner stays visible with the number at its corner.
With archive-manager favorites, a subagent-only row uses the full-size favorite.
The favorite replaces the number on hover or while marked as a favorite.
Main activity, warnings, and errors keep the corner favorite.

Two surfaces, same number:

1. **Sidebar session rows**: the number replaces a spinner for subagent-only activity.
   When the main agent runs, the number sits at the spinner's corner.
   Warnings and errors stay visible with the number at the corner.
   Other idle-main states use the larger, centered number.
2. **Session header** — the current session shows the same number next to its
   title.

A session without a running subagent shows nothing. Then the plugin draws no
element at all.

## The number

| Reading | Drawn | When |
| --- | --- | --- |
| `N` | the number of running subagents, on the host's indicator | N descendant subagents of that session run |
| nothing | nothing | no descendant subagent runs |

The main agent's own state — running, waiting for permission, waiting for plan
review, waiting for an answer, finished — is **the host's** job. The official
sidebar draws a status dot for it and codex-ui draws a spinner plus a pending
label. This plugin counts subagents and hides a running glyph that represents
only subagent activity. It keeps warnings and errors clear of the count.

Tooltips and accessible names spell the number out in zh/en: "Only subagents
working: N" or "Main agent working + N subagent(s) running".

## How it works

- **Header seat** — one occupant (order 5) in the
  `conversation.session.header.actions` slot, the title-adjacent row the
  official schedule / jobs / subagent-catalog entries use.
- **Sidebar rows** — the host exposes no per-row slot, so a renderless
  `shell.overlay` occupant (order 200) decorates the rows the host already
  renders.
- **Row identity** — codex-ui labels each row with `data-dcu-session`, which is
  read directly. Every other host is read through the row's React fiber chain
  (`props.sessionId`, `props.node.id`, `props.session.sessionId`, and
  `props.id` together with `props.selected`). The result is cached per row, so a
  repaint never walks a fiber again.
- **Host indicator** — codex-ui's spinner is found by its class
  (`.dcu-wb-running`). The official sidebar's dot is found by its class suffix
  (`..._slot`) or, failing that, by the `aria-hidden` marker the dot and its
  screen-reader text carry. The number is appended **inside** that element. A
  static indicator gets `position: relative` for its lifetime, and the plugin
  removes that style again when it clears the row.
- **No host indicator** — an idle codex-ui row with a running subagent has no
  spinner. There the number leads the row in normal flow instead.
- **Stable repaint** — React re-renders rows on store changes and can drop a
  painted number with its node. A row observer re-asserts the painted rows on
  every mutation tick, and repaints the whole list only when the row **count**
  changes, so a streaming page cannot turn DOM churn into repeated full
  repaints. A paint that would write the same reading returns early.
- **Data** — the standard session list store (`useSessions` → `byId`) only: one
  single-pass fold counts running `origin === "subagent"` descendants toward
  every ancestor in their chain (cycle-guarded, stops at ordinary forks) — the
  same projection the official `ui-subagent` catalog uses. No RPC, no polling,
  nothing stored.

## Install

Clone this repository into your projects directory. Install the local bundle:

```bash
git clone https://github.com/howyay/dsh-title-agent-indicator.git
cd dsh-title-agent-indicator
dsh plugin --profile web add "link:$PWD"
```

Start or restart your DSH Web profile after installation.
This package is not published to npm.

To update the plugin, run `git pull --ff-only` in the cloned directory.
Then restart your DSH Web profile.

## Test

```bash
node test/smoke.cjs   # headless logic test (no browser needed)
```

The smoke test loads `lib/client.js` with a fake module host and a minimal DOM.
It asserts both seat registrations, drives the header number, and drives the
sidebar painter over **both host row shapes**: an official-sidebar row (status
slot with dot) and a codex-ui row (spinner, and an idle row without one). It
checks the number placement inside the host indicator, the `data-dcu-session`
path, nested attribution and a self-parented cycle, idempotent repaints,
clearing, and full cleanup on disposal.

Use an isolated `agent-browser` session for these browser checks:

```bash
AGENT_BROWSER_SESSION=<isolated-session> node test/browser-typography.cjs
AGENT_BROWSER_SESSION=<isolated-session> node test/browser-state.cjs
AGENT_BROWSER_SESSION=<isolated-session> node test/browser-favorite.cjs
```

Set `AGENT_BROWSER` if the executable is not on `PATH`.
The test replaces the isolated page with a fixture.
It measures text alignment under different host fonts and text spacing.
It checks both badge surfaces and preserves the sidebar badge position.
It does not verify the signed-in DSH page.

## Compatibility

- Developed against DSH `0.1.5-rc.1` (engines: `>=0.1.5-rc.1`).
- Session rows: the official sidebar (`@deepseek-ai/dsh-client-ui-workspace`)
  and `@michengai/dsh-codex-ui` 1.1.37.
