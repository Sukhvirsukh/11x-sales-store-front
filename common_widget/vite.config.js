import { defineConfig } from "vite";
import { readFileSync } from "node:fs";

export const version = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url)),
).version;
export function libraryBuild(entry, fileName, emptyOutDir = true) {
  return {
    configFile: false,
    define: { __WIDGET_VERSION__: JSON.stringify(version) },
    build: {
      outDir: "build",
      emptyOutDir,
      target: "es2020",
      lib: {
        entry,
        formats: ["iife"],
        name: "ChatWidgetBundle",
        fileName: () => fileName,
      },
    },
  };
}
export default defineConfig({
  define: { __WIDGET_VERSION__: JSON.stringify(version) },
  server: { host: "127.0.0.1" }
});
