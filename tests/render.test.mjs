import test from "node:test";
import assert from "node:assert/strict";
import { escapeHtml } from "../src/render.mjs";

test("user-entered habit names are escaped before HTML rendering", () => {
  const unsafe = '<img src=x onerror="alert(1)"> & test';
  const escaped = escapeHtml(unsafe);
  assert.equal(escaped, "&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; test");
  assert.equal(escaped.includes("<img"), false);
});
