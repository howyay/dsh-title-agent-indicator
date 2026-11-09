// Use an isolated browser session. This test replaces its page.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const browser = process.env.AGENT_BROWSER || "agent-browser";
const session = process.env.AGENT_BROWSER_SESSION;
assert.ok(session, "Set AGENT_BROWSER_SESSION to an isolated browser session");
const source = fs.readFileSync(path.join(__dirname, "../lib/client.js"), "utf8");

// Match the installed archive manager's RowFavorite rules, including specificity.
const favoriteCSS = `
.dsham_starSlot{display:none;position:absolute;left:calc(8px + var(--dsh-workspace-indent,0px));inset-inline-start:calc(8px + var(--dsh-workspace-indent,0px));top:50%;transform:translateY(-50%);align-items:center;justify-content:center;box-sizing:border-box;width:16px;height:20px;z-index:1;pointer-events:none}
[data-row-key^='session:']:hover .dsham_starSlot,.dsham_starSlot[data-favorited='true']{display:inline-flex;pointer-events:auto}
[data-row-key^='session:']:hover>span:first-child:not(:has([data-state])),[data-row-key^='session:'][data-dsham-favorited='true']:not([data-dsham-has-status='true'])>span:first-child:not(:has([data-state])){opacity:0}
[data-row-key^='session:'][data-dsham-has-status='true']>span:first-child,[data-row-key^='session:']>span:first-child:has([data-state]){opacity:1}
[data-row-key^='session:'][data-dsham-has-status='true'] .dsham_starSlot,[data-row-key^='session:']:has(>span:first-child [data-state]) .dsham_starSlot{width:10px;height:10px;top:auto;bottom:3px;left:calc(15px + var(--dsh-workspace-indent,0px));inset-inline-start:calc(15px + var(--dsh-workspace-indent,0px));transform:none}
[data-row-key^='session:'][data-dsham-has-status='true'] .dsham_rowStar,[data-row-key^='session:']:has(>span:first-child [data-state]) .dsham_rowStar{width:10px;height:10px}
[data-row-key^='session:'][data-dsham-has-status='true'] .dsham_rowStar svg,[data-row-key^='session:']:has(>span:first-child [data-state]) .dsham_rowStar svg{width:10px;height:10px;filter:drop-shadow(0 0 1px rgba(0,0,0,0.85))}
.dsham_rowStar{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:16px;height:16px;padding:0;border:0;background:transparent;color:white;cursor:pointer;flex:none;border-radius:4px}
.dsham_starSlot[data-favorited='true'] .dsham_rowStar{color:#e8b931}
.dsham_rowStar svg{display:block;width:16px;height:16px;flex:none}
`;
function setup(source, favoriteCSS, hostLast) {
  window.__dtaiFavoriteCleanup?.();
  document.body.replaceChildren();
  document.getElementById("dtai-style")?.remove();
  document.getElementById("favorite-fixture-style")?.remove();
  document.body.style.cssText = "margin:24px;background:#18212e;color:white";
  const hostStyle = document.createElement("style");
  hostStyle.id = "favorite-fixture-style";
  hostStyle.textContent = favoriteCSS;
  if (!hostLast) document.head.append(hostStyle);
  let definition;
  const loader = window.__ModuleLoader__;
  window.__ModuleLoader__ = { load(value) { definition = value; } };
  try { new Function(source)(); } finally { window.__ModuleLoader__ = loader; }
  const seats = new Map();
  const pending = [];
  let hooks = [];
  const disposals = [];
  const module = definition.factory((id) => {
    if (id === "react") return { useEffect(fn) { pending.push(fn); } };
    if (id === "react/jsx-runtime") return { jsx: () => null, jsxs: () => null };
    throw new Error("Unexpected dependency: " + id);
  });
  module.apply({
    effect(fn) { const dispose = fn(); if (dispose) disposals.push(dispose); },
    locale: { register: () => () => {} },
    slots: { inject(_name, fn) { fn(); }, register(options, component) { seats.set(options.id, component); } },
  });
  if (hostLast) document.head.append(hostStyle);
  const byId = {};
  const rows = new Map();
  for (const [id, main, state, child] of [
    ["subs", false, "ongoing", true], ["both", true, "ongoing", true],
    ["warning", false, "warning", true], ["error", false, "error", true],
    ["idle", false, null, false], ["done", false, "done", true],
  ]) {
    byId[id] = { running: main };
    if (child) byId[id + "-child"] = { running: true, origin: "subagent", parentId: id };
    const row = document.createElement("div");
    row.setAttribute("role", "treeitem");
    row.setAttribute("aria-selected", "false");
    row.dataset.rowKey = "session:" + id;
    if (state) row.dataset.dshamHasStatus = "true";
    row.__reactFiber$fixture = { memoizedProps: { node: { id } }, return: null };
    row.style.cssText = "position:relative;display:flex;align-items:center;padding-left:8px;gap:12px;width:240px;height:36px;margin:12px";
    const anchor = document.createElement("span");
    anchor.className = "fixture_slot";
    anchor.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:16px;height:20px;flex:none";
    if (state) {
      const dot = document.createElement("span");
      dot.dataset.state = state;
      dot.setAttribute("aria-hidden", "true");
      dot.style.cssText = "width:16px;height:16px;background:#9ca3af;border-radius:50%";
      anchor.append(dot);
    }
    const title = document.createElement("span"); title.textContent = id;
    const slot = document.createElement("span"); slot.className = "dsham_starSlot";
    const button = document.createElement("button"); button.className = "dsham_rowStar";
    button.setAttribute("aria-label", "Favorite " + id);
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1z"/></svg>';
    let clicks = 0;
    button.addEventListener("click", () => { clicks++; slot.dataset.favorited = "true"; row.dataset.dshamFavorited = "true"; });
    slot.append(button); row.append(anchor, title, slot); document.body.append(row);
    rows.set(id, { row, anchor, slot, button, clicks: () => clicks });
  }
  function render() {
    for (const dispose of hooks) dispose?.(); hooks = [];
    seats.get("title-agent-indicator-rows")({
      useSessions: (select) => select({ byId }), t: (key, args) => key + ":" + args.count,
    });
    for (const fn of pending.splice(0)) hooks.push(fn());
  }
  render();
  window.__dtaiFavorite = { rows, byId, render };
  window.__dtaiFavoriteCleanup = () => {
    for (const dispose of hooks) dispose?.();
    for (const dispose of disposals.reverse()) dispose();
    hostStyle.remove();
  };
}
function measure(id) {
  const { row, anchor, slot, button, clicks } = window.__dtaiFavorite.rows.get(id);
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  const visible = (el) => {
    if (!el || !el.getClientRects().length) return false;
    for (let node = el; node instanceof Element; node = node.parentElement) {
      const s = getComputedStyle(node);
      if (s.display === "none" || s.visibility !== "visible" || s.opacity === "0") return false;
    }
    return true;
  };
  const r = slot.getBoundingClientRect();
  const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return { id, row: rect(row), anchor: rect(anchor), slot: rect(slot), button: rect(button),
    svg: rect(button.querySelector("svg")), starVisible: visible(button), badgeVisible: visible(row.querySelector(".dtai-num")),
    hit: button === hit || button.contains(hit), clicks: clicks(), hover: row.matches("[data-row-key]:hover") };
}
function command(args, input) {
  const reply = JSON.parse(execFileSync(browser, ["--session", session, ...args, "--json"], { input, encoding: "utf8" }));
  assert.equal(reply.success, true, JSON.stringify(reply));
  return reply.data;
}
const evaluate = (code) => command(["eval", "--stdin"], code).result;
function sample(id) { return evaluate(`(${measure.toString()})(${JSON.stringify(id)})`); }
function hover(id) {
  const box = sample(id).row;
  command(["mouse", "move", String(box.x + 120), String(box.y + box.h / 2)]);
  const actual = sample(id);
  assert.equal(actual.hover, true, "Hover the session row");
  return actual;
}
function fullSize(actual, reference) {
  assert.equal(actual.starVisible, true, JSON.stringify(actual));
  for (const name of ["slot", "button", "svg"]) {
    assert.equal(actual[name].w, reference[name].w, "Match idle favorite width: " + JSON.stringify(actual));
    assert.equal(actual[name].h, reference[name].h, "Match idle favorite height: " + JSON.stringify(actual));
  }
  assert.ok(Math.abs(actual.slot.x - actual.anchor.x) <= 0.1, "Center favorite horizontally: " + JSON.stringify(actual));
  assert.ok(Math.abs(actual.slot.y + actual.slot.h / 2 - actual.anchor.y - actual.anchor.h / 2) <= 0.1,
    "Center favorite vertically: " + JSON.stringify(actual));
  assert.equal(actual.badgeVisible, false, "Hide badge behind favorite: " + JSON.stringify(actual));
  assert.equal(actual.hit, true, "Favorite must receive pointer input: " + JSON.stringify(actual));
}
for (const hostLast of [false, true]) {
  command(["mouse", "move", "1", "1"]);
  evaluate(`(${setup.toString()})(${JSON.stringify(source)},${JSON.stringify(favoriteCSS)},${hostLast})`);
  assert.equal(sample("subs").badgeVisible, true, "Keep count outside hover");
  const idle = hover("idle");
  assert.equal(idle.button.w, 16);
  for (const id of ["subs", "done"]) fullSize(hover(id), idle);
  for (const id of ["both", "warning", "error"]) {
    const actual = hover(id);
    assert.equal(actual.button.w, 10, "Keep main activity and alerts unchanged");
    assert.equal(actual.badgeVisible, true);
  }
  evaluate('window.__dtaiFavorite.byId.subs.running=true;window.__dtaiFavorite.render()');
  assert.equal(hover("subs").button.w, 10, "Use corner favorite when main resumes");
  evaluate('window.__dtaiFavorite.byId.subs.running=false;window.__dtaiFavorite.render()');
  const target = hover("subs"); fullSize(target, idle);
  command(["mouse", "move", String(target.slot.x + target.slot.w / 2), String(target.slot.y + target.slot.h / 2)]);
  command(["mouse", "down"]); command(["mouse", "up"]);
  assert.equal(sample("subs").clicks, 1, "Keep native favorite click handler");
  command(["mouse", "move", "1", "1"]);
  fullSize(sample("subs"), idle);
  evaluate('delete window.__dtaiFavorite.rows.get("subs").slot.dataset.favorited;delete window.__dtaiFavorite.rows.get("subs").row.dataset.dshamFavorited');
  assert.equal(sample("subs").badgeVisible, true, "Restore count after hover");
  evaluate('window.__dtaiFavorite.byId["subs-child"].running=false;window.__dtaiFavorite.render()');
  assert.equal(hover("subs").button.w, 10, "Clear overrides after child stops");
  evaluate("window.__dtaiFavoriteCleanup()");
}
console.log("BROWSER FAVORITE CHECKS PASSED");
