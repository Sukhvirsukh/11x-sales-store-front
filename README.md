# 11x Sales Shopify project

This repository contains the shared chat widget in `common_widget/` and the Shopify app and theme extension in `shopify_extension/11x-sales/`.

Use Node.js 22.12 or newer. Install dependencies in both packages before starting the app:

```sh
cd common_widget
npm ci
cd ../shopify_extension/11x-sales
npm ci
npm run dev
```

The app's `predev` and `predeploy` scripts build the shared widget and copy its JavaScript and design JSON into the theme extension. Those generated assets, local databases, and Shopify development state are excluded from Git. The shared widget source and both lockfiles are committed so a fresh clone can rebuild them.
