import { domReady } from "./ready.js";

const script = document.currentScript;
const defaultBase = script?.src
  ? new URL(".", script.src).href
  : document.baseURI;
// Shared across repeated copies of the installation snippet.
const state = (window.__chatWidgetLoaderState ??= {});

async function loadScript(url, version) {
  if (!window.ChatWidget) {
    await new Promise((resolve, reject) => {
      const asset = document.createElement("script");
      asset.src = url;
      asset.async = true;
      asset.onload = resolve;
      asset.onerror = () => {
        asset.remove();
        reject(new Error(`Failed to load chat widget release ${version}`));
      };
      document.head.append(asset);
    });
  }
  if (window.ChatWidget?.version !== version)
    throw new Error(
      `Expected chat widget ${version}; a different or invalid script is loaded`,
    );
  return window.ChatWidget;
}

async function load(options = {}) {
  const {
    version = __WIDGET_VERSION__,
    assetBaseUrl = defaultBase,
    ...widgetOptions
  } = options;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
    throw new Error("Invalid chat widget release version");
  if (state.instance && !state.instance.host.isConnected)
    Object.assign(state, { instance: null, promise: null, version: null });
  if (state.promise) {
    if (state.version !== version)
      throw new Error(
        "A different chat widget release is already loading or mounted",
      );
    return state.promise;
  }
  const base = new URL(assetBaseUrl, document.baseURI);
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  const url = new URL(`releases/${version}/chatWidget.js`, base).href;
  state.version = version;
  state.promise = (async () => {
    await domReady();
    const api = await loadScript(url, version);
    const instance = api.init(widgetOptions);
    const [, styled] = await Promise.all([instance.ready, instance.styleReady]);
    if (!styled || !instance.host.isConnected) {
      instance.destroy();
      throw new Error("Chat widget could not finish mounting");
    }
    state.instance = instance;
    return instance;
  })().catch((error) => {
    Object.assign(state, { instance: null, promise: null, version: null });
    throw error;
  });
  return state.promise;
}

window.ChatWidgetLoader ??= { load };
if (script?.hasAttribute("data-chat-widget-loader")) {
  const { version, assetBaseUrl, configUrl } = script.dataset;
  load({ version, assetBaseUrl, configUrl }).catch((error) =>
    console.error("[11x Sales chat] loader failed", error),
  );
}
