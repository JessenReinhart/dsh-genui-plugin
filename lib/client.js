window.__ModuleLoader__.load({
	id: "dsh-genui-plugin",
	factory: (require) => {
		const React = require("react");
		const module = { exports: {} };
		const exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const h = React.createElement;

		const GENUI_KIND = "dsh-genui";
		const GENUI_RESULT_NODE_KIND = "dsh-genui-result";

		function clampHeight(value) {
			const parsed = Number(value);
			if (!Number.isFinite(parsed)) return 420;
			return Math.max(180, Math.min(Math.round(parsed), 720));
		}

		function summarize(payload) {
			if (typeof payload === "string") return payload.slice(0, 160);
			if (payload === null || payload === undefined) return "(empty)";
			let text;
			try {
				text = JSON.stringify(payload);
			} catch (e) {
				text = String(payload);
			}
			return (text || "(empty)").slice(0, 160);
		}

		function formatSubmission(title, payload) {
			let body;
			if (typeof payload === "string") body = payload;
			else if (payload === null || payload === undefined) body = "";
			else body = JSON.stringify(payload, null, 2);
			return `[Generated UI "${title}" submission]\n${body}`;
		}

		function submitToConversation(inputActions, text) {
			if (!inputActions) {
				return { ok: false, error: "Conversation input actions are unavailable in this view." };
			}

			const setDraft = inputActions.setDraft;
			const setText = inputActions.setText;
			const submit = inputActions.submit || inputActions.submitText || inputActions.send;

			if (typeof setDraft === "function" && typeof submit === "function") {
				try {
					setDraft.call(inputActions, text);
					submit.call(inputActions);
					return { ok: true, method: "setDraft+submit" };
				} catch (e) {
					return { ok: false, error: e instanceof Error ? e.message : String(e) };
				}
			}

			for (const verb of ["send", "submitText"]) {
				const fn = inputActions[verb];
				if (typeof fn === "function") {
					try {
						fn.call(inputActions, text);
						return { ok: true, method: verb };
					} catch (e) {
						/* try next candidate */
					}
				}
			}

			if (typeof setText === "function" && typeof submit === "function") {
				try {
					setText.call(inputActions, text);
					submit.call(inputActions);
					return { ok: true, method: "setText+submit" };
				} catch (e) {
					/* fall through */
				}
			}

			return { ok: false, error: "Conversation input actions offer no usable submission method." };
		}

		function sendIntoSession(inputFor, sessionId, text) {
			if (typeof inputFor !== "function" || sessionId == null) {
				return { ok: false, error: "Conversation input is unavailable in this view." };
			}
			try {
				const input = inputFor(sessionId);
				if (!input) {
					return { ok: false, error: "No conversation input resolved for this session." };
				}
				const setDraft = input.setDraft ?? input.setText;
				if (typeof setDraft === "function") {
					setDraft.call(input, text);
				}
				if (typeof input.submit === "function") {
					input.submit.call(input, "queue");
				} else if (typeof input.send === "function") {
					input.send.call(input, text);
				} else if (typeof setDraft !== "function") {
					return { ok: false, error: "Resolved input facade exposes no submission method." };
				}
				return { ok: true };
			} catch (e) {
				return { ok: false, error: e instanceof Error ? e.message : String(e) };
			}
		}

		function parsedToolCall(block) {
			if (!block) return null;
			if ("kind" in block) {
				const call = block.call;
				if (!call || typeof call.argsRaw !== "string") return null;
				try {
					return { name: call.name, args: JSON.parse(call.argsRaw) };
				} catch (e) {
					return null;
				}
			}
			if (typeof block.argsRaw === "string") {
				try {
					return { name: block.name, args: JSON.parse(block.argsRaw) };
				} catch (e) {
					return null;
				}
			}
			return { name: block.name, args: block.args || {} };
		}

		function genuiFromMeta(value) {
			if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
			if (value.kind !== void 0 && value.kind !== GENUI_KIND) return void 0;
			if (typeof value.html !== "string" || value.html.trim() === "") return void 0;
			return {
				html: value.html,
				title: typeof value.title === "string" ? value.title : "Generated interface",
				height: clampHeight(value.height)
			};
		}

		function blockData(block) {
			let html = null;
			let title = "Generated interface";
			let height = 420;

			if (block && isRecord(block.meta)) {
				const fromMeta = genuiFromMeta(block.meta);
				if (fromMeta !== void 0) {
					html = fromMeta.html;
					title = fromMeta.title;
					height = fromMeta.height;
				}
			}

			if (!html) {
				const call = parsedToolCall(block);
				if (call && isRecord(call.args) && typeof call.args.html === "string" && call.args.html.trim() !== "") {
					html = call.args.html;
					title = typeof call.args.title === "string" ? call.args.title : title;
					height = clampHeight(call.args.height);
				}
			}

			return { html, title, height };
		}

		function isRecord(value) {
			return value !== null && typeof value === "object" && !Array.isArray(value);
		}

		function eventTurn(event) {
			const turn = event && event.data && event.data.turn;
			return typeof turn === "number" && Number.isSafeInteger(turn) && turn >= 0 ? turn : void 0;
		}

		function createGenuiResultDefinition() {
			return {
				kind: GENUI_RESULT_NODE_KIND,
				target: "chat",
				match: (event) => {
					const turn = eventTurn(event);
					if (turn === void 0) return null;
					if (event.type === "turn/start") return { id: String(turn), role: "start" };
					if (event.type === "turn/end") return { id: String(turn), role: "update" };
					if (event.type === "assistant/message") return { id: String(turn), role: "update" };
					if (event.type === "tool/call") {
						const name = event.data && event.data.name;
						if (name === "genui_html") return { id: String(turn), role: "update" };
					}
					if (event.type === "tool/result") {
						const meta = genuiFromMeta(event.data && event.data.meta);
						if (meta !== void 0) return { id: String(turn), role: "update" };
						if (event.data && event.data.message && event.data.message.source) return { id: String(turn), role: "update" };
					}
					return null;
				},
				start: (_context, match) => {
					const turn = eventTurn(match.event);
					if (match.event.type !== "turn/start" || turn === void 0) {
						throw new Error("dsh-genui-result start requires turn/start");
					}
					return { turn, results: [], pendingCalls: new Map() };
				},
				update: (context, match) => {
					const state = context.state;
					if (match.event.type === "turn/end") {
						return { ...state, endSeq: match.event.seq };
					}
					if (match.event.type === "assistant/message") {
						return { ...state, answerSeq: match.event.seq };
					}
					if (match.event.type === "tool/call") {
						const data = match.event.data;
						if (data && data.name === "genui_html" && data.callId !== void 0) {
							let args = data.arguments;
							if ((!args || typeof args !== "object") && typeof data.argumentsRaw === "string") {
								try { args = JSON.parse(data.argumentsRaw); } catch (e) {}
							}
							const pendingCalls = new Map(state.pendingCalls);
							pendingCalls.set(String(data.callId), args);
							return { ...state, pendingCalls };
						}
						return state;
					}
					if (match.event.type !== "tool/result") return state;
					const data = match.event.data;
					let result = genuiFromMeta(data && data.meta);
					if (result === void 0) {
						const callId = data && data.message && data.message.source && data.message.source.callId;
						const callArgs = callId !== void 0 && state.pendingCalls ? state.pendingCalls.get(String(callId)) : void 0;
						if (callArgs && typeof callArgs.html === "string" && callArgs.html.trim() !== "") {
							result = {
								html: callArgs.html,
								title: typeof callArgs.title === "string" ? callArgs.title : "Generated interface",
								height: clampHeight(callArgs.height)
							};
						}
					}
					if (result === void 0) return state;
					if (state.results.some((candidate) => candidate.html === result.html && candidate.title === result.title)) {
						return state;
					}
					return {
						...state,
						results: [...state.results, { ...result, seq: match.event.seq }]
					};
				},
				buildViewNode: (context) => {
					const state = context.state;
					const last = state && state.results.length > 0 ? state.results[state.results.length - 1] : void 0;
					if (last === void 0) return null;
					const location = context.matches.length > 0 ? context.matches[context.matches.length - 1].location
						: (context.start && context.start.location) || { kind: "unresolved" };
					const baseSeq = Math.max(last.seq, state.answerSeq ?? 0, state.endSeq ?? 0);
					return {
						key: context.key,
						kind: GENUI_RESULT_NODE_KIND,
						id: context.id,
						target: "chat",
						anchorSeq: baseSeq + 0.05,
						location,
						visibility: "visible",
						groupTree: "turn",
						data: {
							turn: state.turn,
							results: state.results.map(({ seq: _seq, ...result }) => result)
						}
					};
				}
			};
		}

		function GenuiCard(props) {
			const { html, title, height: rawHeight, inputActions, useInput, inputFor, sessionId } = props;
			const frameHeight = rawHeight !== undefined ? clampHeight(rawHeight) : 420;
			const [pending, setPending] = React.useState(null);
			const [sent, setSent] = React.useState(false);
			const [error, setError] = React.useState("");
			const [expanded, setExpanded] = React.useState(false);
			const [frameKey, setFrameKey] = React.useState(0);
			const iframeRef = React.useRef(null);

			React.useEffect(() => {
				if (!html) return undefined;
				function onMessage(event) {
					const frame = iframeRef.current;
					if (!frame || event.source !== frame.contentWindow) return;
					const data = event.data;
					if (!data || typeof data !== "object") return;
					if (data.type !== "genui:submit" && data.type !== "genui-submit") return;
					const payload = Object.prototype.hasOwnProperty.call(data, "payload") ? data.payload : data.data;
					const resolved = payload === undefined ? data : payload;
					setPending({ text: formatSubmission(title || "Generated interface", resolved), preview: summarize(resolved) });
					setSent(false);
					setError("");
				}
				window.addEventListener("message", onMessage);
				return () => window.removeEventListener("message", onMessage);
			}, [html, title]);

			if (!html) {
				return h("div", { style: { padding: "12px", color: "var(--dsw-alias-label-secondary, #888)" } }, "Generating interface...");
			}

			function handleSend() {
				if (!pending) return;
				const actions = inputActions || (typeof useInput === "function" ? useInput().actions : void 0);
				let result = submitToConversation(actions, pending.text);
				if (!result.ok && typeof inputFor === "function" && sessionId != null) {
					result = sendIntoSession(inputFor, sessionId, pending.text);
				}
				if (result.ok) {
					setSent(true);
					setError("");
				} else {
					setError(result.error || "Could not send result to the conversation.");
				}
			}

			const toolbarButtonStyle = {
				border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35))",
				background: "transparent",
				color: "var(--dsw-alias-label-primary, #ddd)",
				borderRadius: 6,
				padding: "4px 8px",
				cursor: "pointer",
				display: "inline-flex",
				alignItems: "center",
				gap: 4,
				font: "inherit",
				fontSize: 12
			};

			const header = h("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					padding: "8px 10px",
					background: "var(--dsw-alias-bg-layer-1, #141414)",
					borderBottom: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35))"
				}
			},
				h("svg", {
					viewBox: "0 0 24 24",
					width: 15,
					height: 15,
					fill: "none",
					stroke: "var(--dsw-alias-brand-primary, #3b82f6)",
					strokeWidth: 2,
					"aria-hidden": true
				},
					h("path", { d: "M6 3v12" }),
					h("circle", { cx: 18, cy: 6, r: 3 }),
					h("circle", { cx: 6, cy: 18, r: 3 }),
					h("path", { d: "M18 9a9 9 0 0 1-9 9" })
				),
				h("span", {
					style: {
						fontSize: 12,
						fontWeight: 600,
						color: "var(--dsw-alias-label-primary, #f0f0f0)",
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
						flex: 1,
						minWidth: 0
					}
				}, String(title || "Generated interface").slice(0, 120)),
				h("button", {
					type: "button",
					style: toolbarButtonStyle,
					title: "Reload interface",
					onClick: () => setFrameKey((k) => k + 1)
				}, "Reload")
			);

			let footer = null;
			if (pending && !sent) {
				footer = h("div", {
					style: {
						padding: "8px 10px",
						background: "var(--dsw-alias-bg-layer-1, #141414)",
						borderTop: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35))",
						fontSize: 12
					}
				},
					h("div", { style: { color: "var(--dsw-alias-label-secondary, #bbb)" } }, "Ready to send to the conversation:"),
					h("div", { style: { margin: "6px 0", color: "var(--dsw-alias-label-primary, #eee)" } }, (pending.preview || "").slice(0, 160)),
					h("div", { style: { display: "flex", gap: 6 } },
						h("button", { type: "button", style: toolbarButtonStyle, onClick: handleSend }, "Send"),
						h("button", { type: "button", style: toolbarButtonStyle, onClick: () => { setPending(null); setError(""); } }, "Discard")
					),
					error ? h("div", { style: { color: "var(--dsw-alias-danger, #f66)", marginTop: 6 } }, error) : null
				);
			} else if (sent) {
				footer = h("div", {
					style: {
						padding: "8px 10px",
						background: "var(--dsw-alias-bg-layer-1, #141414)",
						borderTop: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35))",
						fontSize: 12,
						color: "var(--dsw-alias-label-secondary, #bbb)"
					}
				}, "Sent to the conversation.");
			}

			return h("section", {
				style: {
					border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35))",
					borderRadius: 8,
					overflow: "hidden",
					margin: "10px 0",
					background: "var(--dsw-alias-bg-layer-0, #0d0d0d)"
				}
			},
				header,
				h("iframe", {
					key: frameKey,
					ref: iframeRef,
					sandbox: "allow-scripts",
					style: {
						border: "none",
						width: "100%",
						height: frameHeight,
						display: "block",
						background: "transparent"
					},
					title: String(title || "Generated interface").slice(0, 120),
					srcDoc: String(html)
				}),
				footer
			);
		}

		function GenuiToolView(ownerProps) {
			const block = ownerProps && ownerProps.block;
			const promoted = ownerProps && ownerProps.promoted;
			const inputActions = ownerProps && ownerProps.inputActions;
			const useInput = ownerProps && ownerProps.useInput;
			const inputFor = ownerProps && ownerProps.inputFor;
			const sessionId = ownerProps && ownerProps.sessionId;
			const { html, title, height } = blockData(block);

			if (!block) {
				return h("div", { style: { padding: "10px", color: "var(--dsw-alias-label-secondary, #888)" } }, "Waiting for tool block...");
			}

			if (promoted && html) {
				return h("div", {
					style: {
						padding: "6px 10px",
						fontSize: "12px",
						color: "var(--dsw-alias-label-secondary, #888)",
						display: "flex",
						alignItems: "center",
						gap: "6px"
					}
				}, [
					h("span", { key: "icon", style: { opacity: 0.8 } }, "⚡"),
					h("span", { key: "text" }, `Interface "${title || "GenUI"}" displayed in turn summary below`)
				]);
			}

			return h(GenuiCard, { html, title, height, inputActions, useInput, inputFor, sessionId });
		}

		function GenuiResultNode(props) {
			const node = props.node;
			const results = node && node.data && Array.isArray(node.data.results) ? node.data.results : [];
			const inputFor = props.inputFor;
			const sessionId = props.sessionId;
			return h("div", { className: "dsh-genui-promoted-results" },
				results.map((result, index) => {
					const title = result && result.title;
					const height = result && result.height;
					return h(GenuiCard, {
						key: `${title || "interface"}-${index}`,
						html: result && result.html,
						title,
						height,
						inputFor,
						sessionId
					});
				})
			);
		}

		function ensurePromotedStyles() {
			if (typeof document === "undefined") return;
			const styleId = "dsh-genui-promoted-style";
			if (document.getElementById(styleId)) return;
			const style = document.createElement("style");
			style.id = styleId;
			style.textContent = ".dsh-genui-promoted-results{display:flex;flex-direction:column;gap:12px;margin:8px 0;width:100%}";
			document.head.appendChild(style);
		}

		function apply(ctx) {
			ensurePromotedStyles();
			const promotion = { enabled: false };

			function inputFor(sessionId) {
				const sessions = ctx.get("sessions");
				const conversation = ctx.get("conversation");
				if (!sessions || !conversation) return void 0;
				const actx = sessions.scope(sessionId);
				if (!actx) return void 0;
				return conversation.input.for(actx);
			}

			const slots = ctx.get("slots");
			if (slots && typeof slots.inject === "function") {
				ctx.effect(() => {
					const dispose = slots.inject("tool.call.toolview", () => slots.register(
						{
							name: "tool.call.toolview",
							key: "genui_html",
							inject: (sessionId) => ({
								sessionId,
								promoted: promotion.enabled,
								inputFor
							})
						},
						GenuiToolView
					));
					return dispose;
				});
			}

			ctx.inject(["uiConversation"], (owner) => {
				const uiConversation = owner.get("uiConversation");
				if (uiConversation === void 0) throw new Error("dsh-genui-plugin: uiConversation has an incompatible interface");
				if (typeof uiConversation.events?.register !== "function") return;

				promotion.enabled = true;
				const ownerRegister = owner.slots.register.bind(owner.slots);
				owner.effect(() => uiConversation.events.register(createGenuiResultDefinition()), "dsh-genui-plugin: promoted result node");

				owner.slots.inject("conversation.chat.node", () => ownerRegister(
					{
						name: "conversation.chat.node",
						key: GENUI_RESULT_NODE_KIND,
						inject: (sessionId) => ({ sessionId, inputFor })
					},
					GenuiResultNode
				));
			});
		}

		exports.apply = apply;
		exports.inject = ["slots"];
		return module.exports;
	}
});