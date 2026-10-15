function el(tag, className, attrs) {
  let node = document.createElement(tag);
  if (className) node.className = className;
  if (attrs) {
    Object.keys(attrs).forEach(function (key) {
      if (attrs[key] != null) node.setAttribute(key, attrs[key]);
    });
  }
  return node;
}

let SVG_NS = "http://www.w3.org/2000/svg";

function svg(children, viewBox) {
  let node = document.createElementNS(SVG_NS, "svg");
  node.setAttribute("viewBox", viewBox || "0 0 24 24");
  node.setAttribute("aria-hidden", "true");
  node.setAttribute("focusable", "false");
  node.setAttribute("fill", "none");
  node.setAttribute("stroke", "currentColor");
  node.setAttribute("stroke-width", "2");
  node.setAttribute("stroke-linecap", "round");
  node.setAttribute("stroke-linejoin", "round");
  children.forEach(function (child) {
    let part = document.createElementNS(SVG_NS, child.tag);
    Object.keys(child.attrs).forEach(function (key) {
      part.setAttribute(key, child.attrs[key]);
    });
    node.appendChild(part);
  });
  return node;
}

export { el, svg };
