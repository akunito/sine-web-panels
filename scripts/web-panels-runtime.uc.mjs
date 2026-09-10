export class WebPanelsRuntime {
  #window;
  #panels = new Map();

  constructor(windowRef) {
    this.#window = windowRef;
  }

  get(id) {
    return this.#panels.get(id) ?? null;
  }

  getBrowser(itemOrId) {
    const id = typeof itemOrId === "string" ? itemOrId : itemOrId?.id;
    return this.#panels.get(id)?.tab?.linkedBrowser ?? null;
  }

  ensurePanelTab(item, parentTab = null, url = null) {
    const existing = this.#panels.get(item.id) ?? {};
    if (existing.tab && !existing.tab.closing) {
      existing.item = item;
      existing.parentTab = parentTab;
      this.#setParentTabAttribute(existing.tab, parentTab);
      this.#panels.set(item.id, existing);
      return existing.tab;
    }

    const tab = this.#createPanelTab(item, url ?? item.url);
    tab.owner = null;
    tab.setAttribute("sine-web-panel-tab", "true");
    tab.setAttribute("sine-web-panel-id", item.id);
    this.#setParentTabAttribute(tab, parentTab);

    this.#window.gBrowser.hideTab?.(tab, "sine-web-panels");
    this.#panels.set(item.id, { item, parentTab, tab });
    return tab;
  }

  noteTabClosed(itemId) {
    const runtime = this.#panels.get(itemId);
    if (!runtime) {
      return;
    }
    delete runtime.tab;
    this.#panels.set(itemId, runtime);
  }

  unload(id) {
    const runtime = this.#panels.get(id);
    if (!runtime) {
      return;
    }

    if (runtime.tab && !runtime.tab.closing) {
      this.#window.gBrowser.removeTab(runtime.tab, {
        animate: false,
        skipPermitUnload: true,
      });
    }
    this.#panels.delete(id);
  }

  unloadMissing(itemIds) {
    const currentIds = new Set(itemIds);
    for (const id of this.#panels.keys()) {
      if (!currentIds.has(id)) {
        this.unload(id);
      }
    }
  }

  destroy() {
    for (const id of [...this.#panels.keys()]) {
      this.unload(id);
    }
    this.#window = null;
  }

  #createPanelTab(item, url) {
    const options = {
      inBackground: true,
      skipAnimation: true,
      skipBackgroundNotify: true,
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    };

    if (typeof this.#window.gBrowser.addTrustedTab === "function") {
      return this.#window.gBrowser.addTrustedTab(url, options);
    }

    return this.#window.gBrowser.addTab(url, options);
  }

  #setParentTabAttribute(tab, parentTab) {
    if (parentTab?.id) {
      tab.setAttribute("sine-web-panel-parent-id", parentTab.id);
      return;
    }

    tab.removeAttribute("sine-web-panel-parent-id");
  }
}
