import { ChatWidget } from "./widget.js";
import { configToSettings, contrastColor } from "./config.js";

let instance;
export function init(options) {
  instance?.destroy();
  instance = new ChatWidget(options);
  return instance;
}
export { ChatWidget, configToSettings, contrastColor };
export default {
  version: __WIDGET_VERSION__,
  init,
  ChatWidget,
  configToSettings,
  contrastColor,
};
