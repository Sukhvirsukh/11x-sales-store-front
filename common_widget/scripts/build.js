import { build } from "vite";
import { pathToFileURL } from "node:url";
import { libraryBuild } from "../vite.config.js";

export async function buildWidget() {
  await build(libraryBuild("src/browser.js", "chatWidget.js"));
  await build(libraryBuild("src/loader.js", "chatWidgetLoader.js", false));
  await build(libraryBuild("src/bootstrap.js", "chatWidgetBootstrap.js", false));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await buildWidget();
