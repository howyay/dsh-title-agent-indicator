// Run in an isolated browser session. This test replaces its page.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const browser = process.env.AGENT_BROWSER || "agent-browser";
const session = process.env.AGENT_BROWSER_SESSION;
assert.ok(session, "Set AGENT_BROWSER_SESSION to an isolated browser session");
const source = fs.readFileSync(path.join(__dirname, "../lib/client.js"), "utf8");

async function fixture(source) {
  window.__dtaiStateCleanup?.();
  document.body.replaceChildren();
  document.getElementById("dtai-style")?.remove();
  document.body.style.cssText = "margin:24px;background:#18212e;color:white";
  const seats = new Map();
  const disposals = [];
  const hooks = [];
  let cursor = 0;
  let pending = [];
  let definition;
  const loader = window.__ModuleLoader__;
  window.__ModuleLoader__ = { load(value) { definition = value; } };
  try { new Function(source)(); }
  finally { window.__ModuleLoader__ = loader; }
  const module = definition.factory((id) => {
    if (id === "react") return {
      useEffect(fn, deps) {
        const i = cursor++;
        const previous = hooks[i];
        if (previous && deps && deps.length === previous.deps?.length
          && deps.every((value, index) => Object.is(value, previous.deps[index]))) return;
        pending.push(() => {
          previous?.dispose?.();
          hooks[i] = { deps, dispose: fn() };
        });
      },
    };
    if (id === "react/jsx-runtime") return { jsx: () => null, jsxs: () => null };
    throw new Error("Unexpected dependency: " + id);
  });
  module.apply({
    effect(fn) { const dispose = fn(); if (dispose) disposals.push(dispose); },
    locale: { register: () => () => {} },
    slots: {
      inject(_name, fn) { fn(); },
      register(options, component) { seats.set(options.id, component); },
    },
  });
  const byId = {};
  const rows = new Map();
  function make(id, kind) {
    byId[id] = { running: true };
    byId[id + "-child"] = { running: true, origin: "subagent", parentId: id };
    const row = document.createElement("div");
    row.setAttribute("role", "treeitem");
    row.setAttribute("aria-selected", "false");
    row.__reactFiber$fixture = { memoizedProps: { node: { id } }, return: null };
    row.style.cssText = "position:relative;display:flex;align-items:center;gap:12px;width:220px;height:36px;margin:12px";
    let anchor;
    if (kind !== "flow") {
      anchor = document.createElement("span");
      anchor.className = kind === "codex" ? "dcu-wb-running" : "fixture_slot";
      anchor.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:16px;height:20px";
      if (kind === "codex") anchor.style.position = "absolute";
      row.append(anchor);
    }
    const title = document.createElement("span");
    title.textContent = id;
    row.append(title);
    document.body.append(row);
    rows.set(id, { row, anchor, kind });
    if (anchor) glyph(id, "ongoing", kind === "nested");
  }
  function glyph(id, state, nested = false) {
    const { anchor } = rows.get(id);
    for (const child of [...anchor.children]) {
      if (!child.classList.contains("dtai-num")) child.remove();
    }
    const dot = document.createElement("span");
    dot.setAttribute("aria-hidden", "true");
    dot.dataset.state = state;
    dot.style.cssText = "display:block;width:12px;height:12px;border-radius:50%;background:#aaa";
    if (nested) {
      const wrapper = document.createElement("span");
      wrapper.append(dot);
      anchor.prepend(wrapper);
    } else anchor.prepend(dot);
  }
  for (const kind of ["flat", "nested", "done", "idle", "codex", "flow", "warning", "error"]) make(kind, kind);
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const translate = () => "Subagents";
  async function render() {
    cursor = 0;
    pending = [];
    seats.get("title-agent-indicator-rows")({ useSessions: (select) => select({ byId }), t: translate });
    for (const effect of pending) effect();
    await nextFrame();
  }
  function read(id) {
    const { row, anchor } = rows.get(id);
    const badge = row.querySelector(".dtai-num");
    const rect = badge?.getBoundingClientRect();
    const target = anchor?.getBoundingClientRect();
    const css = badge && getComputedStyle(badge);
    const dot = row.querySelector("[data-state]");
    return {
      id, count: badge?.textContent, width: rect?.width, height: rect?.height,
      fontSize: css?.fontSize, position: css?.position, visibility: css?.visibility,
      dx: target && rect ? rect.x + rect.width / 2 - target.x - target.width / 2 : null,
      dy: target && rect ? rect.y + rect.height / 2 - target.y - target.height / 2 : null,
      dotVisibility: dot && getComputedStyle(dot).visibility,
      marked: row.hasAttribute("data-dtai-subs-only"),
    };
  }
  const phases = {};
  await render();
  phases.running = [...rows.keys()].map(read);
  for (const id of rows.keys()) byId[id].running = false;
  glyph("nested", "ongoing", true);
  glyph("done", "done", true);
  glyph("idle", "idle", true);
  glyph("warning", "warning", true);
  glyph("error", "error", true);
  await render();
  phases.idle = [...rows.keys()].map(read);
  // Replace the host glyph without changing the main state or the count.
  glyph("flat", "done", true);
  await nextFrame();
  phases.replaced = read("flat");
  for (const id of rows.keys()) byId[id].running = true;
  for (const [id, { anchor }] of rows) if (anchor) glyph(id, "ongoing", true);
  await render();
  phases.resumed = [...rows.keys()].map(read);
  for (const id of rows.keys()) byId[id + "-child"].running = false;
  await render();
  phases.stopped = [...rows.keys()].map(read);
  window.__dtaiStateCleanup = () => {
    for (const hook of hooks) hook?.dispose?.();
    for (const dispose of disposals.reverse()) dispose();
  };
  return phases;
}
const output = execFileSync(browser, ["--session", session, "--json", "eval", "--stdin"], {
  input: `(${fixture.toString()})(${JSON.stringify(source)})`, encoding: "utf8", maxBuffer: 2e6,
});
const reply = JSON.parse(output);
assert.ok(reply.success, reply.error);
const phases = reply.data.result;
for (const phase of ["running", "resumed"]) for (const row of phases[phase]) {
  assert.equal(row.height, 13, `${phase}: keep a small count: ${JSON.stringify(row)}`);
  assert.equal(row.fontSize, "9px");
  assert.equal(row.marked, false);
  assert.equal(row.visibility, "visible");
  if (row.id !== "flow") {
    assert.ok(Math.abs(row.dx) > 1 && Math.abs(row.dy) > 1, "Keep the count at the corner");
    assert.equal(row.dotVisibility, "visible");
  }
}
for (const row of [...phases.idle, phases.replaced]) {
  assert.equal(row.count, "1");
  assert.equal(row.visibility, "visible");
  assert.equal(row.marked, true);
  if (["warning", "error"].includes(row.id)) {
    assert.equal(row.height, 13, "Keep alerts clear");
    assert.equal(row.dotVisibility, "visible");
    assert.ok(Math.abs(row.dx) > 1 && Math.abs(row.dy) > 1, "Do not cover alerts");
  } else {
    assert.equal(row.height, 18, `Enlarge the idle-main count: ${JSON.stringify(row)}`);
    assert.equal(row.fontSize, "11px");
    if (row.id === "flow") assert.equal(row.position, "relative");
    else {
      assert.ok(Math.abs(row.dx) < 0.1 && Math.abs(row.dy) < 0.1,
        "Center the idle-main count: " + JSON.stringify(row));
      if (["flat", "nested", "codex"].includes(row.id) && row !== phases.replaced) assert.equal(row.dotVisibility, "hidden");
    }
  }
}
for (const row of phases.stopped) {
  assert.equal(row.count, undefined, "Remove the count when children stop");
  assert.equal(row.marked, false);
  if (row.id !== "flow") assert.equal(row.dotVisibility, "visible");
}
console.log("BROWSER STATE CHECKS PASSED");
