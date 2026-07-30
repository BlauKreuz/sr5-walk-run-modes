/**
 * Combat Tracker UI
 * Injects W/R mode toggle buttons and a "used / max" distance display
 * next to each combatant's name.
 */

import {
  MODULE_ID,
  FLAG_CURRENT_MODE,
  FLAG_SPRINT_OVERRIDE,
  FLAG_RAN_THIS_ROUND,
  getMovementLimits,
  getCombatantForToken,
  getHistoryCost,
  getEffectiveLimit,
  hasRunThisRound,
  getDistanceUnit,
  getCurrentMode,
} from "./utils.js";
import {
  getDistanceVisibility,
  getDeclarationMode,
  isRunningModifiersEnabled,
  shouldOpenRunningTestOnSprint,
} from "./settings.js";

export function registerCombatTrackerHooks() {
  // V13 uses ApplicationV2-based combat tracker
  Hooks.on("renderCombatTrackerV2", onRenderCombatTracker);
  // Fallback for older builds that still use the V1 tracker - possibly SR5
  Hooks.on("renderCombatTracker", onRenderCombatTracker);

  // Update only the distance number when a token move is committed,
  // without triggering a full tracker re-render.
  Hooks.on("recordToken", onRecordToken);
}

/* -------------------------------------------- */
/*  Tracker render                              */
/* -------------------------------------------- */

/**
 * @param {Application} app
 * @param {HTMLElement} html
 */
