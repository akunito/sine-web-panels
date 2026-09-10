import assert from "node:assert/strict";
import { test } from "node:test";
import { createChromeWindow } from "./helpers/chrome-window.mjs";

const PREFS = {
  enabled: "sine.web-panels.enabled",
  collapsed: "sine.web-panels.collapsed",
  width: "sine.web-panels.width",
};

// The controller reads globalThis.Services at import time, and createChromeWindow
// installs it, so the harness has to exist before the module is pulled in.
createChromeWindow();
const { SineWebPanels } = await import("../web-panels.uc.mjs");

// A real KeyboardEvent always carries every modifier as a boolean, and
// shortcutMatches compares them strictly — so a partial event does not just
// fail to match, it fails for the wrong reason.
function keydown(code, modifiers = {}) {
  return {
    code,
    key: "",
    repeat: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...modifiers,
  };
}

function mount(options = {}) {
  const harness = createChromeWindow({
    prefs: { [PREFS.enabled]: true, ...options.prefs },
    viewportWidth: options.viewportWidth,
  });
  const controller = new SineWebPanels(harness.window);
  controller.init();

  return {
    ...harness,
    controller,
    el: id => harness.document.getElementById(`sine-web-panels-${id}`),
    root: () => harness.document.getElementById("sine-web-panels-root"),
  };
}

test("mounting builds the rail and reserves a strip of window for it", () => {
  const app = mount();

  assert.ok(app.el("rail"), "the rail exists");
  assert.ok(app.el("toggle"), "with the collapse toggle on it");
  assert.equal(app.root().getAttribute("side"), "right");
  assert.equal(app.browser.getAttribute("sine-web-panels-side"), "right");
  assert.ok(
    app.browser.style.getPropertyValue("--sine-web-panels-reserved-inline-size"),
    "the content is inset by the rail's width"
  );
  assert.ok(app.appContent.style.has("margin-inline-end"), "on the rail's side");

  app.controller.destroy();
  assert.equal(app.root(), null, "and unloading leaves nothing behind");
});

test("a width stored from a wider window is clamped on the way in", () => {
  // The regression: mount used to apply the stored width raw, so it overflowed
  // until the first resize event happened to move it.
  const app = mount({ prefs: { [PREFS.width]: "2009" }, viewportWidth: 1200 });

  const applied = Number.parseInt(
    app.document.documentElement.style.getPropertyValue("--sine-web-panels-width"),
    10
  );

  assert.ok(applied < 2009, "clamped");
  assert.ok(applied <= 1200, "to the page, not the window");
  assert.equal(
    app.prefs.getStringPref(PREFS.width),
    "2009",
    "but the stored width is left alone — clamping is for display only"
  );
});

test("collapsing hands the reserved strip back and puts the hover edge up", () => {
  const app = mount();
  assert.equal(app.el("edge").hidden, true, "no edge while the rail is docked");

  app.el("toggle").dispatch("click");

  assert.ok(app.root().hasAttribute("collapsed"));
  assert.equal(app.el("edge").hidden, false, "the edge is now the way back");
  assert.equal(
    app.browser.getAttribute("sine-web-panels-side"),
    null,
    "the reserved strip is released"
  );
  assert.equal(app.appContent.style.has("margin-inline-end"), false);

  app.el("toggle").dispatch("click");

  assert.equal(app.root().hasAttribute("collapsed"), false);
  assert.ok(app.browser.style.getPropertyValue("--sine-web-panels-reserved-inline-size"));
});

test("collapsing is remembered for the next window, not broadcast to this one", () => {
  const app = mount();

  app.el("toggle").dispatch("click");
  assert.equal(app.prefs.getBoolPref(PREFS.collapsed), true, "written for next time");

  // What another window's toggle looks like from in here: the pref moves under
  // us. This window must not follow it.
  app.prefs.setBoolPref(PREFS.collapsed, false);
  assert.ok(app.root().hasAttribute("collapsed"), "still collapsed");
});

