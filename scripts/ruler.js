/**
 * Walk/Run mode ruler colouring.
 *
 * Overrides TokenRuler#_getSegmentStyle on the registered ruler class so every
 * segment — both the live drag ("planned") and the committed history trail
 * ("passed") — is coloured by the movement mode declared for the phase in which
 * it was created, completely replacing SR5's distance-based walk/run colours.
 *
 * Colour rules:
 *   Walk mode  →  green  (COLOR_WALK)
 *   Run  mode  →  amber  (COLOR_RUN)
 *   Current drag exceeds round limit  →  red  (COLOR_OVER)
 *
 * Mode is declared once per round and applies to all segments uniformly.
 */

import {
  MODULE_ID,
  FLAG_SPRINT_OVERRIDE,
  getMovementLimits,
  getCombatantForToken,
  getEffectiveLimit,
  hasRunThisRound,
  getCurrentMode,
  getSegmentModeAtCost,
} from "./utils.js";


const COLOR_WALK   = 0x00CC00; // green  — walk mode, within limit
const COLOR_RUN    = 0xFFCC00; // amber  — run mode, within limit
const COLOR_SPRINT = 0x0088FF; // blue   — run mode + sprint override active
const COLOR_OVER   = 0xFF2200; // red    — any mode, limit exceeded

export function registerRulerHooks() {
  // Use Hooks.on (not once) so re-patching works after scene changes or
  // hot-reloads.  Idempotency is enforced via a prototype marker below.
  Hooks.on("canvasReady", _patchRulerStyle);
}

/* -------------------------------------------- */

/** Prototype marker so the patch is never applied twice, even on hot-reload. */
const PATCH_KEY = "__sr5WalkRunPatched";

function _patchRulerStyle() {
  const RulerClass = CONFIG.Token.rulerClass;
  if (!RulerClass) return;

  // Idempotency: skip if this module already patched this class.
  if (RulerClass.prototype[PATCH_KEY]) return;
  RulerClass.prototype[PATCH_KEY] = true;

  if (typeof RulerClass.prototype._getSegmentStyle !== "function") {
    console.warn("sr5-walk-run-modes | ruler _getSegmentStyle not found — mode colouring disabled");
    return;
  }

  const originalStyle = RulerClass.prototype._getSegmentStyle;

  RulerClass.prototype._getSegmentStyle = function sr5WalkRunSegmentStyle(waypoint) {
    // Preserve width and alpha from the SR5 / Foundry base chain.
    const style = originalStyle.call(this, waypoint);
    if (style.width === 0) return style; // invisible segment — don't touch

    // Only colour segments for tokens in an active combat encounter.
    const tokenDoc = this.token?.document;
    if (!tokenDoc) return style;

    const combat = game.combat;
    if (!combat) return style;

    const combatant = getCombatantForToken(tokenDoc, combat);
    if (!combatant) {
      console.debug(`sr5-walk-run-modes | _getSegmentStyle: no combatant for token id="${tokenDoc.id}" — falling back to SR5 default`);
      return style;
    }

    const limits = getMovementLimits(tokenDoc);
    if (!limits) return style;

    const currentMode  = getCurrentMode(combatant, combat);
    const sprintActive = !!combatant.getFlag(MODULE_ID, FLAG_SPRINT_OVERRIDE);
    // Once run is declared in any phase, the effective limit becomes runMax for the rest of
    // the round and committed history segments stay amber — regardless of declaration mode.
    const everRan      = hasRunThisRound(combatant, combat);

    // History segments (already committed) — colour by the mode that was active when
    // each specific move was committed, not the current global mode.
    if (waypoint.stage !== "planned") {
      const seg     = getSegmentModeAtCost(tokenDoc.id, waypoint.measurement?.cost ?? 0);
      const segMode   = seg?.mode   ?? currentMode;   // fall back to current if no record
      const segSprint = seg?.sprint ?? sprintActive;
      style.color = segMode === "run"
        ? (segSprint ? COLOR_SPRINT : COLOR_RUN)
        : COLOR_WALK;
      return style;
    }

    // Live drag segment — colour reflects the current phase declaration;
    // the limit uses runMax if run was ever declared this round.
    const totalCost  = waypoint.measurement?.cost ?? 0;
    const roundLimit = everRan ? limits.runMax : getEffectiveLimit(combatant, limits);

    let color;
    if (sprintActive) {
      // Sprint: run limit bypassed — always blue regardless of distance.
      color = COLOR_SPRINT;
    } else if (totalCost > roundLimit + 0.001) {
      color = COLOR_OVER;
    } else if (currentMode === "run") {
      color = COLOR_RUN;
    } else {
      color = COLOR_WALK;
    }

    style.color = color;
    return style;
  };

  // ── Patch _getWaypointLabelContext ─────────────────────────────────────────
  // Replace context.action (the actionConfig that supplies the icon) with walk
  // or run config so the label icon matches the declared mode rather than the
  // distance-based SR5 action.

  if (typeof RulerClass.prototype._getWaypointLabelContext === "function") {
    const originalLabelContext = RulerClass.prototype._getWaypointLabelContext;

    RulerClass.prototype._getWaypointLabelContext = function sr5WalkRunLabelContext(waypoint, state) {
      const context = originalLabelContext.call(this, waypoint, state);
      if (!context) return context; // null = "don't render this label"

      const tokenDoc = this.token?.document;
      if (!tokenDoc) return context;

      const combat = game.combat;
      if (!combat) return context;

      const combatant = getCombatantForToken(tokenDoc, combat);
      if (!combatant) return context;

      const currentMode = getCurrentMode(combatant, combat);

      // Use the per-segment recorded mode for history waypoints; current mode for live drag.
      const segInfo  = waypoint.stage !== "planned"
        ? getSegmentModeAtCost(tokenDoc.id, waypoint.measurement?.cost ?? 0)
        : null;
      const mode = segInfo?.mode ?? currentMode;

      const actionKey    = mode === "run" ? "run" : "walk";
      const actionConfig = CONFIG.Token.movement.actions[actionKey];
      if (actionConfig) context.action = actionConfig;

      return context;
    };
  }

  console.log(`sr5-walk-run-modes | ${RulerClass.name}#_getSegmentStyle patched for walk/run mode colouring`);
}
