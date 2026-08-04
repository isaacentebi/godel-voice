const DEFAULT_GAP = 12;
const DEFAULT_MIN_WIDTH = 300;
const DEFAULT_MIN_HEIGHT = 210;

const PRESETS = new Set(["research", "market", "comparison", "options", "grid", "focus"]);
const ZONES = new Set([
  "full", "left", "right", "top", "bottom",
  "top-left", "top-right", "bottom-left", "bottom-right"
]);

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeViewport(viewport, gap) {
  const x = finite(viewport?.x, 0);
  const y = finite(viewport?.y, 0);
  const width = finite(viewport?.width, 0);
  const height = finite(viewport?.height, 0);
  if (width < DEFAULT_MIN_WIDTH + gap * 2 || height < DEFAULT_MIN_HEIGHT + gap * 2) {
    throw new Error("Viewport is too small for a Godel panel");
  }
  return { x: x + gap, y: y + gap, width: width - gap * 2, height: height - gap * 2 };
}

function normalizeRect(rect) {
  return {
    x: finite(rect?.x, 0), y: finite(rect?.y, 0),
    width: Math.max(0, finite(rect?.width, 0)),
    height: Math.max(0, finite(rect?.height, 0))
  };
}

function intersect(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

function splitFreeRect(free, obstacle, gap) {
  const padded = {
    x: obstacle.x - gap, y: obstacle.y - gap,
    width: obstacle.width + gap * 2, height: obstacle.height + gap * 2
  };
  const hit = intersect(free, padded);
  if (!hit) return [free];
  const parts = [
    { x: free.x, y: free.y, width: hit.x - free.x, height: free.height },
    { x: hit.x + hit.width, y: free.y, width: free.x + free.width - hit.x - hit.width, height: free.height },
    { x: free.x, y: free.y, width: free.width, height: hit.y - free.y },
    { x: free.x, y: hit.y + hit.height, width: free.width, height: free.y + free.height - hit.y - hit.height }
  ];
  return parts.filter(rect => rect.width >= DEFAULT_MIN_WIDTH && rect.height >= DEFAULT_MIN_HEIGHT);
}

function largestFreeRect(viewport, obstacles, gap) {
  let free = [viewport];
  for (const obstacle of obstacles) {
    free = free.flatMap(rect => splitFreeRect(rect, normalizeRect(obstacle.rect ?? obstacle), gap));
    free.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    free = free.slice(0, 48);
  }
  return free.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0] ?? null;
}

function insetCell(area, row, column, rows, columns, gap) {
  const cellWidth = (area.width - gap * (columns - 1)) / columns;
  const cellHeight = (area.height - gap * (rows - 1)) / rows;
  return {
    x: area.x + column * (cellWidth + gap),
    y: area.y + row * (cellHeight + gap),
    width: cellWidth,
    height: cellHeight
  };
}

function gridRects(area, count, gap) {
  if (!count) return [];
  const aspect = area.width / area.height;
  const columns = Math.max(1, Math.ceil(Math.sqrt(count * aspect)));
  const rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, index) =>
    insetCell(area, Math.floor(index / columns), index % columns, rows, columns, gap));
}

function splitPrimary(area, count, ratio, gap) {
  if (count <= 1) return [area];
  const leftWidth = (area.width - gap) * ratio;
  const primary = { x: area.x, y: area.y, width: leftWidth, height: area.height };
  const rail = {
    x: area.x + leftWidth + gap, y: area.y,
    width: area.width - leftWidth - gap, height: area.height
  };
  const others = Array.from({ length: count - 1 }, (_, index) =>
    insetCell(rail, index, 0, count - 1, 1, gap));
  return [primary, ...others];
}

function presetRects(area, count, preset, gap) {
  if (preset === "focus") return count ? [area] : [];
  if (preset === "comparison") {
    if (count <= 3 && (area.width - gap * (count - 1)) / count >= DEFAULT_MIN_WIDTH) {
      return Array.from({ length: count }, (_, index) => insetCell(area, 0, index, 1, count, gap));
    }
    return gridRects(area, count, gap);
  }
  if (preset === "research") return splitPrimary(area, count, 0.66, gap);
  if (preset === "options") return splitPrimary(area, count, 0.68, gap);
  if (preset === "market" && count <= 4) return splitPrimary(area, count, 0.58, gap);
  return gridRects(area, count, gap);
}

