/**
 * SR5 Walk/Run Mode Declaration
 * Entry point — imports all submodules and registers their hooks.
 */

import { registerCombatTrackerHooks } from "./combat-tracker.js";
import { registerMovementHooks } from "./movement.js";
import { registerLifecycleHooks } from "./lifecycle.js";
import { registerRulerHooks } from "./ruler.js";
//import { registerCombatMovementHooks } from "./test-modifiers.js";
import { registerSettings } from "./settings.js";

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
