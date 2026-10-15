import test from "node:test";
import assert from "node:assert/strict";
import {
  configToSettings,
  contrastColor,
  pathIsExcluded,
  pathIsVisible,
  safeProductUrl,
  unwrapConfig,
} from "../src/config.js";

test("API configuration maps valid fields and ignores malformed values", () => {
  assert.deepEqual(configToSettings(null), {});
  assert.deepEqual(
    configToSettings({
      aiAgentName: "  Shop  ",
      primaryColor: "#abc",
      notificationColor: "invalid",
      bubbleSize: 999,
      showOnMobile: false,
    }),
    {
      title: "Shop",
      primaryColor: "#abc",
      bubbleSize: 120,
      showOnMobile: false,
    },
  );
  assert.deepEqual(unwrapConfig({ data: { primaryColor: "#123456" } }), {
    primaryColor: "#123456",
  });
});

test("contrast follows the supplied merchant color", () => {
  assert.equal(contrastColor("#fff"), "#000000");
  assert.equal(contrastColor("#16181D"), "#ffffff");
});

test("page exclusions match paths and wildcards without treating dots as regex", () => {
  assert.equal(pathIsExcluded("/checkout", "/checkout/payment"), true);
  assert.equal(pathIsExcluded("/checkout", "/checkout-other"), false);
  assert.equal(pathIsExcluded("/products/*", "/products/shoe"), true);
  assert.equal(pathIsExcluded("/a.b", "/axb"), false);
});

test("pageVisibility maps all, product and specific pages", () => {
  assert.equal(configToSettings({ pageVisibility: "all" }).pageVisibility, "all");
  assert.equal(configToSettings({ pageVisibility: "bogus" }).pageVisibility, undefined);
  const product = configToSettings({ pageVisibility: "product" });
  assert.equal(pathIsVisible(product, "/products/shoe"), true);
  assert.equal(pathIsVisible(product, "/"), false);
  const specific = configToSettings({
    pageVisibility: "specific",
    includePages: "/contact\n/faq/*",
  });
  assert.equal(pathIsVisible(specific, "/contact"), true);
  assert.equal(pathIsVisible(specific, "/faq/returns"), true);
  assert.equal(pathIsVisible(specific, "/products/shoe"), false);
  assert.equal(pathIsVisible({ pageVisibility: "all" }, "/anything"), true);
});

test("product links reject executable and protocol-relative URLs", () => {
  assert.equal(safeProductUrl("javascript:alert(1)"), null);
  assert.equal(safeProductUrl("//example.com"), null);
  assert.equal(safeProductUrl("/products/shoe"), "/products/shoe");
  assert.equal(
    safeProductUrl("https://example.com/shoe"),
    "https://example.com/shoe",
  );
});
