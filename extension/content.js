(() => {
  "use strict";

  const core = globalThis.GodelVoiceCore;
  const config = globalThis.GodelVoiceConfig;
  if (!core || !config || location.origin !== "https://app.godelterminal.com") return;

  const PANEL_TITLES = {
    HMS: ["HISTORICAL MULTIPLE SECURITY", "HMS"],
    GR: ["RATIO ANALYSIS", "GR"],
    GF: ["GRAPH FUNDAMENTALS", "GF"]
  };
  let running = false;

  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

  function visible(element) {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function rectOf(element) {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }

  function waitFor(find, description, timeoutMs = 6000) {
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

  function exactText(root, label, selectors = "button,[role='button'],[role='option'],label,span,div") {
    const wanted = String(label).trim().toLowerCase();
    const matches = [...root.querySelectorAll(selectors)]
      .filter(element => visible(element) && element.textContent.trim().toLowerCase() === wanted);
    const leaves = matches.filter(element => !matches.some(other => other !== element && element.contains(other)));
    return (leaves.length === 1 ? leaves[0] : null) ?? (matches.length === 1 ? matches[0] : null);
  }

  function rootForTitle(title) {
    const grid = title.closest(".react-grid-item,.grid-stack-item,[data-grid-id],[data-widget-id]");
    if (grid) return grid;
    let current = title.parentElement;
    for (let depth = 0; current && depth < 9; depth += 1, current = current.parentElement) {
      if (current.querySelectorAll("input").length >= 1 && current.querySelectorAll("button").length >= 2) return current;
    }
    return null;
  }

  function panelTitleNodes(command) {
    const titles = PANEL_TITLES[command] ?? [];
    return [...document.querySelectorAll("div,span")].filter(element =>
      visible(element) && titles.includes(element.textContent.trim().toUpperCase()));
  }

  function toast(message, error = false) {
    document.getElementById("godel-voice-status")?.remove();
    const element = document.createElement("div");
    element.id = "godel-voice-status";
    element.textContent = message;
    Object.assign(element.style, {
      position: "fixed", right: "18px", bottom: "18px", zIndex: "2147483647",
      padding: "10px 13px", border: `1px solid ${error ? "#ff5c5c" : "#55d68b"}`,
      background: "#101313", color: error ? "#ff8a8a" : "#8bf0b0",
      font: "12px ui-monospace,SFMono-Regular,Menlo,monospace", borderRadius: "6px"
    });
    document.documentElement.appendChild(element);
    setTimeout(() => element.remove(), error ? 8000 : 3500);
  }

  async function cdp(operation, payload = {}) {
    const response = await chrome.runtime.sendMessage({ type: "godel-voice:cdp", operation, ...payload });
    if (!response?.ok) throw new Error(response?.error || "Arc rejected tab input");
  }

  async function click(element) {
    if (!visible(element)) throw new Error("Target control is not visible");
    await cdp("click", { rect: rectOf(element) });
  }

  async function replaceText(element, text) {
    if (!visible(element)) throw new Error("Target input is not visible");
    await cdp("replaceText", { rect: rectOf(element), text: String(text) });
  }

  async function press(key) {
    await cdp("key", { key });
  }

  async function clickExact(root, label) {
    const element = await waitFor(() => exactText(root, label), `control ${label}`);
    if (element.matches("[disabled],[aria-disabled='true']")) throw new Error(`${label} is unavailable`);
    await click(element);
  }

  function topCommandInput() {
    return [...document.querySelectorAll("input,textarea")]
      .filter(element => visible(element) && element.getBoundingClientRect().top < 100)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0] ?? null;
  }

  async function chooseTicker(input, ticker) {
    const symbol = String(ticker).trim().toUpperCase().split(/\s+/)[0];
    await replaceText(input, symbol);
    const inputRect = input.getBoundingClientRect();
    const result = await waitFor(() => {
      const exact = [...document.querySelectorAll("[role='option'],li,button,span,div")]
        .filter(element => visible(element) && element.textContent.trim().toUpperCase() === symbol)
        .map(element => element.closest("[role='option'],li,button") ?? element)
        .filter((element, index, all) => all.indexOf(element) === index)
        .filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.top >= inputRect.top - 8 && rect.top < inputRect.bottom + 500;
        })
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      return exact[0] ?? null;
    }, `${symbol} ticker result`);
    await click(result);
    await pause(180);
  }

  async function executeGF(panel, action, plan) {
    const feature = action.feature;
    const value = String(action.value ?? "");
    if (feature === "add company") {
      const input = await waitFor(() => [...panel.querySelectorAll("input")].find(element =>
        visible(element) && /add a company/i.test([element.placeholder, element.getAttribute("aria-label")].join(" "))), "GF company input");
      return chooseTicker(input, value);
    }
    if (["add metric", "ratio metric", "margin metric"].includes(feature)) {
      const companies = [plan.terminal_command.split(/\s+/)[0], ...plan.actions
        .filter(item => item.feature === "add company").map(item => String(item.value).split(/\s+/)[0])];
      for (const company of [...new Set(companies)]) {
        const button = await waitFor(() => [...panel.querySelectorAll("button")].find(element =>
          visible(element) && [element.getAttribute("aria-label"), element.title, element.getAttribute("data-tooltip"), element.textContent]
            .filter(Boolean).join(" ").includes(`Add metric for ${company}`)), `Add metric for ${company}`);
        await click(button);
        const option = await waitFor(() => exactText(document, value), `metric ${value}`);
        if (option.matches("[disabled],[aria-disabled='true']") || /no data available/i.test(option.parentElement?.textContent ?? "")) {
          throw new Error(`Godel has no ${value} data for ${company}`);
        }
        await click(option);
        await pause(150);
      }
      return;
    }
    if (feature === "include consensus estimates") {
      const control = await waitFor(() => exactText(panel, "Include consensus estimates"), "consensus estimates");
      const desired = ["on", "true", "yes"].includes(value.toLowerCase());
      const checkbox = control.querySelector("input[type=checkbox]") ?? control.parentElement?.querySelector("input[type=checkbox]");
      if (!checkbox || checkbox.checked !== desired) await click(control);
      return;
    }
    return clickExact(panel, value);
  }

  async function executeHMS(panel, action) {
    const value = String(action.value ?? "");
    if (action.feature === "add/remove securities") {
      const input = await waitFor(() => [...panel.querySelectorAll("input")].find(element =>
        visible(element) && /add a ticker/i.test([element.placeholder, element.getAttribute("aria-label")].join(" "))), "HMS ticker input");
      return chooseTicker(input, value);
    }
    if (action.feature === "timeframe") {
      const labels = { "1M": "1 Month", "3M": "3 Months", "6M": "6 Months", YTD: "YTD", "1Y": "1 Year", "5Y": "5 Years", "ALL TIME": "All Time" };
      const menu = [...panel.querySelectorAll("button")].find(element => visible(element) && /year/i.test(element.textContent));
      if (!menu) throw new Error("HMS timeframe menu not found");
      await click(menu);
      return clickExact(document, labels[value.toUpperCase()] ?? value);
    }
    return clickExact(panel, value);
  }

  async function executeGR(panel, action) {
    const value = String(action.value ?? "");
    if (["buy leg", "sell leg"].includes(action.feature)) {
      const label = await waitFor(() => exactText(panel, action.feature === "buy leg" ? "Buy" : "Sell"), action.feature);
      const input = label.parentElement?.querySelector("input") ?? label.parentElement?.parentElement?.querySelector("input");
      if (!input || !visible(input)) throw new Error(`${action.feature} input not found`);
      return chooseTicker(input, value);
    }
    return clickExact(panel, value);
  }

  async function executePlan(marker) {
    const plan = core.parseMarker(marker);
    const before = panelTitleNodes(plan.command).length;
    toast(`Godel Voice: opening ${plan.command}`);

    await press("Escape");
    await press("Backquote");
    const input = await waitFor(topCommandInput, "Godel command bar", 3000);
    await replaceText(input, plan.terminal_command);
    await pause(180);
    await press("Enter");

    if (!plan.actions.length) return toast(`Godel Voice: ${plan.command} opened`);
    const panel = await waitFor(() => {
      const titles = panelTitleNodes(plan.command);
      if (titles.length <= before) return null;
      return rootForTitle(titles.at(-1));
    }, `new ${plan.command} panel`, 9000);

    for (const action of plan.actions) {
      if (plan.command === "GF") await executeGF(panel, action, plan);
      else if (plan.command === "HMS") await executeHMS(panel, action);
      else if (plan.command === "GR") await executeGR(panel, action);
      await pause(120);
    }
    toast(`Godel Voice: ${plan.command} configured`);
  }

  async function poll() {
    if (running || document.visibilityState !== "visible") return;
    try {
      const response = await fetch(`${config.handoffUrl}/next?token=${encodeURIComponent(config.secret)}`, { cache: "no-store" });
      if (response.status === 204) return;
      if (!response.ok) throw new Error(`handoff server returned ${response.status}`);
      const payload = await response.json();
      running = true;
      try { await executePlan(payload.marker); }
      catch (error) { toast(`Godel Voice stopped: ${error.message}`, true); }
      finally { running = false; }
    } catch (error) {
      // The local server is intentionally on-demand. Stay silent while it is
      // absent so an ordinary Godel session has no warnings or network noise.
    }
  }

  setInterval(poll, 350);
  poll();
})();
