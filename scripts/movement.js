/**
 * Movement Enforcement
 * Hooks into preMoveToken to block movement that exceeds the declared mode's distance limit.
 *
 * Limit logic (applies to both declaration modes):
 *  - If run was declared at any point this round → effective limit = runMax.
 *  - Otherwise → effective limit = current mode's limit (walkMax when walking).
 *  Once run is on the record for a round it cannot be undone — switching back to walk
 *  does not lower the cap.
 */

import {
  MODULE_ID,
  FLAG_SPRINT_OVERRIDE,
  getMovementLimits,
  getCombatantForToken,
  getHistoryCost,
  getEffectiveLimit,
  hasRunThisRound,
  getCurrentMode,
  recordSegmentMode,
} from "./utils.js";
import { isGmMovementOverrideEnabled } from "./settings.js";

export function registerMovementHooks() {
  Hooks.on("preMoveToken", onPreMoveToken);
}

/**
 * @param {TokenDocument} tokenDoc
 * @param {TokenMovementOperation} movement
 * @param {object} options
 * @returns {boolean|void}  Return false to cancel the movement.
 */
function onPreMoveToken(tokenDoc, movement, options) {
  // Only enforce when there is an active combat (avoid blocking movement outside combat).
  // Deliberately avoid combat.started because SR5's initiative pass system can leave
  // started === false momentarily between passes while combat is still ongoing.
  const combat = game.combat;
  if (!combat) return;

  // GMs may bypass movement limits when the override setting is enabled.
  if (isGmMovementOverrideEnabled() && game.user?.isGM) return;

  const combatant = getCombatantForToken(tokenDoc, combat);
  if (!combatant) return;

  // Record mode/sprint for ruler per-segment colouring. Done here — before any early return
  // that still allows the move — so sprint and no-limits cases are captured too.
  // If the move is later blocked (return false), historyCost is unchanged and the record
  // is overwritten on the next preMoveToken call with the same fromCost.
   
console.log("+++++++++++++++recordSegmentMode")
  
  recordSegmentMode(
    tokenDoc.id,
    getHistoryCost(tokenDoc),
    getCurrentMode(combatant),
    !!combatant.getFlag(MODULE_ID, FLAG_SPRINT_OVERRIDE),
  );

  // Sprint override: player has chosen to exceed the run distance limit.
  if (combatant.getFlag(MODULE_ID, FLAG_SPRINT_OVERRIDE)) return;

  const limits = getMovementLimits(tokenDoc);
  if (!limits) return; // actor has no SR5 movement data

  const mode = getCurrentMode(combatant, combat);
  // Once run is declared this round the effective cap stays at runMax even if mode is later
  // switched back to walk.  For a pure-walk round the cap is walkMax as usual.
  const roundLimit = hasRunThisRound(combatant, combat) ? limits.runMax : limits.walkMax;

  // Read cumulative round history cost directly from the token's _movementHistory.
  // This is the same data SR5TokenDocument.measureMovementPath uses for walk/run/sprint
  // colour assignment, so the units are guaranteed to match walkMax / runMax.
  
console.log("+++++++++++++++MOVEMENT 2")
  
  const historyCost = getHistoryCost(tokenDoc);

  // movement.passed.cost = incremental backward-cost sum for the waypoints being committed now.
  // (Foundry builds this from measurement.waypoints[i].backward.cost inside _preUpdate.)
  const moveCost = Number.isFinite(movement.passed?.cost) ? movement.passed.cost : Infinity;

  const totalCost = Number.isFinite(historyCost) ? historyCost + moveCost : Infinity;

  console.debug(
    `sr5-walk-run-modes | preMoveToken: actor=${tokenDoc.actor?.name} ` +
    `mode=${mode} ` +
    `history=${historyCost.toFixed(2)} move=${moveCost.toFixed(2)} ` +
    `total=${Number.isFinite(totalCost) ? totalCost.toFixed(2) : "Inf"} limit=${roundLimit}`
  );

  if (totalCost > roundLimit + 0.001) { // small epsilon to forgive floating-point rounding
    const modeLabel = game.i18n.localize(
      mode === "run" ? "SR5WalkRun.Mode.Run" : "SR5WalkRun.Mode.Walk"
    );
    const remaining = Math.max(roundLimit - (Number.isFinite(historyCost) ? historyCost : 0), 0).toFixed(1);
    ui.notifications.warn(
      game.i18n.format("SR5WalkRun.Warning.Exceeded", {
        mode: modeLabel,
        limit: roundLimit,
        total: Number.isFinite(totalCost) ? totalCost.toFixed(1) : "∞",
        remaining,
      })
    );
    return false; // cancel the movement update
  }
}
