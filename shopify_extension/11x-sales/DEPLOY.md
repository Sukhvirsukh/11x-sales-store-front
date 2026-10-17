# Deploying the 11xsales.ai Shopify app

This folder holds the **app configuration** (`shopify.app.toml`) and the **chat theme
app extension** (`extensions/chat-widget`). Sign-in, store connection, billing and
webhooks are served by the 11xsales.ai API (core.11xsales.ai); the React Router app in
`app/` is the Shopify template and is not deployed.

## Deploy

```bash
cd shopify_extension/11x-sales
npm install
shopify app config link     # choose the production app "11xsales" (client id 0980007a…)
shopify app deploy          # pushes the config and the chat extension as a new version
```

`shopify app config link` may rewrite `shopify.app.toml` from the Dev Dashboard: check
the diff and keep the values here (application_url, redirect URLs, scopes, webhooks).

## How the chat finds the store's agent

1. A store connects in 11xsales.ai (Continue with Shopify, or Chat setup › Integration).
2. The API saves the agent id on the app's installation in that store: app-data
   metafield `elevenx.agent_id`.
3. The app embed (`blocks/chat-widget.liquid`) reads `app.metafields.elevenx.agent_id`
   and loads `https://agent.11xsales.ai/widget.js` with it.
4. The dashboard's "Turn on chat in your theme" button opens
   `https://{shop}/admin/themes/current/editor?context=apps&activateAppId={client_id}/chat-widget`:
   the merchant clicks Save.

Stores connected before this existed get the value on their next Refresh (Chat setup ›
Integration) or reconnect.

## Before submitting to the App Store

- Partner Dashboard › API access › **Protected customer data**: request access for
  orders and customers (used for order lookup in the chat), with the reasons.
- App listing: name "11xsales.ai", privacy policy https://11xsales.ai/privacy,
  support email, screencast, and test instructions (a development store with a
  catalog; reviewers' development stores get test charges automatically).
