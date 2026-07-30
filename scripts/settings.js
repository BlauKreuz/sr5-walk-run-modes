/**
 * Module Settings
 * Registers all configurable options for sr5-walk-run-modes.
 */

import { MODULE_ID } from "./utils.js";

export const SETTING_DECLARATION_MODE    = "declarationMode";
export const SETTING_RUNNING_MODIFIERS   = "runningModifiers";
export const SETTING_GM_MOVEMENT_OVERRIDE = "gmMovementOverride";
export const SETTING_DISTANCE_VISIBILITY  = "distanceVisibility";
export const SETTING_OPEN_RUNNING_TEST_ON_SPRINT = "openRunningTestOnSprint";

export function registerSettings() {
  // ── Declaration mode (first setting) ────────────────────────────────────
  game.settings.register(MODULE_ID, SETTING_DECLARATION_MODE, {
    name: game.i18n.localize("SR5WalkRun.Settings.DeclarationMode.Name"),
    hint: game.i18n.localize("SR5WalkRun.Settings.DeclarationMode.Hint"),
    scope:   "world",
    config:  true,
    type:    String,
    choices: {
      once_per_round: game.i18n.localize("SR5WalkRun.Settings.DeclarationMode.OncePerRound"),
      per_phase:      game.i18n.localize("SR5WalkRun.Settings.DeclarationMode.PerPhase"),
    },
    default: "once_per_round",
  });

  game.settings.register(MODULE_ID, SETTING_RUNNING_MODIFIERS, {
    name: game.i18n.localize("SR5WalkRun.Settings.RunningModifiers.Name"),
    hint: game.i18n.localize("SR5WalkRun.Settings.RunningModifiers.Hint"),
    scope:  "world",
    config: true,
    type:    Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, SETTING_GM_MOVEMENT_OVERRIDE, {
    name: game.i18n.localize("SR5WalkRun.Settings.GmMovementOverride.Name"),
    hint: game.i18n.localize("SR5WalkRun.Settings.GmMovementOverride.Hint"),
    scope:  "world",
    config: true,
    type:    Boolean,
    default: false,
  });

  game.settings.register(MODULE_ID, SETTING_DISTANCE_VISIBILITY, {
    name: game.i18n.localize("SR5WalkRun.Settings.DistanceVisibility.Name"),
    hint: game.i18n.localize("SR5WalkRun.Settings.DistanceVisibility.Hint"),
    scope:   "world",
    config:  true,
    type:    String,
    choices: {
      all:     game.i18n.localize("SR5WalkRun.Settings.DistanceVisibility.All"),
      players: game.i18n.localize("SR5WalkRun.Settings.DistanceVisibility.Players"),
      owned:   game.i18n.localize("SR5WalkRun.Settings.DistanceVisibility.Owned"),
    },
    default: "all",
  });

  game.settings.register(MODULE_ID, SETTING_OPEN_RUNNING_TEST_ON_SPRINT, {
    name: game.i18n.localize("SR5WalkRun.Settings.OpenRunningTestOnSprint.Name"),
    hint: game.i18n.localize("SR5WalkRun.Settings.OpenRunningTestOnSprint.Hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });
}

/** Returns the declaration mode: "once_per_round" | "per_phase". */
export function getDeclarationMode() {
  return game.settings.get(MODULE_ID, SETTING_DECLARATION_MODE);
}

/** Returns true when the running-mode dice-pool modifiers are enabled. */
export function isRunningModifiersEnabled() {
  return game.settings.get(MODULE_ID, SETTING_RUNNING_MODIFIERS);
}

/** Returns true when the GM movement-limit override is enabled. */
export function isGmMovementOverrideEnabled() {
  return game.settings.get(MODULE_ID, SETTING_GM_MOVEMENT_OVERRIDE);
}

/** Returns the current distance-visibility mode: "all" | "players" | "owned". */
export function getDistanceVisibility() {
  return game.settings.get(MODULE_ID, SETTING_DISTANCE_VISIBILITY);
}

/** Returns true when sprint activation should auto-open the Running test dialog. */
export function shouldOpenRunningTestOnSprint() {
  return game.settings.get(MODULE_ID, SETTING_OPEN_RUNNING_TEST_ON_SPRINT);
}
