(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GodelVoiceLayout = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PRESETS = new Set(["research", "market", "comparison", "options", "grid", "focus"]);
  const ZONES = new Set([
    "full", "left", "right", "top", "bottom",
    "top-left", "top-right", "bottom-left", "bottom-right"
  ]);

  function cell(area, row, column, rows, columns, gap) {
    const width = (area.width - gap * (columns - 1)) / columns;
    const height = (area.height - gap * (rows - 1)) / rows;
    return { x: area.x + column * (width + gap), y: area.y + row * (height + gap), width, height };
  }

  function grid(area, count, gap) {
    const columns = Math.max(1, Math.ceil(Math.sqrt(count * area.width / area.height)));
    const rows = Math.ceil(count / columns);
    return Array.from({ length: count }, (_, index) =>
      cell(area, Math.floor(index / columns), index % columns, rows, columns, gap));
  }

  function primaryRail(area, count, ratio, gap) {
    if (count <= 1) return [area];
    const width = (area.width - gap) * ratio;
    const rail = { x: area.x + width + gap, y: area.y, width: area.width - width - gap, height: area.height };
    return [
      { x: area.x, y: area.y, width, height: area.height },
      ...Array.from({ length: count - 1 }, (_, index) => cell(rail, index, 0, count - 1, 1, gap))
    ];
  }

  function zone(area, name, gap) {
    if (!ZONES.has(name)) throw new Error(`Unknown placement: ${name}`);
    if (name === "full") return area;
    const halfWidth = (area.width - gap) / 2;
    const halfHeight = (area.height - gap) / 2;
    if (name === "left") return { x: area.x, y: area.y, width: halfWidth, height: area.height };
    if (name === "right") return { x: area.x + halfWidth + gap, y: area.y, width: halfWidth, height: area.height };
    if (name === "top") return { x: area.x, y: area.y, width: area.width, height: halfHeight };
    if (name === "bottom") return { x: area.x, y: area.y + halfHeight + gap, width: area.width, height: halfHeight };
    const right = name.endsWith("right");
    const bottom = name.startsWith("bottom");
    return {
      x: right ? area.x + halfWidth + gap : area.x,
      y: bottom ? area.y + halfHeight + gap : area.y,
      width: halfWidth, height: halfHeight
    };
  }

  function presetRects(area, count, preset, gap) {
    if (preset === "focus") return count ? [area] : [];
    if (preset === "research") return primaryRail(area, count, 0.66, gap);
    if (preset === "options") return primaryRail(area, count, 0.68, gap);
    if (preset === "market" && count <= 4) return primaryRail(area, count, 0.58, gap);
    if (preset === "comparison" && count <= 3 && (area.width - gap * (count - 1)) / count >= 280) {
      return Array.from({ length: count }, (_, index) => cell(area, 0, index, 1, count, gap));
    }
    return grid(area, count, gap);
  }

  function plan(options = {}) {
    const gap = Math.max(0, Number(options.gap ?? 12));
    const viewport = options.viewport ?? {};
    const area = {
      x: Number(viewport.x ?? 0) + gap,
      y: Number(viewport.y ?? 0) + gap,
      width: Number(viewport.width ?? 0) - gap * 2,
      height: Number(viewport.height ?? 0) - gap * 2
    };
    const panels = Array.isArray(options.panels) ? options.panels : [];
    const preset = String(options.preset ?? "grid").toLowerCase();
    if (!PRESETS.has(preset)) throw new Error(`Unknown layout preset: ${preset}`);
    if (area.width < 280 || area.height < 190) throw new Error("Godel workspace is too small");

    const automatic = panels.filter(panel => !panel.placement);
    const automaticRects = presetRects(area, automatic.length, preset, gap);
    let automaticIndex = 0;
    const placements = [];
    const overflow = [];
    for (const panel of panels) {
      const rect = panel.placement ? zone(area, panel.placement, gap) : automaticRects[automaticIndex++];
      if (!rect || rect.width < 280 || rect.height < 190) overflow.push(panel.id);
      else placements.push({ id: panel.id, rect });
    }
    if (preset === "focus" && automatic.length > 1) {
      overflow.push(...automatic.slice(1).map(panel => panel.id));
    }
    return { placements, overflow: [...new Set(overflow)] };
  }

  return { plan };
});
