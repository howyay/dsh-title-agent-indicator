// Run against an existing isolated agent-browser session.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const source = fs.readFileSync(path.join(__dirname, "../lib/client.js"), "utf8");
const browser = process.env.AGENT_BROWSER || "agent-browser";
const session = process.env.AGENT_BROWSER_SESSION;
assert.ok(session, "Set AGENT_BROWSER_SESSION to an isolated browser session");

function fixture(source) {
  window.__dtaiTypographyCleanup?.();
  document.body.replaceChildren();
  const previousStyle = document.getElementById("dtai-style");
  previousStyle?.remove();
  document.body.style.cssText = "margin:20px;background:#18212e;color:#fff";
  const effects = [];
  const disposals = [];
  const seats = new Map();
  let definition;
  const previousLoader = window.__ModuleLoader__;
  window.__ModuleLoader__ = { load: (value) => { definition = value; } };
  try { new Function(source)(); }
  finally { window.__ModuleLoader__ = previousLoader; }
  const jsx = (tag, props) => {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "children") element.textContent = value;
      else if (key === "className") element.className = value;
      else element.setAttribute(key, value);
    }
    return element;
  };
  const module = definition.factory((id) => {
    if (id === "react") return { useEffect: (fn) => effects.push(fn) };
    if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
    throw new Error("Unexpected module: " + id);
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
  const rows = [];
  const counts = [1, 2, 4, 8, 12, 99];
  for (const font of ["Arial", "system-ui", "serif", "Noto Sans CJK SC"]) {
    const group = document.createElement("section");
    // Host typography must not move text inside the badge.
    group.style.cssText = `font-family:${font};font-style:italic;letter-spacing:2px;text-indent:3px`;
    const label = document.createElement("h3");
    label.textContent = font;
    group.append(label);
    const examples = document.createElement("div");
    examples.style.cssText = "display:flex;gap:20px;align-items:center";
    group.append(examples);
    document.body.append(group);
    for (const count of counts) {
      const id = `${font}-${count}`;
      byId[id] = { running: false };
      for (let i = 0; i < count; i += 1) {
        byId[`${id}-child-${i}`] = { running: true, origin: "subagent", parentId: id };
      }
      const row = document.createElement("div");
      row.setAttribute("role", "treeitem");
      row.setAttribute("aria-selected", "false");
      row.__reactFiber$fixture = { memoizedProps: { node: { id } }, return: null };
      const slot = document.createElement("span");
      slot.className = "fixture_slot";
      slot.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:16px;height:20px";
      const glyph = document.createElement("span");
      glyph.dataset.state = "ongoing";
      glyph.setAttribute("aria-hidden", "true");
      glyph.style.cssText = "width:12px;height:12px;background:#aaa;border-radius:50%";
      slot.append(glyph);
      row.append(slot);
      examples.append(row);
      rows.push(row);
      const header = seats.get("title-agent-indicator")({
        sessionId: id, useSessions: (select) => select({ byId }), t: () => "Subagents",
      });
      examples.append(header);
    }
  }
  seats.get("title-agent-indicator-rows")({
    useSessions: (select) => select({ byId }), t: () => "Subagents",
  });
  for (const effect of effects) {
    const dispose = effect();
    if (dispose) disposals.push(dispose);
  }
  const results = [...document.querySelectorAll(".dtai-num,.dtai-root")].map((element) => {
    const rect = element.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    const text = range.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      count: element.textContent, surface: element.className,
      dx: text.x + text.width / 2 - rect.x - rect.width / 2,
      dy: text.y + text.height / 2 - rect.y - rect.height / 2,
      fontFamily: style.fontFamily, fontStyle: style.fontStyle,
      letterSpacing: style.letterSpacing, textIndent: style.textIndent,
    };
  });
  const centered = rows.every((row) => {
    const badge = row.querySelector(".dtai-num").getBoundingClientRect();
    const slot = row.firstElementChild.getBoundingClientRect();
    return Math.abs(badge.x + badge.width / 2 - slot.x - slot.width / 2) < 0.1
      && Math.abs(badge.y + badge.height / 2 - slot.y - slot.height / 2) < 0.1
      && getComputedStyle(row.querySelector('[data-state="ongoing"]')).visibility === "hidden"
      && getComputedStyle(row.querySelector(".dtai-num")).visibility === "visible";
  });
  window.__dtaiTypographyCleanup = () => {
    for (const dispose of disposals.reverse()) dispose();
    delete window.__dtaiTypographyCleanup;
  };
  return { results, centered };
}
const output = execFileSync(browser, ["--session", session, "--json", "eval", "--stdin"], {
  input: `(${fixture.toString()})(${JSON.stringify(source)})`, encoding: "utf8", maxBuffer: 2e6,
});
const reply = JSON.parse(output);
assert.ok(reply.success, reply.error);
const { results, centered } = reply.data.result;
assert.equal(results.length, 48, "Render both badge surfaces for each font and count");
assert.ok(centered, "Keep the circle in the host spinner position");
for (const result of results) {
  const message = JSON.stringify(result);
  assert.ok(Math.abs(result.dx) <= 0.1, "Center text horizontally: " + message);
  assert.ok(Math.abs(result.dy) <= 0.75, "Center text vertically: " + message);
  assert.equal(result.textIndent, "0px", message);
  assert.ok(["0px", "normal"].includes(result.letterSpacing), message);
  assert.equal(result.fontStyle, "normal", message);
  assert.match(result.fontFamily, /Arial/, message);
}
console.log("BROWSER TYPOGRAPHY CHECKS PASSED");
