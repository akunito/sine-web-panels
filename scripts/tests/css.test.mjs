import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const css = readFileSync(
  join(dirname(dirname(fileURLToPath(import.meta.url))), "web-panels.css"),
  "utf8"
);

// Anchored at the start of a line, so a selector that also appears as the tail
// of a compound rule elsewhere (`:root[inFullscreen] #sine-web-panels-resizer`)
// cannot be mistaken for the standalone one.
function rule(selector) {
  const needle = `${selector} {`;
  const start = css.startsWith(needle) ? 0 : css.indexOf(`\n${needle}`) + 1;
  assert.ok(start > 0 || css.startsWith(needle), `missing rule: ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}

// The regression: the handle was pointer-events: none, so :hover could never
// fire. Both sides of it are remote content, and chrome sees no pointer moves
// over that, so the JS hover state alone left the affordance invisible.
test("the resize handle stays hit-testable", () => {
  const resizer = rule("#sine-web-panels-resizer");

  assert.match(resizer, /pointer-events:\s*auto/);
  assert.doesNotMatch(resizer, /pointer-events:\s*none/);
  assert.match(resizer, /cursor:\s*ew-resize/, "the cursor is half the affordance");
});

test("the resize indicator spans the panel edge rather than a stub of it", () => {
  const indicator = rule("#sine-web-panels-resizer::before");

  assert.match(indicator, /inset-block:\s*0/);
  assert.doesNotMatch(indicator, /height:\s*\d+px/, "no fixed height");
});

test("the resize indicator follows a theme colour, not a hard-coded one", () => {
  const indicator = rule("#sine-web-panels-resizer::before");

  assert.match(indicator, /background:\s*var\(--sine-web-panels-accent\)/);
});

// A var() chain that resolves to nothing paints nothing, which is exactly the
// failure being fixed — so the last link must be a colour that always exists.
test("the accent chain ends in a colour that cannot fail to resolve", () => {
  const root = rule(":root");

  assert.match(root, /--sine-web-panels-accent:/);
  assert.match(root, /--zen-primary-color/, "prefers Zen's own theme colour");
  assert.match(root, /AccentColor\s*\)/, "falls back to the system accent");
});

// --------------------------------------------------------------------------
// Navigation controls: Tom's condition for merging was that the gradient
// header over the panel's content goes. His decision (2026-09-09): a few
// floating controls beside the panel, always there, nothing appearing and
// disappearing.
// --------------------------------------------------------------------------

test("the navigation controls float beside the panel, not over it", () => {
  const nav = rule(".sine-web-panels-nav");

  assert.doesNotMatch(nav, /gradient/, "no gradient");
  assert.doesNotMatch(nav, /opacity:\s*0\b/, "not hidden until hovered");
  assert.doesNotMatch(nav, /inset-inline:\s*0/, "does not span the panel's width");
  assert.match(nav, /flex-direction:\s*column/, "a vertical stack");
  assert.match(nav, /background:\s*var\(--zen-themed-toolbar-bg/, "opaque, themed");

  const right = rule(':root[sine-web-panels-side="right"] .sine-web-panels-nav');
  const left = rule(':root[sine-web-panels-side="left"] .sine-web-panels-nav');
  assert.match(right, /inset-inline-end:\s*calc\(100%/, "outside the panel's edge on the right");
  assert.match(left, /inset-inline-start:\s*calc\(100%/, "and on the left");
  assert.match(right, /--sine-web-panels-resizer-width/, "clear of the resize handle");
});

test("the navigation controls do not come and go with the pointer", () => {
  assert.doesNotMatch(css, /:hover\s*>\s*\.sine-web-panels-nav/);
});

test("the navigation controls leave when a panel's video goes fullscreen", () => {
  const fullscreen = rule(":root[sine-web-panels-panel-fullscreen] .sine-web-panels-nav");
  assert.match(fullscreen, /display:\s*none/);
});
