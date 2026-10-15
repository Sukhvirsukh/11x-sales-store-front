import {
  DEFAULTS,
  configToSettings,
  isRecord,
  pathIsExcluded,
  pathIsVisible,
  unwrapConfig,
} from "./config.js";
import { domReady } from "./ready.js";

const script = document.currentScript;
const version = __WIDGET_VERSION__;
const defaultWidgetUrl = script?.src
  ? new URL("chatWidget.js", script.src).href
  : null;
let activeBootstrap;
let corePromise;

function loadCore(url) {
  if (window.ChatWidget?.version === version)
    return Promise.resolve(window.ChatWidget);
  if (corePromise) return corePromise;
  corePromise = new Promise((resolve, reject) => {
    const element = document.createElement("script");
    element.src = url;
    element.async = true;
    element.onload = () => {
      if (window.ChatWidget?.version === version) resolve(window.ChatWidget);
      else reject(new Error("Chat widget bundle version mismatch"));
    };
    element.onerror = () =>
      reject(new Error("Chat widget bundle failed to load"));
    document.head.append(element);
  }).catch((error) => {
    corePromise = null;
    throw error;
  });
  return corePromise;
}

function visible(settings) {
  const mobile = window.matchMedia?.("(max-width: 767px)").matches ?? false;
  if (mobile ? !settings.showOnMobile : !settings.showOnDesktopTablet)
    return false;
  return (
    pathIsVisible(settings, location.pathname) &&
    !pathIsExcluded(settings.excludePages, location.pathname)
  );
}

class ChatWidgetBootstrap {
  constructor(options = {}) {
    this.options = options;
    this.widgetUrl = options.widgetUrl || defaultWidgetUrl;
    this.fields = isRecord(options.config) ? options.config : null;
    this.widget = null;
    this.destroyed = false;
    this.ready = this.start();
  }

  async loadConfig() {
    if (this.fields) return this.fields;
    if (!this.options.configUrl) return null;
    this.controller = new AbortController();
    try {
      const response = await fetch(this.options.configUrl, {
        credentials: "omit",
        signal: this.controller.signal,
      });
      if (!response.ok)
        throw new Error(`Config request failed (${response.status})`);
      const fields = unwrapConfig(await response.json());
      if (!isRecord(fields))
        throw new Error("Config response is not an object");
      this.fields = fields;
    } catch (error) {
      if (!this.destroyed && error.name !== "AbortError")
        console.error("[11x Sales chat] config load failed", error);
    }
    return this.fields;
  }

  async start() {
    const fields = await this.loadConfig();
    if (!fields || this.destroyed || !this.widgetUrl) return null;
    const settings = {
      ...DEFAULTS,
      ...this.options,
      ...configToSettings(fields),
    };
    if (!visible(settings)) return null;
    try {
      const core = await loadCore(this.widgetUrl);
      if (this.destroyed) return null;
      this.widget = core.init({
        ...this.options,
        config: fields,
      });
      const [, styled] = await Promise.all([
        this.widget.ready,
        this.widget.styleReady,
      ]);
      if (!styled) {
        this.widget.destroy();
        this.widget = null;
        throw new Error("Chat widget styles failed to load");
      }
      return fields;
    } catch (error) {
      console.error("[11x Sales chat] could not start", error);
      return null;
    }
  }

  async open() {
    await this.ready;
    if (!this.widget || this.destroyed) return null;
    this.widget.open();
    return this.widget;
  }

  destroy() {
    this.destroyed = true;
    this.controller?.abort();
    this.widget?.destroy();
    if (activeBootstrap === this) activeBootstrap = null;
  }
}

export async function init(options = {}) {
  await domReady();
  activeBootstrap?.destroy();
  activeBootstrap = new ChatWidgetBootstrap(options);
  return activeBootstrap;
}

window.ChatWidgetBootstrap = { version, init };
if (script?.hasAttribute("data-chat-widget-bootstrap")) {
  const { widgetUrl, configUrl, chatApiUrl, socketUrl } = script.dataset;
  init({ widgetUrl, configUrl, chatApiUrl, socketUrl }).catch((error) =>
    console.error("[11x Sales chat] bootstrap failed", error),
  );
}
