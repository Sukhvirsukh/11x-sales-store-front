import {
  DEFAULTS,
  configToSettings,
  contrastColor,
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
  if (window.ChatWidget?.version === version) return Promise.resolve(window.ChatWidget);
  if (corePromise) return corePromise;
  corePromise = new Promise((resolve, reject) => {
    const element = document.createElement("script");
    element.src = url;
    element.async = true;
    element.onload = () => {
      if (window.ChatWidget?.version === version) resolve(window.ChatWidget);
      else reject(new Error("Chat widget bundle version mismatch"));
    };
    element.onerror = () => reject(new Error("Chat widget bundle failed to load"));
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
    this.settings = { ...DEFAULTS, ...options };
    this.fields = isRecord(options.config) ? options.config : null;
    this.widget = null;
    this.destroyed = false;
    this.openPromise = null;
    this.host = document.createElement("x11-sales-chat-bootstrap");
    this.shadowRoot = this.host.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `<style>
      :host{all:initial;display:block}
      button{box-sizing:border-box;position:fixed;right:var(--edge);bottom:var(--bottom);z-index:var(--layer);height:var(--size);min-width:var(--size);border:0;border-radius:999px;background:var(--color);color:var(--contrast);padding:0 16px;display:flex;align-items:center;justify-content:center;gap:9px;box-shadow:0 10px 20px #0002;cursor:pointer;font:14px system-ui,sans-serif}
      button.left{left:var(--edge);right:auto}
      button.bar{background:#fff;color:#334155;border:1px solid #e2e8f0;border-radius:12px;min-width:210px}
      button:focus-visible{outline:2px solid #2563eb;outline-offset:3px}
      button:disabled{cursor:wait;opacity:.7}
      button[hidden]{display:none}
      svg{width:22px;height:22px;flex:none}
    </style><button type="button" aria-label="Open chat" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z"/></svg><span></span></button>`;
    this.button = this.shadowRoot.querySelector("button");
    this.button.addEventListener("click", () => this.open());
    this.button.addEventListener("pointerenter", () => this.preload().catch(() => {}), {
      once: true,
    });
    this.button.addEventListener("focus", () => this.preload().catch(() => {}), {
      once: true,
    });
    this.mediaQuery = window.matchMedia?.("(max-width: 767px)");
    this.onViewportChange = () => {
      this.button.hidden = !visible(this.settings);
    };
    this.mediaQuery?.addEventListener?.("change", this.onViewportChange);
    document.body.append(this.host);
    this.ready = this.loadConfig();
    if (options.autoOpen) this.ready.then(() => this.open());
  }

  async loadConfig() {
    if (!this.fields && this.options.configUrl) {
      this.controller = new AbortController();
      try {
        const response = await fetch(this.options.configUrl, {
          credentials: "omit",
          signal: this.controller.signal,
        });
        if (!response.ok) throw new Error(`Config request failed (${response.status})`);
        this.fields = unwrapConfig(await response.json());
      } catch (error) {
        if (!this.destroyed && error.name !== "AbortError")
          console.error("[11x Sales chat] config load failed", error);
      }
    }
    if (this.destroyed) return null;
    this.settings = {
      ...this.settings,
      ...configToSettings(this.fields),
    };
    this.button.style.setProperty("--edge", `${this.settings.edge}px`);
    this.button.style.setProperty("--bottom", `${this.settings.bottom}px`);
    this.button.style.setProperty("--layer", String(this.settings.zIndex));
    this.button.style.setProperty("--size", `${this.settings.bubbleSize}px`);
    this.button.style.setProperty("--color", this.settings.primaryColor);
    this.button.style.setProperty("--contrast", contrastColor(this.settings.primaryColor));
    this.button.classList.toggle("left", this.settings.position === "left");
    const bar = this.settings.bubbleType !== "compact-bar";
    this.button.classList.toggle("bar", bar);
    this.button.querySelector("span").textContent = bar
      ? this.settings.placeholder
      : "";
    this.button.hidden = !visible(this.settings);
    return this.fields;
  }

  preload() {
    if (!this.widgetUrl || this.destroyed) return Promise.resolve(null);
    return loadCore(this.widgetUrl);
  }

  open() {
    if (this.destroyed) return Promise.resolve(null);
    if (this.openPromise) return this.openPromise;
    this.openPromise = this._open().finally(() => {
      this.openPromise = null;
    });
    return this.openPromise;
  }

  async _open() {
    if (this.widget) {
      this.widget.open();
      return this.widget;
    }
    this.button.disabled = true;
    try {
      await this.ready;
      if (this.destroyed || !visible(this.settings)) return null;
      const core = await this.preload();
      if (!core || this.destroyed) return null;
      this.widget = core.init({
        ...this.options,
        config: this.fields,
        autoOpen: true,
      });
      const [, styled] = await Promise.all([this.widget.ready, this.widget.styleReady]);
      if (!styled) {
        this.widget.destroy();
        this.widget = null;
        throw new Error("Chat widget styles failed to load");
      }
      this.mediaQuery?.removeEventListener?.("change", this.onViewportChange);
      this.host.remove();
      return this.widget;
    } catch (error) {
      console.error("[11x Sales chat] could not open", error);
      return null;
    } finally {
      this.button.disabled = false;
    }
  }

  destroy() {
    this.destroyed = true;
    this.controller?.abort();
    this.mediaQuery?.removeEventListener?.("change", this.onViewportChange);
    this.widget?.destroy();
    this.host.remove();
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
