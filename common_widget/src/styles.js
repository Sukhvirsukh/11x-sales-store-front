import css from "./styles/widget.css?inline";

export function mountStyles(root, url) {
  if (!url) {
    const style = document.createElement("style");
    style.textContent = css;
    root.append(style);
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    link.onload = () => resolve(true);
    link.onerror = () => {
      console.error("[11x Sales chat] stylesheet load failed", url);
      resolve(false);
    };
    root.append(link);
  });
}
