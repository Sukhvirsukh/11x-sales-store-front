import { existsSync } from "node:fs";
import { mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { version } from "../vite.config.js";
import { buildWidget } from "./build.js";

const release = resolve("dist", "releases", version);
if (existsSync(release))
  throw new Error(
    `Release ${version} exists. Bump package.json version first.`,
  );
await buildWidget();
await mkdir(release, { recursive: true });
for (const file of ["chatWidget.js", "chatWidgetLoader.js", "chatWidgetBootstrap.js"]) {
  await copyFile(resolve("build", file), resolve(release, file));
}
await copyFile(
  resolve("build/chatWidgetLoader.js"),
  resolve("dist/chatWidgetLoader.js"),
);
console.log(`Release ${version} is ready in ${release}`);
