window.__ModuleLoader__.load({
	id: "dsh-title-agent-indicator",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");

		/** Locale namespace; `locale: NS` in the seat options binds `t` to it. */
		const NS = "title-agent-indicator";

		const zh = {
			"tip.subs": "仅子代理运行中：{count} 个",
			"tip.both": "主代理运行中 + {count} 个子代理运行中"
		};

		const en = {
			"tip.subs": "Only subagents working: {count}",
			"tip.both": "Main agent working + {count} subagent(s) running"
		};

		const STYLE_ID = "dtai-style";

		const STYLE = [
			// Keep the count visible when the host spinner represents only subagents.
			`.dtai-num{position:absolute;top:-4px;right:-4px;z-index:2;box-sizing:border-box;`,
			`display:inline-flex;align-items:center;justify-content:center;min-width:13px;height:13px;padding:0 3px;`,
			`border-radius:7px;background:var(--dsw-alias-state-business-primary,#3b82f6);color:#fff;`,
			`font-size:9px;line-height:1;font-weight:600;font-variant-numeric:tabular-nums;`,
			`pointer-events:none;user-select:none;white-space:nowrap;visibility:visible}`,
			// Keep other host states, including pending interaction, visible.
			`[data-dtai-subs-only] [data-state="ongoing"],[data-dtai-subs-only] > .dcu-wb-running{visibility:hidden}`,
			// Use the main-agent state, not the host spinner's DOM structure.
			`[data-dtai-subs-only]:not(:has([data-state="warning"],[data-state="error"])) .dtai-num{min-width:18px;height:18px;border-radius:9px;font-size:11px}`,
			`[data-dtai-subs-only]:not(:has([data-state="warning"],[data-state="error"])) .dtai-num:not(.dtai-num-flow){top:50%;right:50%;transform:translate(50%,-50%)}`,
			// Keep the host's favorite visibility and click behavior.
			`[data-row-key^="session:"][data-dtai-subs-only]:not(:has([data-state="warning"],[data-state="error"])):has(.dsham_starSlot) .dsham_starSlot{width:16px;height:20px;top:50%;bottom:auto;left:calc(8px + var(--dsh-workspace-indent,0px));inset-inline-start:calc(8px + var(--dsh-workspace-indent,0px));transform:translateY(-50%)}`,
			`[data-row-key^="session:"][data-dtai-subs-only]:not(:has([data-state="warning"],[data-state="error"])):has(.dsham_starSlot) .dsham_rowStar{width:16px;height:16px}`,
			`[data-row-key^="session:"][data-dtai-subs-only]:not(:has([data-state="warning"],[data-state="error"])):has(.dsham_starSlot) .dsham_rowStar svg{width:16px;height:16px;filter:none}`,
			`[data-row-key^="session:"][data-dtai-subs-only]:not(:has([data-state="warning"],[data-state="error"])):has(.dsham_starSlot):is(:hover,:has(.dsham_starSlot[data-favorited="true"])) .dtai-num{visibility:hidden}`,
			// A row without a host indicator: the number leads the row in flow.
			`.dtai-num-flow{position:relative;top:auto;right:auto;flex:none;margin-right:4px}`,
			// Header seat: the same number, standing alone.
			`.dtai-root{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;`,
			`padding:0 5px;margin-right:2px;border-radius:9px;background:var(--dsw-alias-state-business-primary,#3b82f6);`,
			`color:#fff;font-size:11px;line-height:1;font-weight:600;font-variant-numeric:tabular-nums;`,
			`white-space:nowrap;user-select:none;vertical-align:middle}`,
			// Keep host text spacing and font metrics out of both number badges.
			`.dtai-num,.dtai-root{font-family:Arial,Helvetica,sans-serif;font-style:normal;letter-spacing:0;text-indent:0;text-align:center}`
		].join("");

		/* ------------------------------------------------------------------ *
		 * Activity model — running subagents, attributed to the session that *
		 * started them, from the same store the sidebar itself reads.        *
		 * ------------------------------------------------------------------ */

		/**
		 * Fold every session's own turn bit and its running subagent
		 * descendants into one map, in a single pass.
		 *
		 * Descendant attribution mirrors `indexSubagentDescendants` of the
		 * official ui-subagent package: a running subagent counts toward each
		 * ancestor along its uninterrupted `origin === "subagent"` chain, and the
		 * walk stops at ordinary forks. The chain is tracked by map key, so
		 * entries without an `id` field still terminate, and a cyclic chain is
		 * visited once.
		 * @param summaries - Session summaries keyed by id (`useSessions` `byId`).
		 * @returns `Map<sessionId, { main, subs }>`.
		 */
		function activityMap(summaries) {
			const map = new Map();
			const entryOf = (id) => {
				let entry = map.get(id);
				if (entry === undefined) {
					entry = { main: false, subs: 0 };
					map.set(id, entry);
				}
				return entry;
			};
			for (const [key, summary] of Object.entries(summaries)) {
				if (!summary) continue;
				entryOf(key).main = summary.running === true;
				if (summary.origin !== "subagent" || summary.running !== true) continue;
				const seen = new Set();
				let cur = summary;
				let curKey = key;
				while (cur && cur.origin === "subagent" && cur.parentId !== undefined && !seen.has(curKey)) {
					seen.add(curKey);
					entryOf(cur.parentId).subs += 1;
					curKey = cur.parentId;
					cur = summaries[curKey];
				}
			}
			return map;
		}

		/**
		 * One session's reading, reduced to what this indicator draws.
		 *
		 * Only running subagents are worth a number: the host already draws the
		 * main agent's own state — a spinner or a status dot in the row, and its
		 * waiting states as well.
		 * @param map - `activityMap` result.
		 * @param sessionId - session to read.
		 * @returns `{ main, subs, signature, tipKey }`; `signature` is `""` when
		 * the session has no running subagent, and then nothing is drawn.
		 */
		function readingOf(map, sessionId) {
			const entry = map.get(sessionId);
			const main = entry !== undefined && entry.main === true;
			const subs = entry === undefined ? 0 : entry.subs;
			if (subs === 0) return { main, subs, signature: "", tipKey: "" };
			return {
				main,
				subs,
				signature: `${main ? 1 : 0}:${subs}`,
				tipKey: main ? "tip.both" : "tip.subs"
			};
		}

		/** The number itself: running subagents of one session. */
		function numberText(reading) {
			return reading.subs > 0 ? String(reading.subs) : "";
		}

		/** Tooltip of one reading, in the reader's language. */
		function tipOf(reading, t) {
			return t(reading.tipKey, { count: reading.subs });
		}

		/* ------------------------------------------------------------------ *
		 * Header seat — the number alone, in the title-adjacent actions row.  *
		 * ------------------------------------------------------------------ */

		/**
		 * Render the header number for the current session.
		 * @param props - standard `conversation.session.header.actions` props.
		 * @returns The number, or null while no subagent of the session runs.
		 */
		function AgentActivityIndicator(props) {
			const sessionId = props.sessionId;
			const useSessions = props.useSessions;
			const t = props.t;
			const state = useSessions((next) => next);
			if (sessionId === undefined || sessionId === null || sessionId === "") return null;
			const reading = readingOf(activityMap(state.byId), sessionId);
			if (reading.signature === "") return null;
			const tip = tipOf(reading, t);
			return react_jsx_runtime.jsx("span", {
				className: "dtai-root",
				role: "status",
				title: tip,
				"aria-label": tip,
				children: numberText(reading)
			});
		}

		/* ------------------------------------------------------------------ *
		 * Sidebar rows — the host exposes no per-row slot, so the rows it     *
		 * already renders are decorated: store-driven, idempotent, and cheap  *
		 * enough to run on every commit.                                      *
		 * ------------------------------------------------------------------ */

		/** Session id per sidebar row, cached so repaints never re-walk fibers. */
		const rowIds = new WeakMap();

		/** Rows currently carrying a number, mapped to the reading they show. */
		const decorated = new Map();

		/** Latest store and translator, read by the row observer. */
		const latest = { summaries: {}, t: null };

		/** Class of the official sidebar's leading status slot (`..._slot`). */
		const STATUS_SLOT = /(^|\s)[A-Za-z0-9]*_slot(\s|$)/;

		/**
		 * Session id of one sidebar row.
		 *
		 * codex-ui labels each of its rows with `data-dcu-session`, which is the
		 * only source that does not read React internals; the official sidebar
		 * and every other host are read through the row's fiber chain instead.
		 * @param row - a `[role="treeitem"][aria-selected]` element.
		 * @returns the session id, or null when the row cannot be attributed.
		 */
		function rowSessionId(row) {
			const tag = row.dataset === undefined ? undefined : row.dataset.dcuSession;
			if (typeof tag === "string" && tag !== "") return tag;
			return fiberSessionId(row);
		}

		/**
		 * Session id carried by the React fiber chain of one row, or null.
		 *
		 * `props.id` is read only together with `props.selected`, which is what
		 * separates a session row component (codex-ui's `SessionRow`) from any
		 * other component that happens to hold an `id` prop.
		 * @param row - sidebar row element.
		 * @returns the session id, or null.
		 */
		function fiberSessionId(row) {
			let fiber = null;
			for (const key in row) {
				if (key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")) {
					fiber = row[key];
					break;
				}
			}
			let depth = 0;
			while (fiber && depth < 40) {
				const props = fiber.memoizedProps;
				if (props) {
					if (typeof props.sessionId === "string") return props.sessionId;
					if (props.node && typeof props.node.id === "string") return props.node.id;
					if (props.session && typeof props.session.sessionId === "string") return props.session.sessionId;
					if (typeof props.id === "string" && typeof props.selected === "boolean") return props.id;
				}
				fiber = fiber.return;
				depth += 1;
			}
			return null;
		}

		/** Sidebar row elements that represent a session (not a workspace folder). */
		function sessionRows(doc) {
			const found = [];
			for (const row of doc.querySelectorAll('[role="treeitem"][aria-selected]')) {
				if (row.hasAttribute("aria-expanded")) continue;
				found.push(row);
			}
			return found;
		}

		/**
		 * The host's own main-agent status indicator of one row, when it has one.
		 *
		 * codex-ui renders its running spinner into `.dcu-wb-running` at the left
		 * of the row. The official sidebar renders a status dot into the leading
		 * slot, which is found by its class (`..._slot`) or, failing that, by the
		 * `aria-hidden` marker the dot or its screen-reader text carries; titles,
		 * times and action cells carry no such child.
		 * @param row - sidebar row element.
		 * @returns the host indicator element, or null when the row has none.
		 */
		function hostIndicator(row) {
			const spinner = row.querySelector(":scope > .dcu-wb-running");
			if (spinner !== null) return spinner;
			const first = row.firstElementChild;
			if (first === null || first === undefined) return null;
			const className = typeof first.className === "string" ? first.className : "";
			if (className.split(" ").includes("dtai-num")) return null;
			if (STATUS_SLOT.test(className)) return first;
			if (typeof first.querySelector !== "function") return null;
			if (first.querySelector("[aria-hidden]") === null) return null;
			return first;
		}

		/**
		 * Give one host indicator a positioning context for the number.
		 *
		 * An indicator the host positions itself (codex-ui's absolute spinner)
		 * already is a containing block and is left untouched; a static one needs
		 * `position: relative`, and the marker records that this plugin added it.
		 * @param anchor - host indicator element.
		 */
		function positionAnchor(anchor) {
			if (anchor.style === undefined) return;
			if (anchor.style.position === "relative") return;
			let position = "static";
			try {
				const doc = anchor.ownerDocument;
				const view = doc === undefined ? null : doc.defaultView;
				if (view && typeof view.getComputedStyle === "function") {
					position = view.getComputedStyle(anchor).position;
				}
			} catch (error) {
				// An unreadable computed style is not worth guessing at: keep the
				// element as the host laid it out and let the number sit where the
				// element's own positioning puts it.
				return;
			}
			if (position !== "static") return;
			anchor.style.position = "relative";
			anchor.dataset.dtaiAnchor = "1";
		}

		/** The number this plugin painted into one row, or null. */
		function badgeOf(row) {
			if (typeof row.querySelector !== "function") return null;
			return row.querySelector(".dtai-num");
		}

		/**
		 * Take back the positioning context this plugin gave one row's anchor.
		 * @param row - sidebar row element.
		 */
		function releaseAnchor(row) {
			const anchor = row.querySelector("[data-dtai-anchor]");
			if (anchor === null) return;
			anchor.style.position = "";
			delete anchor.dataset.dtaiAnchor;
		}

		/**
		 * Remove one row's number and leave its host indicator exactly as the
		 * host rendered it.
		 * @param row - sidebar row element.
		 */
		function clearRow(row) {
			delete row.dataset.dtaiSubsOnly;
			const badge = badgeOf(row);
			if (badge !== null) badge.remove();
			releaseAnchor(row);
			decorated.delete(row);
		}

		/**
		 * Paint (or clear) one row's number.
		 *
		 * Add the count to the host indicator. Hide its running glyph when only
		 * subagents run. Keep other states visible. Without a host indicator,
		 * put the number first in normal flow.
		 *
		 * Writes only when the painted reading differs, so a repaint cannot feed
		 * the row observer.
		 * @param row - sidebar row element.
		 * @param reading - `readingOf` result for this row's session.
		 * @param t - translator bound to this plugin's namespace.
		 */
		function paintRow(row, reading, t) {
			if (reading.signature === "") {
				clearRow(row);
				return;
			}
			if (reading.main) delete row.dataset.dtaiSubsOnly;
			else row.dataset.dtaiSubsOnly = "1";
			const anchor = hostIndicator(row);
			const flow = anchor === null;
			let badge = badgeOf(row);
			if (badge === null) {
				badge = row.ownerDocument.createElement("span");
				badge.setAttribute("role", "status");
			}
			badge.className = flow ? "dtai-num dtai-num-flow" : "dtai-num";
			const parent = flow ? row : anchor;
			if (badge.parentElement !== parent) {
				if (flow) row.prepend(badge);
				else anchor.append(badge);
			}
			if (!flow) positionAnchor(anchor);
			decorated.set(row, reading);
			const tip = tipOf(reading, t);
			const text = numberText(reading);
			if (badge.dataset.dtai === reading.signature && badge.textContent === text && badge.title === tip) return;
			badge.dataset.dtai = reading.signature;
			badge.title = tip;
			badge.setAttribute("aria-label", tip);
			badge.textContent = text;
		}

		/** Repaint every session row from one activity snapshot. */
		function paintRows(doc, summaries, t) {
			const map = activityMap(summaries);
			for (const row of sessionRows(doc)) {
				let sessionId = rowIds.get(row);
				if (sessionId === undefined) {
					sessionId = rowSessionId(row);
					if (sessionId === null) continue;
					rowIds.set(row, sessionId);
				}
				paintRow(row, readingOf(map, sessionId), t);
			}
		}

		/**
		 * Remove every number this plugin painted and drop every positioning
		 * context it added.
		 * @param doc - target document.
		 */
		function clearRows(doc) {
			for (const row of doc.querySelectorAll("[data-dtai-subs-only]")) delete row.dataset.dtaiSubsOnly;
			for (const badge of doc.querySelectorAll(".dtai-num")) badge.remove();
			for (const anchor of doc.querySelectorAll("[data-dtai-anchor]")) {
				anchor.style.position = "";
				delete anchor.dataset.dtaiAnchor;
			}
			decorated.clear();
		}

		/**
		 * Renderless occupant of `shell.overlay`: repaints the sidebar whenever
		 * the session list changes, and re-scans when React adds or removes rows
		 * or drops a painted number with the node it was drawn into.
		 *
		 * Rows are decorated only while one of their subagents runs: a sidebar
		 * without running subagents is left exactly as the host rendered it.
		 * @param props - standard `shell.overlay` props.
		 * @returns Always null.
		 */
		function SidebarActivity(props) {
			const useSessions = props.useSessions;
			const t = props.t;
			const state = useSessions((next) => next);
			latest.summaries = state.byId;
			latest.t = t;
			let signature = "";
			const map = activityMap(state.byId);
			for (const id of Object.keys(state.byId).sort()) {
				const reading = readingOf(map, id);
				if (reading.signature === "") continue;
				signature += `${id}:${reading.signature};`;
			}
			react.useEffect(() => {
				paintRows(document, latest.summaries, latest.t);
			}, [signature, t]);
			react.useEffect(() => {
				let frame = 0;
				let knownRows = -1;
				const scan = () => {
					frame = 0;
					for (const [row, reading] of [...decorated]) {
						if (!row.isConnected) {
							decorated.delete(row);
							continue;
						}
						// Re-assert in place: this restores a number React dropped
						// with its node, and moves one across when the host adds or
						// removes the indicator it belongs on.
						paintRow(row, reading, latest.t);
					}
					const count = sessionRows(document).length;
					if (count === knownRows) return;
					knownRows = count;
					paintRows(document, latest.summaries, latest.t);
				};
				const schedule = () => {
					if (frame !== 0) return;
					frame = requestAnimationFrame(scan);
				};
				const observer = new MutationObserver(schedule);
				observer.observe(document.body, { childList: true, subtree: true });
				return () => {
					observer.disconnect();
					if (frame !== 0) cancelAnimationFrame(frame);
					clearRows(document);
				};
			}, [t]);
			return null;
		}

		/** Client plugin body: locale, styles, and the two seats. */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				"zh-CN": zh,
				"zh-TW": zh,
				en
			}), "title-agent-indicator: dictionaries");
			ctx.effect(() => {
				if (document.getElementById(STYLE_ID) !== null) return;
				const element = document.createElement("style");
				element.id = STYLE_ID;
				element.textContent = STYLE;
				document.head.append(element);
				return () => element.remove();
			}, "title-agent-indicator: styles");
			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "title-agent-indicator",
				order: 5,
				locale: NS
			}, AgentActivityIndicator));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "title-agent-indicator-rows",
				order: 200,
				locale: NS
			}, SidebarActivity));
		}

		/** Cordis services this plugin waits for. */
		const inject = ["slots", "locale"];

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
