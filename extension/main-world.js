(() => {
  "use strict";

  const REQUEST = "godel-voice:panel-action";
  const RESPONSE = "godel-voice:panel-action-result";
  let webpackRequire = null;

  function respond(detail) {
    window.dispatchEvent(new CustomEvent(RESPONSE, { detail }));
  }

  function fiberOf(element) {
    const key = Object.keys(element).find(name =>
      name.startsWith("__reactFiber$") || name.startsWith("__reactInternalInstance$"));
    return key ? element[key] : null;
  }

  function propsOf(fiber) {
    return fiber?.memoizedProps ?? fiber?.pendingProps ?? null;
  }

  function walkFiber(element, predicate) {
    const first = fiberOf(element);
    const starts = [first, first?.alternate].filter(Boolean);
    const seen = new Set();
    for (const start of starts) {
      for (let fiber = start; fiber && !seen.has(fiber); fiber = fiber.return) {
        seen.add(fiber);
        const props = propsOf(fiber);
        if (props && predicate(props, fiber)) return { fiber, props };
      }
    }
    return null;
  }

  function scanFiberProps(root, predicate) {
    const seen = new Set();
    for (const element of [root, ...root.querySelectorAll("*")]) {
      for (let fiber = fiberOf(element); fiber; fiber = fiber.return) {
        if (seen.has(fiber)) break;
        seen.add(fiber);
        const props = propsOf(fiber);
        if (props && predicate(props, fiber)) return { fiber, props };
      }
    }
    return null;
  }

  function searchFiberSubtree(root, predicate) {
    const rootFiber = fiberOf(root);
    const stack = [rootFiber?.child, rootFiber?.alternate?.child].filter(Boolean);
    const seen = new Set();
    while (stack.length) {
      const fiber = stack.pop();
      if (!fiber || seen.has(fiber)) continue;
      seen.add(fiber);
      const props = propsOf(fiber);
      if (props && predicate(props, fiber)) return { fiber, props };
      if (fiber.sibling) stack.push(fiber.sibling);
      if (fiber.child) stack.push(fiber.child);
      if (fiber.alternate) stack.push(fiber.alternate);
    }
    return null;
  }

  function railFor(root) {
    const predicate = props =>
        Array.isArray(props.series)
        && typeof props.onAddCompany === "function"
        && (typeof props.onAddSeriesForCompany === "function"
          || typeof props.onToggleMetric === "function");
    const rail = searchFiberSubtree(root, predicate)
      ?? scanFiberProps(root, predicate);
    if (!rail) throw new Error("Godel GF rail callbacks unavailable");
    return rail;
  }

  function userDataFor(element) {
    const first = fiberOf(element);
    const starts = [first, first?.alternate].filter(Boolean);
    const seen = new Set();
    for (const start of starts) {
      for (let fiber = start; fiber && !seen.has(fiber); fiber = fiber.return) {
        seen.add(fiber);
        for (let dependency = fiber.dependencies?.firstContext; dependency; dependency = dependency.next) {
          if (dependency.memoizedValue?.ssrUser?.jwt) return dependency.memoizedValue;
        }
      }
    }
    throw new Error("Godel authenticated search context unavailable");
  }

  function requireGodelModule(id) {
    if (!webpackRequire) {
      const chunks = window.webpackChunk_N_E;
      if (!Array.isArray(chunks)) throw new Error("Godel module runtime unavailable");
      chunks.push([[Date.now()], {}, runtime => { webpackRequire = runtime; }]);
    }
    return webpackRequire(id);
  }

  async function resolveCompany(root, symbol) {
    const input = [...root.querySelectorAll("input")].find(element =>
      /add a company/i.test([element.placeholder, element.getAttribute("aria-label")].filter(Boolean).join(" ")))
      ?? root.querySelector("input");
    if (!input) throw new Error("Godel company search context missing");
    const userData = userDataFor(input);
    const search = requireGodelModule(85515).Ve;
    const normalize = requireGodelModule(45916).o;
    const { instruments = [] } = await search({
      query: symbol,
      userData,
      types: ["instruments"],
      instrumentsCount: 7,
      extantRelationships: ["AGGREGATE_RTH"]
    });
    const matches = instruments
      .filter(item => item?.seriesContext)
      .map(item => normalize(item.seriesContext))
      .filter(item => item.securityId === symbol && item.sourceId === "US");
    if (matches.length !== 1) throw new Error(`Expected one Godel US match for ${symbol}, found ${matches.length}`);
    return matches[0];
  }

  function controlFor(root, title, predicate) {
    const element = root.querySelector(`[title="${CSS.escape(title)}"]`);
    if (!element) throw new Error(`Godel ${title} control missing`);
    const control = walkFiber(element, predicate)
      ?? searchFiberSubtree(root, predicate)
      ?? scanFiberProps(root, predicate);
    if (!control) throw new Error(`Godel ${title} callback unavailable`);
    return control.props;
  }

  function scopedGFRoot(root, rawSecurity) {
    const security = String(rawSecurity ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9./-]{1,16}$/.test(security)) return root;
    const anchors = [...root.querySelectorAll("button")].filter(element =>
      element.getAttribute("aria-label") === `Add metric for ${security}`);
    const panels = [];
    for (const anchor of anchors) {
      for (let element = anchor.parentElement, depth = 0; element && element !== root.parentElement && depth < 16;
        element = element.parentElement, depth += 1) {
        const hasCompanyInput = [...element.querySelectorAll("input")].some(input =>
          /add a company/i.test([input.placeholder, input.getAttribute("aria-label")].filter(Boolean).join(" ")));
        if (hasCompanyInput && element.querySelector('[title="Periodicity"]') && element.querySelector('[title="Layout"]')) {
          panels.push(element); break;
        }
      }
    }
    const unique = [...new Set(panels)];
    if (unique.length !== 1) throw new Error(`Expected one Godel GF panel for ${security}, found ${unique.length}`);
    return unique[0];
  }

  async function setGFChoice(root, title, allowed, desired) {
    if (!allowed.includes(desired)) throw new Error(`Unsupported GF ${title.toLowerCase()}`);
    const props = controlFor(root, title, candidate =>
      candidate.title === title && Array.isArray(candidate.options) && typeof candidate.onChange === "function");
    const option = props.options.find(candidate =>
      [candidate?.value, candidate?.label, candidate].some(value => String(value ?? "").toLowerCase() === desired.toLowerCase()));
    if (option == null) throw new Error(`Godel GF ${title} does not offer ${desired}`);
    const nativeValue = String(option?.value ?? option?.label ?? option);
    if (String(props.value).toLowerCase() === nativeValue.toLowerCase()) return;
    const beforeRender = [...root.querySelectorAll("svg,canvas")].map(element => {
      const rect = element.getBoundingClientRect();
      return `${element.tagName}:${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)}:${element.querySelectorAll?.("path").length ?? 0}`;
    }).join("|");
    props.onChange(nativeValue);
    await waitForElement(() => {
      try {
        const exactState = controlFor(root, title, candidate =>
          candidate.title === title && Array.isArray(candidate.options) && typeof candidate.onChange === "function"
          && String(candidate.value).toLowerCase() === nativeValue.toLowerCase());
        if (!exactState) return false;
        // Range changes can preserve the chart's SVG geometry and path count,
        // especially when Godel only changes the visible domain. The native
        // controlled value is the authoritative postcondition in that case.
        if (title === "Range") return true;
        if (title === "Periodicity") {
          const leafLabels = [...root.querySelectorAll("*")].filter(element => element.children.length === 0)
            .map(element => String(element.textContent ?? "").replace(/\s+/g, " ").trim());
          const pattern = desired === "Annual" ? /^FY\s*'?\d{2,4}$/i : /^Q[1-4]\s*'?\d{2,4}$/i;
          return leafLabels.filter(label => pattern.test(label)).length >= 2;
        }
        const afterRender = [...root.querySelectorAll("svg,canvas")].map(element => {
          const rect = element.getBoundingClientRect();
          return `${element.tagName}:${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)}:${element.querySelectorAll?.("path").length ?? 0}`;
        }).join("|");
        return afterRender !== beforeRender;
      } catch { return false; }
    }, `GF ${title} ${desired}`, 5000);
  }

  async function setGFRange(root, desired) {
    const allowed = ["1Y", "3Y", "5Y", "10Y", "Max"];
    if (!allowed.includes(desired)) throw new Error("Unsupported GF range");
    const stableRootId = typeof root.id === "string" && /^[A-Za-z0-9_-]{1,140}$/.test(root.id) ? root.id : null;
    const currentRoot = () => (stableRootId ? document.getElementById(stableRootId) : null) ?? root;
    const groupFor = () => currentRoot().querySelector('[title="Range"]');
    if (!groupFor()) throw new Error("Godel Range control missing");
    const buttonFor = () => [...(groupFor()?.querySelectorAll("button") ?? [])].find(element =>
      String(element.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase() === desired.toLowerCase());
    const active = button => String(button?.className ?? "").includes("bg-[#222222]")
      && String(button?.className ?? "").includes("text-[#eaeaea]");
    const deadline = Date.now() + 6000;
    let stableSince = 0;
    while (Date.now() < deadline) {
      const button = buttonFor();
      if (!button) throw new Error(`Godel GF Range does not offer ${desired}`);
      if (active(button)) {
        stableSince ||= Date.now();
        if (Date.now() - stableSince >= 900) return;
      } else {
        stableSince = 0;
        const props = reactPropsFor(button);
        if (typeof props?.onClick !== "function") throw new Error(`Godel GF Range ${desired} callback unavailable`);
        props.onClick();
      }
      await new Promise(resolve => setTimeout(resolve, 120));
    }
    throw new Error(`GF verified Range ${desired} unavailable`);
  }

  async function setGFDisplayCurrency(root, rawValue) {
    const value = String(rawValue ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(value)) throw new Error("Unsupported GF display currency");
    const candidates = [...root.querySelectorAll("select")].filter(select =>
      String(select.getAttribute("aria-label") ?? select.title ?? "").trim() === "Display currency");
    if (candidates.length !== 1) throw new Error(`Expected one Godel GF display-currency selector, found ${candidates.length}`);
    const select = candidates[0];
    const options = [...select.options].filter(option =>
      String(option.value ?? "").toUpperCase() === value
      || String(option.textContent ?? "").trim().toUpperCase() === value);
    if (options.length !== 1) throw new Error(`Godel GF does not offer display currency ${value}`);
    const option = options[0];
    if (select.selectedOptions?.[0] === option) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    if (typeof setter !== "function") throw new Error("Godel GF currency setter unavailable");
    setter.call(select, option.value);
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await waitForElement(() => {
      const selected = candidates[0].selectedOptions?.[0];
      const selectedMatches = selected === option
        || String(selected?.value ?? "").toUpperCase() === value
        || String(selected?.textContent ?? "").trim().toUpperCase() === value;
      const renderedUnit = [...root.querySelectorAll("*")].some(element =>
        element.children.length === 0 && String(element.textContent ?? "").replace(/\s+/g, " ").trim().toUpperCase() === value);
      return selectedMatches && renderedUnit;
    }, `GF display currency ${value}`, 5000);
  }

  async function waitForBuilder(root) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const button = [...root.querySelectorAll("button")]
        .find(element => element.textContent.trim() === "Add series");
      if (button) {
        const predicate = props =>
          Array.isArray(props.series)
          && typeof props.onAdd === "function"
          && typeof props.onClose === "function"
          && typeof props.metricAvailabilityFor === "function";
        const builder = walkFiber(button, predicate)
          ?? searchFiberSubtree(root, predicate)
          ?? scanFiberProps(root, predicate);
        if (builder) return builder.props;
      }
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error("Godel metric builder callbacks unavailable");
  }

  async function waitForElement(find, description, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const element = find();
      if (element) return element;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error(`Godel ${description} unavailable`);
  }

  function metricDialogFor(element) {
    for (let root = element, depth = 0; root && depth < 12; root = root.parentElement, depth += 1) {
      const labelled = [...root.querySelectorAll("[aria-label],[title]")]
        .map(control => control.getAttribute("aria-label") ?? control.getAttribute("title") ?? "").join(" ");
      const text = `${root.textContent ?? ""} ${labelled}`;
      const hasAdd = /(?:^|\s)Add series(?:\s|$)/.test(String(text).replace(/\s+/g, " "));
      if (hasAdd && text.includes("PREVIEW") && text.includes("RATIOS")) return root;
    }
    return null;
  }

  function semanticMetricControl(dialog, label) {
    const wanted = String(label).replace(/\s+/g, " ").trim();
    const sources = [...dialog.querySelectorAll("*")].filter(element => {
      const text = String(element.getAttribute?.("aria-label") ?? element.getAttribute?.("title")
        ?? element.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text !== wanted && !text.startsWith(`${wanted} Add to favorites`)) return false;
      return ![...element.children].some(child => {
        const childText = String(child.getAttribute?.("aria-label") ?? child.getAttribute?.("title")
          ?? child.textContent ?? "").replace(/\s+/g, " ").trim();
        return childText === wanted || childText.startsWith(`${wanted} Add to favorites`);
      });
    });
    const controls = [];
    for (const source of sources) {
      for (let element = source, depth = 0; element && element !== dialog && depth < 6; element = element.parentElement, depth += 1) {
        const role = element.getAttribute?.("role");
        const tag = element.tagName;
        const props = reactPropsFor(element);
        if (["BUTTON", "LABEL", "INPUT"].includes(tag)
            || ["button", "radio", "option", "checkbox", "switch"].includes(role)
            || typeof props?.onClick === "function" || typeof props?.onChange === "function") {
          controls.push(element);
          break;
        }
      }
    }
    const unique = [...new Set(controls)];
    if (unique.length !== 1) throw new Error(`Expected one Godel ${label} metric control, found ${unique.length}`);
    return unique[0];
  }

  async function runGF(root, action, payload) {
    const panelRoot = root;
    const stablePanelRootId = typeof panelRoot.id === "string" && /^[A-Za-z0-9_-]{1,140}$/.test(panelRoot.id)
      ? panelRoot.id : null;
    const livePanelRoot = () => (stablePanelRootId ? document.getElementById(stablePanelRootId) : null) ?? panelRoot;
    const liveScopedRoot = () => scopedGFRoot(livePanelRoot(), payload.security);
    root = liveScopedRoot();
    if (action === "addCompany") {
      const symbol = String(payload.symbol ?? "").toUpperCase();
      if (!/^[A-Z0-9./-]{1,16}$/.test(symbol)) throw new Error("Invalid company symbol");
      const rail = railFor(root);
      const company = rail.props.series.some(item => item.securityId === symbol)
        ? null : await resolveCompany(root, symbol);
      const deadline = Date.now() + 8000;
      let stableSince = 0;
      let lastAddAt = 0;
      while (Date.now() < deadline) {
        const currentRail = railFor(liveScopedRoot());
        const loaded = currentRail.props.series.some(item => item.securityId === symbol);
        if (loaded) {
          stableSince ||= Date.now();
          if (Date.now() - stableSince >= 900) return;
        } else {
          stableSince = 0;
          if (company && Date.now() - lastAddAt >= 600) {
            currentRail.props.onAddCompany(company);
            lastAddAt = Date.now();
          }
        }
        await new Promise(resolve => setTimeout(resolve, 120));
      }
      throw new Error(`${symbol} company series did not stabilize`);
    }
    if (action === "setRange") {
      const value = String(payload.value ?? "").toUpperCase();
      if (!["1Y", "3Y", "5Y", "10Y", "MAX"].includes(value)) throw new Error("Unsupported GF range");
      await setGFRange(panelRoot, value === "MAX" ? "Max" : value);
      return;
    }
    if (action === "verifyRange") {
      const value = String(payload.value ?? "").toUpperCase();
      if (!["1Y", "3Y", "5Y", "10Y", "MAX"].includes(value)) throw new Error("Unsupported GF range");
      const canonical = value === "MAX" ? "Max" : value;
      await setGFRange(panelRoot, canonical);
      return;
    }
    if (action === "setPeriodicity") {
      const value = String(payload.value ?? "").trim().toLowerCase();
      const canonical = { quarterly: "Quarterly", annual: "Annual" }[value];
      if (!canonical) throw new Error("Unsupported GF periodicity");
      await setGFChoice(root, "Periodicity", ["Quarterly", "Annual"], canonical);
      return;
    }
    if (action === "setLayout") {
      const value = String(payload.value ?? "").trim().toLowerCase();
      const canonical = { overlay: "Overlay", split: "Split" }[value];
      if (!canonical) throw new Error("Unsupported GF layout");
      await setGFChoice(root, "Layout", ["Overlay", "Split"], canonical);
      return;
    }
    if (action === "setDisplayCurrency") {
      await setGFDisplayCurrency(root, payload.value);
      return;
    }
    if (action === "setEstimates") {
      const value = payload.value === true;
      controlFor(root, "Include consensus estimates", props =>
        typeof props.value === "boolean" && typeof props.onChange === "function").onChange(value);
      return;
    }
    if (action === "addMetric") {
      const symbol = String(payload.symbol ?? "").toUpperCase();
      const metricKey = String(payload.metricKey ?? "").toLowerCase();
      const metricLabels = {
        revenue: "Revenue",
        gross_margin: "Gross Margin",
        operating_margin: "Operating Margin",
        net_margin: "Net Margin",
        rd_revenue: "R&D as % of Revenue",
        sga_revenue: "SG&A as % of Revenue",
        roe: "Return on Equity",
        pe: "P/E",
        ps: "P/S",
        pb: "P/B",
        pcf: "P/CF"
      };
      const directMetricKeys = {
        revenue: "revenue",
        operating_margin: "operatingProfitMargin"
      };
      if (!metricLabels[metricKey]) throw new Error("Unsupported GF metric");
      const metricLabel = metricLabels[metricKey];
      const removeControl = label => [...liveScopedRoot().querySelectorAll("button")].find(element => {
        const description = [element.getAttribute("aria-label"), element.getAttribute("title")]
          .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
        return description.toLowerCase().startsWith(`remove ${symbol} us ${label}`.toLowerCase());
      });
      // Metric labels repeat across companies. Only an exact, symbol-scoped
      // remove control proves that the requested series exists.
      const metricRendered = label => Boolean(removeControl(label));
      const removeDefaultRevenue = async () => {
        if (metricKey === "revenue" || payload.keepDefaultRevenue === true) return;
        const revenueRemove = removeControl("Revenue");
        if (!revenueRemove) return;
        revenueRemove.click();
        await waitForElement(() => !removeControl("Revenue"), `${symbol} default Revenue removed`);
      };
      const rail = railFor(liveScopedRoot());
      const base = rail.props.series.find(item => item.securityId === symbol);
      if (!base) throw new Error(`Godel company ${symbol} is not loaded`);
      if (metricRendered(metricLabel)) {
        await removeDefaultRevenue();
        return;
      }
      const addMetric = [...liveScopedRoot().querySelectorAll("button")].find(element =>
        element.getAttribute("aria-label") === `Add metric for ${symbol}`);
      if (!addMetric) throw new Error(`Godel add-metric control for ${symbol} unavailable`);
      const expectedIds = new Set(rail.props.series.map(item => item.id));
      let builder = null;
      const builderDeadline = Date.now() + 6000;
      while (Date.now() < builderDeadline) {
        const currentButton = [...liveScopedRoot().querySelectorAll("button")].find(element =>
          element.getAttribute("aria-label") === `Add metric for ${symbol}`);
        if (!currentButton) throw new Error(`Godel add-metric control for ${symbol} unavailable`);
        currentButton.click();
        const candidate = await waitForBuilder(livePanelRoot());
        const candidateIds = new Set(candidate.series.map(item => item.id));
        if ([...expectedIds].every(id => candidateIds.has(id))) {
          builder = candidate;
          break;
        }
        candidate.onClose();
        await new Promise(resolve => setTimeout(resolve, 180));
      }
      if (!builder) throw new Error(`Godel ${symbol} metric builder did not synchronize`);

      // The builder's own onAdd callback is the most reliable mutation seam:
      // it deduplicates, assigns native colors, persists the layout, and keeps
      // every series from the synchronized snapshot. Use it for the two most
      // common comparison metrics whose exact internal keys are live-proven.
      const directMetricKey = directMetricKeys[metricKey];
      if (directMetricKey) {
        const directBase = builder.series.find(item => item.securityId === symbol);
        if (!directBase) {
          builder.onClose();
          throw new Error(`Godel company ${symbol} is not loaded in the metric builder`);
        }
        let nextSeries = builder.series;
        if (metricKey !== "revenue" && payload.keepDefaultRevenue !== true) {
          nextSeries = nextSeries.filter(item =>
            !(item.securityId === symbol && item.metricKey === "revenue"));
        }
        const directSeries = {
          ...directBase,
          id: `${directBase.seriesId}:${directMetricKey}`,
          metricKey: directMetricKey,
          color: null
        };
        builder.onAdd([...nextSeries, directSeries]);
        builder.onClose();
        await waitForElement(() => metricRendered(metricLabel), `${symbol} ${metricLabel} series`, 5000);
        await removeDefaultRevenue();
        return;
      }
      let metric;
      try {
        metric = await waitForElement(() => {
          try { return semanticMetricControl(livePanelRoot(), metricLabel); } catch { return null; }
        }, `${metricLabel} metric`);
      } catch (error) {
        [...document.querySelectorAll("button,[role='button']")]
          .find(element => element.textContent.trim() === "Cancel" && metricDialogFor(element))?.click();
        throw error;
      }
      const dialog = metricDialogFor(metric) ?? livePanelRoot();
      if (metric.disabled || metric.getAttribute("aria-disabled") === "true") {
        [...dialog.querySelectorAll("button")].find(element => element.textContent.trim() === "Cancel")?.click();
        throw new Error(`Godel ${metricLabels[metricKey]} has no data for ${symbol}`);
      }
      metric.click();
      const addSeries = await waitForElement(() => [...dialog.querySelectorAll("button")].find(element =>
        element.textContent.trim() === "Add series" && !element.disabled && element.getAttribute("aria-disabled") !== "true"), "Add series control");
      addSeries.click();
      await waitForElement(() => metricRendered(metricLabel), `${symbol} ${metricLabel} series`, 5000);
      await removeDefaultRevenue();
      return;
    }
    throw new Error("Unsupported Godel GF internal action");
  }

  function exactSelectOption(select, label) {
    const wanted = String(label ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    const matches = [...select.options].filter(option =>
      String(option.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase() === wanted);
    if (matches.length !== 1) throw new Error(`Expected one Godel EM option for ${label}, found ${matches.length}`);
    return matches[0];
  }

  function emMetricSelect(root) {
    const expected = new Set(["Sales", "EBITDA", "EPS (GAAP)"]);
    const candidates = [...root.querySelectorAll("select")].filter(select => {
      const labels = new Set([...select.options].map(option => String(option.textContent ?? "").replace(/\s+/g, " ").trim()));
      return [...expected].every(label => labels.has(label));
    });
    if (candidates.length !== 1) throw new Error(`Expected one Godel EM metric selector, found ${candidates.length}`);
    return candidates[0];
  }

  function readEMValuation(root, payload) {
    const rowLabel = String(payload.row ?? "").replace(/\s+/g, " ").trim();
    const semanticUnit = String(payload.semantic_unit ?? "").trim();
    const allowedRows = new Set(["P/E", "P/B", "P/S", "P/CF", "EV/EBITDA", "EV/Sales", "EV/CF", "EV/FCF", "Dividend Yield"]);
    const expectedUnit = rowLabel === "Dividend Yield" ? "Percent" : "Multiple";
    if (!allowedRows.has(rowLabel) || payload.section !== "Multiples" || semanticUnit !== expectedUnit) {
      throw new Error("Invalid Godel EM valuation request");
    }
    const multiplesHeading = [...root.querySelectorAll("*")]
      .filter(visibleElement)
      .some(element => compactElementText(element) === "Multiples");
    if (!multiplesHeading) throw new Error("Godel EM Multiples heading is missing");
    const tables = [...root.querySelectorAll("table,[role='table'],[role='grid']")].filter(visibleElement);
    const matches = [];
    for (const table of tables) {
      const headers = [...table.querySelectorAll("thead th,[role='columnheader']")]
        .map(cell => compactElementText(cell));
      if (headers[0] !== "Last 4Q" || headers[1] !== "Next 4Q" || !headers.slice(2).some(label => /^FY \d{4}$/.test(label))) continue;
      for (const row of table.querySelectorAll("tbody tr,[role='row']")) {
        const cells = [...row.querySelectorAll("th,td,[role='rowheader'],[role='cell'],[role='gridcell']")]
          .map(cell => compactElementText(cell));
        if (cells[0] !== rowLabel || cells.length !== headers.length + 1) continue;
        const values = cells.slice(1);
        const pattern = semanticUnit === "Multiple" ? /^-?\d{1,5}(?:\.\d{1,6})?\s*[x×]$/i : /^-?\d{1,5}(?:\.\d{1,6})?\s*%$/;
        if (!values.every(value => pattern.test(value))) throw new Error(`Godel EM ${rowLabel} has invalid ${semanticUnit.toLowerCase()} units`);
        matches.push({ row: rowLabel, semantic_unit: semanticUnit, values: headers.map((period, index) => ({ period, value: values[index] })) });
      }
    }
    if (matches.length !== 1) throw new Error(`Expected one Godel EM ${rowLabel} Multiples row, found ${matches.length}`);
    return matches[0];
  }

  async function runEM(root, action, payload) {
    if (action === "readValuation") return readEMValuation(root, payload);
    if (action !== "selectMetric") throw new Error("Unsupported Godel EM internal action");
    const label = String(payload.value ?? "").replace(/\s+/g, " ").trim();
    const select = emMetricSelect(root);
    const option = exactSelectOption(select, label);
    if (select.selectedOptions?.[0] === option) return;

    const reactProps = reactPropsFor(select);
    if (typeof reactProps?.onChange === "function") {
      reactProps.onChange({ target: { value: option.value }, currentTarget: { value: option.value } });
    } else {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      if (typeof setter !== "function") throw new Error("Godel EM selector setter unavailable");
      setter.call(select, option.value);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await waitForElement(() => {
      const current = emMetricSelect(root);
      return String(current.selectedOptions?.[0]?.textContent ?? "").replace(/\s+/g, " ").trim() === label;
    }, `EM ${label} metric`, 5000);
  }

  function mostResultCountSelect(root) {
    const wanted = new Set(["10", "25", "50", "100"]);
    const candidates = [...root.querySelectorAll("select")].filter(select => {
      const labels = new Set([...select.options].map(option => String(option.textContent ?? "").trim()));
      return [...wanted].every(label => labels.has(label));
    });
    if (candidates.length !== 1) throw new Error(`Expected one Godel MOST result-count selector, found ${candidates.length}`);
    return candidates[0];
  }

  function tableDataRows(root) {
    return [...root.querySelectorAll("table tr,[role='row']")].filter(row =>
      row.querySelector("td,[role='cell'],[role='gridcell']"));
  }

  async function runMOST(root, action, payload) {
    if (action !== "selectResultCount") throw new Error("Unsupported Godel MOST internal action");
    const count = Number(payload.value);
    if (![10, 25, 50, 100].includes(count)) throw new Error("Unsupported Godel MOST result count");
    const select = mostResultCountSelect(root);
    const option = exactSelectOption(select, String(count));
    if (select.selectedOptions?.[0] !== option) {
      const reactProps = reactPropsFor(select);
      if (typeof reactProps?.onChange === "function") {
        reactProps.onChange({ target: { value: option.value }, currentTarget: { value: option.value } });
      } else {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
        if (typeof setter !== "function") throw new Error("Godel MOST selector setter unavailable");
        setter.call(select, option.value);
        select.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    await waitForElement(() => {
      const current = mostResultCountSelect(root);
      const rows = tableDataRows(root);
      return String(current.selectedOptions?.[0]?.textContent ?? "").trim() === String(count)
        && rows.length > 0 && rows.length <= count;
    }, `MOST ${count} results`, 5000);
  }

  function omonStrikeSlider(root) {
    const sliders = [...root.querySelectorAll('input[type="range"],[role="slider"]')]
      .filter(visibleElement);
    if (sliders.length !== 1) throw new Error(`Expected one Godel OMON strike-depth slider, found ${sliders.length}`);
    return sliders[0];
  }

  function omonSliderBounds(slider) {
    const props = reactPropsFor(slider) ?? {};
    const read = name => Number(slider.getAttribute(name) ?? props[name]);
    const bounds = { minimum: read("min"), maximum: read("max"), step: read("step") };
    if (!Number.isInteger(bounds.minimum) || !Number.isInteger(bounds.maximum)
        || !Number.isInteger(bounds.step) || bounds.minimum <= 0
        || bounds.minimum > bounds.maximum || bounds.step !== 5) {
      throw new Error("Godel OMON live strike-depth bounds are unavailable");
    }
    return bounds;
  }

  function omonStrikeLabel(root, value) {
    const wanted = `${value} strikes`;
    const labels = [...root.querySelectorAll("div,span,p,label")].filter(element =>
      visibleElement(element) && compactElementText(element).toLowerCase() === wanted
      && ![...element.children].some(child => visibleElement(child) && compactElementText(child)));
    if (labels.length !== 1) throw new Error(`Expected one Godel OMON ${wanted} label, found ${labels.length}`);
    return labels[0];
  }

  function omonStrikeRows(root) {
    const tables = [...root.querySelectorAll("table,[role='table'],[role='grid']")].filter(table => {
      if (!visibleElement(table)) return false;
      const text = compactElementText(table).toLowerCase();
      return text.includes("strike") && text.includes("bid") && text.includes("ask");
    });
    if (tables.length !== 1) throw new Error(`Expected one Godel OMON option table, found ${tables.length}`);
    return { rows: tableDataRows(tables[0]).length, signature: compactElementText(tables[0]) };
  }

  function omonStrikeState(root) {
    const slider = omonStrikeSlider(root);
    const value = Number(slider.value ?? slider.getAttribute("aria-valuenow"));
    if (!Number.isInteger(value)) throw new Error("Godel OMON strike-depth value is unavailable");
    omonStrikeLabel(root, value);
    const table = omonStrikeRows(root);
    if (table.rows < 1 || !table.signature) throw new Error("Godel OMON rendered option rows are unavailable");
    return { value, rows: table.rows, signature: table.signature };
  }

  async function runOMON(root, action, payload) {
    if (action !== "setStrikeDepth") throw new Error("Unsupported Godel OMON internal action");
    const slider = omonStrikeSlider(root);
    const bounds = omonSliderBounds(slider);
    const value = Number(payload.value);
    if (!Number.isInteger(value) || value < bounds.minimum || value > bounds.maximum
        || (value - bounds.minimum) % bounds.step !== 0) {
      throw new Error(`OMON strike depth must be from ${bounds.minimum} to ${bounds.maximum} in steps of ${bounds.step}`);
    }
    const before = omonStrikeState(root);
    if (before.value === value) return { changed: false, strike_depth: value, rendered_rows: before.rows };
    const props = reactPropsFor(slider);
    if (typeof props?.onChange !== "function") throw new Error("Godel OMON native strike-depth callback unavailable");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (typeof setter !== "function") throw new Error("Godel OMON native slider setter unavailable");
    // Use the real range input's platform setter and trusted React event path.
    // Directly calling a captured callback is insufficient for this controlled
    // input because React's value tracker must observe the native transition.
    setter.call(slider, String(value));
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new Event("change", { bubbles: true }));
    await waitForElement(() => {
      try {
        const state = omonStrikeState(root);
        return state.value === value && state.rows > 0 && state.signature !== before.signature;
      } catch { return false; }
    }, `OMON ${value} strike depth`, 5000);
    const completed = omonStrikeState(root);
    return { changed: true, strike_depth: value, rendered_rows: completed.rows };
  }

  function newsQueryInput(root) {
    const candidates = [...root.querySelectorAll("input")].filter(element =>
      visibleElement(element)
      && String(element.getAttribute("placeholder") ?? "").replace(/\s+/g, " ").trim().toLowerCase() === "search exact term");
    if (candidates.length !== 1) throw new Error(`Expected one Godel News exact-query input, found ${candidates.length}`);
    return candidates[0];
  }

  function newsResultTable(root) {
    const expected = ["headline", "date", "time", "ticker", "source"];
    const candidates = [...root.querySelectorAll("table,[role='table'],[role='grid']")].filter(table => {
      if (!visibleElement(table)) return false;
      const headings = [...table.querySelectorAll("th,[role='columnheader']")]
        .map(element => compactElementText(element).toLowerCase());
      return expected.every(label => headings.includes(label));
    });
    if (candidates.length !== 1) throw new Error(`Expected one Godel News result table, found ${candidates.length}`);
    return candidates[0];
  }

  function newsQueryClearAffordance(root) {
    const candidates = [...root.querySelectorAll('[data-icon="delete"],svg[data-icon="delete"],.anticon-delete')]
      .filter(visibleElement);
    const leaves = candidates.filter(element => !candidates.some(other => other !== element && element.contains(other)));
    return leaves.length === 1 ? leaves[0] : null;
  }

  function newsQueryState(root) {
    const input = newsQueryInput(root);
    const table = newsResultTable(root);
    const query = String(input.value ?? "").replace(/\s+/g, " ").trim();
    const rows = tableDataRows(table);
    const signature = compactElementText(table);
    return {
      query,
      active: Boolean(newsQueryClearAffordance(root)),
      rows: rows.length,
      signature
    };
  }

  async function runNews(root, action, payload) {
    if (action !== "setQuery") throw new Error("Unsupported Godel News internal action");
    const query = String(payload.value ?? "").replace(/\s+/g, " ").trim();
    if (!query || query.length > 200 || /[\r\n]/.test(query)) throw new Error("Invalid Godel News exact query");
    const before = newsQueryState(root);
    if (before.query === query && before.active) {
      return { changed: false, query, rendered_rows: before.rows };
    }
    const input = newsQueryInput(root);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (typeof setter !== "function") throw new Error("Godel News native query setter unavailable");
    setter.call(input, query);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    const completed = await waitForElement(() => {
      try {
        const state = newsQueryState(root);
        if (state.query !== query || !state.active || !state.signature) return null;
        if (before.query && before.query !== query && state.signature === before.signature) return null;
        return state;
      } catch { return null; }
    }, `News query ${query}`, 7000);
    return { changed: true, query, rendered_rows: completed.rows };
  }

  function visibleElement(element) {
    if (!(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }

  function compactElementText(element) {
    return String(element?.textContent ?? "").replace(/\s+/g, " ").trim();
  }

  function hdsViewControl(root, label) {
    const exact = (scope, value) => [...scope.querySelectorAll("button,[role='button'],[role='tab']")]
      .filter(element => visibleElement(element) && compactElementText(element).toLowerCase() === value.toLowerCase());
    const groups = [];
    for (const anchor of exact(root, "Bubble")) {
      for (let scope = anchor.parentElement, depth = 0; scope && scope !== root && depth < 6; scope = scope.parentElement, depth += 1) {
        if (["Table", "Treemap", "Bubble"].every(value => exact(scope, value).length === 1)) {
          groups.push(scope);
          break;
        }
      }
    }
    const uniqueGroups = [...new Set(groups)];
    if (uniqueGroups.length !== 1) return null;
    const candidates = exact(uniqueGroups[0], String(label).trim());
    return candidates.length === 1 ? candidates[0] : null;
  }

  function hdsTableVisible(root) {
    const semanticTable = [...root.querySelectorAll("table,[role='table'],[role='grid']")].filter(visibleElement).some(table => {
      const headings = compactElementText([...table.querySelectorAll("th,[role='columnheader']")]
        .map(element => element.textContent).join(" ")).toLowerCase();
      return headings.includes("holder") && headings.includes("value")
        && headings.includes("amount") && headings.includes("change");
    });
    if (semanticTable) return true;
    // Restored HDS layouts currently render the table with div-based headers,
    // not a semantic table. Prove the rendered header row geometrically: four
    // exact leaf labels, aligned on one row and in the native left-to-right
    // order. This avoids a global text-content success path.
    const exactLeaf = label => [...root.querySelectorAll("div,span,p,th,[role='columnheader']")]
      .filter(element => visibleElement(element) && compactElementText(element).toLowerCase() === label
        && ![...element.children].some(child => visibleElement(child) && compactElementText(child)));
    const labels = ["holder", "value", "amount", "change"];
    const candidates = labels.map(exactLeaf);
    if (candidates.some(group => group.length === 0 || group.length > 8)) return false;
    for (const holder of candidates[0]) {
      const h = holder.getBoundingClientRect();
      for (const value of candidates[1]) {
        const v = value.getBoundingClientRect();
        for (const amount of candidates[2]) {
          const a = amount.getBoundingClientRect();
          for (const change of candidates[3]) {
            const c = change.getBoundingClientRect();
            const centersY = [h, v, a, c].map(rect => rect.top + rect.height / 2);
            const centersX = [h, v, a, c].map(rect => rect.left + rect.width / 2);
            if (Math.max(...centersY) - Math.min(...centersY) <= 24
              && centersX.every((x, index) => index === 0 || x > centersX[index - 1])) return true;
          }
        }
      }
    }
    return false;
  }

  function hdsBubbleVisible(root) {
    if (hdsTableVisible(root)) return false;
    return [...root.querySelectorAll("svg")].filter(visibleElement).some(svg => {
      const rect = svg.getBoundingClientRect();
      const circles = [...svg.querySelectorAll("circle")].filter(visibleElement);
      const labels = compactElementText(svg).toLowerCase();
      return rect.width >= 240 && rect.height >= 140 && circles.length >= 5
        && /(?:vanguard|blackrock|fmr|state street|capital group|investment)/.test(labels);
    });
  }

  function hdsTreemapVisible(root) {
    if (hdsTableVisible(root) || hdsBubbleVisible(root)) return false;
    return [...root.querySelectorAll("canvas,[class*='treemap' i],[data-testid*='treemap' i],svg")]
      .filter(visibleElement).some(element => {
        const rect = element.getBoundingClientRect();
        const text = compactElementText(element.parentElement ?? element).toLowerCase();
        return rect.width >= 240 && rect.height >= 140
          && /(?:vanguard|blackrock|fmr|state street|capital group|investment)/.test(text);
      });
  }

  function hdsViewState(root) {
    const table = hdsTableVisible(root);
    const bubble = hdsBubbleVisible(root);
    const treemap = hdsTreemapVisible(root);
    const visibleCount = [table, treemap, bubble].filter(Boolean).length;
    if (visibleCount !== 1) return null;
    return {
      view: table ? "Table" : treemap ? "Treemap" : "Bubble",
      table_visible: table,
      treemap_visible: treemap,
      bubble_visible: bubble
    };
  }

  async function runHDS(root, action, payload) {
    if (action !== "selectView") throw new Error("Unsupported Godel HDS internal action");
    const canonical = { table: "Table", treemap: "Treemap", bubble: "Bubble" }[
      String(payload.value ?? "").trim().toLowerCase()
    ];
    if (!canonical) throw new Error("Unsupported Godel HDS view");
    const current = hdsViewState(root);
    if (current?.view === canonical) return current;
    const control = hdsViewControl(root, canonical);
    if (!control) throw new Error(`Expected one Godel HDS ${canonical} control`);
    control.click();
    await waitForElement(() => hdsViewState(root)?.view === canonical, `HDS ${canonical} rendered view`, 5000);
    return hdsViewState(root);
  }

  function windowIdFor(root) {
    let windowRoot = root.matches?.('[id$="-window"]') ? root : root.closest('[id$="-window"]');
    // Godel currently renders the draggable shell and the native `*-window`
    // node as siblings in some layouts. Walk only until one unambiguous native
    // window exists; never choose among multiple workspace windows.
    for (let scope = root, depth = 0; !windowRoot && scope && depth < 5; scope = scope.parentElement, depth += 1) {
      const candidates = [...scope.querySelectorAll(':scope [id$="-window"]')];
      if (candidates.length === 1) windowRoot = candidates[0];
      else if (candidates.length > 1) break;
    }
    let match = windowRoot?.id.match(/^(.+)-window$/);
    if (!match?.[1]) {
      // Some current Godel panels (notably Graph Fundamentals) render the
      // command root beside, rather than inside, the native `*-window` node.
      // Resolve only the workspace's exact active window; never guess among
      // mounted windows from other screens.
      try {
        const layout = assertLayoutShape(workspaceContextFor(root).layout);
        const activeId = layout.screens[layout.activeScreenId]?.activeWindowId;
        if (activeId != null && /^[A-Za-z0-9_-]{1,120}$/.test(String(activeId))) {
          const nativeRoot = document.getElementById(`${activeId}-window`);
          windowRoot = nativeRoot ?? root;
          match = [null, String(activeId)];
        }
      } catch {}
    }
    if (!match?.[1] || !/^[A-Za-z0-9_-]{1,120}$/.test(match[1])) {
      throw new Error("Godel window id unavailable");
    }
    const id = /^\d+$/.test(match[1]) ? Number(match[1]) : match[1];
    return { id, root: windowRoot };
  }

  function positionManager() {
    const manager = requireGodelModule(17065)?.U?.getInstance?.();
    if (!manager || typeof manager.updateWindowPosition !== "function") {
      throw new Error("Godel native position manager unavailable");
    }
    return manager;
  }

  function currentPosition(manager, id) {
    const positions = manager.windowPositions;
    if (positions instanceof Map) return positions.get(id) ?? null;
    return positions?.[id] ?? null;
  }

  function reactPropsFor(element) {
    const key = Object.keys(element).find(name => name.startsWith("__reactProps$"));
    return key ? element[key] : null;
  }

  function workspaceContextFor(root) {
    const tabButtons = [...document.querySelectorAll('[data-icon="plus"]')]
      .map(icon => icon.closest("button"))
      .filter(Boolean);
    const starts = [root, ...tabButtons].flatMap(element => {
      const first = fiberOf(element);
      return [first, first?.alternate].filter(Boolean);
    });
    const seen = new Set();
    for (const start of starts) {
      for (let fiber = start; fiber && !seen.has(fiber); fiber = fiber.return) {
        seen.add(fiber);
        for (let dependency = fiber.dependencies?.firstContext; dependency; dependency = dependency.next) {
          const value = dependency.memoizedValue;
          if (value && typeof value.setLayout === "function" && typeof value.setActiveWindowId === "function"
              && typeof value.exportScreen === "function" && typeof value.exportLayout === "function") {
            return value;
          }
        }
      }
    }
    throw new Error("Godel workspace provider unavailable");
  }

  function assertLayoutShape(layout) {
    const valid = layout && typeof layout === "object" && !Array.isArray(layout)
      && Number.isInteger(layout.activeScreenId) && Number.isInteger(layout.nextScreenId)
      && Array.isArray(layout.screenIds) && layout.screens && typeof layout.screens === "object"
      && layout.windows && typeof layout.windows === "object";
    if (!valid) throw new Error("Godel workspace layout shape changed");
    for (const screenId of layout.screenIds) {
      const screen = layout.screens[screenId];
      if (!screen || String(screen.id) !== String(screenId) || typeof screen.title !== "string"
          || !Array.isArray(screen.windowIds)
          || (screen.windowIds.length > 0 && !("activeWindowId" in screen))) {
        const shape = screen && typeof screen === "object" ? {
          key: String(screenId), id: String(screen.id), title: typeof screen.title,
          windows: Array.isArray(screen.windowIds), active: "activeWindowId" in screen,
          fields: Object.keys(screen).sort().join(",")
        } : { key: String(screenId), missing: true };
        throw new Error(`Godel screen record shape changed: ${JSON.stringify(shape)}`);
      }
    }
    return layout;
  }

  function screenTabs() {
    const candidates = [...document.querySelectorAll('[data-icon="plus"]')]
      .map(icon => icon.closest("button"))
      .filter(Boolean)
      .map(button => walkFiber(button, props => Array.isArray(props.items)
        && typeof props.onSelect === "function" && typeof props.onEdit === "function"
        && typeof props.beforeOnAdd === "function"))
      .filter(Boolean);
    if (candidates.length !== 1) throw new Error("Godel screen-tab callbacks unavailable");
    const props = candidates[0].props;
    if (!props.items.every(item => /^\d+$/.test(String(item.id)) && typeof item.title === "string")) {
      throw new Error("Godel screen-tab shape changed");
    }
    return props;
  }

  function resolveScreen(tabs, target) {
    const value = String(target ?? "").trim();
    const byId = /^\d+$/.test(value) ? tabs.items.filter(item => String(item.id) === value) : [];
    const byTitle = tabs.items.filter(item => item.title.toLowerCase() === value.toLowerCase());
    const matches = byId.length ? byId : byTitle;
    if (matches.length !== 1) throw new Error(`Expected one Godel screen for ${value || "target"}, found ${matches.length}`);
    return matches[0];
  }

  function validateScreenName(value) {
    const name = String(value ?? "").trim();
    if (!name || name.length > 48 || /[\r\n]/.test(name)) throw new Error("Invalid Godel screen name");
    return name;
  }

  function commandTypeFor(root) {
    const type = String(root.getAttribute("data-cy-command-type") ?? "").toUpperCase();
    if (!/^[A-Z0-9_]{2,64}$/.test(type)) throw new Error("Godel window type unavailable");
    return type;
  }

  function consequentialWindowType(type) {
    return /CHAT|NOTE|ACCOUNT|BROK|ORDER|TRADE|MESSAGE|ALERT/.test(String(type ?? "").toUpperCase());
  }

  function nativeClose(root) {
    const controls = [...root.querySelectorAll('[data-cy-close-window="true"]')];
    if (controls.length !== 1) throw new Error("Godel native close control unavailable");
    const props = reactPropsFor(controls[0]);
    if (props?.["data-cy-close-window"] !== true || typeof props.onClick !== "function") {
      throw new Error("Godel native close callback shape changed");
    }
    const unsafe = consequentialWindowType(commandTypeFor(root));
    if (unsafe) throw new Error("This Godel window may contain unsaved or consequential state and cannot be closed by voice");
    props.onClick();
  }

  function nativePanelExport(root) {
    const controls = [...root.querySelectorAll("button")].filter(button =>
      button.title === "Copy or export the plot and its data" && button.getAttribute("aria-label") === "Export");
    if (controls.length !== 1) throw new Error("This Godel panel has no verified native data-export adapter");
    const props = reactPropsFor(controls[0]);
    if (typeof props?.onClick !== "function") throw new Error("Godel native export callback shape changed");
    props.onClick();
  }

  async function runLayout(root, action, payload) {
    const { id, root: windowRoot } = windowIdFor(root);
    if (["focus", "maximize", "restore", "close", "openExport"].includes(action)) {
      if (action === "focus") {
        const workspace = workspaceContextFor(windowRoot);
        workspace.setActiveWindowId(id);
        await waitForElement(() => {
          const active = windowRoot.getAttribute("data-cy-active-window");
          if (active !== null && active !== "false") return true;
          const latest = assertLayoutShape(workspaceContextFor(windowRoot).layout);
          const screen = latest.screens[latest.activeScreenId];
          return String(screen?.activeWindowId) === String(id);
        }, `${id} active window`, 3000);
        return;
      }
      if (["maximize", "restore"].includes(action)) {
        const manager = positionManager();
        if (typeof manager.fullScreen !== "function") throw new Error("Godel native full-screen manager unavailable");
        const current = currentPosition(manager, id);
        if (!current) throw new Error("Godel window position unavailable");
        const isMaximized = current.previous != null;
        if ((action === "maximize" && isMaximized) || (action === "restore" && !isMaximized)) return;
        manager.fullScreen(id, commandTypeFor(windowRoot));
        await waitForElement(() => Boolean(currentPosition(manager, id)?.previous) === (action === "maximize"),
          `${id} ${action}`, 3000);
        return;
      }
      if (action === "close") {
        // Prove the workspace provider is available before the root detaches,
        // then reacquire it from the live document on every poll. React props
        // expose an immutable layout snapshot; polling that captured object
        // waits forever and lets a delayed close overwrite a newly opened panel.
        workspaceContextFor(windowRoot);
        nativeClose(windowRoot);
        await waitForElement(() => {
          const disconnected = !windowRoot.isConnected;
          const layout = assertLayoutShape(workspaceContextFor(document.documentElement).layout);
          const absentFromLayout = layout.screenIds.every(screenId =>
            !layout.screens[screenId].windowIds.some(windowId => String(windowId) === String(id)));
          return disconnected && absentFromLayout;
        }, `${id} closed window and layout settled`, 3000);
        return;
      }
      nativePanelExport(windowRoot);
      return;
    }
    if (action !== "setGeometry") throw new Error("Unsupported Godel layout action");
    const rect = Object.fromEntries(["x", "y", "width", "height"].map(key => [key, Number(payload[key])]));
    if (Object.values(rect).some(value => !Number.isFinite(value))) throw new Error("Invalid Godel window geometry");
    if (rect.x < 0 || rect.y < 0 || rect.width < 280 || rect.height < 190 || rect.width > 10000 || rect.height > 10000) {
      throw new Error("Unsafe Godel window geometry");
    }
    const manager = positionManager();
    const current = currentPosition(manager, id) ?? {};
    manager.updateWindowPosition(id, { ...current, ...rect });
    // The native layout store is the authoritative state. Large Godel panels
    // can animate toward that state for several seconds; waiting for the CSS
    // box to finish makes Jarvis feel frozen even though the move is already
    // accepted. Verify the exact native geometry and let rendering continue.
    await waitForElement(() => {
      const actual = currentPosition(manager, id);
      return actual && ["x", "y", "width", "height"].every(key => Math.abs(Number(actual[key]) - rect[key]) < 1);
    }, `${id} native window geometry`, 800);
  }

  async function runWorkspace(root, action, payload) {
    // A workspace request delivered through the dedicated fiber-free anchor
    // must resolve from Godel's screen tabs, not from an arbitrary descendant
    // window whose React provider can still be bound to another screen.
    const contextRoot = root.matches?.('[id$="-window"]') ? root : null;
    if (action === "activeScreenInfo") {
      const tabs = screenTabs();
      const active = tabs.items.find(item => String(item.id) === String(tabs.activeItemId));
      if (!active) throw new Error("Godel active screen is unavailable");
      return { id: String(active.id), title: active.title };
    }
    if (!contextRoot && action === "createScreen") {
      const title = validateScreenName(payload.name ?? "Voice");
      const tabs = screenTabs();
      const reusable = tabs.items.find(item => item.title.toLowerCase() === title.toLowerCase())
        ?? tabs.items.find(item => item.title.toLowerCase() === "blank");
      if (!reusable) {
        throw new Error(`Create an empty Blank screen once so Jarvis can claim its dedicated ${title} workspace`);
      }
      if (String(tabs.activeItemId) !== String(reusable.id)) tabs.onSelect(String(reusable.id));
      await waitForElement(() => String(screenTabs().activeItemId) === String(reusable.id),
        `${title} reusable empty screen`, 5000);
      return;
    }
    const context = workspaceContextFor(contextRoot ?? root);
    const current = assertLayoutShape(context.layout);
    if (action === "workspaceInventory") {
      return {
        active_screen_id: String(current.activeScreenId),
        total_windows: current.screenIds.reduce((total, id) => total + current.screens[id].windowIds.length, 0),
        screens: current.screenIds.map(id => ({
          id: String(id), title: current.screens[id].title,
          active: String(id) === String(current.activeScreenId),
          active_window_id: current.screens[id].activeWindowId == null ? null : String(current.screens[id].activeWindowId),
          window_ids: current.screens[id].windowIds.map(String)
        }))
      };
    }
    if (action === "clearVoiceScreen") {
      const voiceScreens = current.screenIds.map(id => current.screens[id])
        .filter(screen => screen.title.trim().toLowerCase() === "voice");
      if (voiceScreens.length !== 1) throw new Error(`Expected one dedicated Voice screen, found ${voiceScreens.length}`);
      const voice = voiceScreens[0];
      const preserveIds = new Set((Array.isArray(payload.preserve_ids) ? payload.preserve_ids : []).map(String));
      if (!Array.isArray(payload.only_ids)) throw new Error("Voice cleanup requires explicit Jarvis ownership receipts");
      const onlyIds = new Set(payload.only_ids.map(String));
      for (const id of [...preserveIds, ...(onlyIds ?? [])]) {
        if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new Error("Invalid Godel cleanup window id");
      }
      const duplicateIds = voice.windowIds.map(String).filter(id => current.screenIds.some(screenId =>
        String(screenId) !== String(voice.id) && current.screens[screenId].windowIds.some(candidate => String(candidate) === id)));
      if (duplicateIds.length) throw new Error("Godel layout contains windows assigned to more than one screen");
      const blockedIds = new Set();
      for (const rawId of voice.windowIds.map(String)) {
        const nativeRoot = document.getElementById(`${rawId}-window`);
        if (nativeRoot instanceof HTMLElement) {
          try { if (consequentialWindowType(commandTypeFor(nativeRoot))) blockedIds.add(rawId); }
          catch { blockedIds.add(rawId); }
        }
      }
      const removeIds = new Set(voice.windowIds.map(String).filter(id =>
        !preserveIds.has(id) && !blockedIds.has(id) && onlyIds.has(id)));
      if (!removeIds.size) {
        return { removed_ids: [], preserved_ids: [...preserveIds], blocked_ids: [...blockedIds] };
      }
      let rejected = null;
      context.setLayout(layoutValue => {
        let layout;
        try { layout = assertLayoutShape(layoutValue); }
        catch (error) { rejected = error; return layoutValue; }
        const liveVoice = layout.screens[voice.id];
        if (!liveVoice || [...removeIds].some(id => !liveVoice.windowIds.some(candidate => String(candidate) === id))) {
          rejected = new Error("Godel Voice workspace changed during cleanup");
          return layoutValue;
        }
        const remainingIds = liveVoice.windowIds.filter(id => !removeIds.has(String(id)));
        const windows = { ...layout.windows };
        for (const id of removeIds) delete windows[id];
        return {
          ...layout,
          windows,
          screens: {
            ...layout.screens,
            [voice.id]: {
              ...liveVoice,
              windowIds: remainingIds,
              activeWindowId: remainingIds.some(id => String(id) === String(liveVoice.activeWindowId))
                ? liveVoice.activeWindowId : (remainingIds.at(-1) ?? null)
            }
          }
        };
      });
      await waitForElement(() => {
        if (rejected) throw rejected;
        const layout = assertLayoutShape(workspaceContextFor(document.documentElement).layout);
        const screen = layout.screens[voice.id];
        return screen && [...removeIds].every(id => !screen.windowIds.some(candidate => String(candidate) === id));
      }, "Voice workspace cleanup", 3000);
      return { removed_ids: [...removeIds], preserved_ids: [...preserveIds], blocked_ids: [...blockedIds] };
    }
    if (action === "activeWindowIds") {
      const screen = current.screens[current.activeScreenId];
      if (!screen) throw new Error("Godel active screen is unavailable");
      const active = screen.activeWindowId == null ? [] : [String(screen.activeWindowId)];
      return [...active, ...screen.windowIds.map(id => String(id)).filter(id => !active.includes(id))];
    }
    if (action === "moveWindowToScreen") {
      const rawId = String(payload.id ?? "");
      const rawTargetId = String(payload.target_screen_id ?? "");
      if (!/^[A-Za-z0-9_-]{1,120}$/.test(rawId) || !/^\d+$/.test(rawTargetId)) {
        throw new Error("Invalid Godel window transfer target");
      }
      const targetScreenId = Number(rawTargetId);
      const target = current.screens[targetScreenId];
      if (!target) throw new Error("Godel target screen is unavailable");
      const sources = current.screenIds.map(id => current.screens[id])
        .filter(screen => screen.windowIds.some(id => String(id) === rawId));
      if (sources.length !== 1) throw new Error(`Expected one Godel screen for window ${rawId}, found ${sources.length}`);
      const source = sources[0];
      if (String(source.id) === rawTargetId) {
        return { moved: false, id: rawId, target_screen_id: rawTargetId };
      }
      const nativeRoot = document.getElementById(`${rawId}-window`);
      if (!(nativeRoot instanceof HTMLElement)) throw new Error("Godel transfer window is unavailable");
      if (/CHAT|NOTE|ACCOUNT|BROK|ORDER|TRADE|MESSAGE|ALERT/.test(commandTypeFor(nativeRoot))) {
        throw new Error("This Godel window cannot be temporarily moved by voice");
      }
      const nativeId = /^\d+$/.test(rawId) ? Number(rawId) : rawId;
      const manager = positionManager();
      const position = currentPosition(manager, nativeId);
      if (!position || ["x", "y", "width", "height"].some(key => !Number.isFinite(Number(position[key])))) {
        throw new Error("Godel transfer window position is unavailable");
      }
      if (position.previous != null) throw new Error("Restore the maximized Godel window before temporarily moving it");
      const receipt = {
        moved: true,
        id: rawId,
        source_screen_id: String(source.id),
        source_index: source.windowIds.findIndex(id => String(id) === rawId),
        source_active_window_id: source.activeWindowId == null ? null : String(source.activeWindowId),
        target_screen_id: rawTargetId,
        position: Object.fromEntries(["x", "y", "width", "height"].map(key => [key, Number(position[key])]))
      };
      let rejected = null;
      context.setLayout(layoutValue => {
        let layout;
        try { layout = assertLayoutShape(layoutValue); }
        catch (error) { rejected = error; return layoutValue; }
        const liveSource = layout.screens[source.id];
        const liveTarget = layout.screens[targetScreenId];
        if (!liveSource?.windowIds.some(id => String(id) === rawId) || !liveTarget) {
          rejected = new Error("Godel window transfer state changed");
          return layoutValue;
        }
        const sourceIds = liveSource.windowIds.filter(id => String(id) !== rawId);
        const targetIds = [...liveTarget.windowIds.filter(id => String(id) !== rawId), nativeId];
        return {
          ...layout,
          activeScreenId: targetScreenId,
          screens: {
            ...layout.screens,
            [source.id]: {
              ...liveSource,
              windowIds: sourceIds,
              activeWindowId: String(liveSource.activeWindowId) === rawId ? (sourceIds.at(-1) ?? null) : liveSource.activeWindowId
            },
            [targetScreenId]: { ...liveTarget, windowIds: targetIds, activeWindowId: nativeId }
          }
        };
      });
      await waitForElement(() => {
        if (rejected) throw rejected;
        const layout = assertLayoutShape(workspaceContextFor(document.documentElement).layout);
        return String(layout.activeScreenId) === rawTargetId
          && layout.screens[targetScreenId]?.windowIds.some(id => String(id) === rawId)
          && !layout.screens[source.id]?.windowIds.some(id => String(id) === rawId);
      }, `${rawId} moved to Jarvis screen`, 3000);
      return receipt;
    }
    if (action === "restoreWindowLocation") {
      const rawId = String(payload.id ?? "");
      const rawSourceId = String(payload.source_screen_id ?? "");
      const rawTargetId = String(payload.target_screen_id ?? "");
      if (!/^[A-Za-z0-9_-]{1,120}$/.test(rawId) || !/^\d+$/.test(rawSourceId) || !/^\d+$/.test(rawTargetId)) {
        throw new Error("Invalid Godel window restoration receipt");
      }
      const sourceScreenId = Number(rawSourceId);
      const targetScreenId = Number(rawTargetId);
      const source = current.screens[sourceScreenId];
      const target = current.screens[targetScreenId];
      if (!source || !target?.windowIds.some(id => String(id) === rawId)) {
        throw new Error("Godel borrowed window is no longer on the Jarvis screen");
      }
      const nativeId = /^\d+$/.test(rawId) ? Number(rawId) : rawId;
      const sourceIndex = Math.max(0, Math.min(source.windowIds.length, Number(payload.source_index) || 0));
      const restoredSourceIds = [...source.windowIds];
      restoredSourceIds.splice(sourceIndex, 0, nativeId);
      const targetIds = target.windowIds.filter(id => String(id) !== rawId);
      const requestedSourceActive = payload.source_active_window_id == null ? null : String(payload.source_active_window_id);
      const sourceActive = requestedSourceActive && restoredSourceIds.some(id => String(id) === requestedSourceActive)
        ? (/^\d+$/.test(requestedSourceActive) ? Number(requestedSourceActive) : requestedSourceActive)
        : nativeId;
      let rejected = null;
      context.setLayout(layoutValue => {
        let layout;
        try { layout = assertLayoutShape(layoutValue); }
        catch (error) { rejected = error; return layoutValue; }
        const liveSource = layout.screens[sourceScreenId];
        const liveTarget = layout.screens[targetScreenId];
        if (!liveSource || !liveTarget?.windowIds.some(id => String(id) === rawId)) {
          rejected = new Error("Godel borrowed window state changed");
          return layoutValue;
        }
        return {
          ...layout,
          screens: {
            ...layout.screens,
            [sourceScreenId]: { ...liveSource, windowIds: restoredSourceIds, activeWindowId: sourceActive },
            [targetScreenId]: {
              ...liveTarget,
              windowIds: targetIds,
              activeWindowId: String(liveTarget.activeWindowId) === rawId ? (targetIds.at(-1) ?? null) : liveTarget.activeWindowId
            }
          }
        };
      });
      await waitForElement(() => {
        if (rejected) throw rejected;
        const layout = assertLayoutShape(workspaceContextFor(document.documentElement).layout);
        return layout.screens[sourceScreenId]?.windowIds.some(id => String(id) === rawId)
          && !layout.screens[targetScreenId]?.windowIds.some(id => String(id) === rawId);
      }, `${rawId} restored to its original screen`, 3000);
      const rect = Object.fromEntries(["x", "y", "width", "height"].map(key => [key, Number(payload.position?.[key])]))
      if (Object.values(rect).every(Number.isFinite)) {
        const manager = positionManager();
        const existing = currentPosition(manager, nativeId) ?? {};
        manager.updateWindowPosition(nativeId, { ...existing, ...rect });
      }
      return { restored: true, id: rawId };
    }
    if (action === "nameActiveScreen") {
      const title = validateScreenName(payload.name ?? "Voice");
      const screenId = current.activeScreenId;
      let rejected = null;
      context.setLayout(layoutValue => {
        let layout;
        try { layout = assertLayoutShape(layoutValue); }
        catch (error) { rejected = error; return layoutValue; }
        const screen = layout.screens[screenId];
        if (!screen) {
          rejected = new Error("Godel active screen changed during rename");
          return layoutValue;
        }
        return {
          ...layout,
          screens: { ...layout.screens, [screenId]: { ...screen, title } }
        };
      });
      await waitForElement(() => {
        if (rejected) throw rejected;
        const tabs = screenTabs();
        return String(tabs.activeItemId) === String(screenId)
          && tabs.items.some(item => String(item.id) === String(screenId) && item.title === title);
      }, `${title} active screen name`, 3000);
      return;
    }
    if (action === "setWindowGeometry") {
      const rawId = String(payload.id ?? "");
      if (!/^[A-Za-z0-9_-]{1,120}$/.test(rawId)) throw new Error("Invalid Godel workspace window id");
      const screen = current.screens[current.activeScreenId];
      if (!screen || !screen.windowIds.some(id => String(id) === rawId)) {
        const activeIds = screen?.windowIds?.map(String).join(",") || "none";
        throw new Error(`Godel workspace window ${rawId} is not on active screen ${current.activeScreenId} (${activeIds})`);
      }
      const rect = Object.fromEntries(["x", "y", "width", "height"].map(key => [key, Number(payload.rect?.[key])]));
      if (Object.values(rect).some(value => !Number.isFinite(value))) throw new Error("Invalid Godel window geometry");
      if (rect.x < 0 || rect.y < 0 || rect.width < 280 || rect.height < 190 || rect.width > 10000 || rect.height > 10000) {
        throw new Error("Unsafe Godel window geometry");
      }
      const id = /^\d+$/.test(rawId) ? Number(rawId) : rawId;
      const manager = positionManager();
      const existing = currentPosition(manager, id) ?? {};
      manager.updateWindowPosition(id, { ...existing, ...rect });
      await waitForElement(() => {
        const actual = currentPosition(manager, id);
        return actual && ["x", "y", "width", "height"].every(key => Math.abs(Number(actual[key]) - rect[key]) < 1);
      }, `${rawId} native window geometry`, 800);
      return;
    }
    if (action === "createScreen") {
      const title = validateScreenName(payload.name ?? "Voice");
      const screens = current.screenIds.map(screenId => current.screens[screenId]);
      const reusable = screens.find(screen => screen.title.toLowerCase() === title.toLowerCase())
        ?? screens.find(screen => screen.windowIds.length === 0 && screen.title.toLowerCase() === "blank");
      if (reusable) {
        let rejected = null;
        context.setLayout(layoutValue => {
          let layout;
          try { layout = assertLayoutShape(layoutValue); }
          catch (error) { rejected = error; return layoutValue; }
          const screen = layout.screens[reusable.id];
          if (!screen) {
            rejected = new Error("Godel reusable screen changed during activation");
            return layoutValue;
          }
          return {
            ...layout,
            activeScreenId: reusable.id,
            screens: { ...layout.screens, [reusable.id]: { ...screen, title } }
          };
        });
        await waitForElement(() => {
          if (rejected) throw rejected;
          const next = screenTabs();
          return String(next.activeItemId) === String(reusable.id)
            && next.items.some(item => String(item.id) === String(reusable.id) && item.title === title);
        }, `${title} reusable screen`, 5000);
        return;
      }
      if (current.screenIds.length >= 8) throw new Error("Godel has reached its eight-screen limit; reuse or clear a screen first");
      const id = current.nextScreenId;
      if (current.screens[id] || current.screenIds.includes(id)) throw new Error("Godel next screen id is already in use");
      const screen = { id, title, windowIds: [], activeWindowId: null };
      let rejected = null;
      context.setLayout(layoutValue => {
        let layout;
        try { layout = assertLayoutShape(layoutValue); }
        catch (error) { rejected = error; return layoutValue; }
        if (layout.nextScreenId !== id) {
          rejected = new Error("Godel screen state changed during creation");
          return layoutValue;
        }
        return {
          ...layout,
          activeScreenId: id,
          nextScreenId: id + 1,
          screenIds: [...layout.screenIds, id],
          screens: { ...layout.screens, [id]: screen }
        };
      });
      await waitForElement(() => {
        if (rejected) throw rejected;
        const tabs = screenTabs();
        return String(tabs.activeItemId) === String(id)
          && tabs.items.some(item => String(item.id) === String(id) && item.title === title);
      }, `${title} screen`, 5000);
      return;
    }
    if (["focusScreen", "renameScreen"].includes(action)) {
      const tabs = screenTabs();
      const screen = resolveScreen(tabs, payload.target);
      if (action === "focusScreen") {
        tabs.onSelect(String(screen.id));
        await waitForElement(() => String(screenTabs().activeItemId) === String(screen.id), `${screen.title} active screen`, 5000);
      } else {
        const name = validateScreenName(payload.name);
        tabs.onEdit(String(screen.id), name);
        await waitForElement(() => screenTabs().items.some(item => String(item.id) === String(screen.id) && item.title === name),
          `${name} renamed screen`, 5000);
      }
      return;
    }
    if (action === "exportScreen") return context.exportScreen();
    if (action === "exportLayout") return context.exportLayout();
    throw new Error("Unsupported Godel workspace action");
  }

  const adapters = new Map();

  function registerAdapter(command, adapter) {
    const code = String(command).toUpperCase();
    if (!/^[A-Z0-9]{1,12}$/.test(code)) throw new Error("Invalid Godel adapter code");
    if (adapters.has(code)) throw new Error(`Duplicate Godel adapter: ${code}`);
    if (typeof adapter?.run !== "function") throw new Error(`Invalid Godel adapter: ${code}`);
    adapters.set(code, Object.freeze(adapter));
  }

  registerAdapter("GF", {
      expandRoot(root) {
        let panel = root;
        for (let depth = 0; depth < 8 && panel.parentElement; depth += 1) {
          const hasRail = [...panel.querySelectorAll("button")].some(element =>
            /add metric for/i.test([element.getAttribute("aria-label"), element.title].filter(Boolean).join(" ")));
          if (hasRail) break;
          panel = panel.parentElement;
        }
        return panel;
      },
      run: runGF
  });

  registerAdapter("EM", { run: runEM });
  registerAdapter("MOST", { run: runMOST });
  registerAdapter("HDS", { run: runHDS });
  registerAdapter("OMON", { run: runOMON });
  registerAdapter("N", { run: runNews });
  if (window.GodelVoiceIMAPAdapter?.install) {
    window.GodelVoiceIMAPAdapter.install(registerAdapter);
  }

  registerAdapter("LAYOUT", { run: runLayout });
  registerAdapter("WORKSPACE", { run: runWorkspace });

  window.addEventListener(REQUEST, event => {
    const { id, target_id: targetId, command, action, payload } = event.detail ?? {};
    const selector = typeof id === "string" ? `[data-godel-voice-panel="${CSS.escape(id)}"]` : null;
    const targeted = selector && event.target instanceof Element
      ? event.target.closest(selector)
      : null;
    const stableRoot = typeof targetId === "string" && /^[A-Za-z0-9_-]{1,140}$/.test(targetId)
      ? document.getElementById(targetId)
      : null;
    const root = stableRoot ?? targeted ?? (selector ? document.querySelector(selector) : null);
    if (!(root instanceof HTMLElement)) return respond({ id, ok: false, error: "Godel panel bridge target missing" });
    const adapter = adapters.get(String(command ?? "").toUpperCase());
    if (!adapter) return respond({ id, ok: false, error: `No internal adapter for ${command}` });
    const panel = adapter.expandRoot?.(root) ?? root;
    Promise.resolve(adapter.run(panel, action, payload ?? {}))
      .then(result => respond({ id, ok: true, result: result ?? null }))
      .catch(error => respond({ id, ok: false, error: error instanceof Error ? error.message : String(error) }));
  });
})();
