import { MODULE_ID, FLAG_CURRENT_MODE, FLAG_RAN_THIS_ROUND, getCurrentMode, getHistoryCost } from "./utils.js";

export function registerLifecycleHooks() {
  Hooks.on("updateCombat", onUpdateCombat);
}

async function onUpdateCombat(combat, changes, options, userId) {
  if (!game.user.isActiveGM) return;
  if (!("turn" in changes)) return;

  const prevId = combat.previous?.combatantId;
  const prevCombatant = prevId ? combat.combatants.get(prevId) : null;
  const nextCombatant = combat.combatant;
  const updates = [];

  // 1. Jos edellinen combatant juoksi, leimataan se flageihin
  if (prevCombatant) {
    const usedMode = getCurrentMode(prevCombatant);
    if (usedMode === "run") {
      const used = prevCombatant.token ? getHistoryCost(prevCombatant.token) : 0;
      if (Number.isFinite(used) && used > 0) {
        updates.push({
          _id: prevCombatant.id,
          [`flags.${MODULE_ID}.${FLAG_RAN_THIS_ROUND}`]: { round: combat.round },
        });
      }
    }
  }

  // 2. TARKISTETAAN UUDEN COMBATANTIN VUORO (Pass 1)
  if (nextCombatant) {
    const isFirstPass = (combat.system.pass ?? 1) === 1;
    if (isFirstPass && nextCombatant.token?.clearMovementHistory) {
      
      // Nollataan liikehistoria
      await nextCombatant.token.clearMovementHistory();
      Hooks.callAll("recordToken", nextCombatant.token);

      // --- AUTOMAATTINOLLAUKSEN TEKSTI JA EFEKTIT ---
      if (nextCombatant.actor) {
        const moduleFlagKey = "sr5walkrun";
        const effectIds = ["globalPenalty", "defenseBonus", "runningComp"];
        
        // Etsitään moduulimme aktiiviset efektit hahmon omista efekteistä
        const existingEffects = nextCombatant.actor.effects.filter(e => effectIds.includes(e.flags?.[moduleFlagKey]?.id));
        
        if (existingEffects.length > 0) {
          const idsToDelete = existingEffects.map(e => e.id);

          // 1. Haetaan fyysinen Token ja laukaistaan valkoinen Walking-teksti alaspäin
          const activeScene = game.scenes.active;
          const targetToken = activeScene?.tokens.get(nextCombatant.tokenId || nextCombatant.token?.id);
          
          if (targetToken?.object) {
            console.log("sr5-walk-run-modes | Laukaistaan Walking-teksti automaattisessa nollauksessa tokenille:", targetToken.name);
            canvas.interface.createScrollingText(targetToken.object.center, "Walking", {
              anchor: CONST.TEXT_ANCHOR_POINTS.TOP,
              direction: CONST.TEXT_ANCHOR_POINTS.BOTTOM, // Liikkuu alaspäin hidastamisen merkiksi
              fontSize: 24,
              fill: "#ffffff", // Puhdas valkoinen core-tyyli
              stroke: "#000000",
              strokeThickness: 4
            });
          }

          // 2. ARKKITEHTUURINEN KORJAUS: Poistetaan efektit suoralla ja varmalla komennolla hahmolta!
          // Käytetään vaimennusta { render: false, animate: false }, jotta poisto tapahtuu hiljaa taustalla
          await nextCombatant.actor.deleteEmbeddedDocuments("ActiveEffect", idsToDelete, { render: false, animate: false });
          
          // Pakotetaan hahmon tietomalli ja avoinna oleva lomake päivittymään heti
          nextCombatant.actor.prepareData();
          if (nextCombatant.actor.sheet && nextCombatant.actor.sheet.rendered) {
            nextCombatant.actor.sheet.render(false);
          }
        }
      }

      // Päivitetään combatantin flagit puhtaasti omana itsenäisenä tietokantapäivityksenään
      updates.push({
        _id: nextCombatant.id,
        [`flags.${MODULE_ID}.${FLAG_CURRENT_MODE}`]: { round: combat.round, mode: "walk" }
      });
    }
  }



  // Ajetaan kaikki muutokset yhdellä kertaa tietokantaan
  if (updates.length) {
    await combat.updateEmbeddedDocuments("Combatant", updates);
    
    // Pakotetaan hahmoarkki päivittymään ruudulle lennosta vuoronvaihdon jälkeen
    if (nextCombatant?.actor) {
      nextCombatant.actor.prepareData();
      if (nextCombatant.actor.sheet && nextCombatant.actor.sheet.rendered) {
        nextCombatant.actor.sheet.render(false);
      }
    }
  }
}
