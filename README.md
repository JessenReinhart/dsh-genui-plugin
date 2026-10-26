# dsh-genui-plugin

Dynamic Generative UI plugin for DeepSeek Harness (DSH).

Provides:
- Tool: `genui_html` — allows AI agents to render custom interactive inline web interfaces directly in the conversation.
- Slash Command: `/genui` — lets users describe an interface to be generated.
- Sandboxed execution: interfaces run inside a sandboxed `iframe` (`sandbox="allow-scripts"`), preserving host security without network or parent-frame access.
- Interactive Callbacks: inside the iframe, scripts can communicate results or user selections back to the conversation via:
  ```javascript
  window.parent.postMessage({ type: 'genui:submit', payload: { ... } }, '*');
  ```
- Presentation persistence: UI payload travels via `presentationMeta`, reconstructing faithfully across session reloads, forks, and replays.

## Installation

Install into the current DSH profile via `plugin_manager`:

```json
{
  "action": "install_bundle",
  "target": "C:\\tmp\\dsh-genui-plugin"
}
```

## Tool Specification

- `name`: `genui_html`
- `parameters`:
  - `html` (string, required): Full self-contained HTML document with inline CSS/JS.
  - `title` (string, optional): Title displayed on the card header.
  - `height` (number, optional): Desired frame height in pixels (clamped between 180 and 720).

## License

MIT
