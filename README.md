# 11x Sales Agent — Shopify theme app extension

This repository is an **extension-only Shopify app**. It contains a single
[theme app extension](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions)
called `11x-sales-agent` and nothing else — no web server, no database, no
React Router app.

Because it is extension-only, the app can only be installed with **custom
distribution** (it is not eligible for public App Store distribution).

---

## How it works

### The big picture

A theme app extension is not a website — it's a bundle of Liquid blocks that
Shopify injects into a merchant's theme. There is nothing to host: during
deploy, Shopify CLI uploads the extension's blocks and assets to Shopify, and
they are served from Shopify's CDN.

The flow, end to end:

```
  You                          Shopify                        Storefront
  ───                          ───────                        ──────────
  pnpm deploy        ──▶  creates an app version,
                          releases it, uploads
                          blocks + assets to the CDN

                          merchant installs   ──▶  app blocks appear in the
                          the app (custom           theme editor under "Apps"
                          distribution link)
                                                          │
                          merchant enables         ◀──────┘
                          the Chatbot block
                          in the theme editor
                                                          │
                          theme renders the        ◀──────┘
                          block's Liquid  ──▶  {{ }} <script src=
                                               "https://agent.11xsales.ai/
                                                widget.js" data-agent="…">

  ┌───────────────────────────────────────────────────────────────────────┐
  │ agent.11xsales.ai/widget.js loads in the customer's browser and draws  │
  │ the chat widget. This repo is never involved at runtime — there is no  │
  │ backend in it.                                                         │
  └───────────────────────────────────────────────────────────────────────┘
```

Key points:

- **Why is this an "app" at all?** Theme app extensions must ship as part of a
  Shopify app. `shopify.app.toml` identifies that app (via `client_id`), which
  is why the extension lives under `extensions/`.
- **Why extension-only?** The extension renders entirely through Liquid and a
  third-party script, so no server is needed. Shopify hosts the default App
  Home page for you (`application_url` in `shopify.app.toml` points at it).
- **Nothing in this repo serves storefront traffic.** The storefront only ever
  loads `https://agent.11xsales.ai/widget.js`.

### The two blocks

`extensions/11x-sales-agent/blocks/` is the entry point of the extension. Each
`.liquid` file becomes something a merchant can add in the theme editor:

| Block | Target | What it is |
| --- | --- | --- |
| **Chatbot** | `body` | An **app embed block**. It loads site-wide when the merchant toggles it on under **App embeds**, and is not placed in an individual section. |
| **Star Rating** | `section` | An **app block**. It is placed inside a theme section. This is the sample block that ships with the Shopify theme template and is not part of the chatbot. |

The block's `{% schema %}` tag (at the bottom of each file) defines the
settings the merchant sees in the theme editor.

### How the Chatbot block works

```liquid
{% assign agent_id = app.metafields.chatbot.agent_id.value | strip %}
{% if agent_id == blank %}
  {% assign agent_id = block.settings.agent_id | strip %}
{% endif %}
{% assign agent_id = agent_id | split: '?' | first | split: '#' | first | split: '/' | last | strip %}

{% if agent_id != blank %}
  <script src="https://agent.11xsales.ai/widget.js" data-agent="{{ agent_id | escape }}" defer></script>
{% endif %}
```

1. It reads the **Agent ID saved by the installation backend** from the app-data
   metafield `chatbot.agent_id` on the current store's app installation.
2. If that value is missing, empty, or whitespace-only, it reads the existing
   **Agent ID (fallback)** theme setting. The automatic value takes priority.
3. It normalises it: a bare ID or full share link
   (`https://agent.11xsales.ai/c/<id>`) works. Query strings and fragments are
   removed before extracting the last path segment.
4. If an ID is present, it outputs a `<script>` tag that loads the widget with
   that ID as `data-agent`. `defer` keeps it off the critical rendering path.
5. If no Agent ID is set, **no script is output** — the widget never loads.

The Agent ID is per-store configuration. Once this extension version is deployed,
changing a store's saved ID does not require redeployment. It does not belong in
this project's `.env` or generated TOML.

### Connect an Agent ID from the installation backend

This repository implements the **reader**. The separate installation backend must
implement the **writer** below; installing the app alone does not save an Agent ID.
Both projects must target the same Shopify app/client ID.

After verifying the OAuth callback and obtaining that shop's Admin API access token:

1. Resolve or create the agent belonging to the authenticated merchant/store.
   Store the canonical Agent ID in your backend's shop-to-agent mapping.
