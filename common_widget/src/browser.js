import widget from "./index.js";
import { domReady } from "./ready.js";

const script = document.currentScript;
window.ChatWidget = widget;
if (script?.hasAttribute("data-chat-widget")) {
  // Each platform supplies its own chat design URL through the script tag.
  const { configUrl } = script.dataset;
  domReady().then(() => widget.init({ configUrl }));
}
