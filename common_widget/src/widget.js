import {
  DEFAULTS,
  definedOnly,
  isRecord,
  isColor,
  isBubbleType,
  withAlpha,
  contrastColor,
  pathIsExcluded,
  pathIsVisible,
  safeProductUrl,
  resolveAssetUrl,
  configToSettings,
  unwrapConfig,
} from "./config.js";
import { el, svg } from "./dom.js";
import { ICONS } from "./icons.js";
import { mountStyles } from "./styles.js";
import { ChatTransport } from "./transport.js";

const MOBILE_QUERY = "(max-width: 767px)";
const PANEL_ID = "x11-sales-panel";
let instanceCount = 0;
let messageCount = 0;

export class ChatWidget {
  constructor(options) {
    this.settings = Object.assign({}, DEFAULTS, definedOnly(options));
    this.settings.chatFaceUrl = resolveAssetUrl(
      this.settings.chatFaceUrl,
      this.settings.configUrl,
    );
    this.fields = null;
    this.opened = false;
    this.status = "idle";
    this.messages = [];
    this.ready = null;
    this.panelId = PANEL_ID + "-" + ++instanceCount;
    this._destroyed = false;
    this.transport = new ChatTransport(this, this.settings);
    if (!this.settings.onSend && this.settings.chatApiUrl)
      this.settings.onSend = (message) => this.transport.send(message);
    this._build();
    this._applySettings();
    this._renderCommit();
    this.loadConfig();
    this._greeting = this.addMessage(this.settings.greeting, "bot");
    if (this.settings.autoOpen) this.open();
  }

