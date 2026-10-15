# 11x Sales chat widget

This is a plain JavaScript storefront widget built with Vite. A small loader fetches a pinned release asynchronously, then mounts one widget instance on the page. Each release lives in `dist/releases/<version>/` so installations can be tested and rolled back by changing their pinned version.

## Runtime structure

The widget mounts in an `<x11-sales-chat>` host with an open Shadow DOM. Its stylesheet is bundled with the release and inserted inside that shadow root. Internal CSS classes, custom properties, element IDs, and animation names use the `x11-sales-` namespace. The public `window.ChatWidget` and `window.ChatWidgetLoader` APIs retain their existing names for integrations.

## Source map

| File | Purpose |
| --- | --- |
| `src/loader.js` | Fetch a pinned release and reuse its mounted instance |
| `src/index.js` | Public widget interface and instance lifecycle |
| `src/widget.js` | Chat UI, interaction, messages, and visibility |
| `src/config.js` | Merchant settings, validation, colors, and URL rules |
| `src/styles/widget.css` | Design tokens and component styles |
| `src/styles.js` | Insert the bundled or optional external CSS into Shadow DOM |
| `scripts/build.js` | Build the widget and loader with Vite |
| `scripts/build-release.js` | Create an immutable, versioned release |

See [README.md](README.md) for installation and API usage, [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) for tokens, and [MULTI_PLATFORM_PLAN.md](MULTI_PLATFORM_PLAN.md) for platform work.