2. Query `currentAppInstallation` through the Admin GraphQL API and select its
   `id`. Use this ID as the owner, not the shop ID or another store's installation.
3. Call `metafieldsSet` with one input in its `metafields` list:

   | Input field | Value |
   | --- | --- |
   | `ownerId` | The `currentAppInstallation.id` returned for this shop |
   | `namespace` | `chatbot` |
   | `key` | `agent_id` |
   | `type` | `single_line_text_field` |
   | `value` | The canonical Agent ID for this store |

4. Check HTTP failures, GraphQL `errors`, and mutation `userErrors` before marking
   setup complete. Retry failed writes without creating duplicate agents.
5. Verify the saved value by querying `currentAppInstallation.metafield` with
   namespace `chatbot` and key `agent_id`, selecting `value`.
6. Send the merchant to the theme editor to enable **Chatbot** under **App embeds**
   and **Save**. They do not need to enter the ID when the automatic value is saved.

This uses an **app-data metafield on AppInstallation**, not a shop or product
metafield. It does not require a TOML metafield definition. Shopify documents the
installation lookup, write operation, and Liquid access in
[App-data metafields](https://shopify.dev/docs/apps/build/metafields#app-data-metafields).

Repeat the write when the merchant changes their connected agent and after
reinstallation, using the current installation ID. Existing installations can be
backfilled using each shop's valid token and existing agent mapping. API calls and
tokens stay in the backend; the rendered Agent ID is visible in storefront HTML.

The manual setting is a fallback, not an override. To return a store to manual
configuration, delete its `chatbot.agent_id` app-data metafield. Clearing the manual
field does not disable an automatically configured widget; turn off the app embed
to disable it. App embed activation still requires the merchant to save the theme.

#### Verify the integration on a development store

- With the app-data metafield absent, save a manual ID and confirm it appears in
  the script's `data-agent` attribute.
- Save a different automatic ID and confirm it takes precedence over the manual ID.
- Remove the automatic value and confirm the manual fallback works again.
- Clear both sources and confirm no `widget.js` script is rendered.
- Try a full share URL with a query string/fragment and confirm only the ID is used.
- Disable the embed and confirm no widget script is rendered, even with a saved ID.
- Verify a second store uses its own installation's ID.

---

## Project structure

```
.
├── extensions/
│   └── 11x-sales-agent/
│       ├── assets/                # images/assets served from Shopify's CDN
│       ├── blocks/
│       │   ├── chatbot.liquid     # the chat widget (app embed block)
│       │   └── star_rating.liquid # sample app block
│       ├── locales/
│       │   └── en.default.json    # storefront translations
│       ├── snippets/
│       │   └── stars.liquid       # reusable Liquid snippet
│       └── shopify.extension.toml # name + type = "theme"
├── shopify.app.toml               # app config (extension-only: points at Shopify's default App Home)
├── package.json                   # Shopify CLI scripts + local @shopify/cli
├── pnpm-workspace.yaml            # pnpm config (allows the esbuild build script)
└── pnpm-lock.yaml                 # lockfile
```

There is no `app/` directory, no server entry point, and no build output — the
extension is uploaded as-is.

---

## Requirements

- **Shopify CLI.** This repo includes it as a local dev dependency, so
  `pnpm install` is enough. To use the CLI globally instead:

  ```shell
  npm install -g @shopify/cli@latest
  ```

- **Node.js 22.12 or later**
- A [Partner account](https://dev.shopify.com/dashboard) (or an app created in
  a store's organization)
- A development store with an Online Store 2.0 theme (e.g. Dawn)
- Access to the existing app matching the `client_id` in `shopify.app.toml`

---

## Setup

```shell
pnpm install
cp .env.example .env # only if you don't already have a .env file
```

Set the app's client ID, name, URL, embedded setting, callback URLs, and webhook
API version in `.env`. Keep client secrets and merchant access tokens in your
installation backend; this extension does not need them. `.env` is ignored by Git.

The package scripts regenerate `shopify.app.toml` from `.env` and
`shopify.app.toml.template` before running Shopify CLI. Process environment
variables take precedence over `.env`, so CI can supply these values directly.
Use `pnpm config:generate` to regenerate the file on its own. Direct commands
such as `pnpm exec shopify ...` bypass this step; run `pnpm config:generate` first.
Edit the template for additional settings such as scopes, legacy installation
configuration, or webhook subscriptions; edits to the generated TOML are overwritten.
The initial placeholder app URL and empty callback list still need to be updated
to match your installation backend before deployment.

`shopify.app.toml` already contains the app's `client_id`, so the CLI links to
the existing app instead of creating a new one. Confirm the link at any time:

```shell
pnpm info
```

---

## Test locally

A theme app extension can't be rendered fully offline — Shopify has to inject
it into a real theme. So testing has two levels: **offline checks** that need no
store, and a **live preview** on a development store.

### Level 1 — Offline checks (no store, no login)

Validate the config and bundle the extension exactly as a deploy would:

```shell
pnpm build
# same as: shopify app build
```

Expected output ends with `11x-sales-agent built!`. This catches problems in
`shopify.app.toml` and in the block Liquid before you ever touch a store.

> You'll see a `[warning]: RemoteAsset` note about
> `https://agent.11xsales.ai/widget.js` not being served from the Shopify CDN.
> That is expected — the widget is intentionally hosted by 11x, not Shopify.

To schema-check the config on its own (requires a login):

```shell
pnpm config:validate
```

### Level 2 — Live preview on a dev store (the real test)

```shell
pnpm dev
# same as: shopify app dev
```

The first run asks you to select the organization and store, then:

1. Uploads the extension to your **dev store** (no release involved).
2. Starts a local dev server with hot reload.
3. Prints a **theme editor** link and a **preview** URL.

This store is already linked in this repo (`11x-sales.myshopify.com`), so the
prompts are usually skipped. To see the widget:

1. Open the **theme editor** link from the CLI output.
2. Under **App embeds**, enable **Chatbot**.
3. If the backend has not saved an ID, enter **Agent ID (fallback)**. Click **Save**.
4. Open the **preview** URL printed at the bottom of the CLI output.
5. In the browser DevTools console, confirm the script request:
   `https://agent.11xsales.ai/widget.js`.

Liquid edits hot-reload while `pnpm dev` is running — no re-deploy needed.

Useful flags:

| Flag | Use it when |
| --- | --- |
| `-s, --store <url>` | Pick the dev store non-interactively |
| `-t, --theme <id or name>` | Preview against a specific theme (defaults to uploading Dawn) |
| `--reset` | Local state looks stale or the extension isn't updating |

> **Chrome only.** The theme extension preview is documented to work in Google
> Chrome. Use another browser and the injected preview may not load.

> `pnpm dev` only affects your own dev store. It never publishes to other
> stores — that is what [Deploy](#deploy) is for.

### Level 3 — Test the widget by itself (no Shopify at all)

Since the block only outputs a `<script>` tag, you can sanity-check the widget
without Shopify by putting the same tag in a plain HTML file:

```html
<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Widget test</title></head>
  <body>
    <h1>11x widget test</h1>
    <script src="https://agent.11xsales.ai/widget.js" data-agent="YOUR-AGENT-ID" defer></script>
  </body>
</html>
```

Serve it and open it in a browser:

```shell
python3 -m http.server 8000
# then open http://localhost:8000/widget-test.html
```

This verifies the **widget itself** (script URL, agent ID, rendering). It does
**not** test the Shopify integration — use Level 2 for that.

### What you can't test locally

- **No offline Liquid rendering.** App blocks and app embeds are rendered by
  Shopify inside a theme, so there is no local server that shows the block on a
  page. The extension must be uploaded to a dev store (Level 2) to see it in a
  storefront.
- **The Star Rating block needs data.** It reads a product's
  `demo.avg_rating` metafield (namespace `demo`, key `avg_rating`, type
  **Integer**). Create that metafield definition and set a value on a product,
  or the block renders blank. The Chatbot uses an app-data metafield for automatic
  setup, but also works with just the manual fallback setting.
- **You need a real Agent ID.** Without one the Chatbot block outputs nothing,
  by design.

---

## Deploy

Deploying creates a new **app version** containing the extension and releases
it to every store that has the app installed. There is no separate hosting step.

### Step 1 — Deploy

From the project root:

```shell
pnpm deploy
# same as: shopify app deploy
```

This will:

1. Bundle the extensions (no build step for a theme extension — files are
   uploaded as-is).
2. Create a new app version.
3. **Release it** — releasing replaces the currently active version served to
   stores. It can take **several minutes** for installed stores to receive it.

If the CLI isn't logged in yet, it will walk you through authentication. You can
add a description to the version for your own record-keeping:

```shell
pnpm exec shopify app deploy --message "Fix chatbot agent ID parsing"
```

Don't release immediately? Create the version without releasing it:

```shell
pnpm exec shopify app deploy --no-release
```

Then release it later (this replaces the active version for installed stores):

```shell
pnpm exec shopify app release
```

You can also release from the **Dev Dashboard** under your app's versions.

### Step 2 — Install the app on a store

> Shipping the extension inside your **own** app instead of this repo's app?
> Skip to [Using this extension with an existing app](#using-this-extension-with-an-existing-app-legacy-callback-install).

Extension-only apps use **custom distribution**. If the app is not installed on
the store yet:

1. Open your app in the [Dev Dashboard](https://dev.shopify.com/dashboard).
2. On the app's **Home**, find the **Distribution** card and select **Custom
   distribution**.
3. Enter the store's `*.myshopify.com` domain and click **Generate link**.
4. Open the install link and approve the install.
   *(For a Plus organization, multi-store installs are allowed by default.)*

If the app was created inside the store's own organization instead of a Partner
organization, install it from the app's **Installs** card.

> Distributing the extension to another merchant's store means sending them the
> custom install link. Only custom distribution works here — public App Store
> distribution is not available to extension-only apps.

### Step 3 — Add the block in the theme editor

Installing the app does not display anything by itself; the merchant turns the
block on:

1. **Online Store → Themes → Customize** (on the target store).
2. Under **App embeds**, toggle **Chatbot** on (loads it site-wide).
3. If the backend has not saved an ID, enter **Agent ID (fallback)**. Click **Save**.

### Step 4 — Verify

Open the storefront and confirm the widget loads. In the browser DevTools
console you should see the `widget.js` request:

```
https://agent.11xsales.ai/widget.js
```

If it doesn't appear, see [Troubleshooting](#troubleshooting) — the usual cause
is the app embed not being toggled on, or no Agent ID saved.

### Updating an already-installed store

You don't reinstall. Change the code, then deploy again:

1. `pnpm deploy`
2. Wait a few minutes for the release to roll out.
3. Reload the storefront.

The merchant's saved block settings are preserved across app versions. To change
the automatic Agent ID, update the installation metafield from your backend. If
using manual setup, edit the fallback ID in the theme editor. Neither needs a deploy.

### Deploying from CI/CD

`shopify app deploy` is interactive by default. In a non-interactive
environment, pass `--allow-updates` (and `--allow-deletes` if extensions were
removed) so it doesn't wait for confirmation:

```shell
pnpm exec shopify app deploy --allow-updates
```

Use `--no-release` if you want CI to create versions that you release manually.

### Useful deploy commands

| Command | What it does |
| --- | --- |
| `pnpm deploy` | Create a new app version and release it |
| `pnpm exec shopify app deploy --no-release` | Create a version without releasing |
| `pnpm exec shopify app release` | Release the latest unreleased version |
| `pnpm exec shopify app versions` | List deployed versions |
| `pnpm info` | Show the linked app, organization, and dev store |
| `pnpm config:validate` | Validate `shopify.app.toml` and extension configs |

---

## Using this extension with an existing app (legacy callback install)

The rest of this README assumes you deploy this repo's own app. If you already
have a Shopify app that you install yourself — for example a **legacy OAuth
callback URL** flow with a **non-embedded** app — ship the extension with *that*
app instead.

This works because a theme app extension needs none of an app's front end:
there is no admin UI, no iframe, and no backend involved. It only has to be
bundled into the app version that gets installed on the store. A non-embedded
app with a legacy install flow is perfectly fine.

### Recommended: add the extension to your existing app project

1. **Copy the extension folder** into your app's `extensions/` directory:

   ```
   your-app/
   ├── extensions/
   │   └── 11x-sales-agent/          ← copied from this repo
   │       ├── assets/
   │       ├── blocks/
   │       ├── locales/
   │       ├── snippets/
   │       └── shopify.extension.toml
   ├── shopify.app.toml              ← your existing app config, unchanged
   └── package.json
   ```

2. **Remove the `uid` line** from
   `extensions/11x-sales-agent/shopify.extension.toml`. The `uid` is
   *app-scoped* — the value in this repo belongs to this repo's app. Shopify CLI
   regenerates uids from the extension handle during `deploy`, so let it own
   that value and commit whatever it writes.

3. **Keep your own `shopify.app.toml` exactly as it is** — your `client_id`,
   `application_url`, `[auth] redirect_urls` (your legacy callback URL), scopes,
   and `embedded = false`.

4. **Deploy from your app project:**

   ```shell
   shopify app deploy
   ```

   In the confirmation summary the extension should appear as **new**. Watch
   for anything marked *removed* — that would indicate a mapping problem.

5. **Install on the store using your existing flow.** Nothing about the install
   changes; once the app is installed, the block appears in the theme editor.

6. **Save the Agent ID from your backend and enable the embed.** Follow the
   installation-backend steps above, or use the manual fallback field. App embeds
   remain inactive until a merchant enables them and saves in the theme editor.

### ⚠️ Don't deploy this repo's config against your app

`shopify.app.toml` in this repo has `include_config_on_deploy = true`, so
`shopify app deploy` ships the local config **as the app's configuration**. This
repo's config points at Shopify's placeholder App Home
(`https://shopify.dev/apps/default-app-home`), sets `embedded = true`, and
declares **no** `redirect_urls`.

Pointed at your app, that would replace your real app URL and redirect URLs and
**break your legacy callback install**. Always read the config-change summary
before confirming a deploy.

### Alternative: point this repo at your app

If you'd rather keep this repo as the extension's home, make `shopify.app.toml`
mirror your app, then deploy from here:

```toml
client_id = "<your app's client id>"
application_url = "<your app's URL>"
embedded = false                     # non-embedded app

[auth]
redirect_urls = [ "<your legacy callback URL>" ]
```

Carry over your real scopes and webhooks too. Keeping the app config in two
places drifts over time, which is why copying the folder into your app is the
safer option.

### Check for a double-loaded widget

If your app currently injects the widget with the **ScriptTag API**, remove that
injection when you switch to the theme app extension. Otherwise the storefront
loads the widget twice — once from your script tag and once from the block.

---

## Making changes

### Change the chatbot behaviour

Edit `extensions/11x-sales-agent/blocks/chatbot.liquid`. Any new setting must
also be added to the `{% schema %}` block at the bottom of the file. Preview
with `pnpm dev`, then `pnpm deploy` to release.

### Change the Agent ID

Update `chatbot.agent_id` on that shop's app installation from the backend.
For stores without an automatic ID, edit **Agent ID (fallback)** in the theme editor.
The automatic value takes priority; changing the manual field will not override it.
Neither change requires deploying the extension.

### Remove the sample Star Rating block

Delete `blocks/star_rating.liquid`, `snippets/stars.liquid`,
`locales/en.default.json`, and `assets/thumbs-up.png` if you don't need the
template's sample block, then deploy again.

---

## Notes & limitations

- **Extension-only apps require custom distribution.** They cannot be published
  publicly on the Shopify App Store.
- **No backend.** There are no sessions or database in this repo, and no
  webhook subscriptions. All storefront behaviour comes from Liquid plus
  `agent.11xsales.ai`.
- **`[auth]` and `[webhooks]` must stay in `shopify.app.toml`.** Shopify CLI's
  config validator rejects an app without them (`[auth]: Required`,
  `[webhooks]: Required`), even for an extension-only app. They declare no
  redirect targets and no subscriptions here — they exist to satisfy the schema.
  Verify with `pnpm build`.
- **Deploys go through app versions.** A released version is served to all
  installed stores and can take several minutes to propagate.
- `application_url` in `shopify.app.toml` points at Shopify's hosted default
  App Home (`https://shopify.dev/apps/default-app-home`). If you ever add a
  backend, change it to your hosted URL.
- Extension assets are served from Shopify's CDN — there is no hosting step for
  a theme app extension.

---

## Troubleshooting

- **`shopify: command not found`** — run commands through `pnpm` (e.g.
  `pnpm deploy`), or install the CLI globally with
  `npm install -g @shopify/cli@latest`.
- **The widget doesn't appear** — check, in order: the **Chatbot** app embed is
  toggled on, an automatic or fallback **Agent ID** is saved, the theme was
  **Saved**, and the app version was actually **released**.
- **The manual ID is ignored** — the automatic `chatbot.agent_id` value takes
  priority. Update it from your backend or delete it to use the manual fallback.
- **Automatic setup is missing** — confirm the backend wrote to the current
  `AppInstallation` for the same app/client ID and shop, using namespace `chatbot`,
  key `agent_id`, and type `single_line_text_field`. Check API errors and read the
  value back. This repository does not run the installation callback.
- **Changes aren't showing on a store** — releases take a few minutes to roll
  out; confirm the version was released (`shopify app versions`).
- **The block isn't listed in the theme editor** — the theme must be an Online
  Store 2.0 theme that supports app blocks, and the app must be installed on
  that store.
- **Config errors** — run `pnpm config:validate`.

---

## Resources

- [Theme app extensions](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions)
- [Build theme app extensions](https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/build)
- [Extension-only apps](https://shopify.dev/docs/apps/build/app-extensions/build-extension-only-app)
- [Select a distribution method](https://shopify.dev/docs/apps/launch/distribution/select-distribution-method)
- [Shopify CLI](https://shopify.dev/docs/api/shopify-cli)
