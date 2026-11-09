// Headless smoke test for dsh-title-agent-indicator lib/client.js.
// Simulates the client module host (ModuleLoader + react + cordis ctx) and a
// minimal DOM, then drives both seats: the header number and the sidebar
// painter, over an official sidebar row and a codex-ui row.
const assert = require("node:assert");

const PLUGIN = require("node:path").join(__dirname, "../lib/client.js");

/* ------------------------------ fake DOM --------------------------------- */

class FakeElement {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.attributes = {};
    const attributes = this.attributes;
    const attrName = (key) => "data-" + String(key).replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
    // Mirrors the real DOM: dataset writes are attribute writes.
    this.dataset = new Proxy({}, {
      get: (_target, key) => attributes[attrName(key)],
      set: (_target, key, value) => { attributes[attrName(key)] = String(value); return true; },
      deleteProperty: (_target, key) => { delete attributes[attrName(key)]; return true; },
      has: (_target, key) => attrName(key) in attributes,
    });
    this.style = {};
    this.className = "";
    this.text = "";
    this.title = "";
    this.parent = null;
    this.isConnected = false;
  }
  get textContent() {
    if (this.children.length === 0) return this.text;
    return this.text + this.children.map((c) => c.textContent).join("");
  }
  set textContent(value) {
    for (const child of this.children) child.parent = null;
    this.children = [];
    this.text = String(value);
  }
  get firstElementChild() {
    return this.children[0] ?? null;
  }
  get parentElement() {
    return this.parent;
  }
  get nextElementSibling() {
    if (this.parent === null) return null;
    const index = this.parent.children.indexOf(this);
    return this.parent.children[index + 1] ?? null;
  }
  get classList() {
    return { contains: (name) => this.className.split(" ").includes(name) };
  }
  prepend(...nodes) {
    for (const child of nodes) {
      child.detach();
      child.parent = this;
      this.children.unshift(child);
      child.markConnected();
    }
    return nodes[0];
  }
  append(...nodes) {
    for (const child of nodes) {
      child.detach();
      child.parent = this;
      this.children.push(child);
      child.markConnected();
    }
    return nodes[0];
  }
  detach() {
    if (this.parent === null) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = null;
  }
  markConnected() {
    this.isConnected = true;
    for (const child of this.children) child.markConnected();
  }
  markDisconnected() {
    this.isConnected = false;
    for (const child of this.children) child.markDisconnected();
  }
  remove() {
    this.detach();
    this.markDisconnected();
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }
  matches(selector) {
    if (selector === '[role="treeitem"][aria-selected]') {
      return this.attributes.role === "treeitem" && this.hasAttribute("aria-selected");
    }
    if (selector.startsWith(".")) return this.className.split(" ").includes(selector.slice(1));
    const data = /^\[data-([a-z0-9-]+)\]$/.exec(selector);
    if (data) return this.hasAttribute("data-" + data[1]);
    if (selector === "[aria-hidden]") return this.hasAttribute("aria-hidden");
    return false;
  }
  descendants() {
    const out = [];
    for (const child of this.children) out.push(child, ...child.descendants());
    return out;
  }
  querySelector(selector) {
    const scoped = /^:scope > (.+)$/.exec(selector);
    if (scoped) return this.children.find((c) => c.matches(scoped[1])) ?? null;
    return this.descendants().find((c) => c.matches(selector)) ?? null;
  }
  querySelectorAll(selector) {
    return this.descendants().filter((c) => c.matches(selector));
  }
}

/** Computed position of a fake element: codex-ui's spinner is absolute. */
function computedPosition(element) {
  if (element.style.position) return element.style.position;
  return element.className.split(" ").includes("dcu-wb-running") ? "absolute" : "static";
}

function makeDoc() {
  const doc = {
    head: null,
    body: null,
    getElementById: () => null,
    createElement: (tag) => new FakeElement(tag, doc),
    querySelectorAll: (selector) => doc.body.querySelectorAll(selector),
  };
  doc.defaultView = { getComputedStyle: (element) => ({ position: computedPosition(element) }) };
  doc.head = new FakeElement("head", doc);
  doc.body = new FakeElement("body", doc);
  doc.body.markConnected();
  return doc;
}

const doc = makeDoc();
global.document = doc;
global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
global.cancelAnimationFrame = (handle) => clearTimeout(handle);
const observers = [];
global.MutationObserver = class {
  constructor(callback) {
    this.callback = callback;
    observers.push(this);
  }
  observe() {}
  disconnect() {}
};
/** Let one queued animation frame run, as a browser would. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
/** Fire the newest row observer, then let its frame run. */
async function tick() {
  const observer = observers[observers.length - 1];
  if (observer) observer.callback();
  await settle();
}

