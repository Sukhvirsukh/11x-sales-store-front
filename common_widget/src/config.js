const BUBBLE_TYPES = {
  "type-bar": 1,
  "compact-bar": 1,
  "classic-bar": 1,
  custom: 1,
};
const COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const DEFAULTS = {
  // ---- Behaviour ----
  autoOpen: false,
  onSend: null, // onSend(message, widget)
  onImageUpload: null, // onImageUpload(files, widget)
  onLike: null, // onLike(messageId, widget)
  onDislike: null, // onDislike(messageId, widget)
  defaultReply: "Thanks for your message! How else can I help?",

  // ---- Config source ----
  config: null, // pass fields directly instead of fetching
  configUrl: null, // e.g. "/mocks/chat-design.json"
  configHeaders: null,
  chatApiUrl: null, // public endpoint for sending messages
  socketUrl: null, // optional native WebSocket endpoint for replies
  styleUrl: null, // optional external stylesheet; otherwise use bundled CSS

  // ---- Appearance (overridden by the chat-design fields) ----
  title: "Chat with us",
  greeting: "Hi! How can I help you today?",
  placeholder: "Type your message\u2026",
  disclaimer: "",
  predefinedMessages: [],
  chatFaceUrl: null,
  primaryColor: "#2f6df3",
  notificationColor: "#ff4d4f",
  bubbleType: "compact-bar",
  bubbleSize: 56,
  position: "right", // "right" | "left"
  edge: 20, // moveLeftRight (px)
  bottom: 20, // moveUpDown (px)
  zIndex: 2147483000,
  showOnMobile: true,
  showOnDesktopTablet: true,
  excludePages: "", // comma/newline separated paths; "*" allowed
  pageVisibility: "all", // "all" | "product" | "specific" (uses includePages)
  includePages: "", // used when pageVisibility is "specific"
};
function definedOnly(options) {
  let clean = {};
  Object.keys(options || {}).forEach(function (key) {
    if (options[key] !== undefined) clean[key] = options[key];
  });
  return clean;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isColor(value) {
  return typeof value === "string" && COLOR_PATTERN.test(value.trim());
}

function isBubbleType(value) {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(BUBBLE_TYPES, value)
  );
}

function expandHex(color) {
  let hex = color.trim().replace("#", "");
  if (hex.length === 3) {
    hex =
      hex.charAt(0) +
      hex.charAt(0) +
      hex.charAt(1) +
      hex.charAt(1) +
      hex.charAt(2) +
      hex.charAt(2);
  }
  return hex;
}

/** `primaryColor + "22"` as the in-app header does, but valid for 3-digit hex too. */
function withAlpha(color, alphaHex) {
  if (!isColor(color)) return "rgba(47, 109, 243, 0.13)";
  return "#" + expandHex(color) + alphaHex;
}