function zoneRect(area, zone, gap) {
  if (!ZONES.has(zone)) throw new Error(`Unknown layout zone: ${zone}`);
  if (zone === "full") return area;
  const halfWidth = (area.width - gap) / 2;
  const halfHeight = (area.height - gap) / 2;
  if (zone === "left") return { x: area.x, y: area.y, width: halfWidth, height: area.height };
  if (zone === "right") return { x: area.x + halfWidth + gap, y: area.y, width: halfWidth, height: area.height };
  if (zone === "top") return { x: area.x, y: area.y, width: area.width, height: halfHeight };
  if (zone === "bottom") return { x: area.x, y: area.y + halfHeight + gap, width: area.width, height: halfHeight };
  const right = zone.endsWith("right");
  const bottom = zone.startsWith("bottom");
  return {
    x: right ? area.x + halfWidth + gap : area.x,
    y: bottom ? area.y + halfHeight + gap : area.y,
    width: halfWidth, height: halfHeight
  };
}

function rectFits(panel, rect) {
  return rect.width >= finite(panel.minWidth, DEFAULT_MIN_WIDTH)
    && rect.height >= finite(panel.minHeight, DEFAULT_MIN_HEIGHT);
}

/**
 * Pure layout planner. It never moves a panel itself.
 *
 * Existing panels remain untouched unless preserveExisting is false. New panels
 * can request a zone via `placement`; otherwise the selected preset is applied.
 */
export function planPanelLayout(options = {}) {
  const gap = Math.max(0, finite(options.gap, DEFAULT_GAP));
  const workspace = normalizeViewport(options.viewport, gap);
  const existingPanels = Array.isArray(options.existingPanels) ? options.existingPanels : [];
  const newPanels = Array.isArray(options.newPanels) ? options.newPanels : [];
  const preserveExisting = options.preserveExisting !== false;
  const preset = String(options.preset ?? "grid").toLowerCase();
  if (!PRESETS.has(preset)) throw new Error(`Unknown layout preset: ${preset}`);

  const candidates = preserveExisting ? newPanels : [...existingPanels, ...newPanels];
  const area = preserveExisting ? largestFreeRect(workspace, existingPanels, gap) : workspace;
  if (!area) return {
    preset,
    placements: [],
    overflow: candidates.map(panel => panel.id),
    recommendNewScreen: candidates.length > 0,
    preserved: preserveExisting ? existingPanels.map(panel => panel.id) : []
  };

  const explicit = candidates.filter(panel => panel.placement);
  const automatic = candidates.filter(panel => !panel.placement);
  const placements = [];
  const overflow = [];

  for (const panel of explicit) {
    let rect;
    if (typeof panel.placement === "string") rect = zoneRect(area, panel.placement.toLowerCase(), gap);
    else {
      const placement = panel.placement;
      rect = {
        x: area.x + area.width * finite(placement.x, 0),
        y: area.y + area.height * finite(placement.y, 0),
        width: area.width * finite(placement.width, 1),
        height: area.height * finite(placement.height, 1)
      };
    }
    if (rectFits(panel, rect)) placements.push({ id: panel.id, rect, placement: panel.placement });
    else overflow.push(panel.id);
  }

  const rects = presetRects(area, automatic.length, preset, gap);
  automatic.forEach((panel, index) => {
    const rect = rects[index];
    if (!rect || !rectFits(panel, rect)) overflow.push(panel.id);
    else placements.push({ id: panel.id, rect, placement: "auto" });
  });
  if (preset === "focus" && automatic.length > 1) overflow.push(...automatic.slice(1).map(panel => panel.id));

  return {
    preset,
    placements,
    overflow: [...new Set(overflow)],
    recommendNewScreen: overflow.length > 0,
    preserved: preserveExisting ? existingPanels.map(panel => panel.id) : []
  };
}

export const layoutPresets = Object.freeze([...PRESETS]);
export const layoutZones = Object.freeze([...ZONES]);