/* --------------------------- fake module host ----------------------------- */

const jsxRuntime = {
  jsx: (type, props, key) => ({ $$type: type, props, key }),
  jsxs: (type, props, key) => ({ $$type: type, props, key }),
  Fragment: "Fragment",
};
const effects = [];
const reactStub = {
  useEffect(fn) {
    effects.push(fn);
  },
};

let loaded = null;
global.window = { __ModuleLoader__: { load: (def) => { loaded = def; } } };
const requireMap = { "react/jsx-runtime": jsxRuntime, react: reactStub };
const src = require("node:fs").readFileSync(PLUGIN, "utf8");
new Function("window", src + "\n//# sourceURL=client.js")(global.window);

assert.ok(loaded, "ModuleLoader.load was not called");
assert.equal(loaded.id, "dsh-title-agent-indicator");
const mod = loaded.factory((id) => {
  if (requireMap[id]) return requireMap[id];
  throw new Error("unexpected require: " + id);
});
assert.equal(typeof mod.apply, "function", "exports.apply missing");
assert.deepEqual(mod.inject, ["slots", "locale"]);

/* ------------------------------ fake ctx ---------------------------------- */

const seats = new Map();
let localeRegistered = null;
const ctx = {
  effect(fn) { const dispose = fn(); return typeof dispose === "function" ? dispose : undefined; },
  locale: { register(ns, dicts) { localeRegistered = { ns, dicts }; return () => {}; } },
  slots: {
    inject(name, register) { assert.ok(typeof name === "string"); register(); },
    register(options, component) { seats.set(options.id, { options, component }); return options; },
  },
};
mod.apply(ctx);