function toRgb(color) {
  let hex = expandHex(color);
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

/** Pick black or white text for a given background so labels stay readable. */
function contrastColor(color) {
  if (!isColor(color)) return "#ffffff";
  let rgb = toRgb(color);
  let channel = function (value) {
    let c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  let luminance =
    0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  return luminance > 0.179 ? "#000000" : "#ffffff";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pathMatchesList(list, pathname) {
  if (!list) return false;
  let path = pathname || "/";
  return list
    .split(/[\n,]+/)
    .map(function (entry) {
      return entry.trim();
    })
    .filter(Boolean)
    .some(function (pattern) {
      if (pattern.indexOf("*") !== -1) {
        let source =
          "^" + pattern.split("*").map(escapeRegExp).join(".*") + "$";
        return new RegExp(source).test(path);
      }
      return path === pattern || path.indexOf(pattern + "/") === 0;
    });
}

/** True when the chat is hidden on this path (excludePages). */
function pathIsExcluded(excludePages, pathname) {
  return pathMatchesList(excludePages, pathname);
}

/**
 * True when pageVisibility allows the chat on this path.
 * "all" shows everywhere, "product" only on /products/*, and "specific" only on
 * the includePages list.
 */
function pathIsVisible(settings, pathname) {
  const path = pathname || "/";
  if (settings.pageVisibility === "product")
    return pathMatchesList("/products/*", path);
  if (settings.pageVisibility === "specific")
    return pathMatchesList(settings.includePages, path);
  return true;
}

/** Same rule as ProductRecommendation.tsx: relative paths or http(s) only. */
function safeProductUrl(value) {
  if (typeof value !== "string" || !value) return null;
  if (value.charAt(0) === "/" && value.charAt(1) !== "/") return value;
  if (typeof URL !== "function") return null;
  try {
    let url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : null;
  } catch (error) {
    return null;
  }
}

/** Resolve the chat face against the configuration URL and keep only http(s) URLs. */
function resolveAssetUrl(value, base) {
  if (typeof value !== "string" || !value.trim()) return null;
  if (typeof URL !== "function") return null;
  try {
    // A relative base (e.g. "/mocks/chat-design.json") needs the page URL to resolve.
    let absoluteBase =
      base && typeof document !== "undefined"
        ? new URL(base, document.baseURI).href
        : undefined;
    let url = new URL(value.trim(), absoluteBase);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch (error) {
    return null;
  }
}

/**
 * Turn the `/chat-design` fields into widget settings.
 * Unknown or malformed values are ignored so a bad payload can't break the widget.
 */
function configToSettings(fields) {
  const settings = {};
  if (!isRecord(fields)) return settings;

  const textFields = {
    aiAgentName: "title",
    welcomeMessage: "greeting",
    placeholderMessage: "placeholder",
    chatFace: "chatFaceUrl",
  };
  for (const [field, setting] of Object.entries(textFields)) {
    if (typeof fields[field] === "string" && fields[field].trim())
      settings[setting] = fields[field].trim();
  }
  if (typeof fields.disclaimerMessage === "string")
    settings.disclaimer = fields.disclaimerMessage;
  if (Array.isArray(fields.predefinedMessages)) {
    settings.predefinedMessages = fields.predefinedMessages.filter(
      function (item) {
        return typeof item === "string" && item.trim();
      },
    );
  }
  for (const field of ["primaryColor", "notificationColor"]) {
    if (isColor(fields[field])) settings[field] = fields[field].trim();
  }
  if (isBubbleType(fields.chatBubbleType))
    settings.bubbleType = fields.chatBubbleType;
  if (typeof fields.showOnMobile === "boolean")
    settings.showOnMobile = fields.showOnMobile;
  if (typeof fields.showOnDesktopTablet === "boolean")
    settings.showOnDesktopTablet = fields.showOnDesktopTablet;
  if (typeof fields.excludePages === "string")
    settings.excludePages = fields.excludePages;
  if (typeof fields.includePages === "string")
    settings.includePages = fields.includePages;
  if (
    fields.pageVisibility === "all" ||
    fields.pageVisibility === "product" ||
    fields.pageVisibility === "specific"
  )
    settings.pageVisibility = fields.pageVisibility;
  if (fields.position === "left" || fields.position === "right")
    settings.position = fields.position;

  let size = parseInt(fields.bubbleSize, 10);
  if (isFinite(size) && size > 0) settings.bubbleSize = clamp(size, 24, 120);

  let edge = Number(fields.moveLeftRight);
  if (isFinite(edge) && edge >= 0) settings.edge = clamp(edge, 0, 200);

  let bottom = Number(fields.moveUpDown);
  if (isFinite(bottom) && bottom >= 0) settings.bottom = clamp(bottom, 0, 200);

  let z = parseInt(fields.zIndex, 10);
  if (isFinite(z) && z > 0) settings.zIndex = clamp(z, 1, 9999);

  return settings;
}

/** Accepts either the wrapped `{ data: fields }` response or the raw fields object. */
function unwrapConfig(payload) {
  if (isRecord(payload) && isRecord(payload.data)) return payload.data;
  return payload;
}

export {
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
};
