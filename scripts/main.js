/**
 * SR5 Walk/Run Mode Declaration
 * Entry point — imports all submodules and registers their hooks.
 */

import { registerCombatTrackerHooks } from "./combat-tracker.js";
import { registerMovementHooks } from "./movement.js";
import { registerLifecycleHooks } from "./lifecycle.js";
import { registerRulerHooks } from "./ruler.js";
//import { registerCombatMovementHooks } from "./test-modifiers.js";
import { registerSettings, SETTING_RUNNING_MODIFIERS } from "./settings.js";
import { MODULE_ID } from "./utils.js";

Hooks.once("init", () => {
  console.log("sr5-walk-run-modes | Initialised");

  registerSettings();

  // Inject stylesheet directly – works regardless of whether Foundry honoured
  // the "styles" array in module.json (useful to diagnose CSS-load issues).
  const link = document.createElement("link");
  link.rel  = "stylesheet";
  link.type = "text/css";
  link.href = "modules/sr5-walk-run-modes/styles/sr5-walk-run-modes.css";
  document.head.appendChild(link);
  console.log("sr5-walk-run-modes | Stylesheet injected");

  registerLifecycleHooks();
  registerMovementHooks();
  registerRulerHooks();
  //registerCombatMovementHooks();
});

Hooks.once("ready", () => {
  registerCombatTrackerHooks();

// Ensure only GMs enforce the override
if (game.user?.isGM) {
  const SYSTEM = "shadowrun5e";
  const SYSTEM_SETTING = "TokenAutoRunning";
  const MODULE = MODULE_ID;
  const MODULE_SETTING = SETTING_RUNNING_MODIFIERS;

  // Apply immediately on ready if module option enabled
  (async function enforceNow() {
    if (game.settings.get(MODULE, MODULE_SETTING) && game.settings.get(SYSTEM, SYSTEM_SETTING) === true) {
      await game.settings.set(SYSTEM, SYSTEM_SETTING, false);
    }
  })();

  // Re-apply when either setting changes:
  Hooks.on("updateSetting", (namespace, key, value) => {
    // module toggle turned on → make system false now
    if (namespace === MODULE && key === MODULE_SETTING && value === true) {
      if (game.settings.get(SYSTEM, SYSTEM_SETTING) === true) {
        void game.settings.set(SYSTEM, SYSTEM_SETTING, false);
      }
    }
    // someone tried to enable the system setting → revert it if our module override is active
    if (namespace === SYSTEM && key === SYSTEM_SETTING && value === true && game.settings.get(MODULE, MODULE_SETTING)) {
      // small delay avoids UI race conditions
      setTimeout(() => { void game.settings.set(SYSTEM, SYSTEM_SETTING, false); }, 20);
    }
  });
}


});

/**
 * Automaattinen liiketila-efektien siivous taistelun päättyessä (Korjattu v14-versio).
 */
Hooks.on("deleteCombat", async (combat, options, userId) => {
  // Suoritetaan siivous vain kerran (pelinjohtajan selaimessa)
  if (game.user.id !== userId) return;

  console.log("sr5-walk-run-modes | Combat ended. Cleaning up movement active effects...");

  const moduleFlagKey = "sr5walkrun";
  const effectIds = ["globalPenalty", "defenseBonus", "runningComp"];
  
  // Taulukko, johon kerätään kaikki suoritettavat poistotehtävät
  const cleanupTasks = [];

  // 1. Kerätään kaikilta combatanteilta poistettavat efektit ilman asynkronista odottelua
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor) continue;

    const existingEffects = actor.effects.filter(e => effectIds.includes(e.flags?.[moduleFlagKey]?.id));
    
    if (existingEffects.length > 0) {
      const idsToDelete = existingEffects.map(e => e.id);
      
      // Työnnetään poistolupaus (Promise) taulukkoon, mutta ei ajeta sitä vielä
      cleanupTasks.push((async () => {
        await actor.deleteEmbeddedDocuments("ActiveEffect", idsToDelete);
        actor.prepareData();
      })());
    }
  }

  // 2. Jos poistettavaa löytyi, ajetaan KAIKKI poistot sekunnin murto-osassa rinnakkain
  if (cleanupTasks.length > 0) {
    try {
      await Promise.all(cleanupTasks);
      console.log("sr5-walk-run-modes | Juoksu- ja sprintti-efektit siivottu automaattisesti hahmoilta.");
    } catch (error) {
      // Napataan mahdolliset Foundryn asynkroniset tietokantavalitukset kiinni hiljaa
      console.warn("sr5-walk-run-modes | Huomautus efektien siivouksessa taistelun lopussa:", error);
    }
  }
});