assert.ok(localeRegistered.dicts.zh && localeRegistered.dicts.en);
const headerSeat = seats.get("title-agent-indicator");
const rowsSeat = seats.get("title-agent-indicator-rows");
assert.ok(headerSeat && rowsSeat, "both seats must register");
assert.equal(headerSeat.options.name, "conversation.session.header.actions");
assert.equal(headerSeat.options.order, 5);
assert.equal(rowsSeat.options.name, "shell.overlay");
assert.equal(doc.head.children.length, 1, "one style element");
assert.match(doc.head.children[0].textContent, /\.dtai-num\{/, "the number style is injected");
assert.match(doc.head.children[0].textContent, /\.dtai-root\{/, "the header style is injected");

/* ------------------------------- helpers ---------------------------------- */

const t = (key, params) => key + (params && params.count !== undefined ? "#" + params.count : "");
const SUM = (running, origin, parentId) => ({ running, origin, parentId });

function renderHeader(byId, sessionId) {
  return headerSeat.component({
    sessionId,
    useSessions: (select) => select({ byId }),
    t,
  });
}

/* ---------------------------- header number ------------------------------- */

{
  assert.equal(renderHeader({ a: SUM(false) }, "a"), null, "idle header must render nothing");
  assert.equal(renderHeader({ a: SUM(true) }, "a"), null, "the header shows subagents only");
  assert.equal(renderHeader({ a: SUM(false) }, undefined), null, "a sessionless header renders nothing");
}
{
  const byId = { a: SUM(false), s1: SUM(true, "subagent", "a") };
  const out = renderHeader(byId, "a");
  assert.equal(out.props.className, "dtai-root");
  assert.equal(out.props.children, "1", "the indicator is just the number");
  assert.equal(out.props.title, "tip.subs#1");
  assert.equal(out.props.role, "status");
}
{
  const byId = { a: SUM(true), s1: SUM(true, "subagent", "a"), s2: SUM(true, "subagent", "s1") };
  const out = renderHeader(byId, "a");
  assert.equal(out.props.children, "2", "nested subagents count once each");
  assert.equal(out.props.title, "tip.both#2");
}
{
  // a self-parented chain must not hang
  const byId = { cyc: SUM(true, "subagent", "cyc") };
  const out = renderHeader(byId, "cyc");
  assert.equal(out.props.children, "1");
  assert.equal(renderHeader(byId, "other"), null);
}

/* ---------------------------- sidebar painter ----------------------------- */

// Official sidebar row: [status slot (dot + aria-hidden)][title][time], with the
// session id reachable through the row's fiber chain.
function makeOfficialRow(target, sessionId) {
  const row = target.createElement("div");
  row.setAttribute("role", "treeitem");
  row.setAttribute("aria-selected", "false");
  if (sessionId !== null) {
    row["__reactFiber$test"] = { memoizedProps: { node: { id: sessionId } }, return: null };
  }
  const slot = target.createElement("span");
  slot.className = "YDXeBa_slot";
  const dot = target.createElement("svg");
  dot.setAttribute("aria-hidden", "true");
  dot.dataset.state = "ongoing";
  slot.append(dot);
  const srText = target.createElement("span");
  srText.className = "YDXeBa_visuallyHidden";
  srText.textContent = "Running";
  slot.append(srText);
  const title = target.createElement("span");
  title.className = "YDXeBa_title";
  title.textContent = sessionId === null ? "unattributed" : "title-" + sessionId;
  const time = target.createElement("span");
  time.textContent = "now";
  row.append(slot, title, time);
  row.slot = slot;
  row.markConnected();
  target.body.append(row);
  return row;
}

// codex-ui row: the session id is tagged on the row itself, and the running
// spinner is a later sibling that the host positions absolutely at the left.
function makeCodexRow(target, sessionId, running) {
  const row = target.createElement("div");
  row.setAttribute("role", "treeitem");
  row.setAttribute("aria-selected", "false");
  row.dataset.dcuSession = sessionId;
  const copy = target.createElement("span");
  copy.className = "dcu-wb-session-copy";
  const title = target.createElement("span");
  title.className = "dcu-wb-session-title";
  title.textContent = "title-" + sessionId;
  copy.append(title);
  const time = target.createElement("span");
  time.className = "dcu-wb-session-time";
  time.textContent = "now";
  row.append(copy, time);
  row.spinner = null;
  if (running) row.spinner = addCodexSpinner(row);
  row.markConnected();
  target.body.append(row);
  return row;
}

function addCodexSpinner(row) {
  const spinner = doc.createElement("span");
  spinner.className = "dcu-wb-running";
  spinner.setAttribute("aria-hidden", "true");
  row.append(spinner);
  return spinner;
}

const rows = {
  subsOnly: makeOfficialRow(doc, "subs-only"),
  both: makeOfficialRow(doc, "both"),
  idle: makeOfficialRow(doc, "idle"),
  codexRun: makeCodexRow(doc, "codex-run", true),
  codexIdle: makeCodexRow(doc, "codex-idle", false),
  orphan: makeOfficialRow(doc, null),
};

{
  const project = doc.createElement("div");
  project.setAttribute("role", "treeitem");
  project.setAttribute("aria-expanded", "true");
  project["__reactFiber$test"] = { memoizedProps: { node: { id: "workspace-1" } }, return: null };
  const slot = doc.createElement("span");
  slot.className = "YDXeBa_slot";
  const dot = doc.createElement("span");
  dot.setAttribute("aria-hidden", "true");
  slot.append(dot);
  project.append(slot);
  project.slot = slot;
  project.markConnected();
  doc.body.append(project);
  rows.project = project;
}

let store = {
  byId: {
    "subs-only": SUM(false),
    s1: SUM(true, "subagent", "subs-only"),
    both: SUM(true),
    b1: SUM(true, "subagent", "both"),
    b2: SUM(true, "subagent", "b1"),
    idle: SUM(true),
    "codex-run": SUM(true),
    c1: SUM(true, "subagent", "codex-run"),
    "codex-idle": SUM(false),
    d1: SUM(true, "subagent", "codex-idle"),
    "workspace-1": SUM(true),
    w1: SUM(true, "subagent", "workspace-1"),
  },
};

function runSidebar() {
  for (const effect of effects.splice(0)) {
    if (typeof effect.dispose === "function") effect.dispose();
  }
  const out = rowsSeat.component({
    useSessions: (select) => select(store),
    t,
  });
  assert.equal(out, null, "sidebar seat renders nothing");
  for (const effect of effects) {
    const dispose = effect();
    if (typeof dispose === "function") effect.dispose = dispose;
  }
}

runSidebar();

{
  assert.equal(rows.subsOnly.dataset.dtaiSubsOnly, "1", "hide the subagent-only spinner");
  assert.equal(rows.both.dataset.dtaiSubsOnly, undefined, "keep the main-agent spinner");
  assert.equal(rows.idle.dataset.dtaiSubsOnly, undefined, "leave idle rows unchanged");
  assert.equal(rows.codexIdle.dataset.dtaiSubsOnly, "1");
  const css = doc.head.children.find((child) => child.tagName === "STYLE").textContent;
  assert.ok(css.includes('[data-dtai-subs-only] [data-state="ongoing"]'), "hide only running status");
  assert.ok(css.includes('[data-dtai-subs-only] > .dcu-wb-running'), "hide the codex spinner");
  assert.ok(css.includes("visibility:visible"), "keep the count visible inside a hidden spinner");
  assert.ok(css.includes('[data-dtai-subs-only]:not(:has([data-state="warning"],[data-state="error"])) .dtai-num{min-width:18px;height:18px;border-radius:9px;font-size:11px}'), "enlarge the idle-main count without covering alerts");
  assert.ok(css.includes('[data-dtai-subs-only]:not(:has([data-state="warning"],[data-state="error"])) .dtai-num:not(.dtai-num-flow){top:50%;right:50%;transform:translate(50%,-50%)}'), "center the idle-main count without requiring a spinner sibling");
  assert.ok(!css.includes('[data-state="ongoing"] ~ .dtai-num'), "do not depend on the host spinner structure");
  assert.ok(!css.includes('[data-state="warning"]{visibility:hidden'), "keep pending interaction visible");
  assert.ok(!css.includes('[data-state="error"]{visibility:hidden'), "keep errors visible");

  // Change the main-agent state without changing its child count.
  store.byId["subs-only"].running = true;
  runSidebar();
  assert.equal(rows.subsOnly.dataset.dtaiSubsOnly, undefined);
  assert.equal(rows.subsOnly.querySelector(".dtai-num").textContent, "1");
  store.byId["subs-only"].running = false;
  runSidebar();
  assert.equal(rows.subsOnly.dataset.dtaiSubsOnly, "1");
}

{
  // The official sidebar: the number rides on the row's own status slot.
  const badge = rows.subsOnly.querySelector(".dtai-num");
  assert.ok(badge, "a row with a running subagent must carry the number");
  assert.equal(badge.parentElement, rows.subsOnly.slot, "the number sits on the host indicator");
  assert.equal(badge.className, "dtai-num");
  assert.equal(badge.textContent, "1");
  assert.equal(badge.title, "tip.subs#1");
  assert.equal(badge.attributes["aria-label"], "tip.subs#1");
  assert.ok(!badge.style.position, "the number is positioned by the stylesheet");
  assert.ok(!rows.subsOnly.slot.style.display, "the host indicator is never hidden");
  assert.equal(rows.subsOnly.slot.style.position, "relative", "a static indicator becomes a containing block");
  assert.equal(rows.subsOnly.slot.dataset.dtaiAnchor, "1");
  assert.equal(rows.subsOnly.slot.children.length, 3, "the host dot and its label stay in place");
  assert.equal(rows.subsOnly.slot.children[2], badge, "the number is added last");

  const bothBadge = rows.both.querySelector(".dtai-num");
  assert.equal(bothBadge.parentElement, rows.both.slot);
  assert.equal(bothBadge.textContent, "2");
  assert.equal(bothBadge.title, "tip.both#2", "a running main agent is named in the tooltip");
}

{
  // codex-ui: the number rides on the host's absolutely positioned spinner.
  const badge = rows.codexRun.querySelector(".dtai-num");
  assert.ok(badge, "a codex-ui row with a running subagent must carry the number");
  assert.equal(badge.parentElement, rows.codexRun.spinner);
  assert.equal(badge.textContent, "1");
  assert.equal(badge.title, "tip.both#1");
  assert.ok(!rows.codexRun.spinner.style.display, "the spinner keeps spinning");
  assert.ok(!rows.codexRun.spinner.style.position, "an absolute host indicator is left alone");
  assert.equal(rows.codexRun.spinner.hasAttribute("data-dtai-anchor"), false);

  // An idle codex-ui row has no host indicator: the number leads the row.
  const flow = rows.codexIdle.querySelector(".dtai-num");
  assert.ok(flow, "an idle row with a running subagent still shows the number");
  assert.equal(flow, rows.codexIdle.firstElementChild, "the number leads a row without an indicator");
  assert.equal(flow.className, "dtai-num dtai-num-flow");
  assert.equal(flow.textContent, "1");
  assert.equal(flow.title, "tip.subs#1");
}

{
  assert.equal(rows.idle.querySelector(".dtai-num"), null, "a row without running subagents is untouched");
  assert.ok(!rows.idle.slot.style.position, "an untouched indicator keeps its layout");
  assert.equal(rows.idle.slot.hasAttribute("data-dtai-anchor"), false);
  assert.equal(rows.project.querySelector(".dtai-num"), null, "project rows are never painted");
  assert.ok(!rows.project.slot.style.position, "project rows keep their own dot");
  assert.equal(rows.orphan.querySelector(".dtai-num"), null, "unattributable rows are skipped");
  assert.ok(!rows.orphan.slot.style.position);
}

{
  // Idempotence: the same state reuses the same element, in the same place.
  const before = rows.both.querySelector(".dtai-num");
  const signature = before.dataset.dtai;
  rowsSeat.component({ useSessions: (select) => select(store), t });
  const after = rows.both.querySelector(".dtai-num");
  assert.equal(after, before, "the same number element is reused");
  assert.equal(after.dataset.dtai, signature);
  assert.equal(after.parentElement, rows.both.slot, "and it stays where it was put");
}

{
  // Everything settles: the numbers disappear and the anchors are handed back.
  store = { byId: { idle: SUM(true) } };
  runSidebar();
  for (const row of [rows.subsOnly, rows.both, rows.codexRun, rows.codexIdle]) {
    assert.equal(row.querySelector(".dtai-num"), null, "a settled row must clear its number");
  }
  assert.ok(!rows.subsOnly.slot.style.position, "the release drops the positioning context");
  assert.equal(rows.subsOnly.slot.hasAttribute("data-dtai-anchor"), false);
  assert.equal(doc.body.querySelectorAll("[data-dtai-subs-only]").length, 0, "restore spinners when subagents stop");
  assert.equal(rows.codexIdle.children.length, 2, "the row keeps only what the host rendered");
}

{
  // Disposal removes every number and drops every positioning context.
  store = { byId: { both: SUM(false), b1: SUM(true, "subagent", "both") } };
  runSidebar();
  assert.ok(rows.both.querySelector(".dtai-num"));
  assert.equal(rows.both.dataset.dtaiSubsOnly, "1");
  const disposers = effects.filter((effect) => typeof effect.dispose === "function");
  assert.ok(disposers.length > 0, "the observer effect must return a disposer");
  for (const effect of disposers) effect.dispose();
  assert.equal(doc.body.querySelectorAll(".dtai-num").length, 0, "dispose clears every number");
  assert.equal(doc.body.querySelectorAll("[data-dtai-anchor]").length, 0, "dispose drops every anchor marker");
  assert.equal(doc.body.querySelectorAll("[data-dtai-subs-only]").length, 0, "dispose restores all spinners");
  assert.ok(!rows.both.slot.style.position, "dispose restores the host indicator");
}

(async () => {
  // The host switches a codex-ui row to running: the number moves onto the
  // spinner the host just added, because the row observer re-asserts in place.
  store = { byId: { "codex-idle": SUM(false), d1: SUM(true, "subagent", "codex-idle") } };
  runSidebar();
  const leading = rows.codexIdle.querySelector(".dtai-num");
  assert.equal(leading, rows.codexIdle.firstElementChild, "the number leads while the host is quiet");
  rows.codexIdle.spinner = addCodexSpinner(rows.codexIdle);
  await tick();
  const moved = rows.codexIdle.querySelector(".dtai-num");
  assert.equal(moved, leading, "the same number element is reused");
  assert.equal(moved.parentElement, rows.codexIdle.spinner, "the number moves onto the host indicator");
  assert.equal(moved.className, "dtai-num");

  // React drops the painted node with the node it was drawn into: the observer
  // restores the number, at the current reading.
  moved.remove();
  assert.equal(rows.codexIdle.querySelector(".dtai-num"), null);
  await tick();
  const restored = rows.codexIdle.querySelector(".dtai-num");
  assert.ok(restored, "the observer restores a number React dropped");
  assert.equal(restored.textContent, "1");
  assert.equal(restored.parentElement, rows.codexIdle.spinner);
  assert.equal(rows.codexIdle.querySelectorAll(".dtai-num").length, 1, "never two numbers on one row");

  // A new reading repaints the number in place.
  store = { byId: { "codex-idle": SUM(true), d1: SUM(true, "subagent", "codex-idle") } };
  runSidebar();
  const updated = rows.codexIdle.querySelector(".dtai-num");
  assert.equal(updated.textContent, "1");
  assert.equal(updated.title, "tip.both#1");

  console.log("ALL LOGIC TESTS PASSED");
})();