  _build() {
    this.host = document.createElement("x11-sales-chat");
    this.host.style.display = "none";
    this.shadowRoot = this.host.attachShadow({ mode: "open" });
    this.styleReady = mountStyles(this.shadowRoot, this.settings.styleUrl).then(
      (loaded) => {
        if (loaded && !this._destroyed)
          this.host.style.removeProperty("display");
        return loaded;
      },
    );

    this.root = el("div", "x11-sales-root x11-sales-root--right");

    // --- Launcher (content depends on the bubble type) ---
    this.launcher = el("button", "x11-sales-launcher", {
      type: "button",
      "aria-label": "Open chat",
      "aria-expanded": "false",
      "aria-controls": this.panelId,
    });
    this.launcher.addEventListener("click", () => {
      this.toggle();
    });

    // --- Panel ---
    this.panel = el("section", "x11-sales-panel", {
      id: this.panelId,
      role: "dialog",
      "aria-label": this.settings.title,
      "aria-hidden": "true",
    });
    this.panel.hidden = true;

    // Header: avatar (optional) + agent name + Active badge + close
    const header = el("header", "x11-sales-header");
    const headerMain = el("div", "x11-sales-header__main");

    this.avatarEl = el("img", "x11-sales-header__avatar", {
      alt: "",
      "aria-hidden": "true",
    });
    this.avatarEl.hidden = true;

    const nameGroup = el("div", "x11-sales-header__name");
    this.titleEl = el("p", "x11-sales-header__title");
    const badge = el("span", "x11-sales-header__badge");
    badge.appendChild(document.createTextNode("Active"));
    badge.appendChild(el("span", "x11-sales-header__badge-dot"));
    nameGroup.appendChild(this.titleEl);
    nameGroup.appendChild(badge);

    headerMain.appendChild(this.avatarEl);
    headerMain.appendChild(nameGroup);

    this.closeBtn = el("button", "x11-sales-header__close", {
      type: "button",
      "aria-label": "Close chat",
    });
    this.closeBtn.appendChild(svg(ICONS.close));
    this.closeBtn.addEventListener("click", () => {
      this.close();
    });

    header.appendChild(headerMain);
    header.appendChild(this.closeBtn);

    // Messages
    this.messagesEl = el("div", "x11-sales-messages", {
      role: "log",
      "aria-live": "polite",
      "aria-relevant": "additions text",
    });

    // Quick replies
    this.quickRepliesEl = el("div", "x11-sales-quick-replies");
    this.chipsEl = el("div", "x11-sales-chips");
    this.quickRepliesEl.appendChild(this.chipsEl);

    // Composer: 42px field with attach + send
    const composer = el("form", "x11-sales-composer");
    const shell = el("div", "x11-sales-input-shell");
    this.input = el("input", "x11-sales-input", {
      type: "text",
      "aria-label": "Message",
      autocomplete: "off",
      maxlength: "1000",
    });
    this.input.addEventListener("input", () => {
      this.sendBtn.disabled =
        this.status === "loading" || !this.input.value.trim();
    });
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        this._submitInput();
      }
    });

    this.attachBtn = el("button", "x11-sales-attach", {
      type: "button",
      "aria-label": "Attach image",
    });
    this.attachBtn.appendChild(svg(ICONS.image));
    this.fileInput = el("input", "x11-sales-file", {
      type: "file",
      accept: "image/*",
      multiple: "multiple",
    });
    this.fileInput.hidden = true;
    this.fileInput.addEventListener("change", (event) => {
      const files = Array.prototype.slice.call(event.target.files || []);
      if (files.length && typeof this.settings.onImageUpload === "function") {
        this.settings.onImageUpload(files, this);
      }
      event.target.value = "";
    });
    this.attachBtn.addEventListener("click", () => {
      this.fileInput.click();
    });

    this.sendBtn = el("button", "x11-sales-send", {
      type: "submit",
      "aria-label": "Send message",
    });
    this.sendBtn.appendChild(svg(ICONS.arrowUp));
    this.sendBtn.disabled = true;

    const actions = el("div", "x11-sales-input-actions");
    actions.appendChild(this.attachBtn);
    actions.appendChild(this.sendBtn);

    shell.appendChild(this.input);
    shell.appendChild(actions);
    composer.appendChild(shell);
    composer.appendChild(this.fileInput);
    composer.addEventListener("submit", (event) => {
      event.preventDefault();
      this._submitInput();
    });

    this.disclaimerEl = el("p", "x11-sales-disclaimer");
    this.disclaimerEl.hidden = true;
    this.statusEl = el("p", "x11-sales-status", {
      role: "status",
      "aria-live": "polite",
    });
    this.statusEl.hidden = true;

    this.panel.appendChild(header);
    this.panel.appendChild(this.messagesEl);
    this.panel.appendChild(this.quickRepliesEl);
    this.panel.appendChild(composer);
    this.panel.appendChild(this.statusEl);
    this.panel.appendChild(this.disclaimerEl);

    this.root.appendChild(this.panel);
    this.root.appendChild(this.launcher);

    this._onKeydown = (event) => {
      if (event.key === "Escape" && this.opened) this.close();
    };
    document.addEventListener("keydown", this._onKeydown);

    this._mediaQuery = window.matchMedia
      ? window.matchMedia(MOBILE_QUERY)
      : null;
    this._onViewportChange = () => {
      this._applyVisibility();
      this._applyViewport();
    };
    if (this._mediaQuery) {
      if (this._mediaQuery.addEventListener)
        this._mediaQuery.addEventListener("change", this._onViewportChange);
      else if (this._mediaQuery.addListener)
        this._mediaQuery.addListener(this._onViewportChange);
    }

    this._visualViewport = window.visualViewport || null;
    this._onVisualViewportChange = () => {
      this._applyViewport();
    };
    if (this._visualViewport) {
      this._visualViewport.addEventListener(
        "resize",
        this._onVisualViewportChange,
      );
      this._visualViewport.addEventListener(
        "scroll",
        this._onVisualViewportChange,
      );
    }

    this.shadowRoot.appendChild(this.root);
    document.body.appendChild(this.host);
    this._applyViewport();
  }

  /** Write the config-driven values onto the root as CSS variables. */
  _applySettings() {
    const settings = this.settings;
    const style = this.root.style;

    style.setProperty("--x11-sales-color-primary", settings.primaryColor);
    style.setProperty(
      "--x11-sales-color-primary-contrast",
      contrastColor(settings.primaryColor),
    );
    style.setProperty(
      "--x11-sales-color-primary-tint",
      withAlpha(settings.primaryColor, "22"),
    );
    style.setProperty(
      "--x11-sales-color-notification",
      settings.notificationColor,
    );
    style.setProperty("--x11-sales-size", settings.bubbleSize + "px");
    style.setProperty("--x11-sales-offset-x", settings.edge + "px");
    style.setProperty("--x11-sales-offset-y", settings.bottom + "px");
    style.setProperty("--x11-sales-z", String(settings.zIndex));

    this.root.classList.toggle(
      "x11-sales-root--left",
      settings.position === "left",
    );
    this.root.classList.toggle(
      "x11-sales-root--right",
      settings.position !== "left",
    );
  }

  /** Re-render everything that depends on config values. */
  _renderCommit() {
    const settings = this.settings;

    this.panel.setAttribute("aria-label", settings.title);
    this.titleEl.textContent = settings.title;
    this.input.placeholder = settings.placeholder;

    if (settings.chatFaceUrl) {
      this.avatarEl.src = settings.chatFaceUrl;
      this.avatarEl.hidden = false;
    } else {
      this.avatarEl.removeAttribute("src");
      this.avatarEl.hidden = true;
    }

    this._renderLauncher();
    this._renderQuickReplies();
    this.setStatus(this.status);

    this.disclaimerEl.textContent = settings.disclaimer || "";
    this.disclaimerEl.hidden = !settings.disclaimer;

    this._syncGreeting();
  }

  /** Mirror ChatBox's effect: a late-arriving welcome message replaces the greeting. */
  _syncGreeting() {
    const greeting = this._greeting;
    if (!greeting || !greeting._textEl) return;
    const conversationStarted = this.messages.some((message) => {
      return message.role === "user";
    });
    if (conversationStarted) return;
    greeting.text = this.settings.greeting;
    greeting._textEl.textContent = this.settings.greeting;
  }

  _renderLauncher() {
    const settings = this.settings;
    const variant = isBubbleType(settings.bubbleType)
      ? settings.bubbleType
      : "compact-bar";
    const launcher = this.launcher;

    while (launcher.firstChild) launcher.removeChild(launcher.firstChild);
    launcher.className = "x11-sales-launcher x11-sales-launcher--" + variant;

    if (variant === "compact-bar") {
      launcher.appendChild(svg(ICONS.chat));
    } else {
      const dot = el("span", "x11-sales-launcher__dot");
      const label = el("span", "x11-sales-launcher__label");
      label.textContent = settings.placeholder || "";
      const send = el("span", "x11-sales-launcher__send");
      send.appendChild(svg(ICONS.arrowUp));
      launcher.appendChild(dot);
      launcher.appendChild(label);
      launcher.appendChild(send);
    }

    if (!this.opened && isColor(settings.notificationColor)) {
      launcher.appendChild(el("span", "x11-sales-launcher__badge"));
    }
  }

  _renderQuickReplies() {
    const messages = this.settings.predefinedMessages || [];

    while (this.chipsEl.firstChild)
      this.chipsEl.removeChild(this.chipsEl.firstChild);
    this.quickRepliesEl.hidden = messages.length === 0;

    messages.forEach((text) => {
      const chip = el("button", "x11-sales-chip", {
        type: "button",
        title: text,
      });
      chip.textContent = text;
      chip.addEventListener("click", () => {
        this._send(text);
      });
      this.chipsEl.appendChild(chip);
    });
  }

  _isMobile() {
    return this._mediaQuery ? this._mediaQuery.matches : false;
  }

  /** Keep the fixed widget inside the visible viewport when a mobile keyboard opens. */
  _applyViewport() {
    if (!this._visualViewport) return;
    const viewport = this._visualViewport;
    const keyboardInset = this._isMobile()
      ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      : 0;
    this.root.style.setProperty(
      "--x11-sales-keyboard-inset",
      keyboardInset + "px",
    );
    this.root.style.setProperty(
      "--x11-sales-viewport-height",
      viewport.height + "px",
    );
  }

  /** Hide the launcher based on show-on-mobile/desktop and the page exclusion list. */
  _applyVisibility() {
    const settings = this.settings;
    const pathname = window.location ? window.location.pathname : "/";
    const excluded = pathIsExcluded(settings.excludePages, pathname);
    const pageAllowed = pathIsVisible(settings, pathname);
    const allowedOnViewport = this._isMobile()
      ? settings.showOnMobile
      : settings.showOnDesktopTablet;
    this.root.hidden = excluded || !pageAllowed || !allowedOnViewport;
  }

  /** Render one product row, matching ProductRecommendation.tsx. */
  _renderProduct(product) {
    const row = el("div", "x11-sales-product");
    if (product.imageUrl) {
      const img = el("img", "x11-sales-product__media", {
        alt: "",
        "aria-hidden": "true",
        src: product.imageUrl,
      });
      row.appendChild(img);
    } else {
      const placeholder = el("span", "x11-sales-product__placeholder", {
        "aria-hidden": "true",
      });
      placeholder.appendChild(svg(ICONS.shoppingBag));
      row.appendChild(placeholder);
    }

    const meta = el("span", "x11-sales-product__meta");
    const title = el("span", "x11-sales-product__title");
    title.textContent =
      product.title + (product.code ? " (Code: " + product.code + ")" : "");
    const price = el("span", "x11-sales-product__price");
    price.textContent = String(product.price == null ? "" : product.price);
    meta.appendChild(title);
    meta.appendChild(price);
    row.appendChild(meta);

    const url = safeProductUrl(product.productUrl);
    if (!url) return row;

    const link = el("a", "x11-sales-product", {
      href: url,
      target: "_blank",
      rel: "noopener noreferrer",
    });
    while (row.firstChild) link.appendChild(row.firstChild);
    return link;
  }

  _renderMessage(message) {
    const isUser = message.role === "user";
    const products = message.products || [];

    const row = el(
      "div",
      "x11-sales-message x11-sales-message--" + (isUser ? "user" : "bot"),
    );
    if (products.length) row.className += " x11-sales-message--product";

    const body = el("div", "x11-sales-message__body");
    const bubble = el("div", "x11-sales-bubble");

    if (message.text) {
      const text = el("p", "x11-sales-bubble__text");
      text.textContent = message.text; // text node — never parsed as HTML
      message._textEl = text;
      bubble.appendChild(text);
    }

    if (products.length) {
      const list = el(
        "div",
        "x11-sales-products" +
          (message.text ? " x11-sales-products--with-text" : ""),
        {
          "aria-label": "Product recommendations",
        },
      );
      products.forEach((product) => {
        list.appendChild(this._renderProduct(product));
      });
      bubble.appendChild(list);
    }

    body.appendChild(bubble);

    // Bot feedback row — thumbs only (no "Create correction")
    if (!isUser) {
      const feedback = el("div", "x11-sales-feedback");
      for (const [label, icon, callback] of [
        ["Good response", ICONS.thumbsUp, "onLike"],
        ["Bad response", ICONS.thumbsDown, "onDislike"],
      ]) {
        const button = el("button", "x11-sales-feedback__btn", {
          type: "button",
          "aria-label": label,
        });
        button.append(svg(icon));
        button.addEventListener("click", () => {
          if (typeof this.settings[callback] === "function")
            this.settings[callback](message.id, this);
        });
        feedback.append(button);
      }
      body.appendChild(feedback);
    }

    row.appendChild(body);
    this.messagesEl.appendChild(row);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  /**
   * Append a message.
   * @param {string} text
   * @param {"bot"|"user"} role
   * @param {{ products?: Array<object> }} [options]
   */
  addMessage(text, role, options) {
    const message = {
      id: "x11-sales-msg-" + ++messageCount,
      text: String(text == null ? "" : text),
      role: role === "user" ? "user" : "bot",
      products: (options && Array.isArray(options.products)
        ? options.products
        : []
      ).slice(),
    };
    this.messages.push(message);
    this._renderMessage(message);
    return message;
  }

  /** Read, clear and send the current input value. */
  _submitInput() {
    if (this.status === "loading") return;
    const value = this.input.value;
    this.input.value = "";
    this.sendBtn.disabled = true;
    this._send(value);
  }

  _send(rawText) {
    if (this.status === "loading") return;
    const text = String(rawText == null ? "" : rawText).trim();
    if (!text) return;
    if (this.status === "error") this.setStatus("idle");
    this.addMessage(text, "user");

    if (typeof this.settings.onSend === "function") {
      try {
        const result = this.settings.onSend(text, this);
        if (result && typeof result.then === "function") {
          this.setStatus("loading");
          Promise.resolve(result).then(
            () => {
              if (!this._destroyed) this.setStatus("idle");
            },
            (error) => {
              if (window.console && console.error)
                console.error("[11x Sales chat] onSend failed", error);
              if (!this._destroyed) this.setStatus("error");
            },
          );
        }
        return;
      } catch (error) {
        if (window.console && console.error)
          console.error("[11x Sales chat] onSend failed", error);
        this.setStatus("error");
        return;
      }
    }

    this.addMessage(this.settings.defaultReply, "bot");
  }

  /** Set a visible, accessible sending or error state for custom integrations. */
  setStatus(status, message) {
    if (status !== "loading" && status !== "error") status = "idle";
    this.status = status;
    this.root.classList.toggle("x11-sales-root--loading", status === "loading");
    this.root.classList.toggle("x11-sales-root--error", status === "error");
    this.panel.setAttribute(
      "aria-busy",
      status === "loading" ? "true" : "false",
    );
    this.statusEl.classList.toggle(
      "x11-sales-status--error",
      status === "error",
    );
    this.statusEl.setAttribute("role", status === "error" ? "alert" : "status");
    this.statusEl.textContent =
      status === "idle"
        ? ""
        : String(
            message ||
              (status === "loading"
                ? "Sending message…"
                : "Message could not be sent. Please send it again."),
          );
    this.statusEl.hidden = status === "idle";
    if (status === "error") this.input.setAttribute("aria-invalid", "true");
    else this.input.removeAttribute("aria-invalid");
    this.sendBtn.disabled = status === "loading" || !this.input.value.trim();
    this.attachBtn.disabled = status === "loading";
    Array.prototype.forEach.call(
      this.chipsEl.querySelectorAll("button"),
      (button) => {
        button.disabled = status === "loading";
      },
    );
    return this;
  }

  open() {
    if (this.opened) return;
    this.transport.connect();
    this.opened = true;
    this.panel.hidden = false;
    this.root.classList.add("x11-sales-root--open");
    this.launcher.setAttribute("aria-expanded", "true");
    this.launcher.setAttribute("aria-label", "Close chat");
    this.panel.setAttribute("aria-hidden", "false");
    // Once opened, the unread dot has done its job.
    const badge = this.launcher.querySelector(".x11-sales-launcher__badge");
    if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
    this.input.focus();
  }

  close() {
    if (!this.opened) return;
    this.transport.disconnect();
    this.opened = false;
    this.root.classList.remove("x11-sales-root--open");
    this.launcher.setAttribute("aria-expanded", "false");
    this.launcher.setAttribute("aria-label", "Open chat");
    this.panel.setAttribute("aria-hidden", "true");
    this.launcher.focus();

    this.panel.classList.add("x11-sales-panel--closing");
    this._closeTimer = window.setTimeout(() => {
      this.panel.classList.remove("x11-sales-panel--closing");
      if (!this.opened) this.panel.hidden = true;
    }, 180);
  }

  toggle() {
    this.opened ? this.close() : this.open();
  }

  /** Apply a chat-design document, re-styling the widget in place. */
  setFields(fields) {
    if (!isRecord(fields)) return this;
    this.fields = fields;
    this.settings = Object.assign({}, this.settings, configToSettings(fields));
    this.settings.chatFaceUrl = resolveAssetUrl(
      this.settings.chatFaceUrl,
      this.settings.configUrl,
    );
    this._applySettings();
    this._renderCommit();
    this._applyVisibility();
    return this;
  }

  /** Fetch the chat-design document (if a configUrl is configured) and apply it. */
  loadConfig() {
    if (isRecord(this.settings.config)) {
      this.setFields(this.settings.config);
      this.ready = Promise.resolve(this.fields);
      return this.ready;
    }

    if (!this.settings.configUrl || typeof window.fetch !== "function") {
      this._applyVisibility();
      this.ready = Promise.resolve(null);
      return this.ready;
    }

    this.ready = window
      .fetch(this.settings.configUrl, {
        method: "GET",
        headers: this.settings.configHeaders || {},
        credentials: "omit",
      })
      .then((response) => {
        if (!response.ok)
          throw new Error(
            "chatWidget config request failed (" + response.status + ")",
          );
        return response.json();
      })
      .then((payload) => {
        if (!this._destroyed) this.setFields(unwrapConfig(payload));
        return this.fields;
      })
      .catch((error) => {
        if (window.console && console.error)
          console.error("[11x Sales chat] config load failed", error);
        if (!this._destroyed) this._applyVisibility();
        return null;
      });

    return this.ready;
  }

  destroy() {
    this._destroyed = true;
    this.transport.destroy();
    if (this._closeTimer) window.clearTimeout(this._closeTimer);
    if (this._onKeydown)
      document.removeEventListener("keydown", this._onKeydown);
    if (this._mediaQuery && this._onViewportChange) {
      if (this._mediaQuery.removeEventListener)
        this._mediaQuery.removeEventListener("change", this._onViewportChange);
      else if (this._mediaQuery.removeListener)
        this._mediaQuery.removeListener(this._onViewportChange);
    }
    if (this._visualViewport) {
      this._visualViewport.removeEventListener(
        "resize",
        this._onVisualViewportChange,
      );
      this._visualViewport.removeEventListener(
        "scroll",
        this._onVisualViewportChange,
      );
    }
    if (this.host.parentNode) this.host.parentNode.removeChild(this.host);
  }
}
