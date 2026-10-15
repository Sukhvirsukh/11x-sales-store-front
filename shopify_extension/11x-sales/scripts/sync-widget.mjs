// Builds the shared chat widget and copies its bundle and mock design into the
// Shopify theme extension. The mock is a temporary storefront config source.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const widgetRoot = resolve(appRoot, "../../common_widget");
const assetsDir = resolve(appRoot, "extensions/chat-widget/assets");
const copies = [
  {
    source: resolve(widgetRoot, "build/chatWidgetBootstrap.js"),
    target: resolve(assetsDir, "chatWidgetBootstrap.js"),
  },
  {
    source: resolve(widgetRoot, "build/chatWidget.js"),
    target: resolve(assetsDir, "chatWidget.js"),
  },
  {
    source: resolve(widgetRoot, "mocks/chat-design.json"),
    target: resolve(assetsDir, "chat-design.json"),
  },
];

if (!existsSync(resolve(widgetRoot, "package.json"))) {
  throw new Error(`common_widget not found at ${widgetRoot}`);
}

execFileSync("npm", ["run", "build"], {
  cwd: widgetRoot,
  stdio: "inherit",
});

mkdirSync(assetsDir, { recursive: true });
for (const { source, target } of copies) {
  if (!existsSync(source) || statSync(source).size === 0) {
    throw new Error(`Missing or empty sync source ${source}`);
  }
  copyFileSync(source, target);
  console.log(`Synced ${source} -> ${target}`);
}