function onRenderCombatTracker(app, html) {
  const combat = game.combat;
  if (!combat) return;

  for (const combatant of combat.combatants) {
    if (!combatant.name || combatant.name === "Unknown Combatant") return;

    // Support both ApplicationV2 (HTMLElement) and V1 (jQuery) render targets
    const root = html instanceof HTMLElement ? html : html[0];
    const li = root.querySelector(`[data-combatant-id="${combatant.id}"]`);
    if (!li) continue;

    // Remove any previously injected widget to avoid duplicates on re-render
    li.querySelector(".sr5-movement-toggle")?.remove();

    const mode = getCurrentMode(combatant);
    const sprint = !!combatant.getFlag(MODULE_ID, FLAG_SPRINT_OVERRIDE);
    ////console.log("TOKEN", combatant.token);
    const limits = combatant.token ? getMovementLimits(combatant.token) : {};
    const info = canSeeDistance(combatant) ? buildInfoText(combatant, limits) : "";

    const wrap = document.createElement("span");
    wrap.classList.add("sr5-movement-toggle");
    wrap.title = game.i18n.localize("SR5WalkRun.Toggle.Tooltip");

//console.log("Rendering combatant", combatant.name, "mode", mode, "sprint", sprint);

    const ICON_PATH = "modules/sr5-walk-run-modes/assets/";
    wrap.innerHTML = `
      <span class="sr5-movement-info" title="${game.i18n.localize("SR5WalkRun.Info.Tooltip")}">${info}</span>
      <div class="sr5-mode-row">

      <button type="button" class="sr5-mode-btn"
              title="${mode === "run" ? game.i18n.localize("SR5WalkRun.Toggle.Run") : game.i18n.localize("SR5WalkRun.Toggle.Walk")}">
        <img class="sr5-mode-img"
             src="${ICON_PATH}icon-toggle-${mode}.svg"
             data-mode="${mode}"
             alt="${mode}">
      </button>
      <button type="button" class="sr5-sprint-btn"
              title="${game.i18n.localize("SR5WalkRun.Toggle.Sprint")}"
              data-sprint="${sprint ? 'on' : 'off'}"
              ${mode !== "run" ? 'style="display:none"' : ""}>
        <img src="${ICON_PATH}icon-toggle-sprint${sprint ? 'ing' : ''}.svg" alt="sprint">
      </button>

      </div>
    `;

    // Walk/run toggle.
    // Once-per-round mode: only on the 1st initiative pass of the combatant's turn.
    // Per-phase mode: on every initiative pass of the combatant's turn.
    const canControl = combatant.isOwner;
    const isFirstPass = (combat.system.pass ?? 1) === 1;
    const isMyTurn = combat.combatant?.id === combatant.id;
    const isPerPhase = getDeclarationMode() === "per_phase";
    const canToggleMode = isMyTurn && (isPerPhase || isFirstPass);
    const btn = wrap.querySelector(".sr5-mode-btn");
    const img = wrap.querySelector(".sr5-mode-img");

    const used = combatant.token ? getHistoryCost(combatant.token) : 0;

    // Disabling the toggle immediately after first movement of the phase.
    let movedThisPhase = false;
    if (combat.round === 1 && combat.system.pass === 1) {
      if (used > 0) movedThisPhase = true;
    } else {
      if (used > 0) {
        movedThisPhase = combat.previous?.combatantId === combatant.id;
      }
    }
//console.log("movedThisPhase", movedThisPhase, "used", used);


    if (!canControl || !canToggleMode || movedThisPhase) {
      btn.disabled = true;
      //console.log("Disabling mode toggle for combatant", combatant.name);
    } else {

      btn.addEventListener("click", () => {
        const current = img.dataset.mode;
        const newMode = current === "run" ? "walk" : "run";
        img.src = `${ICON_PATH}icon-toggle-${newMode}.svg`;
        img.dataset.mode = newMode;
        img.alt = newMode;
        btn.title = game.i18n.localize(newMode === "run" ? "SR5WalkRun.Toggle.Run" : "SR5WalkRun.Toggle.Walk");
        onModeButtonClick(combatant, newMode);
      });
    }

    // Sprint override button — enabled on any initiative phase when it is this combatant's turn.
    const sprintBtn = wrap.querySelector(".sr5-sprint-btn");
    if (sprintBtn) {
      const currentMode = getCurrentMode(combatant);
      if (!combatant.isOwner || !isMyTurn || currentMode !== "run") {
        sprintBtn.disabled = true;
      } else {
        sprintBtn.addEventListener("click", () => {
          const next = sprintBtn.dataset.sprint !== "on";
          sprintBtn.dataset.sprint = next ? "on" : "off";
          sprintBtn.querySelector("img").src = `${ICON_PATH}icon-toggle-sprint${next ? 'ing' : ''}.svg`;
          onSprintButtonClick(combatant, next);
        });
      }
    }

    // Insert after the token name element
    const nameEl = li.querySelector(".token-name") ?? li.querySelector(".combatant-name");
    if (nameEl) nameEl.after(wrap);
    else li.prepend(wrap);

    // If no token-resource is present in this row, inject an invisible placeholder
    // so the 24px flex slot is always reserved and the toggle doesn't shift right.
    if (!li.querySelector(".token-resource")) {
      const placeholder = document.createElement("div");
      placeholder.classList.add("token-resource", "sr5-resource-placeholder");
      placeholder.style.visibility = "hidden";
      placeholder.style.pointerEvents = "none";
      const initiativeEl = li.querySelector(".token-initiative");
      if (initiativeEl) initiativeEl.before(placeholder);
      else li.appendChild(placeholder);
    }
  }
}

/* -------------------------------------------- */
/*  Live distance update via recordToken hook   */
/* -------------------------------------------- */

/**
 * Called when Foundry commits a token movement to _movementHistory.
 * Updates the "used / max" text for the matching combatant row in-place,
 * without triggering a full tracker re-render.
 *
 * @param {TokenDocument} tokenDoc
 */
function onRecordToken(tokenDoc) {
  const combat = game.combat;
  if (!combat) return;

  const combatant = getCombatantForToken(tokenDoc, combat);
  if (!combatant) return;

  const limits = getMovementLimits(tokenDoc);

  // Search the full document for the combatant row rather than relying on a
  // specific container ID (which differs between Foundry V13's ApplicationV2
  // tracker and older builds).
  const li = document.querySelector(`[data-combatant-id="${combatant.id}"]`);

  ////console.log("Updating combat tracker row for combatant", combatant.name);

  const infoEl = li.querySelector(".sr5-movement-info");
  if (!infoEl) return;

  ////console.log("infoEl", infoEl);

  if (!canSeeDistance(combatant)) return;

  ////console.log("combatant, limits", combatant, limits);

  // Pass tokenDoc directly so we read from the already-updated movementHistory
  // rather than re-resolving combatant.token which could be a stale reference.
  infoEl.textContent = buildInfoText(combatant, limits, tokenDoc);

  ui.combat.render(true);


}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/**
 * Return true when the current user is allowed to see the distance info
 * for the given combatant, according to the distanceVisibility setting.
 * The GM always sees everything.
 *
 * @param {Combatant} combatant
 * @returns {boolean}
 */
