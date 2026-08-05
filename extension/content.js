(() => {
  "use strict";

  const core = globalThis.GodelVoiceCore;
  const layoutEngine = globalThis.GodelVoiceLayout;
  const panelInsights = globalThis.GodelPanelInsights;
  const config = globalThis.GodelVoiceConfig;
  if (!core || !layoutEngine || !panelInsights || !config || location.origin !== "https://app.godelterminal.com") return;

  const PANEL_TITLES = {
    IMAP: ["INTRADAY MARKET MAP", "IMAP"],
    HMAP: ["MARKET HEATMAP", "HMAP"],
    EM: ["EARNINGS MATRIX", "EM"],
    ERN: ["EARNINGS ESTIMATES", "ERN"],
    HMS: ["HISTORICAL MULTIPLE SECURITY", "HMS"],
    GR: ["RATIO ANALYSIS", "GR"],
    GF: ["GRAPH FUNDAMENTALS", "GF"],
    G: ["CHART"],
    N: ["NEWS"],
    OMON: ["OPTION MONITOR", "OPTION CHAIN", "OMON"],
    EQS: ["EQUITY SCREENER", "EQS"],
    FA: ["FINANCIAL ANALYSIS", "FINANCIALS", "FA"],
    HALT: ["MARKET HALTS", "HALT"],
    TRAN: ["TRANSCRIPT HUB", "TRANSCRIPTS", "EARNINGS TRANSCRIPTS", "TRAN"],
    CF: ["COMPANY FILINGS", "SEC FILINGS", "FILINGS", "CF"],
    ANR: ["ANALYST RATINGS"],
    DVD: ["DIVIDEND YIELD"],
    MOST: ["MOST ACTIVE", "MOST"],
    WEI: ["WORLD EQUITY INDEX", "WEI"],
    WEIF: ["WORLD EQUITY INDEX FUTURES", "WEIF"],
    GLCO: ["GLOBAL COMMODITY FUTURES", "GLCO"],
    FX: ["FOREX PAIRS", "FX"],
    MOSO: ["MOST ACTIVE OPTIONS", "MOSO"],
    TOP: ["TOP NEWS", "TOP"],
    TREND: ["TRENDING ON GODEL", "TREND"],
    IPO: ["INITIAL PUBLIC OFFERINGS", "IPO"],
    MAP: ["WORLD VENUE MAP", "MAP"],
    HDS: ["HOLDERS", "HDS"],
    SECF: ["SECURITIES FINDER", "SECF"]
  };
  const COMMAND_WINDOW_TYPES = {
    IMAP: "INTRADAY_MARKET_MAP",
    HMAP: "MARKET_HEATMAP", EM: "EARNINGS_MATRIX", ERN: "EARNINGS_ESTIMATES", GF: "GRAPH_FUNDAMENTALS",
    G: "CHART", N: "NEWS", OMON: "OPTION_MONITOR", EQS: "EQUITY_SCREENER",
    FA: "FINANCIAL_ANALYSIS", HALT: "MARKET_HALTS", TRAN: "TRANSCRIPTS", CF: "COMPANY_FILINGS",
    MOST: "MOST_ACTIVE", WEI: "WORLD_EQUITY_INDEX", WEIF: "WORLD_EQUITY_INDEX_FUTURES",
    GLCO: "GLOBAL_COMMODITY_FUTURES", FX: "FOREX_PAIRS", MOSO: "MOST_ACTIVE_OPTIONS",
    TOP: "TOP_NEWS", TREND: "TRENDING", IPO: "INITIAL_PUBLIC_OFFERINGS", MAP: "WORLD_VENUE_MAP",
    HDS: "HOLDERS", SECF: "SECURITIES_FINDER", ANR: "ANALYST_RATINGS", DVD: "DIVIDEND_YIELD"
  };
  const COMMAND_NAMES = {
    IMAP: "intraday market map",
    HMAP: "market heatmap", EM: "earnings matrix", ERN: "earnings estimates",
    HMS: "historical comparison", GR: "ratio analysis", GF: "fundamentals graph",
    G: "price chart", N: "news", OMON: "options chain", EQS: "equity screener",
    FA: "financial analysis", HALT: "market halts", TRAN: "earnings transcripts",
    CF: "company filings", MOST: "most active stocks", WEI: "world equity indices",
    WEIF: "world equity-index futures", HDS: "institutional holders", SECF: "securities finder",
    GLCO: "global commodity futures", FX: "forex pairs", MOSO: "most active options",
    TOP: "top news", TREND: "trending searches", IPO: "initial public offerings",
    MAP: "world venue map", ANR: "analyst ratings", DVD: "dividend yield"
  };
  const SECURITY_NAMES = { META: "Meta", AMZN: "Amazon", MSFT: "Microsoft", AAPL: "Apple", GOOG: "Google", GOOGL: "Google", QQQ: "QQQ", VIX: "VIX" };
  const mainWorldReady = runtimeMessage({ type: "godel-voice:inject-main" })
    .then(response => {
      if (!response?.ok) throw new Error(response?.error || "Could not inject Godel internal bridge");
    });
  let running = false;
  let polling = false;
  let clientId = null;
  let documentGeneration = null;
  const executorIdentityReady = runtimeMessage({ type: "godel-voice:executor-identity" }).then(response => {
    const value = String(response?.executor_id ?? "");
    const generation = String(response?.document_generation ?? "");
    if (!response?.ok || !/^gx-[A-Za-z0-9_-]{40,96}$/.test(value)
        || !/^gd-[A-Za-z0-9_-]{40,96}$/.test(generation)) {
      throw new Error("Godel executor identity is unavailable");
    }
    clientId = value;
    documentGeneration = generation;
    return { executorId: value, documentGeneration: generation };
  });
  let lastWindowId = null;
  let lastPanelElement = null;
  let lastPanelContext = null;
  const commandWindows = new Map();
  const commandPanels = new Map();
  const panelMetadata = new WeakMap();
  const panelCommandTimings = new WeakMap();
  const managedWindowStorageKey = "godel-voice-managed-window-ids-v1";
  const managedWindowIds = new Set((() => {
    try {
      const value = JSON.parse(sessionStorage.getItem(managedWindowStorageKey) ?? "[]");
      return Array.isArray(value) ? value.filter(id => /^\d+$/.test(String(id))).slice(-32).map(String) : [];
    } catch { return []; }
  })());
  const borrowedWindowStorageKey = "godel-voice-borrowed-windows-v1";
  const borrowedWindowReceipts = new Map((() => {
    try {
      const value = JSON.parse(sessionStorage.getItem(borrowedWindowStorageKey) ?? "[]");
      if (!Array.isArray(value)) return [];
      return value.filter(receipt => receipt && /^[A-Za-z0-9_-]{1,120}$/.test(String(receipt.id ?? ""))
        && /^\d+$/.test(String(receipt.source_screen_id ?? ""))
        && /^\d+$/.test(String(receipt.target_screen_id ?? "")))
        .slice(-16).map(receipt => [String(receipt.id), receipt]);
    } catch { return []; }
  })());
  let lastContextDigest = "";
  let lastContextPublishAt = 0;
  let startSpeechTimer = null;
  let startSpeechUtterance = null;
  const TRAN_TEXT_CACHE_TTL_MS = 15 * 60 * 1000;
  const TRAN_TEXT_CACHE_MAX = 64;
  const tranTextCache = new Map();

  class CancelledError extends Error {
    constructor(message = "Workflow cancelled") {
      super(message);
      this.name = "CancelledError";
    }
  }

  class ExtensionReloadError extends Error {
    constructor() {
      super("Executor updated; reloading Godel once");
      this.name = "ExtensionReloadError";
    }
  }

  async function runtimeMessage(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      if (!/extension context invalidated/i.test(String(error?.message ?? error))) throw error;
      const key = "godel-voice-extension-reload-at";
      const previous = Number(sessionStorage.getItem(key) ?? 0);
      if (Date.now() - previous > 15_000) {
        sessionStorage.setItem(key, String(Date.now()));
        setTimeout(() => location.reload(), 150);
      }
      throw new ExtensionReloadError();
    }
  }

  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

  function quickQuoteFacts(text, expectedSecurity = null) {
    if (typeof panelInsights.extractQuickQuote === "function") {
      const shared = panelInsights.extractQuickQuote(text, expectedSecurity);
      if (shared) return shared;
    }
    // Backward-compatible rolling-update fallback. Arc can keep the previous
    // isolated-world helper object alive briefly after reloading an unpacked
    // extension even though the new executor script is active.
    const source = compactText(text);
    const match = /(?:^|\s)([A-Z][A-Z0-9.-]{0,9})\s*(US|LN|CN|AU|JP|GR|FP|IM|SM|SW|NA|BB|HK|CBOE|CME|GBL|FX1)\s+([$€£])?([0-9][0-9,]*(?:\.[0-9]+)?)\s*[+-]\s*[0-9][0-9,]*(?:\.[0-9]+)?\s*([+-])\s*([0-9]+(?:\.[0-9]+)?)%\s*Vol\s+[0-9][0-9,.]*[KMBT]?\s+B\s+[0-9][0-9,]*(?:\.[0-9]+)?\s+x\s+[0-9][0-9,]*\s*\/\s*[0-9][0-9,]*(?:\.[0-9]+)?\s+x\s+[0-9][0-9,]*\s+A\s+At:\s*([0-9]{1,2}:[0-9]{2}:[0-9]{2})\b/i.exec(source);
    if (!match) return null;
    const security = match[1].toUpperCase();
    if (expectedSecurity && security !== String(expectedSecurity).toUpperCase()) return null;
    return {
      security, venue: match[2].toUpperCase(), price: `${match[3] ?? ""}${match[4]}`,
      direction: match[5] === "-" ? "down" : "up", percent: `${match[6]}%`, at: match[7]
    };
  }

  function quickQuoteHeader(expectedSecurity) {
    const candidates = [...document.querySelectorAll("header,section,div")]
      .filter(element => visible(element) && String(element.innerText ?? "").length <= 420)
      .map(element => ({ element, quote: quickQuoteFacts(element.innerText, expectedSecurity) }))
      .filter(item => item.quote)
      .sort((left, right) => String(left.element.innerText).length - String(right.element.innerText).length);
    if (candidates[0]?.element) return candidates[0].element;
    // Some Godel releases split the symbol and market data across sibling
    // React roots under the navigation shell. The full signature is strict
    // enough to authenticate against the visible page without assuming that
    // private component boundary.
    return quickQuoteFacts(document.body?.innerText, expectedSecurity)
      ? document.body : null;
  }

  function persistManagedWindowIds() {
    sessionStorage.setItem(managedWindowStorageKey, JSON.stringify([...managedWindowIds].slice(-512)));
  }

  function persistBorrowedWindows() {
    sessionStorage.setItem(borrowedWindowStorageKey, JSON.stringify([...borrowedWindowReceipts.values()].slice(-16)));
  }

  async function restoreBorrowedWindows({ onlyIds = null } = {}) {
    const allowed = onlyIds ? new Set([...onlyIds].map(String)) : null;
    for (const [id, receipt] of [...borrowedWindowReceipts].reverse()) {
      if (allowed && !allowed.has(id)) continue;
      try {
        await workspaceInternalAction("restoreWindowLocation", receipt);
        borrowedWindowReceipts.delete(id);
        managedWindowIds.delete(id);
      } catch {
        // Never close or forget a user-owned panel unless its original screen
        // was restored exactly. A later session cleanup can retry safely.
      }
    }
    persistBorrowedWindows();
    persistManagedWindowIds();
  }

  function managedWindowId(panel) {
    const root = nativeWindowRoot(panel);
    const id = root ? windowId(root) : null;
    const type = String(root?.getAttribute("data-cy-command-type") ?? "").toUpperCase();
    if (!id || !type || /CHAT|NOTE|ACCOUNT|BROK|ORDER|TRADE|MESSAGE|ALERT/.test(type)) return null;
    return String(id);
  }

  function rememberManagedPanel(panel) {
    const id = managedWindowId(panel);
    if (!id) return;
    managedWindowIds.add(id);
    persistManagedWindowIds();
  }

  function forgetManagedPanel(panel) {
    const root = nativeWindowRoot(panel);
    const id = root ? String(windowId(root) ?? "") : "";
    if (!id || !managedWindowIds.delete(id)) return;
    persistManagedWindowIds();
  }

  async function closeVoiceScreenPanels({ onlyIds = null } = {}) {
    const active = await workspaceInternalAction("activeScreenInfo");
    const title = String(active?.title ?? "").toLowerCase();
    if (title === "blank" && windowRoots().length === 0) return;
    if (title !== "voice") {
      throw new Error("Jarvis could not establish its dedicated Voice screen");
    }

    // The screen title is the durable ownership boundary. Unlike the old
    // session-only id list, it survives extension reloads and screen switches.
    // Consequential or unrecognised windows still fail closed.
    const allowedIds = onlyIds ? new Set([...onlyIds].map(String)) : null;
    for (const panel of windowRoots()) {
      const id = managedWindowId(panel);
      if (!id) continue;
      if (borrowedWindowReceipts.has(id)) continue;
      if (allowedIds && !allowedIds.has(id)) continue;
      try {
        await panelInternalAction(panel, "LAYOUT", "close");
        managedWindowIds.delete(id);
      } catch {
        // A changed Godel window must remain open. Never turn automatic
        // housekeeping into a destructive or blocking failure.
      }
    }
    // Native close callbacks are ideal for ordinary layouts because they let
    // Godel release each mounted widget normally. Crashed or older Jarvis
    // sessions can leave layout records without a usable DOM root, though.
    // The dedicated Voice screen is the durable ownership boundary, so prune
    // those stale records in one native layout transaction after restoring any
    // temporarily borrowed user panels. This prevents unbounded window buildup
    // and repairs workspaces that can no longer render every leaked widget.
    const cleanup = await workspaceInternalAction("clearVoiceScreen", {
      preserve_ids: [...borrowedWindowReceipts.keys()],
      ...(onlyIds ? { only_ids: [...onlyIds].map(String) } : {})
    });
    for (const id of cleanup?.removed_ids ?? []) managedWindowIds.delete(String(id));
    persistManagedWindowIds();
  }

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

  function waitUntil(find, description, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        const result = find();
        if (result) {
          clearInterval(timer);
          resolve(result);
        } else if (Date.now() - started >= timeoutMs) {
          clearInterval(timer);
          reject(new Error(`Timed out waiting for ${description}`));
        }
      }, 50);
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
    // Godel desktop windows are rooted at this draggable/resizable container.
    // Keep the older selectors for compatibility with other layouts.
    const grid = title.closest(".resize.inline-block.absolute,.react-grid-item,.grid-stack-item,[data-grid-id],[data-widget-id]");
    if (grid) return grid;
    let current = title.parentElement;
    for (let depth = 0; current && depth < 16; depth += 1, current = current.parentElement) {
      if (current.querySelectorAll("input").length >= 1 && current.querySelectorAll("button").length >= 2) return current;
    }
    // Some Godel windows render the title bar and the native `*-window`
    // content as React siblings. Associate only a unique spatially aligned
    // native root; never pick a generic workspace ancestor.
    const titleRect = title.getBoundingClientRect();
    const centerX = titleRect.left + titleRect.width / 2;
    const spatial = windowRoots().filter(root => {
      const rect = root.getBoundingClientRect();
      const horizontallyAligned = centerX >= rect.left - 8 && centerX <= rect.right + 8;
      const verticallyAligned = titleRect.top >= rect.top - 80 && titleRect.bottom <= rect.bottom + 24;
      return horizontallyAligned && verticallyAligned;
    }).sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return ar.width * ar.height - br.width * br.height;
    });
    if (spatial.length === 1) return spatial[0];
    if (spatial.length > 1) {
      const first = spatial[0].getBoundingClientRect();
      const second = spatial[1].getBoundingClientRect();
      if (first.width * first.height < second.width * second.height * 0.9) return spatial[0];
    }
    return null;
  }

  function expandedGFPanel(root) {
    for (let panel = root, depth = 0; panel && depth < 9; panel = panel.parentElement, depth += 1) {
      const hasRail = [...panel.querySelectorAll("button")].some(element =>
        /add metric for/i.test([element.getAttribute("aria-label"), element.title].filter(Boolean).join(" ")));
      if (hasRail) return panel;
    }
    return null;
  }

  function panelTitleNodes(command) {
    const titles = PANEL_TITLES[command] ?? [];
    const matches = [...document.querySelectorAll("[role='heading'],h1,h2,h3,h4,div,span,p")].filter(element =>
      visible(element) && titles.includes(element.textContent.trim().toUpperCase()));
    // The toolbar repeats the same text in three nested wrappers. Keep only
    // the innermost title so one Godel window equals one tracked title node.
    return matches.filter(element => !matches.some(other => other !== element && element.contains(other)));
  }

  function topPanelForCommand(command) {
    const panels = [...new Set(panelTitleNodes(command).map(rootForTitle).filter(Boolean))];
    return panels.sort((a, b) => {
      const az = Number.parseInt(getComputedStyle(a).zIndex, 10) || 0;
      const bz = Number.parseInt(getComputedStyle(b).zIndex, 10) || 0;
      return bz - az;
    })[0] ?? null;
  }

  function windowRoots() {
    return [...document.querySelectorAll('[id$="-window"]')]
      .filter(element => element instanceof HTMLElement && visible(element) && /-window$/.test(element.id));
  }

  function windowId(root) {
    return root.id.replace(/-window$/, "");
  }

  function activeWindowForCommand(command) {
    return windowRoots().find(root => {
      const active = root.getAttribute("data-cy-active-window");
      const type = String(root.getAttribute("data-cy-command-type") ?? "").toUpperCase();
      return active !== null && active !== "false" && (type === command || type === COMMAND_WINDOW_TYPES[command]);
    }) ?? null;
  }

  function windowForCommand(command) {
    const roots = windowRoots();
    const typed = roots.filter(root =>
      [command, COMMAND_WINDOW_TYPES[command]].includes(
        String(root.getAttribute("data-cy-command-type") ?? "").toUpperCase()));
    const candidates = typed.length ? typed : roots.filter(root => panelMatchesCommand(root, command));
    return candidates
      .sort((a, b) => (Number.parseInt(getComputedStyle(b).zIndex, 10) || 0)
        - (Number.parseInt(getComputedStyle(a).zIndex, 10) || 0))[0] ?? null;
  }

  function panelMatchesCommand(panel, command) {
    const type = String(panel.getAttribute("data-cy-command-type") ?? "").toUpperCase();
    if (type === command || type === COMMAND_WINDOW_TYPES[command]) return true;
    return panelTitleNodes(command).some(title => {
      const titleRoot = rootForTitle(title);
      return panel === title || panel.contains(title) || titleRoot === panel
        || (titleRoot && nativeWindowRoot(titleRoot) === panel);
    });
  }

  function panelMatchesTerminalIdentity(panel, identity) {
    if (!identity) return true;
    const expected = `${identity.security} ${identity.venue}`;
    if ([...panel.querySelectorAll("input")].some(input => visible(input)
      && String(input.value ?? "").trim().toUpperCase() === expected)) return true;
    const escapedSecurity = identity.security.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedVenue = identity.venue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escapedSecurity}\\s+${escapedVenue}\\b`, "i").test(compactText(panel.textContent));
  }

  function contextPanel(panel) {
    if (!panel) return null;
    const native = nativeWindowRoot(panel) ?? panel;
    const remembered = panelMetadata.get(panel) ?? panelMetadata.get(native) ?? null;
    const type = String(panel.getAttribute("data-cy-command-type") ?? "").toUpperCase();
    const command = remembered?.command ?? Object.keys(PANEL_TITLES)
      .find(code => code === type || COMMAND_WINDOW_TYPES[code] === type || panelMatchesCommand(panel, code));
    if (!command) return null;
    const symbolValue = [...panel.querySelectorAll("input")]
      .map(input => String(input.value ?? "").trim().toUpperCase())
      .find(value => /^[A-Z][A-Z0-9.-]{0,15}\s+US\b/.test(value));
    const security = symbolValue?.match(/^([A-Z][A-Z0-9.-]{0,15})\s+US\b/)?.[1]
      ?? remembered?.security
      ?? null;
    return { command, security, connected: panel.isConnected };
  }

  function rememberPanel(panel, command = null, security = null) {
    if (!(panel instanceof HTMLElement) || !panel.isConnected) return;
    const native = nativeWindowRoot(panel) ?? panel;
    const id = native.id ? windowId(native) : "";
    const detected = contextPanel(panel) ?? contextPanel(native);
    const canonicalCommand = String(detected?.command ?? command ?? "").toUpperCase();
    const canonicalSecurity = String(detected?.security ?? security ?? "").toUpperCase() || null;
    if (canonicalCommand) {
      const metadata = { command: canonicalCommand, security: canonicalSecurity };
      panelMetadata.set(panel, metadata);
      panelMetadata.set(native, metadata);
    }
    lastPanelElement = panel;
    lastPanelContext = canonicalCommand
      ? { command: canonicalCommand, security: canonicalSecurity, connected: true }
      : null;
    if (id) lastWindowId = id;
    if (canonicalCommand) {
      commandPanels.set(canonicalCommand, panel);
      if (id) commandWindows.set(canonicalCommand, id);
    }
  }

  function tranResearchSession(panel) {
    if (!panel || !panelMatchesCommand(panel, "TRAN")) return null;
    let result;
    try { result = JSON.parse(panel.dataset.godelVoiceTranResult ?? ""); } catch { return null; }
    if (!result || typeof result !== "object" || !Array.isArray(result.periods) || !Array.isArray(result.topics)) return null;
    const periods = result.periods.slice(0, 8).map(item => compactText(item?.period).slice(0, 40)).filter(Boolean);
    const topics = result.topics.slice(0, 5).map(item => compactText(item?.topic).slice(0, 80)).filter(Boolean);
    const panelContext = contextPanel(panel);
    const resultSecurity = /^[A-Z][A-Z0-9.-]{0,15}$/.test(String(result.security ?? "")) ? result.security : null;
    if (!periods.length || !topics.length || (!resultSecurity && !panelContext?.security && !result.company)) return null;
    return {
      command: "TRAN",
      company: compactText(result.company).slice(0, 100),
      security: resultSecurity ?? panelContext?.security ?? null,
      periods,
      topics,
      question: compactText(result.question).slice(0, 300),
      summary: compactText(result.summary).slice(0, 600),
      current_period: result.current?.period && periods.includes(result.current.period) ? result.current.period : null,
      current_excerpt: compactText(result.current?.text).slice(0, 600)
    };
  }

  async function publishExecutorContext() {
    if (document.visibilityState !== "visible" || !document.hasFocus()) return;
    const { executorId, documentGeneration: generation } = await executorIdentityReady;
    const roots = await activeScreenRoots();
    const rootIds = new Set(roots.map(root => String(windowId(root) ?? "")).filter(Boolean));
    const focusedRoot = roots.find(root => {
      const active = root.getAttribute("data-cy-active-window");
      return active !== null && active !== "false";
    }) ?? null;
    const rememberedCandidate = (lastWindowId && panelById(lastWindowId))
      ?? (lastPanelElement?.isConnected ? (nativeWindowRoot(lastPanelElement) ?? lastPanelElement) : null);
    const rememberedRoot = rememberedCandidate
      && rootIds.has(String(windowId(rememberedCandidate) ?? "")) ? rememberedCandidate : null;
    const researchSession = tranResearchSession(focusedRoot) ?? tranResearchSession(rememberedRoot)
      ?? roots.map(tranResearchSession).find(Boolean) ?? null;
    const value = {
      focused_panel: contextPanel(focusedRoot),
      last_panel: contextPanel(rememberedRoot),
      panels: [...new Map(roots.map(contextPanel).filter(Boolean)
        .map(panel => [`${panel.command}:${panel.security ?? ""}`, panel])).values()],
      ...(researchSession ? { research_session: researchSession } : {})
    };
    const digest = JSON.stringify(value);
    if (digest === lastContextDigest && Date.now() - lastContextPublishAt < 5_000) return;
    const response = await fetch(`${config.handoffUrl}/context`, {
      method: "POST", headers: {
        "Content-Type": "application/json", Authorization: `Bearer ${config.secret}`,
        "X-Godel-Executor-Id": executorId, "X-Godel-Document-Generation": generation
      },
      body: digest
    });
    if (!response.ok) return;
    lastContextDigest = digest;
    lastContextPublishAt = Date.now();
  }

  function workspaceViewport() {
    const top = Math.max(88, topCommandInput()?.getBoundingClientRect().bottom ?? 0);
    const bottomReserve = 42;
    return { x: 0, y: top, width: innerWidth, height: Math.max(190, innerHeight - top - bottomReserve) };
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
    const response = await runtimeMessage({ type: "godel-voice:cdp", operation, ...payload });
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

  async function trustedType(text) {
    await cdp("trustedType", { text: String(text) });
  }

  async function focusAndInsert(input, text) {
    if (!visible(input)) throw new Error("Target input is not visible");
    const token = crypto.randomUUID();
    input.dataset.godelVoiceTarget = token;
    try {
      await cdp("focusAndInsert", {
        selector: `[data-godel-voice-target="${token}"]`,
        text: String(text)
      });
    } finally {
      input.removeAttribute("data-godel-voice-target");
    }
  }

  function nativeWindowRoot(panel) {
    if (!(panel instanceof HTMLElement) || !panel.isConnected) return null;
    if (panel.matches('[id$="-window"]')) return panel;
    const ancestor = panel.closest('[id$="-window"]');
    if (ancestor instanceof HTMLElement) return ancestor;
    const descendants = [...panel.querySelectorAll('[id$="-window"]')]
      .filter(element => element instanceof HTMLElement && visible(element));
    if (descendants.length === 1) return descendants[0];

    // Some current Godel layouts mount the visual shell and native window as
    // siblings. Resolve only one strongly overlapping native root; ambiguity
    // must fail closed rather than moving the wrong panel.
    const rect = panel.getBoundingClientRect();
    const overlapping = windowRoots().filter(root => {
      const candidate = root.getBoundingClientRect();
      const overlapWidth = Math.max(0, Math.min(rect.right, candidate.right) - Math.max(rect.left, candidate.left));
      const overlapHeight = Math.max(0, Math.min(rect.bottom, candidate.bottom) - Math.max(rect.top, candidate.top));
      const overlapArea = overlapWidth * overlapHeight;
      const smallerArea = Math.min(rect.width * rect.height, candidate.width * candidate.height);
      return smallerArea > 0 && overlapArea / smallerArea >= 0.8;
    });
    return overlapping.length === 1 ? overlapping[0] : null;
  }

  async function panelInternalAction(panel, command, action, payload = {}) {
    await mainWorldReady;
    const id = crypto.randomUUID();
    const nativeRoot = nativeWindowRoot(panel);
    if (command === "LAYOUT" && !nativeRoot) {
      throw new Error("Godel native window target is unavailable or ambiguous");
    }
    panel.dataset.godelVoicePanel = id;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        panel.removeAttribute("data-godel-voice-panel");
        window.removeEventListener("godel-voice:panel-action-result", onResult);
      };
      const onResult = event => {
        if (event.detail?.id !== id) return;
        cleanup();
        if (event.detail.ok) resolve(event.detail.result ?? null);
        else reject(new Error(event.detail.error || "Godel GF internal action failed"));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Godel ${command} ${action} timed out`));
      }, 12000);
      window.addEventListener("godel-voice:panel-action-result", onResult);
      // DOM attributes cross Chromium's isolated/page-world boundary, but
      // the propagation is not guaranteed within the same JavaScript turn.
      // Yield one animation frame, then use the window event that reliably
      // reaches the injected Godel bridge.
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent("godel-voice:panel-action", {
          detail: { id, target_id: (nativeRoot ?? panel).id || null, command, action, payload }
        }));
      });
    });
  }

  function workspaceInternalAction(action, payload = {}) {
    // Workspace state is global, while native windows retain the React context
    // of the screen on which they were created. Anchoring a workspace request
    // to windowRoots()[0] could therefore mutate a stale screen even though the
    // visible Voice tab was active. A fixed, fiber-free DOM target forces the
    // main-world bridge to resolve the one global tab/workspace provider. Its
    // stable id also keeps concurrent geometry calls from sharing a temporary
    // dataset selector.
    let root = document.getElementById("godel-voice-workspace-anchor");
    if (!(root instanceof HTMLElement)) {
      root = document.createElement("div");
      root.id = "godel-voice-workspace-anchor";
      root.hidden = true;
      document.documentElement.append(root);
    }
    return panelInternalAction(root, "WORKSPACE", action, payload);
  }

  async function clickExact(root, label) {
    const element = await waitFor(() => exactText(root, label), `control ${label}`);
    if (element.matches("[disabled],[aria-disabled='true']")) throw new Error(`${label} is unavailable`);
    await click(element);
  }

  function topCommandInput() {
    return [...document.querySelectorAll("input,textarea")]
      .filter(element => visible(element) && elementExposed(element) && element.getBoundingClientRect().top < 100)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0] ?? null;
  }

  function elementExposed(element) {
    if (!(element instanceof Element) || !visible(element)) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
    const y = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2));
    const hit = document.elementFromPoint(x, y);
    return Boolean(hit && (hit === element || element.contains(hit)));
  }

  function commandMenuOpen() {
    const input = topCommandInput();
    if (!input) return false;
    return [...document.querySelectorAll("h1,h2,h3,h4,div,span,p")].some(element =>
      visible(element)
      && elementExposed(element)
      && element.textContent.trim().toUpperCase() === "COMMANDS"
      && element.getBoundingClientRect().top < 220);
  }

  async function openCommandBar() {
    // Godel keeps its palette mounted after Enter. Reuse would preserve its
    // old layout callback and let a compound command drop the panel that just
    // opened. Toggle that instance closed, prove it unmounted, then open a
    // fresh palette bound to the current layout.
    if (commandMenuOpen()) {
      // Godel 4.5.8 may mount the palette as its default empty-screen state;
      // Backquote does not close that variant, while Escape does. Prefer the
      // semantic close key and retain Backquote only as a bounded fallback.
      const staleInput = topCommandInput();
      if (staleInput) await click(staleInput);
      await press("Escape");
      try {
        await waitUntil(() => !commandMenuOpen(), "closed Godel command bar", 600);
      } catch {
        await press("Backquote");
        await waitUntil(() => !commandMenuOpen(), "closed Godel command bar", 1000);
      }
    }
    await press("Escape");
    await press("Backquote");
    await waitUntil(commandMenuOpen, "open Godel command menu", 3000);
    return waitFor(topCommandInput, "Godel command bar", 1000);
  }

  function normalizedWords(value) {
    return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  }

  function compactText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function shallowResultContext(hit) {
    let context = hit.closest("[role='option'],[role='row'],li,button") ?? hit;
    if (context === hit && hit.parentElement) {
      const parent = hit.parentElement;
      const rect = parent.getBoundingClientRect();
      const text = compactText(parent.textContent);
      // One autocomplete row is compact. Never climb into the list container:
      // clicking that container can select whichever result happens to be first.
      if (rect.height <= 72 && text.length <= 220) context = parent;
    }
    return context;
  }

  function securityPrefixFromResult(element) {
    let scope = element;
    for (let depth = 0; depth < 6 && scope; depth += 1, scope = scope.parentElement) {
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      const tokens = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        tokens.push(...compactText(node.nodeValue).toUpperCase().split(/\s+/).filter(Boolean));
      }
      for (let index = 0; index < tokens.length - 2; index += 1) {
        if (tokens[index] !== "EQ") continue;
        const ticker = tokens[index + 1]?.replace(/[^A-Z0-9./-]/g, "");
        const venue = tokens[index + 2]?.replace(/[^A-Z0-9]/g, "");
        if (ticker && venue === "US") return core.canonicalSecurityPrefix(`${ticker} ${venue} EQ`);
      }
    }
    throw new Error("Godel result did not expose a canonical security identifier");
  }

  function securityResultRows(input, query) {
    const inputRect = input.getBoundingClientRect();
    const words = normalizedWords(query);
    const matching = [...document.querySelectorAll("[role='option'],[role='row'],li,button,span,div,p")].filter(element => {
      if (!visible(element) || element === input) return false;
      const rect = element.getBoundingClientRect();
      if (rect.top < inputRect.bottom - 8 || rect.top > inputRect.bottom + 650) return false;
      if (rect.right < inputRect.left - 50 || rect.left > inputRect.right + 850) return false;
      const textWords = normalizedWords(element.textContent);
      return words.every(word => textWords.includes(word));
    });

    // Godel instrument results are rendered like
    // "EQ LNTH US Lantheus Holdings Inc (US Composite)". Only an instrument
    // result can give us a canonical tradable identifier. This also excludes
    // matching company names, news stories and ordinary widgets elsewhere on
    // the workspace (such as a Market Halts row).
    const compositeContainers = matching.filter(element => /US\s*Composite/i.test(compactText(element.textContent)));
    const usComposite = compositeContainers.sort((a, b) => {
      const textDelta = compactText(a.textContent).length - compactText(b.textContent).length;
      if (textDelta) return textDelta;
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return (ar.width * ar.height) - (br.width * br.height);
    }).slice(0, 1);
    const leafMatches = matching.filter(element => ![...element.children].some(child =>
      visible(child) && words.every(word => normalizedWords(child.textContent).includes(word))));
    const instruments = leafMatches.filter(element => /^EQ\s*\S+\s*\S+/i.test(compactText(element.textContent)));
    const hits = usComposite.length ? usComposite : instruments;

    const rows = hits.map(hit => {
      const row = shallowResultContext(hit);
      return { hit, row, text: compactText(row.textContent) };
    });

    const unique = [];
    for (const candidate of rows) {
      const rect = candidate.hit.getBoundingClientRect();
      const key = `${candidate.text.toLowerCase()}|${Math.round(rect.top)}`;
      if (!unique.some(item => item.key === key)) unique.push({ ...candidate, key });
    }
    return unique;
  }

  async function resolveSecurityInGodel(input, query) {
    toast(`Godel Voice: resolving ${query}`);
    await replaceText(input, query);
    const candidates = await waitUntil(() => {
      const rows = securityResultRows(input, query);
      return rows.length ? rows : null;
    }, `Godel security results for ${query}`, 7000);

    const distinct = [...new Map(candidates.map(candidate => {
      const rect = candidate.hit.getBoundingClientRect();
      return [`${candidate.text.toLowerCase()}|${Math.round(rect.top)}`, candidate];
    })).values()];
    if (distinct.length !== 1) {
      const choices = distinct.slice(0, 4).map(candidate => candidate.text).join(" | ");
      throw new Error(`Multiple Godel matches for “${query}”: ${choices}`);
    }
    // The result already contains Godel's canonical EQ/ticker/venue tokens.
    // Clicking it opens the default instrument view rather than filling the
    // command bar, so parse the verified result and keep the command bar open.
    return securityPrefixFromResult(distinct[0].hit);
  }

  async function chooseTicker(input, ticker) {
    const symbol = String(ticker).trim().toUpperCase().split(/\s+/)[0];
    const panel = input.closest(".resize.inline-block.absolute") ?? input.parentElement ?? document;
    const scope = input.parentElement;
    await focusAndInsert(input, symbol);
    const result = await waitUntil(() => {
      if (!scope) return null;
      const dropdowns = [...scope.children].filter(element =>
        element !== input && element instanceof HTMLElement && visible(element));
      for (const dropdown of dropdowns) {
        const row = [...dropdown.children].find(element => {
          if (!(element instanceof HTMLElement) || !visible(element)) return false;
          const words = compactText(element.textContent).toUpperCase().split(/\s+/);
          return words[0] === symbol && words[1] === "US";
        });
        if (row) return row;
      }
      return null;
    }, `${symbol} US company result`, 8000);
    await click(result);
    await waitUntil(() => {
      if (!input.isConnected) return true;
      return [...panel.querySelectorAll("button,[role='button']")].some(element =>
        visible(element) && compactText(element.textContent).toUpperCase() === symbol);
    }, `${symbol} company added`, 8000);
  }

  async function executeGF(panel, action, plan, terminalCommand) {
    const feature = action.feature;
    const value = String(action.value ?? "");
    const primarySecurity = String(terminalCommand ?? "").trim().toUpperCase().split(/\s+/)[0];
    const securityPayload = /^[A-Z0-9./-]{1,16}$/.test(primarySecurity) && !["CONTEXT", "GF"].includes(primarySecurity)
      ? { security: primarySecurity } : {};
    if (feature === "add company") {
      const symbol = value.trim().toUpperCase().split(/\s+/)[0];
      await panelInternalAction(panel, "GF", "addCompany", { symbol, ...securityPayload });
      return;
    }
    if (["add metric", "ratio metric", "margin metric"].includes(feature)) {
      const metricKeys = {
        "REVENUE": "revenue",
        "GROSS MARGIN": "gross_margin",
        "OPERATING MARGIN": "operating_margin",
        "NET MARGIN": "net_margin",
        "NET INCOME MARGIN": "net_margin",
        "R&D AS % OF REVENUE": "rd_revenue",
        "SG&A AS % OF REVENUE": "sga_revenue",
        "RETURN ON EQUITY": "roe",
        "P/E": "pe",
        "P/S": "ps",
        "P/B": "pb",
        "P/CF": "pcf"
      };
      const metricKey = metricKeys[value.toUpperCase()];
      if (!metricKey) throw new Error(`Direct GF metric ${value} is not supported`);
      const keepDefaultRevenue = plan.actions.some(item =>
        ["add metric", "ratio metric", "margin metric"].includes(item.feature)
        && String(item.value).toUpperCase() === "REVENUE");
      const loadedCompanies = [...panel.querySelectorAll("button,[role='button']")]
        .map(element => compactText(element.getAttribute("aria-label")))
        .map(label => /^Add metric for ([A-Z0-9./-]{1,16})$/.exec(label)?.[1] ?? null)
        .filter(Boolean);
      const explicitCompanies = plan.actions
        .filter(item => item.feature === "add company")
        .map(item => String(item.value).trim().toUpperCase().split(/\s+/)[0])
        .filter(symbol => /^[A-Z0-9./-]{1,16}$/.test(symbol));
      const terminalCompany = String(terminalCommand ?? "").trim().toUpperCase().split(/\s+/)[0];
      const fallbackCompanies = /^[A-Z0-9./-]{1,16}$/.test(terminalCompany)
        && !["CONTEXT", "GF"].includes(terminalCompany) ? [terminalCompany] : [];
      const companies = [...loadedCompanies, ...explicitCompanies, ...(loadedCompanies.length ? [] : fallbackCompanies)];
      if (!companies.length) throw new Error("Godel GF loaded companies are unavailable");
      for (const company of [...new Set(companies)]) {
        const symbol = company.toUpperCase();
        let added = false;
        for (let attempt = 0; attempt < 24; attempt += 1) {
          try {
            await panelInternalAction(panel, "GF", "addMetric", {
              symbol, metricKey, keepDefaultRevenue, ...securityPayload
            });
            added = true;
            break;
          } catch (error) {
            if (!/company .* is not loaded/i.test(String(error.message)) || attempt === 23) throw error;
            // A delayed GF render can restore the primary-series snapshot
            // after a peer was visibly added. Re-add only peers explicitly
            // named in this authenticated plan, then resume the exact metric.
            if (explicitCompanies.includes(symbol)) {
              await panelInternalAction(panel, "GF", "addCompany", {
                symbol, ...securityPayload
              });
            }
            await pause(250);
          }
        }
        if (!added) throw new Error(`Godel company ${symbol} did not finish loading`);
      }
      return;
    }
    if (feature === "include consensus estimates") {
      const desired = ["on", "true", "yes"].includes(value.toLowerCase());
      await panelInternalAction(panel, "GF", "setEstimates", { value: desired, ...securityPayload });
      return;
    }
    if (feature === "range") {
      const canonical = value.toUpperCase() === "MAX" ? "Max" : value.toUpperCase();
      if (!["1Y", "3Y", "5Y", "10Y", "Max"].includes(canonical)) throw new Error("Unsupported GF range");
      await panelInternalAction(panel, "GF", "setRange", { value: canonical, ...securityPayload });
      return;
    }
    if (feature === "periodicity") {
      await panelInternalAction(panel, "GF", "setPeriodicity", { value, ...securityPayload });
      return;
    }
    if (feature === "layout") {
      await panelInternalAction(panel, "GF", "setLayout", { value, ...securityPayload });
      return;
    }
    if (feature === "display currency") {
      await panelInternalAction(panel, "GF", "setDisplayCurrency", { value, ...securityPayload });
      return;
    }
    return clickExact(panel, value);
  }

  function orderedGFActions(actions = []) {
    const metrics = actions.filter(action =>
      ["add metric", "ratio metric", "margin metric"].includes(action.feature));
    const companies = actions.filter(action => action.feature === "add company");
    if (!metrics.length || !companies.length) return actions;
    const controls = actions.filter(action => !metrics.includes(action) && !companies.includes(action));
    // Godel's metric builder commits the series snapshot it opened with. Set
    // the primary company's metrics first, add peers, then replay the metrics
    // so only the newly-added peer series need mutation. This prevents a stale
    // primary-company modal from erasing peers that were just added.
    return [...controls, ...metrics, ...companies, ...metrics];
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

  function haltTabControl(panel, value) {
    const wanted = String(value).trim().toLowerCase();
    const candidates = [...panel.querySelectorAll("[role='tab'],button")].filter(element =>
      visible(element) && compactText(element.textContent).toLowerCase() === wanted);
    return candidates.length === 1 ? candidates[0] : null;
  }

  function haltTabSelected(element) {
    if (!element) return false;
    if (element.getAttribute("aria-selected") === "true" || element.getAttribute("aria-pressed") === "true") return true;
    if (["active", "selected", "on"].includes(String(element.getAttribute("data-state") ?? "").toLowerCase())) return true;
    if (element.getAttribute("data-active") === "true" || element.getAttribute("data-selected") === "true") return true;
    const tokens = String(element.className ?? "").toLowerCase().split(/\s+/);
    return tokens.some(token => /^(active|selected|is-active|is-selected)$/.test(token));
  }

  function haltTabMatchesData(panel, value) {
    const text = compactText(panel.textContent);
    const total = Number(text.match(/Total:\s*(\d+)/i)?.[1]);
    const active = Number(text.match(/Active:\s*(\d+)/i)?.[1]);
    if (!Number.isInteger(total) || !Number.isInteger(active)) return false;
    const rows = [...panel.querySelectorAll("table tr, [role='row']")].filter(row =>
      row.querySelector("td, [role='cell']"));
    const expected = value === "Active" ? active : value === "Resumed" ? total - active : total;
    return rows.length === expected;
  }

  function haltTabDiagnostic(panel, value) {
    const text = compactText(panel.textContent);
    const total = Number(text.match(/Total:\s*(\d+)/i)?.[1]);
    const active = Number(text.match(/Active:\s*(\d+)/i)?.[1]);
    const tableRows = panel.querySelectorAll("table tr").length;
    const roleRows = panel.querySelectorAll("[role='row']").length;
    const cellRows = [...panel.querySelectorAll("table tr, [role='row']")].filter(row =>
      row.querySelector("td, [role='cell']")).length;
    return `${value}; total=${total}; active=${active}; tableRows=${tableRows}; roleRows=${roleRows}; cellRows=${cellRows}`;
  }

  async function executeHALT(panel, action) {
    if (action.feature !== "tab" || action.operation !== "select") throw new Error("Unsupported HALT action");
    const canonical = { all: "All", active: "Active", resumed: "Resumed" }[String(action.value).trim().toLowerCase()];
    if (!canonical) throw new Error("Unsupported HALT tab");
    const tab = await waitFor(() => haltTabControl(panel, canonical), `HALT ${canonical} tab`);
    // Godel currently applies an `active` CSS token to controls that are not
    // the selected filter. Only the rendered data/counter relationship is a
    // trustworthy completion assertion.
    if (haltTabMatchesData(panel, canonical)) return;
    await click(tab);
    await waitUntil(() => haltTabControl(panel, canonical) && haltTabMatchesData(panel, canonical),
      `HALT ${canonical} selected (${haltTabDiagnostic(panel, canonical)})`, 4000);
  }

  function hmapViewControl(panel, value) {
    const wanted = String(value).trim().toLowerCase();
    const candidates = [...panel.querySelectorAll("button,[role='tab']")].filter(element =>
      visible(element) && compactText(element.textContent).toLowerCase() === wanted);
    return candidates.length === 1 ? candidates[0] : null;
  }

  function hmapTableVisible(panel) {
    const tables = [...panel.querySelectorAll("table,[role='table'],[role='grid']")].filter(visible);
    return tables.some(table => {
      const headings = compactText([...table.querySelectorAll("th,[role='columnheader']")]
        .map(element => element.textContent).join(" ")).toLowerCase();
      return headings.includes("ticker")
        && (headings.includes("last") || headings.includes("price"))
        && headings.includes("change")
        && headings.includes("volume");
    });
  }

  function hmapMapVisible(panel) {
    if (hmapTableVisible(panel)) return false;
    const visuals = [...panel.querySelectorAll("canvas,svg,[class*='heatmap' i],[class*='treemap' i]")].filter(visible);
    return visuals.some(element => {
      const rect = element.getBoundingClientRect();
      return rect.width >= 240 && rect.height >= 140;
    });
  }

  function hmapViewMatches(panel, value) {
    return value === "Table" ? hmapTableVisible(panel) : hmapMapVisible(panel);
  }

  function hmapUniverseControls(panel) {
    return [...panel.querySelectorAll("button,[role='tab']")].filter(element =>
      visible(element) && ["S&P 500", "DJIA"].includes(compactText(element.textContent)));
  }

  function hmapUniverseControl(panel, value) {
    const candidates = hmapUniverseControls(panel).filter(element => compactText(element.textContent) === value);
    return candidates.length === 1 ? candidates[0] : null;
  }

  function hmapControlSelected(panel, control) {
    const semantic = [control.getAttribute("aria-pressed"), control.getAttribute("aria-selected"), control.getAttribute("data-selected")]
      .some(value => String(value).toLowerCase() === "true")
      || /(?:^|\s)(?:active|selected|checked)(?:\s|$)/i.test(`${control.className ?? ""} ${control.getAttribute("data-state") ?? ""}`)
      || control.matches(":checked");
    if (semantic) return true;
    const peer = hmapUniverseControls(panel).find(candidate => candidate !== control);
    if (!peer) return false;
    const style = getComputedStyle(control);
    const peerStyle = getComputedStyle(peer);
    return ["backgroundColor", "borderColor", "color"].some(key => style[key] !== peerStyle[key]);
  }

  function hmapMemberCount(panel) {
    const local = [...compactText(panel.textContent).matchAll(/\b(\d{1,4}) members\b/gi)].map(match => Number(match[1]));
    if (local.length === 1) return local[0];
    const panelRect = panel.getBoundingClientRect();
    const spatial = [...document.querySelectorAll("span,div,p")].filter(element => {
      if (!visible(element) || !/^\d{1,4} members$/i.test(compactText(element.textContent))) return false;
      if ([...element.children].some(child => /^\d{1,4} members$/i.test(compactText(child.textContent)))) return false;
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      return centerX >= panelRect.left && centerX <= panelRect.right && centerY >= panelRect.top && centerY <= panelRect.bottom;
    }).map(element => Number(compactText(element.textContent).match(/\d{1,4}/)?.[0]));
    const matches = [...new Set([...local, ...spatial].filter(Number.isInteger))];
    return matches.length === 1 ? matches[0] : null;
  }

  function hmapHash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function hmapTileSignature(panel) {
    if (hmapTableVisible(panel)) {
      const table = [...panel.querySelectorAll("table,[role='table'],[role='grid']")].filter(visible)[0];
      const rows = [...table.querySelectorAll("tr,[role='row']")].map(row => compactText(row.textContent)).filter(Boolean);
      return rows.length >= 2 ? `table:${hmapHash(rows.join("|"))}` : null;
    }
    const visuals = [...panel.querySelectorAll("canvas,svg,[class*='heatmap' i],[class*='treemap' i]")]
      .filter(visible)
      .map(element => ({ element, rect: element.getBoundingClientRect() }))
      .filter(item => item.rect.width >= 240 && item.rect.height >= 140)
      .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
    const visual = visuals[0]?.element;
    if (!visual) return null;
    let payload = "";
    try {
      payload = visual instanceof HTMLCanvasElement ? visual.toDataURL() : visual.outerHTML;
    } catch {
      payload = `${visual.tagName}:${compactText(visual.textContent)}:${visual.childElementCount}`;
    }
    return payload.length >= 32 ? `map:${hmapHash(payload)}` : null;
  }

  function hmapUniverseSnapshot(panel, value) {
    const control = hmapUniverseControl(panel, value);
    const count = hmapMemberCount(panel);
    const countMatches = value === "DJIA" ? count === 30 : Number.isInteger(count) && count >= 500 && count <= 505;
    return { control, count, selected: Boolean(control && hmapControlSelected(panel, control)), signature: hmapTileSignature(panel), countMatches };
  }

  function hmapUniverseMatches(panel, value) {
    const snapshot = hmapUniverseSnapshot(panel, value);
    return Boolean(snapshot.control && snapshot.countMatches);
  }

  async function executeHMAP(panel, action) {
    if (!["universe", "view"].includes(action.feature) || action.operation !== "select") {
      throw new Error("Unsupported HMAP action");
    }
    if (action.feature === "universe") {
      const canonical = { "s&p 500": "S&P 500", djia: "DJIA" }[String(action.value).trim().toLowerCase()];
      if (!canonical) throw new Error("Unsupported HMAP universe");
      const control = await waitFor(() => hmapUniverseControl(panel, canonical), `HMAP ${canonical} universe control`);
      if (hmapUniverseMatches(panel, canonical)) return;
      const before = hmapUniverseSnapshot(panel, canonical);
      if (!Number.isInteger(before.count) || before.countMatches) {
        throw new Error(`HMAP universe pre-state is not independently verifiable (count=${String(before.count)}; selected=${before.selected}; signature=${before.signature ?? "none"})`);
      }
      await click(control);
      await waitUntil(() => {
        const after = hmapUniverseSnapshot(panel, canonical);
        const signatureChanged = before.signature && after.signature ? after.signature !== before.signature : true;
        return after.countMatches && after.count !== before.count && signatureChanged;
      }, `HMAP ${canonical} authoritative changed member count and changed tile signature when available`, 5000);
      return;
    }
    const canonical = { map: "Map", table: "Table" }[String(action.value).trim().toLowerCase()];
    if (!canonical) throw new Error("Unsupported HMAP view");
    const control = await waitFor(() => hmapViewControl(panel, canonical), `HMAP ${canonical} control`);
    if (hmapViewMatches(panel, canonical)) return;
    await click(control);
    await waitUntil(() => hmapViewMatches(panel, canonical), `HMAP ${canonical} view`, 5000);
  }

  async function executeEM(panel, action) {
    if (action.feature === "valuation" && action.operation === "read") {
      await panelInternalAction(panel, "EM", "readValuation", action.value);
      return;
    }
    if (action.feature !== "metric" || action.operation !== "select") {
      throw new Error("Unsupported EM action");
    }
    const aliases = {
      sales: "Sales", revenue: "Sales", ebitda: "EBITDA",
      "net income": "Net Income", "net income (bfng)": "Net Income",
      eps: "EPS (GAAP)", "eps (gaap)": "EPS (GAAP)",
      "total assets": "Total Assets", "current assets": "Current Assets",
      "current liabilities": "Current Liabilities", "shareholder equity": "Shareholder Equity",
      cfo: "Cash Flow From Operations", "cash flow from operations": "Cash Flow From Operations",
      cfi: "Cash Flow From Investing", "cash flow from investing": "Cash Flow From Investing",
      cff: "Cash Flow From Financing", "cash flow from financing": "Cash Flow From Financing",
      "net revenue": "Net Revenue", "gross revenue": "Gross Revenue"
    };
    const canonical = aliases[String(action.value ?? "").trim().toLowerCase()];
    if (!canonical) throw new Error(`Unsupported EM metric: ${action.value}`);
    await panelInternalAction(panel, "EM", "selectMetric", { value: canonical });
  }

  async function executeIMAP(panel, action) {
    await panelInternalAction(panel, "IMAP", action, {});
  }

  async function executeMOST(panel, action) {
    if (action.feature !== "results" || action.operation !== "select") {
      throw new Error("Unsupported MOST action");
    }
    const count = Number(action.value);
    if (![10, 25, 50, 100].includes(count)) throw new Error("Unsupported MOST result count");
    await panelInternalAction(panel, "MOST", "selectResultCount", { value: count });
  }

  async function executeOMON(panel, action) {
    if (action.feature !== "strike depth" || action.operation !== "set") {
      throw new Error("OMON currently supports only native strike depth");
    }
    await panelInternalAction(panel, "OMON", "setStrikeDepth", { value: Number(action.value) });
  }

  async function executeNews(panel, action) {
    if (action.feature !== "query" || action.operation !== "set") {
      throw new Error("News currently supports only an exact per-window query");
    }
    const query = String(action.value ?? "").replace(/\s+/g, " ").trim();
    if (!query || query.length > 200 || /[\r\n]/.test(query)) throw new Error("Invalid News exact query");
    await panelInternalAction(panel, "N", "setQuery", { value: query });
  }

  async function executeHDS(panel, action) {
    if (action.feature !== "view" || action.operation !== "select") {
      throw new Error("Unsupported HDS action");
    }
    const canonical = { table: "Table", treemap: "Treemap", bubble: "Bubble" }[
      String(action.value ?? "").trim().toLowerCase()
    ];
    if (!canonical) throw new Error("Unsupported HDS view");
    await panelInternalAction(panel, "HDS", "selectView", { value: canonical });
  }

  function eqsFilterControls(panel) {
    return [...panel.querySelectorAll("button,[role='button']")].filter(element =>
      visible(element) && (/^(?:×\s*)?remove filter$/i.test(compactText(element.textContent))
        || /\bremove filter\b/i.test([element.getAttribute("aria-label"), element.getAttribute("title")].filter(Boolean).join(" "))));
  }

  function eqsResultsReady(panel) {
    return [...panel.querySelectorAll("table,[role='table'],[role='grid']")].filter(visible).some(table => {
      const headings = compactText([...table.querySelectorAll("th,[role='columnheader']")]
        .map(element => element.textContent).join(" ")).toLowerCase();
      const rows = [...table.querySelectorAll("tr,[role='row']")].filter(row => row.querySelector("td,[role='cell'],[role='gridcell']"));
      return headings.includes("ticker") && headings.includes("name") && headings.includes("last") && rows.length > 0;
    });
  }

  const EQS_RANGE_FIELDS = new Set([
    "Market Cap (USD)", "P/E (Fwd)", "P/E (TTM)", "P/S (Fwd)", "P/S (TTM)",
    "P/B (Fwd)", "P/B (TTM)", "P/CF (Fwd)", "P/CF (TTM)", "EPS (Fwd 12mo)",
    "Rev. (TTM, USD)", "Rev. (Fwd 12mo, USD)",
    "Net Inc. (TTM, USD)", "Net Inc. (Fwd 12mo, USD)"
  ]);
  const EQS_FILTER_FIELDS = new Set([
    "Currency", "Venue", "HQ Country", "Sector", "Sub-Sector", "Market Cap (USD)",
    "Private Company", ...EQS_RANGE_FIELDS
  ]);
  const EQS_LIVE_LIST_VALUES = Object.freeze({
    Currency: Object.freeze({ USD: "US Dollar" }),
    "HQ Country": Object.freeze({ "United States": "United States" }),
    Sector: Object.freeze({ Technology: "Technology" })
  });
  const EQS_LIST_PROOF_LABELS = Object.freeze({
    Currency: Object.freeze(["USD", "CAD", "EUR", "GBP", "JPY", "CNY"]),
    Sector: Object.freeze(["Business Services", "Consumer Services", "Energy", "Finance", "Healthcare", "Industrials", "Technology", "Utilities"])
  });

  function eqsOpenFilterOption(field) {
    if (!EQS_FILTER_FIELDS.has(field)) return null;
    const wanted = field.toLowerCase();
    const candidates = [...document.querySelectorAll("[role='option'],button,div,span")].filter(element =>
      visible(element) && compactText(element.textContent).toLowerCase() === wanted);
    const proven = [];
    for (const candidate of candidates) {
      for (let menu = candidate.parentElement, depth = 0; menu && depth < 7; menu = menu.parentElement, depth += 1) {
        const labels = new Set([...menu.querySelectorAll("[role='option'],button,div,span")]
          .filter(visible).map(element => compactText(element.textContent)).filter(label => EQS_FILTER_FIELDS.has(label)));
        if (labels.size >= 8) {
          proven.push(candidate);
          break;
        }
      }
    }
    const leaves = [...new Set(proven)].filter(element =>
      !proven.some(other => other !== element && element.contains(other)));
    if (leaves.length !== 1) return null;
    const leaf = leaves[0];
    for (let hit = leaf, depth = 0; hit && depth < 5; hit = hit.parentElement, depth += 1) {
      if (hit.matches("button,[role='option'],[role='menuitem'],[tabindex]")
        && compactText(hit.textContent).toLowerCase() === wanted) return hit;
    }
    return leaf;
  }

  function eqsRangeEditor(panel, field) {
    const labels = [...panel.querySelectorAll("div,span,label")].filter(element =>
      visible(element) && compactText(element.textContent) === field);
    for (const label of labels) {
      for (let root = label.parentElement, depth = 0; root && root !== panel && depth < 7; root = root.parentElement, depth += 1) {
        const minimum = [...root.querySelectorAll("input")].find(input =>
          visible(input) && ["min", "minimum"].includes(compactText(input.getAttribute("placeholder")).toLowerCase()));
        const maximum = [...root.querySelectorAll("input")].find(input =>
          visible(input) && ["max", "maximum"].includes(compactText(input.getAttribute("placeholder")).toLowerCase()));
        const remove = [...root.querySelectorAll("button,[role='button']")].find(element =>
          /\bremove filter\b/i.test([element.getAttribute("aria-label"), element.getAttribute("title")].filter(Boolean).join(" ")));
        if (minimum && maximum && remove) return { root, minimum, maximum };
      }
    }
    return null;
  }

  async function ensureEQSRangeEditor(panel, field) {
    const existing = eqsRangeEditor(panel, field);
    if (existing) return existing;
    const add = await waitFor(() => exactText(panel, "+ Add filter"), "EQS Add filter control");
    await click(add);
    // Godel portals the filter menu outside the screener window. Address it
    // only after proving the unique candidate belongs to the full native
    // 20-field menu, rather than matching a result-table header elsewhere.
    const option = await waitFor(() => eqsOpenFilterOption(field), `EQS ${field} filter option`);
    await click(option);
    return waitFor(() => eqsRangeEditor(panel, field), `EQS ${field} range editor`, 4000);
  }

  async function executeEQSRangeFilter(panel, action) {
    if (action.feature !== "range_filter" || action.operation !== "add" || !action.value || typeof action.value !== "object") {
      throw new Error("Unsupported EQS range action");
    }
    const field = String(action.value.field ?? "").trim();
    if (!EQS_RANGE_FIELDS.has(field)) throw new Error("Unsupported EQS range field");
    const minimum = action.value.minimum == null ? null : Number(action.value.minimum);
    const maximum = action.value.maximum == null ? null : Number(action.value.maximum);
    if (minimum == null && maximum == null) throw new Error("EQS range requires a minimum or maximum");
    if ((minimum != null && !Number.isFinite(minimum)) || (maximum != null && !Number.isFinite(maximum))
      || (minimum != null && maximum != null && minimum > maximum)) throw new Error("Invalid EQS range bounds");
    const editor = await ensureEQSRangeEditor(panel, field);
    const wantedMinimum = minimum == null ? "" : String(minimum);
    const wantedMaximum = maximum == null ? "" : String(maximum);
    if (String(editor.minimum.value ?? "") !== wantedMinimum) await replaceText(editor.minimum, wantedMinimum);
    if (String(editor.maximum.value ?? "") !== wantedMaximum) await replaceText(editor.maximum, wantedMaximum);
    await waitUntil(() => {
      const current = eqsRangeEditor(panel, field);
      return current && String(current.minimum.value ?? "") === wantedMinimum
        && String(current.maximum.value ?? "") === wantedMaximum;
    }, `EQS ${field} range applied`, 4000);
  }

  function eqsListEditor(panel, field) {
    const labels = [...panel.querySelectorAll("div,span,label")].filter(element =>
      visible(element) && compactText(element.textContent) === field);
    const editors = [];
    for (const label of labels) {
      for (let root = label.parentElement, depth = 0; root && root !== panel && depth < 8; root = root.parentElement, depth += 1) {
        const remove = [...root.querySelectorAll("button,[role='button']")].find(element =>
          /\bremove filter\b/i.test([element.getAttribute("aria-label"), element.getAttribute("title")].filter(Boolean).join(" ")));
        const filterLabels = new Set([...root.querySelectorAll("div,span,label")].filter(visible)
          .map(element => compactText(element.textContent)).filter(text => EQS_FILTER_FIELDS.has(text)));
        if (remove && filterLabels.size === 1 && filterLabels.has(field)) {
          editors.push({ root, label, remove });
          break;
        }
      }
    }
    return editors.length === 1 ? editors[0] : null;
  }

  function eqsSelectedListChip(editor, displayLabel) {
    const candidates = [...editor.root.querySelectorAll("div,span")].filter(element =>
      visible(element) && compactText(element.textContent) === displayLabel);
    for (const candidate of candidates) {
      for (let root = candidate.parentElement, depth = 0; root && editor.root.contains(root) && depth < 4; root = root.parentElement, depth += 1) {
        const chipRemove = [...root.querySelectorAll("button,[role='button']")].find(button => {
          if (!visible(button) || compactText(button.textContent) !== "×") return false;
          return !/\bremove filter\b/i.test([button.getAttribute("aria-label"), button.getAttribute("title")].filter(Boolean).join(" "));
        });
        if (chipRemove) return candidate;
      }
    }
    return null;
  }

  function eqsListOption(editor, field, optionLabel) {
    const proof = new Set([...editor.root.querySelectorAll("div,span,[role='option'],button")]
      .filter(visible).map(element => compactText(element.textContent)));
    if (!(EQS_LIST_PROOF_LABELS[field] ?? []).every(label => proof.has(label))) return null;
    const candidates = [...editor.root.querySelectorAll("[role='option'],button,div,span")].filter(element =>
      visible(element) && compactText(element.textContent) === optionLabel);
    const leaves = candidates.filter(element => !candidates.some(other => other !== element && element.contains(other)));
    return leaves.length === 1 ? leaves[0] : null;
  }

  async function ensureEQSListEditor(panel, field) {
    const existing = eqsListEditor(panel, field);
    if (existing) return existing;
    const add = await waitFor(() => exactText(panel, "+ Add filter"), "EQS Add filter control");
    await click(add);
    const option = await waitFor(() => eqsOpenFilterOption(field), `EQS ${field} filter option`);
    await click(option);
    return waitFor(() => eqsListEditor(panel, field), `EQS ${field} list editor`, 4000);
  }

  async function executeEQSListFilter(panel, action) {
    if (action.feature !== "list_filter" || action.operation !== "add" || !action.value || typeof action.value !== "object"
      || !Array.isArray(action.value.items) || action.value.items.length !== 1) {
      throw new Error("Unsupported EQS list action");
    }
    const field = String(action.value.field ?? "").trim();
    const requested = String(action.value.items[0] ?? "").trim();
    const allowed = EQS_LIVE_LIST_VALUES[field];
    const canonical = allowed && Object.keys(allowed).find(value => value.toLowerCase() === requested.toLowerCase());
    if (!canonical) throw new Error(`Unsupported EQS ${field || "list"} value`);
    const displayLabel = allowed[canonical];
    let editor = await ensureEQSListEditor(panel, field);
    if (eqsSelectedListChip(editor, displayLabel)) return;
    let option = eqsListOption(editor, field, canonical);
    if (!option) {
      const trigger = exactText(editor.root, "— select —") ?? exactText(editor.root, displayLabel);
      if (!trigger) throw new Error(`EQS ${field} selector is not addressable`);
      await click(trigger);
    }
    option = await waitFor(() => {
      editor = eqsListEditor(panel, field) ?? editor;
      return eqsListOption(editor, field, canonical);
    }, `EQS ${field} ${canonical} option`, 4000);
    // Godel's Sector popover sometimes closes a coordinate-click without
    // committing the option. Its native searchable selector commits the exact
    // single remaining option on Enter and is independently verified below.
    if (field === "Sector") {
      const search = [...editor.root.querySelectorAll("input")].find(input =>
        visible(input) && compactText(input.getAttribute("placeholder")).toLowerCase() === "search...");
      if (!search) throw new Error("EQS Sector search control is unavailable");
      await replaceText(search, canonical);
      await waitFor(() => {
        editor = eqsListEditor(panel, field) ?? editor;
        return [...editor.root.querySelectorAll("div,span,[role='option']")].some(element =>
          visible(element) && compactText(element.textContent) === canonical);
      }, "EQS Sector exact search result", 2500);
      await press("Enter");
    } else {
      await click(option);
    }
    await waitUntil(() => {
      const current = eqsListEditor(panel, field);
      return current && Boolean(eqsSelectedListChip(current, displayLabel));
    }, `EQS ${field} ${canonical} selected`, 4000);
  }

  async function executeEQS(panel, action) {
    if (action.feature === "range_filter") return executeEQSRangeFilter(panel, action);
    if (action.feature === "list_filter") return executeEQSListFilter(panel, action);
    if (action.feature !== "screen" || !["run", "clear"].includes(action.operation) || action.value != null) {
      throw new Error("Unsupported EQS action");
    }
    if (action.operation === "clear" && eqsFilterControls(panel).length === 0) return;
    const label = action.operation === "run" ? "Run" : "Clear";
    const control = await waitFor(() => exactText(panel, label, "button,[role='button']"), `EQS ${label} control`);
    let panelMutated = false;
    const observer = new MutationObserver(() => { panelMutated = true; });
    observer.observe(panel, { childList: true, subtree: true, attributes: true, characterData: true });
    try {
      await click(control);
      if (action.operation === "clear") {
        await waitUntil(() => eqsFilterControls(panel).length === 0, "EQS filters cleared", 5000);
      } else {
        await waitUntil(() => panelMutated && eqsResultsReady(panel), "EQS fresh results rendered", 8000);
      }
    } finally {
      observer.disconnect();
    }
  }

  const SECF_TABS = new Set(["All", "Equities", "Corporate Bonds", "Options", "Sovereign Bonds", "Crypto", "Index", "Futures", "Forex", "People"]);
  const SECF_CAPS = new Set([50, 100, 250, 500]);

  function secfTable(panel) {
    const tables = [...panel.querySelectorAll("table,[role='table'],[role='grid']")].filter(visible).filter(table => {
      const headers = new Set([...table.querySelectorAll("th,[role='columnheader']")].map(element => compactText(element.textContent)));
      return headers.has("Name") && (headers.has("Ticker") || headers.has("Company"));
    });
    return tables.length === 1 ? tables[0] : null;
  }

  function secfRows(table) {
    return [...table.querySelectorAll("tr,[role='row']")].filter(row =>
      visible(row) && row.querySelector("td,[role='cell'],[role='gridcell']"));
  }

  function secfSignature(table) {
    return secfRows(table).slice(0, 12).map(row => compactText(row.textContent)).join("|");
  }

  function secfPeopleRendered(panel, max) {
    const table = secfTable(panel);
    if (!table) return false;
    const headers = new Set([...table.querySelectorAll("th,[role='columnheader']")].map(element => compactText(element.textContent)));
    const exactPeopleHeaders = ["Name", "Company", "Position", "Email", "Phone"].every(header => headers.has(header));
    return exactPeopleHeaders && !headers.has("Ticker") && !headers.has("Venue") && secfRows(table).length <= max;
  }

  function secfTab(panel, tab) {
    if (!SECF_TABS.has(tab)) return null;
    const allLabels = new Set([...panel.querySelectorAll("div,span,button,[role='tab']")].filter(visible)
      .map(element => compactText(element.textContent)).filter(text => SECF_TABS.has(text)));
    if (allLabels.size !== SECF_TABS.size) return null;
    const candidates = [...panel.querySelectorAll("[role='tab'],button,div,span")].filter(element =>
      visible(element) && compactText(element.textContent) === tab);
    const leaves = candidates.filter(element => !candidates.some(other => other !== element && element.contains(other)));
    return leaves.length === 1 ? leaves[0] : null;
  }

  function secfMaxSelect(panel) {
    const selects = [...panel.querySelectorAll("select")].filter(visible).filter(select => {
      const values = new Set([...select.options].map(option => Number(String(option.value ?? option.textContent).match(/\d+/)?.[0])));
      return [...SECF_CAPS].every(value => values.has(value));
    });
    return selects.length === 1 ? selects[0] : null;
  }

  async function executeSECF(panel, action) {
    if (action.feature !== "search" || action.operation !== "configure" || !action.value || typeof action.value !== "object") {
      throw new Error("Unsupported SECF action");
    }
    const value = action.value;
    const query = String(value.query ?? "").replace(/\s+/g, " ").trim();
    const max = Number(value.max);
    if (query.length > 200 || /[\r\n\u0000-\u001f\u007f]/.test(query) || value.tab !== "People" || !SECF_CAPS.has(max)
      || !Array.isArray(value.venues) || value.venues.length || !Array.isArray(value.countries) || value.countries.length
      || value.hide_no_trade !== false) {
      throw new Error("SECF live executor permits only People searches without venue, country, or no-trade filters");
    }
    const input = [...panel.querySelectorAll("input")].filter(visible).find(element =>
      compactText(element.getAttribute("placeholder")).toLowerCase() === "enter a search term...");
    if (!input) throw new Error("SECF exact search input is unavailable");
    const previousQuery = String(input.value ?? "").replace(/\s+/g, " ").trim();
    const previousTable = secfTable(panel);
    const previousSignature = previousTable ? secfSignature(previousTable) : "";

    if (!secfPeopleRendered(panel, max)) {
      const tab = secfTab(panel, "People");
      if (!tab) throw new Error("SECF exact People tab is unavailable");
      await click(tab);
      await waitUntil(() => secfPeopleRendered(panel, max), "SECF People result schema", 5000);
    }

    const select = secfMaxSelect(panel);
    if (!select) throw new Error("SECF exact result-cap selector is unavailable");
    const option = [...select.options].find(candidate =>
      Number(String(candidate.value ?? candidate.textContent).match(/\d+/)?.[0]) === max);
    if (!option) throw new Error(`SECF max ${max} is unavailable`);
    if (select.selectedOptions?.[0] !== option) {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      if (typeof setter !== "function") throw new Error("SECF native result-cap setter unavailable");
      setter.call(select, option.value);
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await waitUntil(() => secfMaxSelect(panel)?.selectedOptions?.[0]?.value === option.value, `SECF max ${max} selected`, 4000);
    }

    if (previousQuery !== query) await replaceText(input, query);
    await waitUntil(() => {
      const currentInput = [...panel.querySelectorAll("input")].find(element =>
        visible(element) && compactText(element.getAttribute("placeholder")).toLowerCase() === "enter a search term...");
      const table = secfTable(panel);
      const queryMatches = String(currentInput?.value ?? "").replace(/\s+/g, " ").trim() === query;
      const changed = previousQuery === query || (table && secfSignature(table) !== previousSignature);
      return queryMatches && changed && secfPeopleRendered(panel, max);
    }, "SECF completed bounded People results", 8000);
  }

  const G_INTERVAL_LABELS = new Map([
    ["1 minute", "1m"], ["1 min", "1m"], ["5 minutes", "5m"], ["5 min", "5m"],
    ["15 minutes", "15m"], ["15 min", "15m"], ["30 minutes", "30m"], ["30 min", "30m"],
    ["1 hour", "1h"], ["1 h", "1h"], ["1 day", "1d"], ["1 d", "1d"]
  ]);

  function gFrameElementVisible(element, view) {
    if (!element || !view) return false;
    const rect = element.getBoundingClientRect();
    const style = view.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function gSemanticLabel(element) {
    return compactText(element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent).toLowerCase();
  }

  function gChartFrameContext(panel) {
    const matches = [];
    for (const frame of [...panel.querySelectorAll("iframe")].filter(visible)) {
      let doc;
      try { doc = frame.contentDocument; } catch { continue; }
      const view = doc?.defaultView;
      if (!doc || !view) continue;
      const popupCandidates = [...doc.querySelectorAll("button[aria-haspopup],[role='button'][aria-haspopup]")]
        .filter(element => gFrameElementVisible(element, view))
        .map(element => ({ element, interval: G_INTERVAL_LABELS.get(gSemanticLabel(element)) }))
        .filter(item => item.interval);
      const chartCandidates = [...doc.querySelectorAll("[aria-label^='Chart for '],img[alt^='Chart for ']")]
        .filter(element => gFrameElementVisible(element, view))
        .map(element => ({ element, label: compactText(element.getAttribute("aria-label") || element.getAttribute("alt")) }))
        .filter(item => /^Chart for [^,]+, (?:1 minute|5 minutes|15 minutes|30 minutes|1 hour|1 day)$/i.test(item.label));
      if (popupCandidates.length !== 1 || chartCandidates.length !== 1) continue;
      const popup = popupCandidates[0];
      const chart = chartCandidates[0];
      const chartInterval = G_INTERVAL_LABELS.get(chart.label.toLowerCase().split(", ").at(-1));
      if (chartInterval !== popup.interval) continue;
      matches.push({ frame, popup: popup.element, chart: chart.element, interval: popup.interval, chartLabel: chart.label });
    }
    return matches.length === 1 ? matches[0] : null;
  }

  function gChartViewportRect(context) {
    const frameRect = context.frame.getBoundingClientRect();
    const chartRect = context.chart.getBoundingClientRect();
    return {
      x: frameRect.left + chartRect.left,
      y: frameRect.top + chartRect.top,
      width: chartRect.width,
      height: chartRect.height
    };
  }

  async function executeG(panel, action) {
    if (action.feature !== "resolution" || action.operation !== "select" || action.value !== "1h") {
      throw new Error("G live executor permits only the independently proven 1h contextual resolution");
    }
    const initial = await waitFor(() => gChartFrameContext(panel), "authenticated G chart interval control", 5000);
    if (initial.interval === "1h" && /, 1 hour$/i.test(initial.chartLabel)) return;
    await cdp("click", { rect: gChartViewportRect(initial) });
    await trustedType("60");
    await press("Enter");
    await waitUntil(() => {
      const current = gChartFrameContext(panel);
      return current?.interval === "1h" && /, 1 hour$/i.test(current.chartLabel);
    }, "G 1 hour popup and chart label", 6000);
  }

  const TRAN_STOP_WORDS = new Set(["a", "an", "and", "are", "for", "from", "in", "is", "of", "on", "or", "the", "to", "was", "were", "with"]);

  function tranRowCells(row) {
    return [...row.querySelectorAll("th,td,[role='columnheader'],[role='cell'],[role='gridcell']")]
      .map(cell => ({ element: cell, text: compactText(cell.textContent) }));
  }

  function tranEarningsRows(panel) {
    const matches = [];
    for (const table of panel.querySelectorAll("table,[role='table'],[role='grid']")) {
      const rows = [...table.querySelectorAll("tr,[role='row']")];
      const headerRow = rows.find(row => {
        const labels = tranRowCells(row).map(cell => cell.text);
        return labels.includes("Period") && labels.includes("Type") && labels.includes("Date");
      });
      if (!headerRow) continue;
      const headers = tranRowCells(headerRow).map(cell => cell.text);
      const periodIndex = headers.indexOf("Period");
      const typeIndex = headers.indexOf("Type");
      const dateIndex = headers.indexOf("Date");
      for (const row of rows) {
        if (row === headerRow) continue;
        const cells = tranRowCells(row);
        if (cells.length <= Math.max(periodIndex, typeIndex, dateIndex)) continue;
        const period = cells[periodIndex].text;
        const type = cells[typeIndex].text;
        const date = cells[dateIndex].text;
        if (!/^Q[1-4] \d{4}$/.test(period) || type !== "Earnings" || !date || date.length > 40) continue;
        matches.push({ table, row, clickTarget: cells[periodIndex].element, period, date });
      }
    }
    // Godel's virtualized transcript table is exposed accessibly as a table
    // but some builds render its rows as ordinary divs. Prove the same three
    // exact fields inside one compact DOM row instead of depending on tag names.
    if (!matches.length) {
      const periodNodes = [...panel.querySelectorAll("div,span,p,button,td")]
        .filter(element => /^Q[1-4] \d{4}$/.test(compactText(element.textContent)))
        .filter(element => ![...element.children].some(child => /^Q[1-4] \d{4}$/.test(compactText(child.textContent))));
      for (const periodNode of periodNodes) {
        const period = compactText(periodNode.textContent);
        let row = null;
        let date = null;
        for (let current = periodNode.parentElement, depth = 0; current && current !== panel.parentElement && depth < 7; current = current.parentElement, depth += 1) {
          const text = compactText(current.textContent);
          const dateMatch = /\b(?:\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})\b/.exec(text);
          if (text.length <= 180 && text.includes(period) && /\bEarnings\b/.test(text) && dateMatch) {
            row = current;
            date = dateMatch[0];
            break;
          }
        }
        if (row && date) matches.push({ table: null, row, clickTarget: periodNode, period, date });
      }
    }
    const topmost = element => {
      if (!visible(element)) return false;
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return Boolean(hit && (element === hit || element.contains(hit)));
    };
    const stackOrder = element => {
      const root = element.closest('[id$="-window"],.resize.inline-block.absolute,.react-grid-item,.grid-stack-item');
      return root ? Number.parseInt(getComputedStyle(root).zIndex, 10) || 0 : 0;
    };
    matches.sort((a, b) => stackOrder(b.clickTarget) - stackOrder(a.clickTarget)
      || Number(topmost(b.clickTarget)) - Number(topmost(a.clickTarget)));
    const unique = [];
    const periods = new Set();
    for (const match of matches) {
      if (periods.has(match.period)) continue;
      periods.add(match.period);
      unique.push(match);
    }
    return unique;
  }

  function tranReaderForPeriod(panel, period) {
    const heading = `${period} Earnings Conference Call`;
    const headings = [...panel.querySelectorAll("h1,h2,h3,h4,h5,h6,[role='heading'],div,span")]
      .filter(element => compactText(element.textContent) === heading)
      .filter(element => ![...element.children].some(child => compactText(child.textContent) === heading));
    const candidates = [];
    for (const node of headings) {
      for (let current = node, depth = 0; current && current !== panel.parentElement && depth < 12; current = current.parentElement, depth += 1) {
        const text = compactText(current.innerText ?? current.textContent);
        if (text.length >= 2000 && text.includes(heading) && text.includes("Final Transcript") && text.includes("Presentation")) {
          candidates.push({ element: current, length: text.length });
          break;
        }
      }
    }
    candidates.sort((a, b) => a.length - b.length);
    return candidates[0]?.element ?? null;
  }

  function tranTopicEvidence(text, topic) {
    const normalizedTopic = compactText(topic).toLowerCase();
    const conceptAliases = {
      "gpu availability": ["gpu availability", "gpu capacity", "gpu supply", "accelerator availability", "accelerator capacity", "capacity constraints", "compute capacity"],
      "backlog": ["backlog", "remaining performance obligations", "rpo"],
      "business agents": ["business agents", "ai agents for businesses", "business ai agents", "agents for businesses", "business messaging agents"]
    };
    const aliases = conceptAliases[normalizedTopic] ?? [normalizedTopic];
    const aliasPattern = alias => new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&").replace(/\\s+/g, "\\s+")}\\b`, "gi");
    const tokens = [...new Set(normalizedTopic.match(/[a-z0-9]+/g) ?? [])]
      .filter(token => token.length >= 3 && !TRAN_STOP_WORDS.has(token));
    const chunks = String(text).replace(/\r/g, "").split(/(?<=[.!?])\s+|\n{2,}/)
      .map(compactText).filter(chunk => chunk.length >= 24 && chunk.length <= 4000);
    const aliasAllowed = (chunk, alias) => {
      const value = chunk.toLowerCase();
      if (normalizedTopic === "gpu availability" && ["capacity constraints", "compute capacity"].includes(alias)) {
        return /\b(?:gpu|accelerator|chip|ai compute|trainium|ec2)\b/i.test(value);
      }
      if (normalizedTopic === "business agents" && alias === "agents for businesses") {
        return /\b(?:ai|artificial intelligence|automated|messaging|assistant)\b/i.test(value);
      }
      return true;
    };
    const matches = [];
    for (const chunk of chunks) {
      for (const alias of aliases) {
        if (!aliasAllowed(chunk, alias)) continue;
        const match = aliasPattern(alias).exec(chunk);
        if (!match) continue;
        matches.push({ chunk, index: match.index, length: match[0].length, rank: alias === normalizedTopic ? 0 : 1 });
        break;
      }
    }
    if (!matches.length && tokens.length) {
      for (const chunk of chunks) {
        const tokenMatches = tokens.map(token => new RegExp(`\\b${token}\\b`, "i").exec(chunk));
        if (tokenMatches.every(Boolean)) matches.push({ chunk, index: tokenMatches[0].index, length: tokenMatches[0][0].length, rank: 2 });
      }
    }
    matches.sort((a, b) => a.rank - b.rank);
    const excerpt = match => {
      if (match.chunk.length <= 240) return match.chunk;
      let start = Math.max(0, match.index - 100);
      if (start + 240 > match.chunk.length) start = Math.max(0, match.chunk.length - 240);
      const value = match.chunk.slice(start, start + 240).trim();
      return `${start ? "..." : ""}${value}${start + 240 < match.chunk.length ? "..." : ""}`;
    };
    return {
      mentions: Math.min(999, matches.length),
      passages: matches.slice(0, 2).map(excerpt)
    };
  }

  async function tranSelectPeriod(panel, period) {
    const rows = tranEarningsRows(panel).filter(item => item.period === period);
    if (rows.length !== 1) throw new Error(`TRAN could not prove one exact visible Earnings row for ${period}`);
    const target = rows[0].clickTarget;
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
    await pause(80);
    if (!visible(target)) throw new Error(`TRAN ${period} Earnings row is not visible`);
    await click(target);
    return waitUntil(() => tranReaderForPeriod(panel, period), `complete ${period} transcript reader`, 7000);
  }

  function tranCompany(panel, plan) {
    const security = terminalSecurity(plan?.terminal_command);
    if (security) return SECURITY_NAMES[security] ?? security;
    const input = [...panel.querySelectorAll("input")].find(element => /^[A-Z0-9.-]+\s+US$/i.test(String(element.value ?? "").trim()));
    return input ? String(input.value).trim().split(/\s+/)[0].toUpperCase() : "Company";
  }

  function tranPanelForPlan(plan) {
    const identity = terminalPanelIdentity(plan?.terminal_command);
    const exactValue = identity ? `${identity.security} ${identity.venue}` : null;
    const candidates = [...new Set([
      ...panelTitleNodes("TRAN").map(rootForTitle).filter(Boolean),
      ...windowRoots().filter(root => panelMatchesCommand(root, "TRAN"))
    ])];
    if (identity) {
      for (const input of document.querySelectorAll("input")) {
        if (String(input.value ?? "").trim().toUpperCase() !== exactValue) continue;
        for (let current = input.parentElement, depth = 0; current && depth < 18; current = current.parentElement, depth += 1) {
          const text = compactText(current.textContent);
          if (!text.includes("TRANSCRIPT HUB") || !text.includes("Final Transcript")
            || !/\bQ[1-4] \d{4}\b/.test(text) || !text.includes("Earnings")) continue;
          candidates.push(current);
        }
      }
    }
    const liveCandidates = [...new Set(candidates)].filter(root => root.isConnected
      && (compactText(root.textContent).includes("TRANSCRIPT HUB") || panelMatchesCommand(root, "TRAN")));
    const exact = identity ? liveCandidates.filter(root => [...root.querySelectorAll("input")]
      .some(input => String(input.value ?? "").trim().toUpperCase() === `${identity.security} ${identity.venue}`)) : liveCandidates;
    const resolved = (exact.length ? exact : liveCandidates).sort((a, b) => {
      const areaA = a.getBoundingClientRect().width * a.getBoundingClientRect().height;
      const areaB = b.getBoundingClientRect().width * b.getBoundingClientRect().height;
      if (areaA !== areaB) return areaA - areaB;
      return (Number.parseInt(getComputedStyle(b).zIndex, 10) || 0)
        - (Number.parseInt(getComputedStyle(a).zIndex, 10) || 0);
    })[0];
    if (resolved) return resolved;
    // Some Godel builds render the title bar and transcript body as React
    // siblings with no stable shared widget root. A document-scoped fallback
    // is safe only when exactly one visible TRAN title and one exact addressed
    // security input exist; multiple transcript panels remain fail-closed.
    if (identity) {
      const exactValue = `${identity.security} ${identity.venue}`;
      const exactInputs = [...document.querySelectorAll("input")].filter(input =>
        String(input.value ?? "").trim().toUpperCase() === exactValue);
      const rawTitles = [...document.querySelectorAll("div,span,h1,h2,h3,h4,h5,h6,[role='heading']")]
        .filter(element => compactText(element.textContent) === "TRANSCRIPT HUB");
      const titleLeaves = rawTitles.filter(element => !rawTitles.some(other => other !== element && element.contains(other)));
      const addressedTitles = titleLeaves.filter(title => {
        for (let current = title.parentElement, depth = 0; current && depth < 8; current = current.parentElement, depth += 1) {
          if ([...current.querySelectorAll("input")].some(input =>
            String(input.value ?? "").trim().toUpperCase() === exactValue)) return true;
        }
        return false;
      });
      const transcriptInputs = [...document.querySelectorAll("input")].filter(input => {
        for (let current = input.parentElement, depth = 0; current && depth < 8; current = current.parentElement, depth += 1) {
          if (compactText(current.textContent).includes("TRANSCRIPT HUB")) return true;
        }
        return false;
      });
      const titleTextElements = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (compactText(node.nodeValue) === "TRANSCRIPT HUB" && node.parentElement) titleTextElements.push(node.parentElement);
      }
      const allInputs = [...document.querySelectorAll("input")];
      const spatialValues = titleTextElements.map(title => {
        const titleRect = title.getBoundingClientRect();
        const nearby = allInputs.map(input => {
          const rect = input.getBoundingClientRect();
          const vertical = Math.abs((rect.top + rect.height / 2) - (titleRect.top + titleRect.height / 2));
          const horizontal = Math.abs((rect.left + rect.width / 2) - (titleRect.left + titleRect.width / 2));
          return { input, vertical, distance: vertical * 8 + horizontal };
        }).filter(item => item.vertical <= 80).sort((a, b) => a.distance - b.distance);
        return nearby[0] ? String(nearby[0].input.value ?? "").trim().toUpperCase() : null;
      });
      // Multiple restored TRAN panels are still safe when every exact title
      // is locally paired with the same addressed security.
      if (titleLeaves.length > 0 && addressedTitles.length === titleLeaves.length && exactInputs.length) return document.documentElement;
      if (transcriptInputs.length && transcriptInputs.every(input =>
        String(input.value ?? "").trim().toUpperCase() === exactValue)) return document.documentElement;
      if (spatialValues.length && spatialValues.every(value => value === exactValue)) return document.documentElement;
    }
    return null;
  }

  function tranScrollToPassage(reader, passage) {
    try {
      const source = compactText(passage).replace(/^\.\.\./, "").replace(/\.\.\.$/, "").trim();
      const words = source.split(/\s+/).filter(Boolean);
      if (words.length < 4) return false;
      const windowSize = Math.min(12, Math.max(8, words.length));
      const starts = [...new Set([0, Math.floor((words.length - windowSize) / 4), Math.floor((words.length - windowSize) / 2)])]
        .map(index => Math.max(0, index));
      const anchors = starts.map(start => words.slice(start, start + windowSize).join(" ")).filter(anchor => anchor.length >= 24);
      let candidates = [];
      for (const anchor of anchors) {
        candidates = [...reader.querySelectorAll("p,li,blockquote,div,span")]
          .filter(element => {
            const text = compactText(element.textContent);
            return visible(element) && text.length <= 3000 && text.includes(anchor);
          });
        if (candidates.length) break;
      }
      candidates.sort((a, b) => compactText(a.textContent).length - compactText(b.textContent).length);
      const target = candidates[0];
      if (!target) return false;
      target.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
      const previous = {
        backgroundColor: target.style.backgroundColor,
        outline: target.style.outline,
        borderRadius: target.style.borderRadius,
        transition: target.style.transition
      };
      target.style.transition = "background-color 120ms ease, outline-color 120ms ease";
      target.style.backgroundColor = "rgba(53, 211, 153, 0.32)";
      target.style.outline = "2px solid rgba(53, 211, 153, 0.95)";
      target.style.borderRadius = "4px";
      setTimeout(() => {
        if (!target.isConnected) return;
        Object.assign(target.style, previous);
      }, 8_000);
      return true;
    } catch { return false; /* Navigation is optional; evidence extraction remains authoritative. */ }
  }

  function tranCacheKey(security, period) {
    return `${String(security ?? "").toUpperCase()}:${period}`;
  }

  function cachedTRANText(security, period) {
    const key = tranCacheKey(security, period);
    const entry = tranTextCache.get(key);
    if (!entry || Date.now() - entry.storedAt > TRAN_TEXT_CACHE_TTL_MS) {
      tranTextCache.delete(key);
      return null;
    }
    tranTextCache.delete(key);
    tranTextCache.set(key, entry);
    return entry.text;
  }

  function cacheTRANText(security, period, text) {
    if (!security || !/^Q[1-4] \d{4}$/.test(period) || text.length < 2000
      || !text.includes(`${period} Earnings Conference Call`)) return;
    const key = tranCacheKey(security, period);
    tranTextCache.delete(key);
    tranTextCache.set(key, { text, storedAt: Date.now() });
    while (tranTextCache.size > TRAN_TEXT_CACHE_MAX) tranTextCache.delete(tranTextCache.keys().next().value);
  }

  function localTRANSummary(result) {
    const found = result.topics.filter(topic => topic.mentions > 0).map(topic => topic.topic);
    return found.length
      ? `I found grounded transcript evidence for ${found.join(", ")}.`
      : "I did not find the requested topics in the loaded transcript text.";
  }

  function validateTRANSummary(value, evidence) {
    if (!value || typeof value !== "object" || value.grounded !== true) throw new Error("TRAN summary is not grounded");
    const summary = compactText(value.summary);
    if (!summary || summary.length > 360 || !Array.isArray(value.findings) || value.findings.length > 12) {
      throw new Error("TRAN summary response is malformed");
    }
    const topics = new Map(evidence.topics.map(topic => [topic.topic.toLowerCase(), topic.topic]));
    const periods = new Set(evidence.periods.map(period => period.period));
    const findings = value.findings.map(finding => {
      if (!finding || typeof finding !== "object" || typeof finding.mentioned !== "boolean") throw new Error("TRAN finding is malformed");
      const topic = topics.get(compactText(finding.topic).toLowerCase());
      const period = finding.period == null ? null : compactText(finding.period);
      const text = compactText(finding.finding);
      if (!topic || (period && !periods.has(period)) || !text || text.length > 240) throw new Error("TRAN finding is not bound to supplied evidence");
      return { topic, period, mentioned: finding.mentioned, finding: text };
    });
    return { summary, findings, grounded: true, fallback: value.fallback === true };
  }

  async function requestTRANSummary(result) {
    const periods = result.periods.map(identity => ({
      period: identity.period,
      excerpts: result.topics.flatMap(topic => topic.passages
        .filter(passage => passage.period === identity.period)
        .map(passage => ({ topic: topic.topic, text: passage.text }))).slice(0, 8)
    }));
    if (!periods.some(period => period.excerpts.length)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_300);
    try {
      const response = await fetch(`${config.handoffUrl}/grounded-transcript-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.secret}` },
        body: JSON.stringify({ company: result.company, question: result.question, topics: result.topics.map(topic => topic.topic), periods }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`TRAN summary request failed with ${response.status}`);
      return validateTRANSummary(await response.json(), result);
    } finally {
      clearTimeout(timer);
    }
  }

  async function executeTRAN(panel, action, plan) {
    if (action.feature !== "research" || action.operation !== "summarize") {
      throw new Error("TRAN live executor permits only bounded read-only research");
    }
    const request = action.value;
    delete panel.dataset.godelVoiceTranResult;
    const available = await waitUntil(() => {
      const rows = tranEarningsRows(panel);
      return rows.length >= request.periods ? rows : null;
    }, `${request.periods} exact TRAN Earnings rows`, 8_000).catch(() => {
      const rows = tranEarningsRows(panel);
      const tables = [...panel.querySelectorAll("table,[role='table'],[role='grid']")];
      const tableRows = tables.map(table => table.querySelectorAll("tr,[role='row']").length).join(",");
      const identity = [panel.id || "no-id", panel.getAttribute("data-cy-command-type") || "no-type",
        compactText(panel.textContent).includes("TRANSCRIPT HUB") ? "has-title" : "no-title"].join("/");
      throw new Error(`TRAN exposes only ${rows.length} exact Earnings rows; ${request.periods} requested (${identity}; tables ${tables.length}; rows ${tableRows || "none"})`);
    });
    const selected = available.slice(0, request.periods).map(({ period, date }) => ({ period, date }));
    const topics = request.topics.map(topic => ({ topic, mentions: 0, periods: [], passages: [] }));
    const security = terminalSecurity(plan?.terminal_command);
    let strongest = null;
    for (const identity of selected) {
      let readerText = cachedTRANText(security, identity.period);
      if (!readerText) {
        const reader = await tranSelectPeriod(panel, identity.period);
        readerText = String(reader.innerText ?? "").trim();
        cacheTRANText(security, identity.period, readerText);
      }
      if (readerText.length < 2000 || !readerText.includes(`${identity.period} Earnings Conference Call`)) {
        throw new Error(`TRAN could not verify complete exact-period text for ${identity.period}`);
      }
      for (const topicResult of topics) {
        const evidence = tranTopicEvidence(readerText, topicResult.topic);
        topicResult.mentions += evidence.mentions;
        if (evidence.mentions) topicResult.periods.push(identity.period);
        for (const text of evidence.passages) {
          if (topicResult.passages.length >= 8) break;
          topicResult.passages.push({ period: identity.period, text });
          const score = evidence.mentions * 10 + Math.min(9, text.length / 30);
          if (!strongest || score > strongest.score) strongest = { score, period: identity.period, text };
          break;
        }
      }
    }
    const result = {
      company: tranCompany(panel, plan),
      security: terminalSecurity(plan?.terminal_command),
      periods: selected,
      topics: topics.map(topic => ({ ...topic, mentions: Math.min(999, topic.mentions) })),
      question: request.question,
      summary: "",
      findings: [],
      grounded: true,
      fallback: true,
      answer_period: strongest?.period ?? null,
      current: strongest ? { period: strongest.period, text: strongest.text } : null
    };
    result.summary = localTRANSummary(result);
    try {
      const summary = await requestTRANSummary(result);
      if (summary) Object.assign(result, summary);
    } catch { /* The local grounded evidence and deterministic summary remain usable. */ }
    if (strongest) {
      const reader = await tranSelectPeriod(panel, strongest.period);
      if (!tranScrollToPassage(reader, strongest.text)) result.current = null;
    }
    if (JSON.stringify(result).length > 12_000) throw new Error("TRAN grounded evidence exceeded its safe bound");
    panel.dataset.godelVoiceTranResult = JSON.stringify(result);
  }

  async function executeCommandPlan(plan, { capturePanel = false, announce = true } = {}) {
    const commandStartedAt = performance.now();
    const phases = {};
    const markPhase = (name, startedAt) => {
      phases[name] = Math.max(0, Math.round(performance.now() - startedAt));
    };
    if (plan.command === "EQS" && (plan.actions ?? []).length) {
      const existingEQS = [...new Set([
        ...windowRoots().filter(root => panelMatchesCommand(root, "EQS")),
        ...panelTitleNodes("EQS").map(rootForTitle).filter(Boolean)
      ])];
      if (existingEQS.length === 1) {
        const panel = existingEQS[0];
        if (announce) toast("Godel Voice: configuring EQS");
        for (const action of plan.actions) await executeEQS(panel, action);
        const existingId = panel.id?.endsWith("-window") ? windowId(panel) : null;
        if (existingId) {
          rememberPanel(panel, "EQS");
        }
        if (announce) toast("Godel Voice: EQS configured");
        return panel;
      }
      if (existingEQS.length > 1) throw new Error(`Expected at most one existing EQS panel, found ${existingEQS.length}`);
    }
    const existingTitles = new Set(panelTitleNodes(plan.command));
    const existingWindows = new Set(windowRoots().map(windowId));
    const hadCommandPanel = Boolean(windowForCommand(plan.command) ?? topPanelForCommand(plan.command));
    if (announce) toast(`Godel Voice: opening ${plan.command}`);

    let phaseStartedAt = performance.now();
    const input = await openCommandBar();
    markPhase("command_bar_ms", phaseStartedAt);
    let terminalCommand = plan.terminal_command;
    if (!terminalCommand) {
      phaseStartedAt = performance.now();
      const securityPrefix = await resolveSecurityInGodel(input, plan.security_query);
      terminalCommand = [securityPrefix, plan.command, ...plan.arguments].filter(Boolean).join(" ");
      markPhase("security_resolution_ms", phaseStartedAt);
    }
    phaseStartedAt = performance.now();
    const currentInput = await waitFor(topCommandInput, "resolved Godel command bar", 2000);
    await replaceText(currentInput, terminalCommand);
    await waitUntil(() => String(currentInput.value ?? "").trim() === terminalCommand,
      `Godel command bar value ${terminalCommand}`, 1000);
    await press("Enter");
    markPhase("command_submit_ms", phaseStartedAt);

    if (plan.command === "Q") {
      phaseStartedAt = performance.now();
      const security = terminalSecurity(terminalCommand);
      let header;
      try {
        header = await waitUntil(() => quickQuoteHeader(security), `updated ${security ?? "security"} quote header`, 2000);
      } catch (error) {
        const pageText = compactText(document.body?.innerText);
        const offset = Math.max(0, pageText.toUpperCase().indexOf(String(security ?? "").toUpperCase()));
        const excerpt = pageText.slice(offset, offset + 240);
        throw new Error(`${error.message}${excerpt ? ` (${excerpt})` : ""}`);
      }
      markPhase("quote_header_ms", phaseStartedAt);
      phases.total_ms = Math.max(0, Math.round(performance.now() - commandStartedAt));
      panelCommandTimings.set(header, phases);
      if (announce) toast("Godel Voice: quote updated");
      return header;
    }

    phaseStartedAt = performance.now();
    let panel = await waitFor(() => {
      const newWindow = windowRoots().find(root => !existingWindows.has(windowId(root))
        && panelMatchesCommand(root, plan.command));
      if (newWindow) return newWindow;
      const titles = panelTitleNodes(plan.command);
      const newTitle = titles.find(title => !existingTitles.has(title));
      if (newTitle) return plan.command === "TRAN"
        ? tranPanelForPlan(plan)
        : (rootForTitle(newTitle) ?? windowForCommand(plan.command));
      const identity = terminalPanelIdentity(terminalCommand);
      if (identity) {
        const visibleCommandRoots = [...new Set([
          ...windowRoots(),
          ...panelTitleNodes(plan.command).map(rootForTitle).filter(Boolean)
        ])];
        const exactReused = visibleCommandRoots.find(root => panelMatchesCommand(root, plan.command)
          && panelMatchesTerminalIdentity(root, identity));
        if (exactReused) return exactReused;
      } else {
        // Several global Godel surfaces (notably HMAP) are singletons. Their
        // command focuses the existing window without creating a node or
        // reliably updating data-cy-active-window. Reuse only one exact native
        // command match; ambiguity still fails closed.
        const exactSingleton = windowRoots().filter(root => panelMatchesCommand(root, plan.command));
        if (exactSingleton.length === 1) return exactSingleton[0];
      }
      const activeReused = activeWindowForCommand(plan.command);
      if (activeReused && panelMatchesTerminalIdentity(activeReused, identity)) return activeReused;
      // The first instance of a command may be mounted in a restored native
      // root. Once an instance already exists, accepting that old active root
      // would bind facts and geometry to the wrong window.
      return hadCommandPanel ? null : (activeWindowForCommand(plan.command) ?? windowForCommand(plan.command) ?? topPanelForCommand(plan.command));
    }, `new ${plan.command} panel`, 9000);
    markPhase("panel_detection_ms", phaseStartedAt);
    if (plan.command === "GF") {
      panel = await waitUntil(() => expandedGFPanel(panel), "complete GF panel", 6000);
    }
    if (plan.command === "TRAN") {
      // The command opener already proved which native window was newly
      // created. Preserve that identity while its transcript body loads;
      // a global re-query can otherwise bind an older stacked TRAN window.
      const openedTRANPanel = panel;
      phaseStartedAt = performance.now();
      panel = await waitUntil(() => {
        if (openedTRANPanel?.isConnected && tranEarningsRows(openedTRANPanel).length) return openedTRANPanel;
        const resolved = tranPanelForPlan(plan);
        return resolved?.isConnected && tranEarningsRows(resolved).length ? resolved : null;
      }, "exact TRAN panel root", 4500);
      markPhase("transcript_root_ms", phaseStartedAt);
    }
    rememberPanel(panel, plan.command, terminalSecurity(terminalCommand));

    phaseStartedAt = performance.now();
    const actions = plan.command === "GF" ? orderedGFActions(plan.actions) : (plan.actions ?? []);
    for (const action of actions) {
      if (plan.command === "GF") await executeGF(panel, action, plan, terminalCommand);
      else if (plan.command === "HMS") await executeHMS(panel, action);
      else if (plan.command === "GR") await executeGR(panel, action);
      else if (plan.command === "HALT") await executeHALT(panel, action);
      else if (plan.command === "HMAP") await executeHMAP(panel, action);
      else if (plan.command === "IMAP") await executeIMAP(panel, action);
      else if (plan.command === "EM") await executeEM(panel, action);
      else if (plan.command === "MOST") await executeMOST(panel, action);
      else if (plan.command === "HDS") await executeHDS(panel, action);
      else if (plan.command === "EQS") await executeEQS(panel, action);
      else if (plan.command === "SECF") await executeSECF(panel, action);
      else if (plan.command === "G") await executeG(panel, action);
      else if (plan.command === "TRAN") await executeTRAN(panel, action, plan);
      else if (plan.command === "N") await executeNews(panel, action);
    }
    markPhase("nested_actions_ms", phaseStartedAt);
    // The chart shell appears before its live quote header. Wait only until
    // Godel exposes the authenticated price/change shape so conversational
    // quote requests can narrate the value instead of racing the data render.
    if (plan.command === "G") {
      await waitUntil(() => panelInsights.extractChartQuote(panel.innerText), "G live quote header", 1500).catch(() => null);
    }
    phases.total_ms = Math.max(0, Math.round(performance.now() - commandStartedAt));
    panelCommandTimings.set(panel, phases);
    rememberManagedPanel(panel);
    if (announce) toast(`Godel Voice: ${plan.command} ${plan.actions.length ? "configured" : "opened"}`);
    return panel;
  }

  async function arrangeWorkflow(plan, opened) {
    opened = opened.filter(item => item.panel !== document.documentElement);
    if (!opened.length) return;
    const planned = layoutEngine.plan({
      viewport: workspaceViewport(),
      preset: plan.layout.preset,
      gap: plan.layout.gap_px,
      panels: opened.map(item => ({ id: item.step.id, placement: item.step.layout?.placement ?? null }))
    });
    if (planned.overflow.length) {
      throw new Error(`The ${plan.layout.preset} layout needs more screen space`);
    }
    // Each new window has an independent native identity. Verify their final
    // geometries concurrently so a three-panel desk pays for one animation
    // interval rather than three sequential intervals.
    await Promise.all(planned.placements.map(async placement => {
      const openedPanel = opened.find(item => item.step.id === placement.id);
      if (!openedPanel) return;
      const exactWindow = openedPanel.workspaceWindowId
        ? panelById(openedPanel.workspaceWindowId)
        : null;
      const capturedWindow = nativeWindowRoot(openedPanel.panel);
      // Geometry belongs to a rendered native window, not to whichever screen
      // the global workspace provider reports during a concurrent multi-open.
      // The page-world adapter verifies the exact native id and resulting
      // position-manager state. Keep the screen-checked workspace path only
      // for an id that Godel has committed but has not mounted in the DOM yet.
      const directWindow = exactWindow ?? capturedWindow;
      if (directWindow) {
        await panelInternalAction(directWindow, "LAYOUT", "setGeometry", placement.rect);
        return;
      }
      if (openedPanel.workspaceWindowId) {
        try {
          await workspaceInternalAction("setWindowGeometry", {
            id: openedPanel.workspaceWindowId,
            rect: placement.rect
          });
        } catch (error) {
          const borrowed = borrowedWindowReceipts.has(String(openedPanel.workspaceWindowId));
          throw new Error(`${error.message}; ${openedPanel.step.command}=${openedPanel.workspaceWindowId}; borrowed=${borrowed}`);
        }
        return;
      }
      const identity = terminalPanelIdentity(openedPanel.step.terminal_command);
      let candidates = windowRoots().filter(root => panelMatchesCommand(root, openedPanel.step.command));
      if (identity) {
        const exact = candidates.filter(root => panelMatchesTerminalIdentity(root, identity));
        if (exact.length) candidates = exact;
      }
      candidates.sort((a, b) => {
        const activeA = a.getAttribute("data-cy-active-window") !== null
          && a.getAttribute("data-cy-active-window") !== "false" ? 1 : 0;
        const activeB = b.getAttribute("data-cy-active-window") !== null
          && b.getAttribute("data-cy-active-window") !== "false" ? 1 : 0;
        if (activeA !== activeB) return activeB - activeA;
        const az = Number.parseInt(getComputedStyle(a).zIndex, 10) || 0;
        const bz = Number.parseInt(getComputedStyle(b).zIndex, 10) || 0;
        return bz - az;
      });
      let livePanel = candidates[0] ?? null;
      if (!livePanel) {
        livePanel = nativeWindowRoot(openedPanel.panel);
      }
      if (!livePanel) {
        const context = openedPanel.workspaceWindowError ? `: ${openedPanel.workspaceWindowError}` : "";
        throw new Error(`Godel ${openedPanel.step.command} live window is unavailable for layout${context}`);
      }
      // Target the exact rendered native window. Godel's active-screen list can
      // lag behind its DOM after opening or reusing a window, which caused a
      // valid visible panel to be rejected as "not on the active screen".
      await panelInternalAction(livePanel, "LAYOUT", "setGeometry", placement.rect);
    }));
  }

  function panelById(id) {
    return windowRoots().find(root => windowId(root) === String(id)) ?? null;
  }

  async function activeScreenRoots() {
    const roots = windowRoots();
    try {
      const ids = await workspaceInternalAction("activeWindowIds");
      if (!Array.isArray(ids)) return roots;
      const active = ids.map(id => roots.find(root => windowId(root) === String(id))).filter(Boolean);
      return active.sort((a, b) => panelExposureScore(b) - panelExposureScore(a));
    } catch {
      return roots;
    }
  }

  function panelExposureScore(root) {
    const rect = root.getBoundingClientRect();
    const samples = [[0.5, 0.12], [0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
    let score = 0;
    for (const [rx, ry] of samples) {
      const x = rect.left + rect.width * rx;
      const y = rect.top + rect.height * ry;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      const top = document.elementFromPoint(x, y);
      if (top && (top === root || root.contains(top))) score += 1;
    }
    return score;
  }

  function panelForControl(target, roots = windowRoots()) {
    const searchRoots = [...new Set(roots)];
    if (target.mode === "last") {
      const last = lastWindowId && searchRoots.find(root => windowId(root) === String(lastWindowId));
      if (last) return last;
      const rememberedPanel = lastPanelElement?.isConnected ? (nativeWindowRoot(lastPanelElement) ?? lastPanelElement) : null;
      if (rememberedPanel && searchRoots.includes(rememberedPanel)) return rememberedPanel;
      return [...searchRoots].sort((a, b) => (Number.parseInt(getComputedStyle(b).zIndex, 10) || 0)
        - (Number.parseInt(getComputedStyle(a).zIndex, 10) || 0))[0] ?? null;
    }
    if (target.mode === "focused") {
      return searchRoots.find(root => {
        const active = root.getAttribute("data-cy-active-window");
        return active !== null && active !== "false";
      }) ?? (lastWindowId && searchRoots.find(root => windowId(root) === String(lastWindowId)))
        ?? null;
    }
    const remembered = commandWindows.get(target.command);
    const rememberedPanel = commandPanels.get(target.command);
    let candidates = roots.filter(root => panelMatchesCommand(root, target.command));
    const rememberedRoot = rememberedPanel?.isConnected ? (nativeWindowRoot(rememberedPanel) ?? rememberedPanel) : null;
    const ordered = [
      rememberedRoot && searchRoots.includes(rememberedRoot) ? rememberedRoot : null,
      remembered && candidates.find(root => windowId(root) === String(remembered)),
      candidates.find(root => {
        const active = root.getAttribute("data-cy-active-window");
        return active !== null && active !== "false";
      }),
      candidates[0],
      ...candidates.sort((a, b) => (Number.parseInt(getComputedStyle(b).zIndex, 10) || 0)
        - (Number.parseInt(getComputedStyle(a).zIndex, 10) || 0))
    ].filter(Boolean);
    const fallbackPanel = topPanelForCommand(target.command);
    const scopedFallback = fallbackPanel && searchRoots.includes(nativeWindowRoot(fallbackPanel) ?? fallbackPanel) ? fallbackPanel : null;
    if (!target.security) return ordered[0] ?? scopedFallback ?? null;
    const token = String(target.security).toUpperCase();
    return ordered.find(panel => String(panel.textContent ?? "").toUpperCase().includes(token))
      ?? (scopedFallback && String(scopedFallback.textContent ?? "").toUpperCase().includes(token) ? scopedFallback : null);
  }

  function uniqueVisiblePanelForControl(target) {
    if (target.mode !== "command" || !target.command) return null;
    const titles = panelTitleNodes(target.command);
    if (titles.length !== 1) return null;
    const shell = rootForTitle(titles[0]) ?? titles[0];
    const native = nativeWindowRoot(shell);
    if (!native || panelExposureScore(native) < 1 || !panelMatchesCommand(native, target.command)) return null;
    if (target.security && !panelContainsSecurity(shell, target.security)
        && !panelContainsSecurity(native, target.security)) return null;
    return native;
  }

  function detachedUniqueHDSPanel(target) {
    if (target.command !== "HDS") return null;
    const titles = panelTitleNodes("HDS");
    if (titles.length !== 1) return null;
    if (!target.security) return document.documentElement;
    const wanted = `${String(target.security).toUpperCase()} US`;
    const titleRect = titles[0].getBoundingClientRect();
    const titleCenter = { x: titleRect.left + titleRect.width / 2, y: titleRect.top + titleRect.height / 2 };
    const nearby = [...document.querySelectorAll("input")].filter(input =>
      visible(input) && String(input.value ?? "").trim().toUpperCase().startsWith(wanted)).map(input => {
      const rect = input.getBoundingClientRect();
      const dx = rect.left + rect.width / 2 - titleCenter.x;
      const dy = rect.top + rect.height / 2 - titleCenter.y;
      return { input, distance: Math.hypot(dx, dy) };
    }).filter(item => item.distance <= 360).sort((a, b) => a.distance - b.distance);
    if (!nearby.length) return null;
    // Restored layouts can retain the same security in several widgets. Use
    // proximity only when the closest input is distinctly nearer to the sole
    // HDS title; an ambiguous pair still fails closed.
    if (nearby.length > 1 && nearby[1].distance - nearby[0].distance < 80) return null;
    return document.documentElement;
  }

  function detachedHDSDiagnostic(target) {
    if (target.command !== "HDS") return "";
    const title = panelTitleNodes("HDS")[0];
    if (!title) return "; hdsInputs=0";
    const rect = title.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const wanted = target.security ? `${String(target.security).toUpperCase()} US` : null;
    const distances = [...document.querySelectorAll("input")].filter(input => visible(input)
      && (!wanted || String(input.value ?? "").trim().toUpperCase().startsWith(wanted))).map(input => {
      const inputRect = input.getBoundingClientRect();
      return Math.round(Math.hypot(inputRect.left + inputRect.width / 2 - cx, inputRect.top + inputRect.height / 2 - cy));
    }).sort((a, b) => a - b).slice(0, 4);
    return `; hdsDistances=${distances.join(",") || "none"}`;
  }

  function detachedUniqueOMONPanel(target) {
    if (target.command !== "OMON") return null;
    const wanted = target.security ? `${String(target.security).toUpperCase()} US` : null;
    const candidates = [];
    for (const title of panelTitleNodes("OMON")) {
      for (let scope = title.parentElement, depth = 0; scope && depth < 14; scope = scope.parentElement, depth += 1) {
        const titles = panelTitleNodes("OMON").filter(node => scope.contains(node));
        if (titles.length > 1) break;
        const sliders = [...scope.querySelectorAll('input[type="range"],[role="slider"]')].filter(visible);
        const inputs = [...scope.querySelectorAll("input")].filter(input => visible(input)
          && (!wanted || String(input.value ?? "").trim().toUpperCase().startsWith(wanted)));
        const tables = [...scope.querySelectorAll("table,[role='table'],[role='grid']")].filter(table => {
          const text = String(table.textContent ?? "").replace(/\s+/g, " ").toLowerCase();
          return visible(table) && text.includes("strike") && text.includes("bid") && text.includes("ask");
        });
        if (titles.length === 1 && sliders.length === 1 && inputs.length >= 1 && tables.length === 1) {
          candidates.push(scope);
          break;
        }
      }
    }
    const unique = [...new Set(candidates)];
    return unique.length === 1 ? unique[0] : null;
  }

  function panelContainsSecurity(panel, security) {
    const token = String(security ?? "").toUpperCase();
    if (!token) return true;
    if (String(panel.textContent ?? "").toUpperCase().includes(token)) return true;
    return [...panel.querySelectorAll("input")].some(input => visible(input)
      && String(input.value ?? "").trim().toUpperCase().startsWith(`${token} `));
  }

  async function executeControlStep(step) {
    // Godel currently renders some title bars and their native `*-window`
    // roots as React siblings. Prefer the active-screen inventory, then allow
    // only one exposed, exact-title native root with the requested security.
    // This keeps follow-up controls deterministic without falling back to an
    // arbitrary active window.
    const panel = panelForControl(step.target, await activeScreenRoots())
      ?? uniqueVisiblePanelForControl(step.target);
    if (!panel) throw new Error(`No Godel window matches ${step.target.command ?? step.target.mode}`);
    if (step.operation === "move") {
      const planned = layoutEngine.plan({
        viewport: workspaceViewport(), gap: 12,
        panels: [{ id: step.id, placement: step.value }]
      });
      if (planned.overflow.length) throw new Error(`The ${step.value} placement needs more screen space`);
      await panelInternalAction(panel, "LAYOUT", "setGeometry", planned.placements[0].rect);
    } else if (step.operation === "resize") {
      const current = panel.getBoundingClientRect();
      const factor = step.value === "larger" ? 1.2 : 0.8;
      const viewport = workspaceViewport();
      const width = Math.min(viewport.width, Math.max(280, current.width * factor));
      const height = Math.min(viewport.height, Math.max(190, current.height * factor));
      const x = Math.max(viewport.x, Math.min(current.x - (width - current.width) / 2, viewport.x + viewport.width - width));
      const y = Math.max(viewport.y, Math.min(current.y - (height - current.height) / 2, viewport.y + viewport.height - height));
      await panelInternalAction(panel, "LAYOUT", "setGeometry", { x, y, width, height });
    } else {
      const actions = { maximize: "maximize", restore: "restore", focus: "focus", close: "close", export: "openExport" };
      await panelInternalAction(panel, "LAYOUT", actions[step.operation]);
      if (step.operation === "close") forgetManagedPanel(panel);
    }
    if (step.operation !== "close") rememberPanel(panel, step.target.command, step.target.security);
    else if (lastPanelElement && (panel === lastPanelElement || panel.contains(lastPanelElement) || lastPanelElement.contains(panel))) {
      lastWindowId = null;
      lastPanelElement = null;
      lastPanelContext = null;
    }
  }

  async function executeConfigureStep(step) {
    const panel = panelForControl(step.target, await activeScreenRoots())
      ?? detachedUniqueHDSPanel(step.target)
      ?? detachedUniqueOMONPanel(step.target);
    if (!panel) {
      const titleCount = step.target.command ? panelTitleNodes(step.target.command).length : 0;
      const rootCount = windowRoots().length;
      throw new Error(`No Godel window matches ${step.target.command ?? step.target.mode} (titles=${titleCount}; roots=${rootCount}${detachedHDSDiagnostic(step.target)})`);
    }
    if (!panelMatchesCommand(panel, step.target.command)) {
      throw new Error(`The targeted window is not ${step.target.command}`);
    }
    if (step.target.security && !panelContainsSecurity(panel, step.target.security)) {
      throw new Error(`The targeted ${step.target.command} window is not for ${step.target.security}`);
    }
    const terminalCommand = `${step.target.security ?? "CONTEXT"} US EQ ${step.target.command}`;
    const adapterPlan = { command: step.target.command, actions: step.actions };
    const actions = step.target.command === "GF" ? orderedGFActions(step.actions) : step.actions;
    for (const action of actions) {
      if (step.target.command === "GF") await executeGF(panel, action, adapterPlan, terminalCommand);
      else if (step.target.command === "HMS") await executeHMS(panel, action);
      else if (step.target.command === "GR") await executeGR(panel, action);
      else if (step.target.command === "HALT") await executeHALT(panel, action);
      else if (step.target.command === "HMAP") await executeHMAP(panel, action);
      else if (step.target.command === "IMAP") await executeIMAP(panel, action);
      else if (step.target.command === "EM") await executeEM(panel, action);
      else if (step.target.command === "MOST") await executeMOST(panel, action);
      else if (step.target.command === "HDS") await executeHDS(panel, action);
      else if (step.target.command === "EQS") await executeEQS(panel, action);
      else if (step.target.command === "SECF") await executeSECF(panel, action);
      else if (step.target.command === "G") await executeG(panel, action);
      else if (step.target.command === "TRAN") await executeTRAN(panel, action, adapterPlan);
      else if (step.target.command === "OMON") await executeOMON(panel, action);
      else if (step.target.command === "N") await executeNews(panel, action);
      else throw new Error(`Existing-panel automation is not enabled for ${step.target.command}`);
    }
    rememberPanel(panel, step.target.command, step.target.security);
    return panel;
  }

  async function cancellationRequested(requestId) {
    if (!requestId) return false;
    const response = await fetch(`${config.handoffUrl}/status?id=${encodeURIComponent(requestId)}&client=${encodeURIComponent(clientId)}`, {
      cache: "no-store", headers: { Authorization: `Bearer ${config.secret}` }
    });
    if (!response.ok) return false;
    const status = await response.json();
    return status.cancel_requested === true || status.status !== "inflight" || status.lease_owned !== true;
  }

  async function ensureNotCancelled(requestId) {
    if (await cancellationRequested(requestId)) throw new CancelledError();
  }

  async function moveWindowToWorkflowScreen(id, targetScreenId) {
    let lastError = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        return await workspaceInternalAction("moveWindowToScreen", {
          id, target_screen_id: targetScreenId
        });
      } catch (error) {
        lastError = error;
        // The rendered window can precede Godel's layout-store commit by a
        // few frames. Retry only that exact transient; every other workspace
        // mismatch still fails closed immediately.
        if (!/Expected one Godel screen for window .* found 0/.test(error.message) || attempt === 19) throw error;
        await pause(25);
      }
    }
    throw lastError ?? new Error("Godel window transfer did not settle");
  }

  async function executeWorkflow(plan, requestId = null) {
    const opened = [];
    const grounded = [];
    const failures = [];
    const timings = [];
    const transactionWindowIds = new Set();
    const transactionBorrowedIds = new Set();
    const opensNewPanels = plan.steps.some(step => step.kind === "command" && step.command !== "Q");
    const replacesVoiceWorkspace = plan.layout.preserve_existing === false
      && plan.steps.some(step => step.kind === "command");
    const hasExplicitGeometryControl = plan.steps.some(step => step.kind === "control"
      && ["maximize", "restore", "move", "resize"].includes(step.operation));
    let workflowScreenId = null;
    try {
    if (replacesVoiceWorkspace) {
      await ensureNotCancelled(requestId);
      await workspaceInternalAction("createScreen", { name: "Voice" });
      const voiceScreen = await workspaceInternalAction("activeScreenInfo");
      workflowScreenId = String(voiceScreen?.id ?? "");
      await restoreBorrowedWindows();
      await workspaceInternalAction("createScreen", { name: "Voice" });
      await closeVoiceScreenPanels();
    } else if (plan.layout.new_screen) {
      await ensureNotCancelled(requestId);
      await workspaceInternalAction("createScreen", { name: "Voice" });
      const voiceScreen = await workspaceInternalAction("activeScreenInfo");
      workflowScreenId = String(voiceScreen?.id ?? "");
    }
    for (let index = 0; index < plan.steps.length; index += 1) {
      const step = plan.steps[index];
      await ensureNotCancelled(requestId);
      toast(`Godel Voice: ${index + 1}/${plan.steps.length} ${step.kind === "control" ? step.operation : step.kind === "configure" ? `configuring ${step.target.command}` : `opening ${step.command}`}`);
      const stepStartedAt = Date.now();
      let executedPanel = null;
      let beforeWindowIds = [];
      let beforeRenderedIds = new Set();
      try {
        if (step.kind === "control") await executeControlStep(step);
        else if (step.kind === "configure") {
          const panel = await executeConfigureStep(step);
          if (panel) grounded.push({ step, panel });
        }
        else {
          beforeWindowIds = await workspaceInternalAction("activeWindowIds").catch(() => []);
          beforeRenderedIds = new Set(windowRoots().map(root => String(windowId(root) ?? "")).filter(Boolean));
          let panel = await executeCommandPlan(step, { capturePanel: true, announce: false });
          executedPanel = panel;
          if (panel) {
            if (step.command === "Q") {
              grounded.push({ step, panel });
            } else {
            const native = nativeWindowRoot(panel);
            const nativeId = native ? String(windowId(native) ?? "") : "";
            let borrowed = false;
            if (nativeId && workflowScreenId) {
              const receipt = await moveWindowToWorkflowScreen(nativeId, workflowScreenId);
              if (receipt?.moved === true) {
                borrowed = true;
                borrowedWindowReceipts.set(nativeId, receipt);
                transactionBorrowedIds.add(nativeId);
                managedWindowIds.delete(nativeId);
                persistBorrowedWindows();
                persistManagedWindowIds();
                panel = await waitUntil(() => panelById(nativeId), `${step.command} moved to Voice screen`, 3000);
                executedPanel = panel;
              }
            }
            if (!borrowed && nativeId && !beforeRenderedIds.has(nativeId)) transactionWindowIds.add(nativeId);
            let workspaceWindowError = null;
            let activeIds = [];
            let newlyReportedId = null;
            for (let attempt = 0; attempt < 20; attempt += 1) {
              activeIds = await workspaceInternalAction("activeWindowIds").catch(error => {
                workspaceWindowError = error.message;
                return [];
              });
              newlyReportedId = activeIds.find(id => !beforeWindowIds.includes(id)) ?? null;
              if (newlyReportedId || (nativeId && activeIds.includes(nativeId))) break;
              if (attempt < 19) await pause(25);
            }
            const workspaceWindowId = newlyReportedId
              ?? (nativeId && activeIds.includes(nativeId) ? nativeId : null)
              ?? null;
            if (!borrowed && workspaceWindowId && !beforeWindowIds.includes(workspaceWindowId)) transactionWindowIds.add(String(workspaceWindowId));
            opened.push({ step, panel, workspaceWindowId, workspaceWindowError });
            grounded.push({ step, panel });
            // Godel's command-bar callback closes over its current screen
            // layout. Before another command opens a panel, allow the same
            // bounded 250 ms commit interval used by the reliable cross-request
            // executor loop. Single-command requests and command-to-control
            // transitions pay no extra latency.
            if (workspaceWindowId && plan.steps[index + 1]?.kind === "command") {
              await pause(250);
              const settledIds = await workspaceInternalAction("activeWindowIds");
              if (!settledIds.includes(String(workspaceWindowId))) {
                throw new Error(`${step.command} did not settle before the next command`);
              }
            }
            }
          }
        }
        const openedStep = [...opened].reverse().find(item => item.step === step) ?? null;
        timings.push({
          step_id: step.id, kind: step.kind, command: step.command ?? step.target?.command, operation: step.operation ?? (step.kind === "configure" ? "configure" : null),
          status: "completed", duration_ms: Date.now() - stepStartedAt,
          ...(openedStep?.workspaceWindowId ? { workspace_window_id: String(openedStep.workspaceWindowId) } : {}),
          ...(openedStep?.workspaceWindowId && transactionBorrowedIds.has(String(openedStep.workspaceWindowId)) ? { borrowed: true } : {}),
          ...(step.kind === "command" && executedPanel && panelCommandTimings.get(executedPanel)
            ? { phases: panelCommandTimings.get(executedPanel) } : {})
        });
      } catch (error) {
        if (step.kind === "command" && step.command !== "Q") {
          for (const root of windowRoots()) {
            const id = String(windowId(root) ?? "");
            if (id && !beforeRenderedIds.has(id) && !transactionBorrowedIds.has(id)
                && panelMatchesCommand(root, step.command)) transactionWindowIds.add(id);
          }
          const activeAfterFailure = await workspaceInternalAction("activeWindowIds").catch(() => []);
          for (const id of activeAfterFailure) {
            if (!beforeWindowIds.includes(id) && !transactionBorrowedIds.has(String(id))) transactionWindowIds.add(String(id));
          }
        }
        failures.push({ step, error });
        timings.push({
          step_id: step.id, kind: step.kind, command: step.command ?? step.target?.command, operation: step.operation ?? (step.kind === "configure" ? "configure" : null),
          status: step.failure_policy === "stop" ? "failed" : "skipped",
          duration_ms: Date.now() - stepStartedAt, error: error.message
        });
        if (step.failure_policy === "stop") {
          const failure = new Error(`${step.kind === "control" ? step.operation : step.kind === "configure" ? `configure ${step.target.command}` : step.command} failed: ${error.message}`);
          failure.stepTimings = timings;
          throw failure;
        }
      }
    }
    if (opensNewPanels && plan.layout.preserve_existing === false && opened.length) {
      const activeScreen = await workspaceInternalAction("activeScreenInfo");
      if (String(activeScreen?.title ?? "").toLowerCase() !== "voice") {
        await workspaceInternalAction("nameActiveScreen", { name: "Voice" });
      }
    }
    const layoutStartedAt = Date.now();
    let layoutWarning = null;
    try {
      // Explicit geometry is the user's final word. Running the automatic
      // layout pass afterwards would silently undo “maximize it”, “move it”,
      // or “make it bigger” even though the control itself succeeded.
      if (!hasExplicitGeometryControl) await arrangeWorkflow(plan, opened);
    } catch (error) {
      layoutWarning = error.message;
      timings.push({
        step_id: "workflow-layout", kind: "control", command: null, operation: "layout",
        status: "skipped", duration_ms: Date.now() - layoutStartedAt, error: error.message
      });
      toast(`Godel Voice: windows opened; layout incomplete`, true);
    }
    if (failures.length) toast(`Godel Voice: workflow ready with ${failures.length} skipped step${failures.length === 1 ? "" : "s"}`, true);
    else if (plan.steps.every(step => step.kind === "control" || step.kind === "configure")) toast("Godel Voice: window updated");
    else toast(`Godel Voice: ${opened.length} windows ready in ${plan.layout.preset} layout`);
    return { timings, opened, grounded, layoutWarning };
    } catch (error) {
      if (opensNewPanels) {
        try {
          await workspaceInternalAction("createScreen", { name: "Voice" });
          await restoreBorrowedWindows({ onlyIds: transactionBorrowedIds });
          await workspaceInternalAction("createScreen", { name: "Voice" });
          if (plan.layout.preserve_existing === false) await closeVoiceScreenPanels();
          else if (transactionWindowIds.size) await closeVoiceScreenPanels({ onlyIds: transactionWindowIds });
          await publishExecutorContext();
        } catch {
          // Rollback is bounded to safe windows on the Voice screen. Preserve
          // the original failure if Godel itself is too unhealthy to clean up.
        }
      }
      throw error;
    }
  }

  async function executePlan(marker, requestId = null) {
    const plan = core.parseMarker(marker);
    if (plan.version === 2) {
      const result = await executeWorkflow(plan, requestId);
      const message = completionMessage(plan, result.grounded);
      return {
        message: result.layoutWarning ? `${message} I couldn't finish the requested placement.` : message,
        steps: result.timings
      };
    }
    const startedAt = Date.now();
    const panel = await executeCommandPlan(plan, { capturePanel: true });
    const fact = groundedCompletionFact([{ step: plan, panel }]);
    return {
      message: fact ?? `${COMMAND_NAMES[plan.command] ?? plan.command}, on screen.`,
      steps: [{ step_id: "legacy-command", kind: "command", command: plan.command, status: "completed", duration_ms: Date.now() - startedAt }]
    };
  }

  function commandSubject(step) {
    const commandName = COMMAND_NAMES[step.command] ?? step.command;
    const security = terminalSecurity(step.terminal_command);
    return security ? `${SECURITY_NAMES[security] ?? security} ${commandName}` : commandName;
  }

  function terminalPanelIdentity(terminalCommand) {
    const match = String(terminalCommand ?? "").trim().toUpperCase()
      .match(/^([A-Z][A-Z0-9.-]{0,9})\s+(US|LN|CN|AU|JP|GR|FP|IM|SM|SW|NA|BB|HK|CBOE|CME|GBL|FX1)\b/);
    return match ? { security: match[1], venue: match[2] } : null;
  }

  function terminalSecurity(terminalCommand) {
    return String(terminalCommand ?? "").match(/\b([A-Z][A-Z0-9.-]{0,9})\s+(?:US|LN|CN|AU|JP|GR|FP|IM|SM|SW|NA|BB|HK|CBOE|CME|GBL|FX1|Equity|EQ)\b/i)?.[1]?.toUpperCase() ?? null;
  }

  function groundedCompletionFact(opened) {
    for (const item of [...opened].reverse()) {
      if (!item?.panel?.isConnected) continue;
      const command = item.step.command ?? item.step.target?.command;
      const security = terminalSecurity(item.step.terminal_command) ?? item.step.target?.security ?? null;
      const company = security ? (SECURITY_NAMES[security] ?? security) : "The company";
      if (command === "Q") {
        const quote = quickQuoteFacts(groundedPanelText(command, item.panel, item.step), security);
        if (quote) return `Godel shows ${company} at ${quote.price}, ${quote.direction} ${quote.percent}, as of ${quote.at}.`;
      }
      const fact = panelInsights.completionFact(command, groundedPanelText(command, item.panel, item.step), company);
      if (fact) return fact;
    }
    return null;
  }

  function groundedPanelText(command, panel, step = null) {
    if (command === "G") return panel.innerText;
    if (command === "Q") return panel.innerText;
    if (command === "TRAN") {
      const result = panel.dataset.godelVoiceTranResult;
      return result ? `TRAN Research :: ${result}` : "";
    }
    if (command === "EM") {
      const valuation = step?.actions?.find(action => action.feature === "valuation" && action.operation === "read");
      const requestedRow = valuation?.value?.row;
      const semanticUnit = valuation?.value?.semantic_unit;
      for (const table of panel.querySelectorAll("table,[role='table'],[role='grid']")) {
        const headers = [...table.querySelectorAll("thead th,[role='columnheader']")]
          .map(cell => compactText(cell.textContent));
        if (headers[0] !== "Last 4Q" || headers[1] !== "Next 4Q") continue;
        if (!headers.slice(2).some(label => /^FY \d{4}$/.test(label))) continue;
        for (const row of table.querySelectorAll("tbody tr,[role='row']")) {
          const cells = [...row.querySelectorAll("th,td,[role='cell'],[role='gridcell']")]
            .map(cell => compactText(cell.textContent));
          const rowLabel = requestedRow ?? "P/E";
          if (cells[0] !== rowLabel || cells.length !== headers.length + 1) continue;
          const values = cells.slice(1);
          const unit = semanticUnit ?? "Multiple";
          const pattern = unit === "Percent" ? /^-?\d{1,5}(?:\.\d{1,6})?\s*%$/ : /^-?\d{1,5}(?:\.\d{1,6})?\s*[x×]$/;
          if (!values.every(value => pattern.test(value))) continue;
          if (requestedRow) return `EM Multiples ${rowLabel} ${unit} :: ${headers.map((header, index) => `${header} = ${values[index]}`).join(" ;; ")}`;
          return `EM Multiples P/E ${headers.map((header, index) => `${header} ${values[index]}`).join(" ")}`;
        }
      }
      return "";
    }
    if (command !== "ERN") return panel.textContent;
    for (const table of panel.querySelectorAll("table,[role='table'],[role='grid']")) {
      const headers = [...table.querySelectorAll("thead th,[role='columnheader']")].map(cell => cell.textContent.trim());
      const multipleIndex = headers.findIndex(label => /^(?:fwd|forward)\s+p\s*\/?\s*e$/i.test(label));
      if (multipleIndex < 0) continue;
      const rows = [];
      for (const row of table.querySelectorAll("tbody tr,[role='row']")) {
        const cells = [...row.querySelectorAll("td,[role='cell'],[role='gridcell']")].map(cell => cell.textContent.trim());
        if (cells.length <= multipleIndex || !/^-?\d+(?:\.\d+)?\s*[x×]$/i.test(cells[multipleIndex])) continue;
        const period = cells.find(value => /^(?:FY|CY)\s*'?\d{2,4}$/i.test(value));
        if (period) rows.push(`${period} ${cells[multipleIndex]}`);
      }
      if (rows.length) return `Fwd P/E ${rows.join(" ")}`;
    }
    return panel.textContent;
  }

  function completionMessage(plan, openedPanels = []) {
    const commands = plan.steps.filter(step => step.kind === "command");
    const controls = plan.steps.filter(step => step.kind === "control");
    const configured = plan.steps.filter(step => step.kind === "configure");
    if (!commands.length) {
      const fact = groundedCompletionFact(openedPanels);
      if (fact) return fact;
      if (controls.length === 1 && !configured.length) return ({
        close: "Window closed.", focus: "On screen.", maximize: "Adjusted.", restore: "Adjusted.",
        resize: "Adjusted.", move: "Adjusted.", export: "Export ready."
      })[controls[0].operation] ?? "Consider it done.";
      return configured.length ? "Updated." : "Done.";
    }
    const subjects = commands.map(commandSubject);
    const closed = controls.filter(step => step.operation === "close").length;
    const fact = groundedCompletionFact(openedPanels);
    if (fact) return fact;
    if (subjects.length === 1) return `${subjects[0]}, on screen.`;
    const action = closed ? `${subjects.join(" and ")}, on screen.` : `${subjects.join(" and ")} are ready.`;
    return action;
  }

  async function acknowledge(id, status, startedAt, error = null, message = "", steps = [], suppressSpokenFeedback = false) {
    if (!id) return;
    const response = await fetch(`${config.handoffUrl}/ack`, {
      method: "POST",
      headers: { "Content-Type": "text/plain", Authorization: `Bearer ${config.secret}` },
      body: JSON.stringify({
        id, client_id: clientId, executor_id: clientId, document_generation: documentGeneration,
        status, duration_ms: Date.now() - startedAt,
        error: error?.message ?? "", message, steps, suppress_spoken_feedback: suppressSpokenFeedback
      })
    });
    if (!response.ok) throw new Error(`acknowledgement returned ${response.status}`);
    return response.json();
  }

  async function releaseForRetry(id, error) {
    if (!id) return;
    await fetch(`${config.handoffUrl}/retry`, {
      method: "POST",
      headers: { "Content-Type": "text/plain", Authorization: `Bearer ${config.secret}` },
      body: JSON.stringify({ id, client_id: clientId, executor_id: clientId, document_generation: documentGeneration,
        reason: error?.message ?? "executor reload" })
    });
  }

  async function heartbeat(id) {
    const response = await fetch(`${config.handoffUrl}/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "text/plain", Authorization: `Bearer ${config.secret}` },
      body: JSON.stringify({ id, client_id: clientId, executor_id: clientId, document_generation: documentGeneration })
    });
    if (!response.ok) throw new CancelledError("Workflow lease was lost");
  }

  async function eligibleExecutor() {
    // A focused top-level Godel document is necessarily the active tab in the
    // focused browser window. Avoid waking the MV3 service worker on every
    // 100 ms queue poll; that round trip was often slower than the command
    // compiler itself and created visible start jitter.
    if (document.visibilityState !== "visible") return false;
    const identity = await executorIdentityReady;
    if (document.hasFocus()) return Boolean(identity.executorId && identity.documentGeneration);
    // Visibility without document focus is unusual, but retain the stricter
    // browser-level check as a safe compatibility fallback.
    const response = await runtimeMessage({ type: "godel-voice:executor-eligibility" });
    return response?.ok === true && response.eligible === true
      && response.executor_id === identity.executorId
      && response.document_generation === identity.documentGeneration;
  }

  function emitCompletion({ id, status, message, durationMs, acknowledged = true, premiumVoice = false }) {
    clearStartAcknowledgement(true);
    window.dispatchEvent(new CustomEvent("godel-voice:completion", {
      detail: { id, status, message, durationMs, acknowledged }
    }));
    if (!acknowledged || premiumVoice || status !== "completed" || config.spokenFeedback === false || !("speechSynthesis" in window)) return;
    setTimeout(() => {
      try {
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.rate = 1.08;
        speechSynthesis.speak(utterance);
      } catch {}
    }, 0);
  }

  function clearStartAcknowledgement(cancelSpeech = false) {
    if (startSpeechTimer !== null) {
      clearTimeout(startSpeechTimer);
      startSpeechTimer = null;
    }
    if (cancelSpeech && startSpeechUtterance && "speechSynthesis" in window) {
      try { speechSynthesis.cancel(); } catch {}
    }
    startSpeechUtterance = null;
  }

  function emitStartAcknowledgement(premiumVoice = false) {
    toast("Godel Voice: On it");
    if (premiumVoice || config.spokenFeedback === false || !("speechSynthesis" in window)) return;
    clearStartAcknowledgement(true);
    startSpeechTimer = setTimeout(() => {
      startSpeechTimer = null;
      try {
        const utterance = new SpeechSynthesisUtterance("On it.");
        utterance.rate = 1.12;
        startSpeechUtterance = utterance;
        const clear = () => {
          if (startSpeechUtterance === utterance) startSpeechUtterance = null;
        };
        utterance.addEventListener("end", clear, { once: true });
        utterance.addEventListener("error", clear, { once: true });
        speechSynthesis.speak(utterance);
      } catch { startSpeechUtterance = null; }
    }, 0);
  }

  async function poll() {
    if (running || polling) return;
    polling = true;
    try {
      await lifecycleCleanup;
      const { executorId, documentGeneration: generation } = await executorIdentityReady;
      if (!(await eligibleExecutor().catch(() => false))) return;
      const response = await fetch(`${config.handoffUrl}/next?client=${encodeURIComponent(executorId)}&executor=${encodeURIComponent(executorId)}&generation=${encodeURIComponent(generation)}`, {
        cache: "no-store", headers: { Authorization: `Bearer ${config.secret}` }
      });
      if (response.status === 204) return;
      if (!response.ok) throw new Error(`handoff server returned ${response.status}`);
      const payload = await response.json();
      // A session-start event can arrive while /next is in flight. Rejoin the
      // serialized cleanup barrier before claiming the workspace so a stale
      // cleanup can never run behind this newly leased request.
      await lifecycleCleanup;
      running = true;
      const startedAt = Date.now();
      if (!payload.realtime) emitStartAcknowledgement(payload.premium_voice === true);
      let leaseLost = null;
      let heartbeatFailures = 0;
      const heartbeatEvery = Math.max(2_000, Math.min(10_000, Math.floor(Number(payload.lease_ms ?? 60_000) / 3)));
      const heartbeatTimer = setInterval(() => {
        heartbeat(payload.id).then(() => { heartbeatFailures = 0; }).catch(error => {
          heartbeatFailures += 1;
          if (error instanceof CancelledError || heartbeatFailures >= 3) leaseLost = error;
        });
      }, heartbeatEvery);
      try {
        const result = await executePlan(payload.marker, payload.id);
        if (leaseLost) throw leaseLost;
        let acknowledged = true;
        let acknowledgement = null;
        // Realtime is already waiting in this page. Release its verified
        // completion immediately; server acknowledgement is bookkeeping and
        // must not add network latency before Jarvis can answer.
        if (payload.realtime === true) {
          emitCompletion({
            id: payload.id, status: "completed", message: result.message,
            durationMs: Date.now() - startedAt, acknowledged: true, premiumVoice: true
          });
          publishExecutorContext().catch(() => {});
        }
        try { acknowledgement = await acknowledge(payload.id, "completed", startedAt, null, result.message, result.steps, payload.realtime === true); }
        catch { acknowledged = false; toast("Godel Voice completed, but status sync failed", true); }
        if (payload.realtime !== true) {
          emitCompletion({
            id: payload.id, status: "completed", message: result.message, durationMs: Date.now() - startedAt, acknowledged,
            premiumVoice: acknowledgement?.spoken_feedback_queued === true
          });
        }
      } catch (error) {
        if (error instanceof ExtensionReloadError) {
          clearStartAcknowledgement(true);
          await releaseForRetry(payload.id, error).catch(() => {});
          toast(error.message, true);
          return;
        }
        const status = error instanceof CancelledError ? "cancelled" : "failed";
        await acknowledge(payload.id, status, startedAt, error, "", error.stepTimings ?? [], payload.realtime === true).catch(() => {});
        const message = status === "cancelled" ? "Godel Voice cancelled" : `Godel Voice stopped: ${error.message}`;
        toast(message, true);
        emitCompletion({ id: payload.id, status, message, durationMs: Date.now() - startedAt, premiumVoice: payload.realtime === true });
      }
      finally { clearInterval(heartbeatTimer); running = false; }
    } catch (error) {
      // The local server is intentionally on-demand. Stay silent while it is
      // absent so an ordinary Godel session has no warnings or network noise.
    }
    finally { polling = false; }
  }

  setInterval(poll, 100);
  let jarvisSessionEpoch = 0;
  let lifecycleCleanup = Promise.resolve();
  function queueVoiceCleanup(requestedEpoch) {
    lifecycleCleanup = lifecycleCleanup.then(async () => {
      for (let attempt = 0; attempt < 700 && running; attempt += 1) await pause(50);
      if (requestedEpoch !== jarvisSessionEpoch || running) return;
      await workspaceInternalAction("createScreen", { name: "Voice" });
      await restoreBorrowedWindows();
      await workspaceInternalAction("createScreen", { name: "Voice" });
      await closeVoiceScreenPanels();
      await publishExecutorContext();
    }).catch(() => {
      // Lifecycle cleanup is best-effort and never blocks a later retry.
    });
  }
  window.addEventListener("godel-voice:session-started", () => {
    jarvisSessionEpoch += 1;
    queueVoiceCleanup(jarvisSessionEpoch);
  });
  window.addEventListener("godel-voice:cleanup-request", () => {
    queueVoiceCleanup(jarvisSessionEpoch);
  });
  // Context is also published immediately after Realtime work. A slower idle
  // cadence avoids repeatedly scanning Godel's large dashboard DOM.
  setInterval(() => publishExecutorContext().catch(() => {}), 2_500);
  window.addEventListener("focus", () => publishExecutorContext().catch(() => {}));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") publishExecutorContext().catch(() => {});
  });
  poll();
  publishExecutorContext().catch(() => {});
})();
