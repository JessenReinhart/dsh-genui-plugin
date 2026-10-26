window.__ModuleLoader__.load({
	id: "dsh-genui-plugin",
	factory: (require) => {
		const React = require("react");
		const module = { exports: {} };
		const exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const h = React.createElement;

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
			const direct = [
				["submit", text],
				["submit", { text }],
				["submitText", text],
				["send", text],
				["send", { text }]
			];
			for (const [method, arg] of direct) {
				const fn = inputActions[method];
				if (typeof fn === "function") {
					try {
						fn.call(inputActions, arg);
						return { ok: true, method };
					} catch (e) {
						/* try next candidate */
					}
				}
			}
			for (const method of ["setText", "setDraft", "appendText", "insertText"]) {
				const fn = inputActions[method];
				if (typeof fn === "function") {
					try {
						fn.call(inputActions, text);
						return { ok: true, method };
					} catch (e) {
						/* try next candidate */
					}
				}
			}
			return { ok: false, error: "Conversation input actions offer no submission method." };
		}

		function blockData(block) {
			let html = null;
			let title = "Generated interface";
			let height = 420;
			if (!block) return { html, title, height };
			// presentationMeta lands on the settled block as `meta`
			if (block.meta && typeof block.meta.html === "string" && block.meta.html) {
				html = block.meta.html;
				title = block.meta.title || title;
				height = block.meta.height || height;
			}
			// In-flight fallback: decode the raw call arguments
			if (!html) {
				const raw = (block.call && block.call.argsRaw) || block.argsRaw;
				if (raw) {
					try {
						const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
						if (parsed && typeof parsed.html === "string" && parsed.html) {
							html = parsed.html;
							title = parsed.title || title;
							height = parsed.height || height;
						}
					} catch (e) {
						/* partial stream: keep waiting */
					}
				}
			}
			return { html, title, height: clampHeight(height) };
		}

		function GenuiToolView(ownerProps) {
			const block = ownerProps && ownerProps.block;
			const inputActions = ownerProps && ownerProps.inputActions;
			const [pending, setPending] = React.useState(null);
			const [sent, setSent] = React.useState(false);
			const [error, setError] = React.useState("");
			const [expanded, setExpanded] = React.useState(false);
			const [frameKey, setFrameKey] = React.useState(0);
			const iframeRef = React.useRef(null);

			const { html, title, height } = blockData(block);

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
					setPending({ text: formatSubmission(title, resolved), preview: summarize(resolved) });
					setSent(false);
					setError("");
				}
				window.addEventListener("message", onMessage);
				return () => window.removeEventListener("message", onMessage);
			}, [html, title]);

			if (!block) {
				return h("div", {
					style: {
						padding: "10px",
						color: "var(--dsw-alias-label-secondary, #888)"
					}
				}, "Waiting for tool block...");
			}

			if (!html) {
				return h("div", {
					style: {
						padding: "10px",
						color: "var(--dsw-alias-label-secondary, #888)"
					}
				}, "Generating interface...");
			}

			function handleSend() {
				if (!pending) return;
				const result = submitToConversation(inputActions, pending.text);
				if (result.ok) {
					setSent(true);
					setError("");
				} else {
					setError(result.error || "Could not send result to the conversation.");
				}
			}

			const frameHeight = expanded ? "min(85vh, 1200px)" : `${height}px`;

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
				}, String(title).slice(0, 120) || "Generated interface"),
				h("button", {
					type: "button",
					style: toolbarButtonStyle,
					title: "Reload interface",
					onClick: () => setFrameKey((k) => k + 1)
				}, "Reload"),
				h("button", {
					type: "button",
					style: toolbarButtonStyle,
					title: expanded ? "Collapse interface" : "Expand interface",
					onClick: () => setExpanded((v) => !v)
				}, expanded ? "Collapse" : "Expand")
			);

			let footer = null;
			if (error) {
				footer = h("div", {
					style: {
						padding: "8px 10px",
						borderTop: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35))",
						fontSize: 12,
						color: "var(--dsw-alias-state-error-primary, #e5484d)"
					}
				}, error);
			} else if (sent) {
				footer = h("div", {
					style: {
						padding: "8px 10px",
						borderTop: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35))",
						fontSize: 12,
						color: "var(--dsw-alias-state-success-primary, #30a46c)"
					}
				}, "Result sent to the conversation.");
			} else if (pending) {
				footer = h("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 10,
						padding: "8px 10px",
						borderTop: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35))",
						fontSize: 12,
						color: "var(--dsw-alias-label-secondary, #a1a1a1)"
					}
				},
					h("span", {
						style: {
							flex: 1,
							minWidth: 0,
							whiteSpace: "nowrap",
							overflow: "hidden",
							textOverflow: "ellipsis"
						}
					}, "Submitted: " + pending.preview),
					h("button", {
						type: "button",
						style: {
							border: "none",
							background: "var(--dsw-alias-brand-primary, #3b82f6)",
							color: "#fff",
							borderRadius: 6,
							padding: "5px 10px",
							cursor: "pointer",
							font: "inherit",
							fontSize: 12,
							fontWeight: 600
						},
						onClick: handleSend
					}, "Send to agent")
				);
			}

			return h("div", {
				style: {
					width: "100%",
					boxSizing: "border-box",
					background: "var(--dsw-alias-bg-layer-2, #101010)",
					border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35))",
					borderRadius: 10,
					overflow: "hidden"
				}
			},
				header,
				h("div", { style: { background: "var(--dsw-alias-bg-base, #0a0a0a)" } },
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
						title: String(title).slice(0, 120) || "Generated interface",
						srcDoc: String(html)
					})
				),
				footer
			);
		}

		function apply(ctx) {
			const slots = ctx.get("slots");
			if (!slots) return;
			ctx.effect(() => {
				const dispose = slots.inject("tool.call.toolview", () => slots.register(
					{ name: "tool.call.toolview", key: "genui_html" },
					GenuiToolView
				));
				return dispose;
			});
		}

		exports.apply = apply;
		exports.inject = ["slots"];
		return module.exports;
	}
});