function canSeeDistance(combatant) {
  if (game.user.isGM) return true;
  const mode = getDistanceVisibility();
  if (mode === "players") return !!combatant.hasPlayerOwner;
  if (mode === "owned") return combatant.isOwner;
  return true; // "all"
}

/**
 * Build the "used / max" text string for a combatant.
 * Returns an empty string when the actor has no SR5 movement data.
 *
 * @param {Combatant} combatant
 * @param {{ walkMax: number; runMax: number } | null} limits
 * @param {TokenDocument|null} [tokenDoc]  Optional: pass the live tokenDoc directly
 *                                          to avoid a stale combatant.token lookup.
 * @returns {string}  e.g. "5.0 / 20m"
 */
function buildInfoText(combatant, limits, tokenDoc = null) {
  if (!limits) return "";

  const combat = game.combat;
  const doc = tokenDoc ?? combatant.token;
  const used = doc ? getHistoryCost(doc) : 0;
  const roundMax = (combat && hasRunThisRound(combatant, combat)) ? limits.runMax : getEffectiveLimit(combatant, limits);
  const units = getDistanceUnit();
  const usedStr = Number.isFinite(used) ? used.toFixed(1) : "∞";

  return `${usedStr} / ${roundMax}${units}`;
}

/* -------------------------------------------- */
/*  Button interaction                          */
/* -------------------------------------------- */

/**
 * Handle a W/R button click — persist the new mode flag.
 * The resulting flag update triggers a combatant document update which
 * causes the combat tracker to re-render automatically.
 *
 * @param {Combatant} combatant
 * @param {"walk"|"run"} newMode
 */
async function onModeButtonClick(combatant, newMode) {
  const current = getCurrentMode(combatant);
  if (current === newMode) return;


  // >>> LISÄYS ALKAA: Laukaisee valkoisen tekstin heti klikkaushetkellä oikeaan suuntaan >>>
  if (combatant.actor) {
    const token = combatant.actor.getActiveTokens()[0] || combatant.token?.object;
    if (token) {
      canvas.interface.createScrollingText(token.center, newMode === "run" ? "Running" : "Walking", {
        anchor: CONST.TEXT_ANCHOR_POINTS.TOP,
        direction: newMode === "run" ? CONST.TEXT_ANCHOR_POINTS.TOP : CONST.TEXT_ANCHOR_POINTS.BOTTOM,
        fontSize: 24,
        fill: "#ffffff", // Puhdas valkoinen core-tyyli
        stroke: "#000000",
        strokeThickness: 4
      });
    }
  }
  // >>> LISÄYS PÄÄTTYY >>>

  const updateData = { [`flags.${MODULE_ID}.${FLAG_CURRENT_MODE}`]: newMode };

  // Stamp ran-this-round only if entering run, or if leaving run AND distance used > 0
  let stampRun = false;
  if (newMode === "run") stampRun = true;
  else if (current === "run") {

    const used = combatant.token ? getHistoryCost(combatant.token) : 0;
    stampRun = Number.isFinite(used) && used > 0;
  }

  if (stampRun) {
    const round = game.combat?.round ?? -1;
    updateData[`flags.${MODULE_ID}.${FLAG_RAN_THIS_ROUND}`] = { round };
  }

  await combatant.update(updateData);

  // If we purposely did NOT stamp, clear any existing ran-this-round flag so limits update.
  if (!stampRun && combatant.getFlag(MODULE_ID, FLAG_RAN_THIS_ROUND)) {
    await combatant.unsetFlag(MODULE_ID, FLAG_RAN_THIS_ROUND);
  }

  // Clear sprint override when switching back to walk (existing behavior).
  if (newMode === "walk" && combatant.getFlag(MODULE_ID, FLAG_SPRINT_OVERRIDE)) {
    await combatant.unsetFlag(MODULE_ID, FLAG_SPRINT_OVERRIDE);
  }

  if (combatant.actor) await updateMovementEffect(combatant, true);
}

