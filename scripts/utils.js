/**
 * Shared constants and helper utilities.
 */

/** The module's identifier, must match module.json "id". */
export const MODULE_ID = "sr5-walk-run-modes";

/** Flag key for the movement mode declared for the current turn. */
export const FLAG_CURRENT_MODE = "currentMode";

/**
 * Flag key for the per-combatant sprint override (boolean).
 * When true, movement enforcement is bypassed and the ruler shows blue.
 * Cleared automatically when the combatant switches back to walk mode.
 */
export const FLAG_SPRINT_OVERRIDE = "sprintOverride";

/**
 * Flag key used in per-phase declaration mode.
 * Stored as { round: N } on the combatant when run mode is declared for the first time
 * this round. Allows movement.js and ruler.js to know that the effective limit is runMax
 * even if the combatant has since switched back to walk for a later phase.
 */
export const FLAG_RAN_THIS_ROUND = "ranThisRound";

/* -------------------------------------------- */

/**
 * Return the walk/run distance limits for a token's actor.
 * Returns null if the actor does not have SR5 movement data.
 *
 * @param {TokenDocument} tokenDoc
 * @returns {{ walkMax: number; runMax: number } | null}
 */
export function getMovementLimits(tokenDoc) {
  const movement = tokenDoc.actor?.system?.movement;
  if (!movement) return null;

  const walkMax = movement.walk?.value;
  const runMax  = movement.run?.value;

  if (!Number.isFinite(walkMax) || !Number.isFinite(runMax)) return null;

  return { walkMax, runMax };
}

/* -------------------------------------------- */

/**
 * Find the Combatant in the given Combat that corresponds to a TokenDocument.
 *
 * Matches by tokenId only (not sceneId) because during drag Foundry renders via
 * a preview token whose document.parent can be null, making sceneId comparisons
 * fail and leaving the ruler without a combatant reference.
 *
 * @param {TokenDocument} tokenDoc
 * @param {Combat} combat
 * @returns {Combatant | undefined}
 */
export function getCombatantForToken(tokenDoc, combat) {
  return combat.combatants.find(c => c.tokenId === tokenDoc.id);
}

/* -------------------------------------------- */

/**
 * Return the total movement cost already recorded in the token's movement history this round.
 * Uses the same _movementHistory array that SR5TokenDocument.measureMovementPath reads.
 *
 * @param {TokenDocument} tokenDoc
 * @returns {number}  Total cost in scene units, or 0 if no history.
 */
export function getHistoryCost(tokenDoc) {
  const history = tokenDoc.movementHistory ?? [];

//console.log("getHistoryCost for token", tokenDoc.name, "history", history);

  let total = 0;
  for (const waypoint of history) {
    const c = waypoint.cost ?? 0;
    if (!Number.isFinite(c)) return Infinity;
    total += c;
  }
  return total;
}

/* -------------------------------------------- */

/**
 * Read FLAG_CURRENT_MODE for a combatant.
 *
 * Flags are stored as a plain string "walk" or "run".
 * Legacy { round, mode } objects are also accepted for backwards compatibility.
 *
 * @param {Combatant} combatant
 * @returns {"walk"|"run"}
 */
export function getCurrentMode(combatant) {
  const raw = combatant.getFlag(MODULE_ID, FLAG_CURRENT_MODE);
  if (!raw) return "walk";
  // Plain-string storage (current format)
  if (typeof raw === "string") return raw;
  // Legacy { round, mode } object
  return raw.mode ?? "walk";
}



/* -------------------------------------------- */

/**
 * Return the round-distance ceiling for a combatant based on their declared mode.
 *
 * @param {Combatant} combatant
 * @param {{ walkMax: number; runMax: number }} limits
 * @returns {number}
 */
export function getEffectiveLimit(combatant, limits) {
  const mode = getCurrentMode(combatant);
  return mode === "run" ? limits.runMax : limits.walkMax;
}

/**
 * Return true when the combatant has declared run mode at any point this round.
 * Always true if their current mode is run.
 * Used in per-phase declaration mode to determine the effective movement limit.
 *
 * @param {Combatant} combatant
 * @param {Combat} [combat]
 * @returns {boolean}
 */
export function hasRunThisRound(combatant, combat = game.combat) {
  if (getCurrentMode(combatant) === "run") return true;
  const round = combat?.round ?? -1;
  const flag  = combatant.getFlag(MODULE_ID, FLAG_RAN_THIS_ROUND);
  return flag?.round === round;
}

/* -------------------------------------------- */

/**
 * Return the current scene distance unit label, e.g. "m".
 * @returns {string}
 */
export function getDistanceUnit() {
  return canvas.grid?.units ?? "";
}

/* -------------------------------------------- */
/*  Per-segment mode registry                   */
/* -------------------------------------------- */

/**
 * Maps tokenId → array of { fromCost, mode, sprint }.
 * Each entry records the mode/sprint that was active at the START of a committed move.
 * Used by ruler.js to colour each history segment by the mode it was actually drawn in,
 * independently of whatever mode is currently declared.
 * @type {Map<string, Array<{fromCost:number, mode:string, sprint:boolean}>>}
 */
const _segmentModeRegistry = new Map();

/**
 * Record the active mode and sprint state for an about-to-be-committed move.
 * `fromCost` is the cumulative distance BEFORE this move (= current historyCost).
 *
 * Any stale records with fromCost ≥ fromCost are pruned first: when a new round starts
 * and historyCost resets to 0, recording fromCost=0 automatically clears old data.
 *
 * @param {string}  tokenId
 * @param {number}  fromCost  Cumulative distance before this move.
 * @param {string}  mode      "walk" | "run"
 * @param {boolean} sprint    Whether the sprint override was active.
 */
export function recordSegmentMode(tokenId, fromCost, mode, sprint) {
  const kept = (_segmentModeRegistry.get(tokenId) ?? []).filter(r => r.fromCost < fromCost);
  kept.push({ fromCost, mode, sprint });
  _segmentModeRegistry.set(tokenId, kept);
}

/**
 * Return the recorded { mode, sprint } for the history segment whose endpoint has
 * cumulative cost = cost.
 *
 * Each segment belongs to the move that was started with the largest fromCost
 * strictly less than cost (a segment ending at cost C was created by a move that
 * began before cost C, so its fromCost < C).
 *
 * Returns null if no record exists (caller should fall back to currentMode).
 *
 * @param {string} tokenId
 * @param {number} cost  waypoint.measurement.cost
 * @returns {{ mode: string, sprint: boolean } | null}
 */
export function getSegmentModeAtCost(tokenId, cost) {
  const records = _segmentModeRegistry.get(tokenId);
  if (!records || records.length === 0) return null;
  let best = null;
  for (const rec of records) {
    if (rec.fromCost < cost && (!best || rec.fromCost > best.fromCost)) best = rec;
  }
  return best;
}
