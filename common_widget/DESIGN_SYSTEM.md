# Chat widget design system

The widget's design tokens live at the top of `src/styles/widget.css` on `.x11-sales-root`, inside the widget's Shadow DOM. This is the single source of truth for the storefront widget and the local preview in `demo.html`.

## Token layers

| Layer | Prefix | Purpose | Examples |
| --- | --- | --- | --- |
| Primitive | `--x11-sales-p-*` | Base color, spacing, type, radius, duration, and shadow values | `--x11-sales-p-slate-900`, `--x11-sales-p-space-2` |
| Semantic | `--x11-sales-color-*`, `--x11-sales-space-*`, `--x11-sales-font-*` | Values named by their role | `--x11-sales-color-surface`, `--x11-sales-color-primary` |
| Component | `--x11-sales-launcher-*`, `--x11-sales-panel-*`, `--x11-sales-message-*`, `--x11-sales-input-*`, `--x11-sales-send-*` | Values used by a specific UI part | `--x11-sales-launcher-bg`, `--x11-sales-input-border` |

Component rules should use component tokens when a component override is useful. New reusable visual values should enter the primitive layer and receive a semantic alias before a component uses them. Do not put new hex colors directly into component rules.

## Merchant settings

`src/config.js` validates `primaryColor` and `notificationColor` as hex colors before applying them. It maps them to `--x11-sales-color-primary` and `--x11-sales-color-notification`. It also calculates a readable foreground for the primary color and a translucent header tint. Component tokens then use these semantic values.

`bubbleSize`, `moveLeftRight`, `moveUpDown`, and `zIndex` are layout settings and remain separate from the visual token layers. Each is validated and clamped in JavaScript.

## States

The widget exposes `widget.setStatus("idle" | "loading" | "error", message?)`. It shows a live status message, disables sending while loading, and marks the input invalid on error. When `onSend` returns a Promise, the widget moves through loading and idle or error automatically. A synchronous `onSend` callback can call `setStatus` itself.

Interactive controls use the same focus ring, transition duration, and disabled opacity tokens. Motion stops when the visitor requests reduced motion.

## Responsive layout

The panel targets `--x11-sales-panel-height: 640px` and is capped by the available viewport height. On phones, it fills the available area above the launcher, which remains visible and can close the chat. The panel width is capped by the viewport. Edge offsets are clamped to keep it on screen. The widget follows `visualViewport` on mobile to stay above the software keyboard, while CSS safe area insets keep it clear of device edges.

## Preview and releases

`demo.html` creates the real `ChatWidget` with `chatDesignFields` and can preview styles and loading or error states. There is no admin dashboard source in this folder. An admin preview should mount this same widget bundle and call `setFields()` with draft settings, so it uses the same tokens and component rules as the storefront.

Update the version in `package.json` and run `npm run release` after editing the source. Vite bundles the CSS into the widget; it is mounted inside Shadow DOM. Published release folders are immutable; update the pinned version to test a change and point back to an earlier version to roll back.
