export function domReady() {
  return document.body
    ? Promise.resolve()
    : new Promise((resolve) =>
        document.addEventListener("DOMContentLoaded", resolve, { once: true }),
      );
}