/**
 * Persist the sprint override flag.
 * @param {Combatant} combatant
 * @param {boolean} active
 */
async function onSprintButtonClick(combatant, active) {

  // --- LISÄTÄÄN TEKSTI TÄHÄN (Laukeaa välittömästi klikatessa) ---
  if (combatant.actor) {
    const token = combatant.actor.getActiveTokens()[0];
    if (token) {
      canvas.interface.createScrollingText(token.center, active ? "Sprinting" : "Running", {
        anchor: CONST.TEXT_ANCHOR_POINTS.TOP,
        direction: active ? CONST.TEXT_ANCHOR_POINTS.TOP : CONST.TEXT_ANCHOR_POINTS.BOTTOM,
        fontSize: 24,
        fill: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4
      });
    }
  }
  if (active) {
    await combatant.setFlag(MODULE_ID, FLAG_SPRINT_OVERRIDE, true);
  } else {
    await combatant.unsetFlag(MODULE_ID, FLAG_SPRINT_OVERRIDE);
  }
  if (combatant.actor) await updateMovementEffect(combatant, true);

  // Optional UX: open Running skill test dialog immediately when sprint is activated.
  if (active && shouldOpenRunningTestOnSprint() && combatant.actor?.isOwner) {
    // Force a plain Running SkillTest without opposed/target data.
    // Some skill items may carry an opposed-action config which turns this into an opposed flow.
    const action = combatant.actor.skillActionData("running");
    if (action) {
      action.opposed = {
        test: "",
        type: "",
        skill: "",
        mod: 0,
        attribute: "",
        attribute2: "",
        armor: false,
        resist: {
          test: "",
          skill: "",
          mod: 0,
          attribute: "",
          attribute2: "",
          armor: false,
        },
      };
      const test = await combatant.actor.tests.fromAction(action, combatant.actor, { showDialog: true });
      if (test) await test.execute();
    } else {
      await combatant.actor.rollSkill("running");
    }
  }
}

/**
 * Apufunktio, joka luo, päivittää tai poistaa Active Effectin välittömästi ilman viivettä.
 * @param {Combatant} combatant
 */
