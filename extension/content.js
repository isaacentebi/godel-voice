(() => {
  "use strict";

  const core = globalThis.GodelVoiceCore;
  if (!core) return;

  const PANEL_TITLES = {
    HMS: ["HISTORICAL MULTIPLE SECURITY", "HMS"],
    GR: ["RATIO ANALYSIS", "GR"],
    GF: ["GRAPH FUNDAMENTALS", "GF"]
  };

  function visible(element) {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function setInputValue(input, value) {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) throw new Error("Input does not expose a value setter");
    setter.call(input, value);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function pressEnter(element) {
    for (const type of ["keydown", "keypress", "keyup"]) {
      element.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
    }
  }

  function waitFor(find, description, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const immediate = find();
      if (immediate) return resolve(immediate);
      const observer = new MutationObserver(() => {
        const result = find();
        if (!result) return;
        clearTimeout(timer);
        observer.disconnect();
        resolve(result);
      });
      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timed out waiting for ${description}`));
      }, timeoutMs);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    });
  }

  function exactText(root, label) {
    const wanted = String(label).trim().toLowerCase();
    const candidates = root.querySelectorAll("button, [role='button'], [role='option'], label, span, div");
    const matches = [...candidates].filter(element => visible(element) && element.textContent.trim().toLowerCase() === wanted);
    return matches.length === 1 ? matches[0] : null;
  }

  function uniqueContaining(root, selector, fragment) {
    const wanted = String(fragment).trim().toLowerCase();
    const matches = [...root.querySelectorAll(selector)].filter(element => visible(element) && element.textContent.trim().toLowerCase().includes(wanted));
    return matches.length === 1 ? matches[0] : null;
  }

  function panelRoot(command) {
    const titles = PANEL_TITLES[command] ?? [];
    const nodes = [...document.querySelectorAll("div, span")].filter(element => {
      if (!visible(element)) return false;
      const text = element.textContent.trim().toUpperCase();
      return titles.includes(text);
    });
    // Godel allows multiple widgets of the same type. Commands append the new
    // widget later in DOM order, so operate on the newest matching panel.
    for (const title of nodes.reverse()) {
      const grid = title.closest(".react-grid-item, .grid-stack-item, [data-grid-id], [data-widget-id]");
      if (grid) return grid;
      let current = title.parentElement;
      for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
        // Header rows already contain help/close buttons. Keep climbing until
        // the actual widget body is included, which these three workflows
        // expose through at least one ticker/search input.
        if (current.querySelectorAll("input").length >= 1) return current;
      }
    }
    return null;
  }

  function toast(message, error = false) {
    const existing = document.getElementById("godel-voice-status");
    existing?.remove();
    const element = document.createElement("div");
    element.id = "godel-voice-status";
    element.textContent = message;
    Object.assign(element.style, {
      position: "fixed", right: "18px", bottom: "18px", zIndex: "2147483647",
      padding: "10px 13px", border: `1px solid ${error ? "#ff5c5c" : "#55d68b"}`,
      background: "#101313", color: error ? "#ff8a8a" : "#8bf0b0",
      font: "12px ui-monospace, SFMono-Regular, Menlo, monospace", borderRadius: "6px",
      boxShadow: "0 6px 24px rgba(0,0,0,.4)"
    });
    document.documentElement.appendChild(element);
    setTimeout(() => element.remove(), error ? 7000 : 3000);
  }

  async function clickText(root, label) {
    const target = await waitFor(() => exactText(root, label), `control ${label}`);
    if (target.getAttribute("aria-disabled") === "true" || target.hasAttribute("disabled")) {
      throw new Error(`${label} is unavailable for this security`);
    }
    target.click();
  }

  async function fillAndEnter(input, value) {
    input.focus();
    setInputValue(input, String(value));
    await new Promise(resolve => setTimeout(resolve, 80));
    pressEnter(input);
  }

  async function chooseTicker(input, value) {
    input.focus();
    setInputValue(input, String(value));
    const tokens = String(value).trim().toUpperCase().split(/\s+/);
    const wanted = tokens[0];
    const venue = tokens[1] ?? "US";
    const option = await waitFor(() => {
      const candidates = [...document.querySelectorAll("[role='option'], li, button, div, span")].filter(element => {
        if (!visible(element) || element.contains(input)) return false;
        const text = element.textContent.trim().toUpperCase();
        return text === wanted || text.startsWith(`${wanted} ${venue} `);
      });
      const leaves = candidates.filter(element => !candidates.some(other => other !== element && element.contains(other)));
      const ranked = (leaves.length ? leaves : candidates).sort((left, right) => left.textContent.trim().length - right.textContent.trim().length);
      const selected = ranked[0];
      return selected ? (selected.closest("[role='option'], li, button") ?? selected) : null;
    }, `ticker result ${wanted}`, 4000);
    option.click();
  }

  function tickerInput(root, placeholderFragment) {
    const wanted = placeholderFragment.toLowerCase();
    const visibleInputs = [...root.querySelectorAll("input")].filter(visible);
    const matches = visibleInputs.filter(input => {
      if (!visible(input)) return false;
      const identity = [input.placeholder, input.getAttribute("aria-label"), input.title, input.name]
        .filter(Boolean).join(" ").toLowerCase();
      return identity.includes(wanted);
    });
    if (matches.length === 1) return matches[0];
    // Several Godel controls derive their accessible name from surrounding
    // React text rather than an input attribute. A widget-scoped single input
    // is still unambiguous and safe to use.
    return visibleInputs.length === 1 ? visibleInputs[0] : null;
  }

  async function executeAction(panel, command, action) {
    const value = String(action.value ?? "");
    if (command === "HMS" && action.feature === "add/remove securities") {
      const input = await waitFor(() => tickerInput(panel, "add a ticker"), "HMS ticker input");
      return chooseTicker(input, value);
    }
    if (command === "HMS" && action.feature === "timeframe") {
      const labels = { "1M": "1 Month", "3M": "3 Months", "6M": "6 Months", "YTD": "YTD", "1Y": "1 Year", "5Y": "5 Years", "ALL TIME": "All Time" };
      const dropdown = await waitFor(() => uniqueContaining(panel, "button", "Year ▾"), "HMS timeframe menu");
      dropdown.click();
      return clickText(document, labels[value.toUpperCase()] ?? value);
    }
    if (command === "GR" && ["buy leg", "sell leg"].includes(action.feature)) {
      const label = await waitFor(() => exactText(panel, action.feature === "buy leg" ? "Buy" : "Sell"), `${action.feature} label`);
      const container = label.parentElement;
      const input = container?.querySelector("input") ?? container?.parentElement?.querySelector("input");
      if (!input || !visible(input)) throw new Error(`Could not locate ${action.feature} input`);
      return chooseTicker(input, value);
    }
    if (command === "GF" && action.feature === "add company") {
      await clickText(panel, "Add company");
      const input = await waitFor(() => {
        const dialogs = [...document.querySelectorAll("[role='dialog']")].filter(visible);
        const scope = dialogs.length === 1 ? dialogs[0] : document;
        const inputs = [...scope.querySelectorAll("input")].filter(visible);
        return inputs.length === 1 ? inputs[0] : null;
      }, "company search input");
      return chooseTicker(input, value);
    }
    if (command === "GF" && ["add metric", "ratio metric", "margin metric"].includes(action.feature)) {
      await clickText(panel, "Add metric");
      return clickText(document, value);
    }
    if (action.feature === "include consensus estimates") {
      const label = await waitFor(() => exactText(panel, "Include consensus estimates"), "consensus estimates toggle");
      const checkbox = label.querySelector("input[type='checkbox']") ?? label.parentElement?.querySelector("input[type='checkbox']");
      const desired = ["on", "true", "yes"].includes(value.toLowerCase());
      if (checkbox && checkbox.checked !== desired) label.click();
      else if (!checkbox) label.click();
      return;
    }
    return clickText(panel, value);
  }

  async function executePlan(plan, commandInput) {
    toast(`Godel Voice: opening ${plan.command}`);
    commandInput.focus();
    setInputValue(commandInput, plan.terminal_command);
    if (!plan.actions.length) return toast(`Godel Voice: command ready`);

    // The VoiceInk delivery script sends a real Return key after this content script
    // inserts the command. Godel's autocomplete intentionally ignores synthetic keys.
    // Wait for Godel to consume and clear the command before touching a panel;
    // otherwise an already-open widget could be configured and immediately reset.
    await waitFor(() => commandInput.value.trim() === "" ? true : null, "terminal submission", 2500);
    const panel = await waitFor(() => panelRoot(plan.command), `${plan.command} panel`, 8000);
    for (const action of plan.actions) await executeAction(panel, plan.command, action);
    toast(`Godel Voice: ${plan.command} configured`);
  }

  document.addEventListener("paste", event => {
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (!text.trim().startsWith(core.PREFIX)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    let commandInput = event.target;
    if (!(commandInput instanceof HTMLInputElement || commandInput instanceof HTMLTextAreaElement)) {
      const topInputs = [...document.querySelectorAll("input, textarea")].filter(input => {
        if (!visible(input)) return false;
        const rect = input.getBoundingClientRect();
        return rect.top >= 0 && rect.top < 100;
      }).sort((left, right) => {
        const a = left.getBoundingClientRect();
        const b = right.getBoundingClientRect();
        return a.top - b.top || a.left - b.left;
      });
      commandInput = topInputs[0] ?? null;
    }
    if (!(commandInput instanceof HTMLInputElement || commandInput instanceof HTMLTextAreaElement)) {
      return toast("Godel Voice: focus the terminal command bar first", true);
    }
    try {
      const plan = core.parseMarker(text);
      executePlan(plan, commandInput).catch(error => toast(`Godel Voice stopped: ${error.message}`, true));
    } catch (error) {
      toast(`Godel Voice rejected the plan: ${error.message}`, true);
    }
  }, true);
})();
