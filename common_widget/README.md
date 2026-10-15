# 11x Sales chat widget

A plain JavaScript chat widget built with Vite. The bootstrap waits for design settings, then mounts the full widget with its final launcher. If the design request fails, nothing appears. The widget runs inside Shadow DOM. Vite is a development dependency; storefronts only load compiled JavaScript. Internal CSS classes and design tokens use the `x11-sales-` namespace.

## Development

Requires Node.js 22.12 or later.

```bash
npm install
npm run dev
```

Open `/demo.html` on the Vite server. The demo imports the same widget modules used in production, including the design tokens and status states. Use the server instead of opening the HTML file directly because the source uses ES modules and Vite CSS imports.

```bash
npm test       # configuration and URL behavior
npm run build # minified bundles in build/
npm run format
```

## Source layout

| File | Responsibility |
| --- | --- |
| `src/index.js` | Public widget interface and instance lifecycle |
| `src/widget.js` | Chat UI, messages, status, visibility, and interactions |
| `src/config.js` | Configuration mapping, validation, colors, and URL rules |
| `src/dom.js` / `src/icons.js` | DOM creation and icon definitions |
| `src/styles.js` | Mount bundled CSS or an optional external stylesheet inside Shadow DOM |
| `src/styles/widget.css` | Design tokens and component styles |
| `src/browser.js` | Browser global and optional script-tag initialization |
| `src/bootstrap.js` | Design fetch and config-gated widget startup |
| `src/transport.js` | HTTP chat sending and native WebSocket replies |
| `src/loader.js` | Load a pinned release and reuse one mounted widget |
| `vite.config.js` | Shared development and library build settings |
| `scripts/build.js` | Build the widget and loader using the same Vite configuration |
| `scripts/build-release.js` | Package an immutable release using the package version |

See [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) for the token contract and [MULTI_PLATFORM_PLAN.md](MULTI_PLATFORM_PLAN.md) for the integration roadmap.

## Install on a storefront

Upload the chosen `dist/releases/<version>/` folder to your asset host, preserving the paths. Then install the bootstrap:

```html
<script src="https://cdn.example.com/releases/1.3.2/chatWidgetBootstrap.js"
        data-chat-widget-bootstrap
        data-widget-url="https://cdn.example.com/releases/1.3.2/chatWidget.js"
        data-config-url="https://cdn.example.com/chat-design.json"
        defer></script>
```

The bootstrap fetches the design JSON before loading `chatWidget.js`. The full widget and its launcher appear together after valid design settings arrive. If the request fails or returns invalid data, the widget stays hidden. Repeated bootstrap initialization replaces the previous widget. Pin both script URLs to the same version and reload the page after changing that version.

The older `chatWidgetLoader.js` remains available for integrations that need to mount the full widget immediately.

Starting with `1.2.0`, the widget bundle includes its CSS as text and inserts it into Shadow DOM. No page-level stylesheet or separate CSS request is required. Earlier release folders retain their CSS files and remain loadable by the loader.

For Shopify, the theme app embed loads the bootstrap and temporary `chat-design.json` from its extension assets. `npm run dev` and `npm run deploy` in `shopify_extension/11x-sales` copy the current assets automatically. If the development server is already running, run `npm run sync:shopify` there after editing `mocks/chat-design.json`, then reload the storefront preview.

## Configuration and callbacks

The JSON file may contain the fields directly or wrap them in `{ data: fields }`. `primaryColor` and `notificationColor` accept `#RGB` or `#RRGGBB`. Invalid values are ignored. Runtime settings flow into the design system's semantic tokens.

For callbacks, load the loader script without `data-chat-widget-loader` and call this after it loads:

```js
const widget = await ChatWidgetLoader.load({
  version: "1.3.2",
  assetBaseUrl: "https://cdn.example.com/",
  configUrl: "https://cdn.example.com/chat-design.json",
  onSend: (message, widget) => {
    widget.addMessage("Demo reply to: " + message, "bot");
  },
});
```

Use `config: chatDesignFields` instead of `configUrl` to pass configuration directly. `onSend` may return a Promise: loading and error states follow its result. Messages are rendered as text, never HTML.

To use the built-in chat transport, set `data-chat-api-url` and optionally `data-socket-url` on the bootstrap script, or pass `chatApiUrl` and `socketUrl` to `ChatWidgetBootstrap.init()`. The chat API is called only after a visitor sends a message. It receives `POST` JSON with `message` and, after the first response, `conversationId`. It may return `{ reply, id, conversationId, products }` directly or inside `data`. A native WebSocket connects only while the panel is open; JSON messages with `{ id, role: "assistant", text, products }` add bot replies. Message IDs prevent duplicates between HTTP and socket responses. The socket reconnects after an unexpected close.

These are configurable integration points until the backend endpoint and socket protocol are supplied. The dashboard's authenticated `/chat-design` endpoint cannot be called from a public storefront with its Bearer token. Use a public, read-only design URL or CDN JSON for `configUrl`, and allow cross-origin requests if it is hosted on another origin. Never expose a server secret in the page.

| Method or option | Purpose |
| --- | --- |
| `ChatWidgetBootstrap.init(options)` | Load config, then mount the full widget; stay hidden on config failure |
| `ChatWidget.init(options)` | Create the full widget directly; replaces the previous instance |
| `widget.ready` | Resolves to applied configuration, or null if unavailable |
| `widget.styleReady` | Resolves to whether styles loaded |
| `open()` / `close()` / `toggle()` | Control the chat panel |
| `addMessage(text, role, options)` | Append a bot or user message, with optional products |
| `setFields(fields)` | Apply design settings at runtime |
| `setStatus(status, message?)` | Show `idle`, `loading`, or `error` |
| `loadConfig()` | Fetch configuration again |
| `destroy()` | Remove the widget and its listeners |
| `onImageUpload(files, widget)` | Handle attachments |
| `onLike(messageId, widget)` / `onDislike(messageId, widget)` | Handle message feedback |
| `styleUrl` | Optional external CSS URL, replacing bundled styles |
| `configHeaders` | Optional headers for the config request; never put server secrets here |

Products accept `id`, `title`, `price`, and optional `code`, `imageUrl`, and `productUrl`. Product links must be relative paths or HTTP(S) URLs.

Social connections, lead capture, marketing consent, and `pageVisibility` are not yet implemented. Device visibility and `excludePages` are supported.

## Releases and rollback

The version in `package.json` is the single source for the widget and loader build. Update it for a new release, then run:

```bash
npm run release
```

This builds the full widget, lazy bootstrap, and legacy loader; creates `dist/releases/<version>/`; and updates `dist/chatWidgetLoader.js`. The command refuses to overwrite an existing release. `npm run build` is repeatable and only replaces the temporary `build/` output; it never clears `dist/releases/`.

Upload the new assets to your CDN and pin a test installation to the new version. Roll back by restoring the previous `data-version` and reloading the page. CDN publication is not configured in this repository.

## Browser checks

With Vite running, open:

- `/tests/design-system-smoke.html` for source styles, states, and viewport layout.
- `/tests/release-smoke.html` for the packaged release, duplicate mounting, isolation, and lifecycle.
- `/tests/lazy-smoke.html` for mounting the configured widget before interaction.
- `/tests/bootstrap-gate-smoke.html` for delayed config, stable launcher, and failed config behavior.

Each page prints named checks; all should be `true`. The release fixture defaults to `1.3.2` and accepts `?version=<version>` to check another release.
