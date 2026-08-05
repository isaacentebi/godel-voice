export const G_RUNTIME_RESOLUTIONS = Object.freeze(["1m", "5m", "15m", "30m", "1h", "1d"]);
export const G_LIVE_VERIFIED_RESOLUTIONS = Object.freeze(["1h"]);

export function normalizeGLiveAction(action, label = "G action") {
  if (!action || typeof action !== "object" || Array.isArray(action)) throw new Error(`${label} must be an object`);
  const feature = String(action.feature ?? "").trim().toLowerCase();
  const operation = String(action.operation ?? "").trim().toLowerCase();
  const value = String(action.value ?? "").trim().toLowerCase();
  if (feature !== "resolution" || operation !== "select" || !G_LIVE_VERIFIED_RESOLUTIONS.includes(value)) {
    throw new Error("G live executor: the only live-verified resolution is 1h");
  }
  return { feature: "resolution", operation: "select", value };
}