test("a new window opens the way the rail was last left", () => {
  const app = mount({ prefs: { [PREFS.collapsed]: true } });

  assert.ok(app.root().hasAttribute("collapsed"));
  assert.equal(app.el("edge").hidden, false);
});

test("the edge peeks the rail back in, and lets it go again", () => {
  const app = mount({ prefs: { [PREFS.collapsed]: true } });

  app.el("edge").dispatch("pointerenter");
  assert.ok(app.root().hasAttribute("peeking"));

  app.el("rail").dispatch("pointerleave");
  assert.ok(app.root().hasAttribute("peeking"), "not the instant the pointer leaves");

  app.advance(400);
  assert.equal(app.root().hasAttribute("peeking"), false, "but shortly after");
});

test("the peek is held open while a menu is up, so the rail cannot slide away", () => {
  const app = mount({ prefs: { [PREFS.collapsed]: true } });

  app.el("edge").dispatch("pointerenter");
  app.el("menu").hidden = false;
  app.el("rail").dispatch("pointerleave");

  app.advance(400);
  assert.ok(app.root().hasAttribute("peeking"), "held");

  app.el("menu").hidden = true;
  app.advance(400);
  assert.equal(app.root().hasAttribute("peeking"), false, "released");
});

test("fullscreen takes the rail off the screen and gives its strip back", () => {
  const app = mount();

  app.setRootAttribute("inFullscreen", "true");

  assert.ok(app.root().hasAttribute("fullscreen"));
  assert.equal(app.browser.getAttribute("sine-web-panels-side"), null);
  assert.equal(app.appContent.style.has("margin-inline-end"), false);

  app.setRootAttribute("inFullscreen", null);

  assert.equal(app.root().hasAttribute("fullscreen"), false);
  assert.ok(
    app.browser.style.getPropertyValue("--sine-web-panels-reserved-inline-size"),
    "and puts it back afterwards"
  );
});

test("the rail moves when Zen's sidebar changes side", () => {
  const app = mount();
  assert.equal(app.root().getAttribute("side"), "right");
  assert.ok(app.appContent.style.has("margin-inline-end"));

  app.setRootAttribute("zen-right-side", "true");

  assert.equal(app.root().getAttribute("side"), "left", "opposite Zen's sidebar");
  assert.equal(app.browser.getAttribute("sine-web-panels-side"), "left");
  assert.ok(app.appContent.style.has("margin-inline-start"), "the strip swaps sides");
  assert.equal(app.appContent.style.has("margin-inline-end"), false, "and vacates the old one");
});

test("the configured shortcut toggles the rail", () => {
  const app = mount();

  app.document.dispatch("keydown", keydown("KeyB", { ctrlKey: true, altKey: true }));
  assert.ok(app.root().hasAttribute("collapsed"));

  app.document.dispatch("keydown", keydown("KeyB", { ctrlKey: true, altKey: true }));
  assert.equal(app.root().hasAttribute("collapsed"), false);
});

test("the shortcut is dormant in fullscreen", () => {
  const app = mount();
  app.setRootAttribute("inFullscreen", "true");

  app.document.dispatch("keydown", keydown("KeyB", { ctrlKey: true, altKey: true }));

  assert.equal(
    app.prefs.getBoolPref(PREFS.collapsed, false),
    false,
    "no invisible rail toggling behind a fullscreen video"
  );
});

test("a custom handle colour is applied, and clearing it hands back to the theme", () => {
  const app = mount({ prefs: { "sine.web-panels.resizer-color": "#3b82f6" } });
  const root = app.document.documentElement;

  assert.equal(root.style.getPropertyValue("--sine-web-panels-accent"), "#3b82f6");

  app.prefs.setStringPref("sine.web-panels.resizer-color", "");
  assert.equal(
    root.style.has("--sine-web-panels-accent"),
    false,
    "removed, so the stylesheet's chain wins again"
  );
});

test("a colour that could escape the declaration never reaches the DOM", () => {
  const app = mount();

  app.prefs.setStringPref("sine.web-panels.resizer-color", "red; background: url(x)");

  assert.equal(app.document.documentElement.style.has("--sine-web-panels-accent"), false);
});