async function updateMovementEffect(combatant) {
  if (!isRunningModifiersEnabled()) return;
  
  const actor = combatant.actor;
  if (!actor) return;

  // Luetaan tila dynaamisesti apufunktiolla ilman monimutkaisia round-objektihakuja
  const currentMode = getCurrentMode(combatant); 
  const isSprintFlagOn = !!combatant.getFlag(MODULE_ID, FLAG_SPRINT_OVERRIDE);

  // Määritetään lopullinen kohdemoodi
  let mode = currentMode;
  if (currentMode === "run" && isSprintFlagOn) {
    mode = "sprint";
  }

  const moduleFlagKey = "sr5walkrun";
  const effectIds = ["globalPenalty", "defenseBonus"]; //, "runningComp"];
  
  // Etsitään olemassa olevat efektit
  const existingEffects = actor.effects.filter(e => effectIds.includes(e.flags?.[moduleFlagKey]?.id));

  // Poistetaan vanhat efektit hiljaisesti taustalla
  if (existingEffects.length > 0) {
    const idsToDelete = existingEffects.map(e => e.id);
    await actor.deleteEmbeddedDocuments("ActiveEffect", idsToDelete, { render: false, animate: false });
  }

  // Jos uusi tila on kävely, nollataan data, päivitetään avoin lomake ja keskeytetään suoritus
  if (mode === "walk") {
    actor.prepareData();
    if (actor.sheet && actor.sheet.rendered) {
      actor.sheet.render(false);
    }
    return;
  }

  const isSprint = mode === "sprint";
  const defenseValue = isSprint ? 4 : 2;
  const statusTag = isSprint ? "sprinting" : "running";
  const modeLabel = isSprint ? game.i18n.localize("SR5WalkRun.SprintingModifier") : game.i18n.localize("SR5WalkRun.RunningModifier");

  // All tests that should be excluded from the running penalty
  const testsToExclude = [
    'PhysicalDefenseTest',
    'CombatSpellDefenseTest',
    'MatrixDefenseTest',
    'PhysicalResistTest',
    'BiofeedbackResistTest',
    'MatrixResistTest',
    'FadeTest',
    'DrainTest'
  ];

  // Määritetään kolme erillistä efektiä
  const effectsToCreate = [
    {
      name: `${modeLabel} ${game.i18n.localize("SR5WalkRun.Penalty")}`,
      img: isSprint ? "systems/shadowrun5e/dist/icons/status-effects/sprint.svg" : "systems/shadowrun5e/dist/icons/status-effects/run.svg",
      statuses: [statusTag],
      changes: [{ key: "data.pool", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "-2", priority: 20 }],
      flags: { 
        [moduleFlagKey]: { id: "globalPenalty" },
        'sr5-ae-neg-filter': {
          negated: {
            selection_tests: testsToExclude,
            selection_skills: ['running']
          }
        }
      },
      system: {
        applyTo: "test_all",
        selection_tests: testsToExclude,
        selection_categories: [],
        selection_skills: ['running'],
        selection_attributes: [],
        selection_limits: []
      }
    },
    {
      name: `${modeLabel} ${game.i18n.localize("SR5WalkRun.Defense")}`,
      img: "icons/svg/shield.svg",
      statuses: [statusTag],
      changes: [{ key: "data.pool", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(defenseValue), priority: 25 }],
      flags: { [moduleFlagKey]: { id: "defenseBonus" } },
      system: {
        applyTo: "test_all",
        selection_tests: ['PhysicalDefenseTest', 'CombatSpellDefenseTest'],
        selection_categories: [],
        selection_skills: [],
        selection_attributes: [],
        selection_limits: []
      }
    }
    
    /*,
    {
      name: `${game.i18n.localize("SR5WalkRun.PenaltyOverride")}`,
      img: "icons/svg/upgrade.svg",
      statuses: [statusTag],
      changes: [{ key: "data.pool", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: "2", priority: 25 }],
      flags: { [moduleFlagKey]: { id: "runningComp" } },
      system: {
        applyTo: "test_all",
        changes: [{ key: "data.pool", type: "add", value: 2 }],
        selection_skills: [{ value: "Running", id: "running" }]
      }
    }*/
  ];

  //console.log("%c-> YRITETÄÄN LUODA EFEKTIT TIETOKANTAAN:", "color: #00ff00; font-weight: bold;", effectsToCreate);
  
  try {
    const created = await actor.createEmbeddedDocuments("ActiveEffect", effectsToCreate, { render: false, animate: false });
    //console.log("-> EFEKTIT LUOTU ONNISTUNEESTI! Luodut dokumentit:", created);
  } catch (err) {
    console.error("%c-> VIRHE EFEKTIEN LUONNISSA:", "color: #ff0000; font-weight: bold;", err);
  }

  // 1. Refresh the actor's sheet if it's open to ensure effects collection is current
  if (actor.sheet && actor.sheet.rendered) {
    await actor.sheet.render(false);
  }

  // 2. Pakotetaan hahmon tietomalli laskemaan noppapoolit lennosta uusiksi
  actor.prepareData();

  // 3. Emit hooks to notify test system and other listeners that effects have changed
  // This ensures test dialogs see the new effects even in per-phase declaration mode
  Hooks.call('sr5_effectsUpdated', actor);
  Hooks.call('sr5EffectsChanged', actor); // Alternate hook name for different listeners

  // 4. Force full actor render to ensure all cached data is refreshed
  // This is particularly important in "per_phase" declaration mode where effects
  // might be created multiple times per turn
  await actor.render(false);

  // 5. If this is the current combatant, invalidate any test dialog caches
  if (game.combat?.combatant?.actor?.id === actor.id) {
    Hooks.call('sr5_actorEffectsInvalidated', actor);
  }

  console.log("[SR5 DEBUG] updateMovementEffect SUORITETTU LOPPUUN.");
}
