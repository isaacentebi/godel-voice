export const G_LIVE_RESOLUTIONS = Object.freeze(["1h"]);

export function normalizeGLiveAction(action, label = "G action") {
  if (!action || typeof action !== "object" || Array.isArray(action)) throw new Error(`${label} must be an object`);
  const feature = String(action.feature ?? "").trim().toLowerCase();
  const operation = String(action.operation ?? "").trim().toLowerCase();
  const value = String(action.value ?? "").trim().toLowerCase();
  if (feature !== "resolution" || operation !== "select" || !G_LIVE_RESOLUTIONS.includes(value)) {
    throw new Error("G live executor permits only the independently proven 1h contextual resolution");
  }
  return { feature: "resolution", operation: "select", value: "1h" };
}
