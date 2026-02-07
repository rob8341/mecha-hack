// Mecha Hack - Foundry VTT v13 System

const DICE_TYPES = ["d4", "d6", "d8", "d10", "d12", "d20"];
const STATS = { power: "Power", mobility: "Mobility", system: "System", presence: "Presence" };

// Actor Document
class MechaHackActor extends Actor {
  prepareDerivedData() {
    const system = this.system;
    if (this.type === "enemy") return;
    
    for (const stat of Object.values(system.stats)) {
      stat.value = Math.max(1, Math.min(20, stat.value));
    }
    system.armorPoints.pct = Math.round((system.armorPoints.value / system.armorPoints.max) * 100) || 0;
    system.hitPoints.pct = Math.round((system.hitPoints.value / system.hitPoints.max) * 100) || 0;
  }

  async rollStat(statKey, mode = "normal", modifier = 0) {
    const stat = this.system.stats[statKey];
    let roll, rollFormula, modeLabel;
    
    if (mode === "advantage") {
      rollFormula = "2d20kl";
      modeLabel = "Advantage";
    } else if (mode === "disadvantage") {
      rollFormula = "2d20kh";
      modeLabel = "Disadvantage";
    } else {
      rollFormula = "1d20";
      modeLabel = "Normal";
    }
    
    roll = await new Roll(rollFormula).evaluate();
    const result = roll.total;
    
    // Apply modifier to the roll, not the target
    const modifiedRoll = result + modifier;
    
    // Check for critical
    let isCritSuccess = false;
    let isCritFailure = false;
    
    if (mode === "normal") {
      isCritSuccess = result === 1;
      isCritFailure = result === 20;
    } else {
      // For advantage/disadvantage, check individual dice
      const dice = roll.dice[0].results;
      const keptDie = dice.find(d => !d.discarded);
      if (keptDie) {
        isCritSuccess = keptDie.result === 1;
        isCritFailure = keptDie.result === 20;
      }
    }
    
    // Success if roll is LOWER than target (fail on equal or higher)
    let success = modifiedRoll < stat.value;
    if (isCritSuccess) success = true;
    if (isCritFailure) success = false;
    
    let resultText = success ? "SUCCESS" : "FAILURE";
    let critText = "";
    let critClass = "";
    
    if (isCritSuccess) {
      critText = " — CRITICAL SUCCESS!";
      critClass = " critical-success";
    } else if (isCritFailure) {
      critText = " — CRITICAL FAILURE!";
      critClass = " critical-failure";
    }
    
    // Format roll display with modifier
    let rollDisplay = `${result}`;
    if (modifier !== 0) {
      const modSign = modifier > 0 ? "+" : "";
      rollDisplay = `${modifiedRoll} (${result} ${modSign}${modifier})`;
    }
    
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `
        <div class="mecha-roll ${success ? 'success' : 'failure'}${critClass}">
          <strong>${STATS[statKey]} Check</strong> (${modeLabel})<br>
          Target: ${stat.value} | Roll: ${rollDisplay}<br>
          <span class="result">${resultText}${critText}</span>
        </div>`
    });
  }

  async rollDie(dieKey, mode = "normal", doubleDamage = false) {
    let dieSize = this.system.dice[dieKey];
    const labels = { hit: "Hit Die", damage: "Damage Die", reactor: "Reactor Die" };
    
    let extraMessage = "";
    let modeLabel = "";
    let damageBonus = 0;
    
    // Handle damage die modes
    if (dieKey === "damage") {
      const diceOrder = ["d4", "d6", "d8", "d10", "d12", "d20"];
      
      if (mode === "heavy") {
        modeLabel = " — Heavy Weapon";
        damageBonus = 2;
      } else if (mode === "unarmed") {
        modeLabel = " — Unarmed";
        // Step down one die size
        const currentIndex = diceOrder.indexOf(dieSize);
        if (currentIndex > 0) {
          dieSize = diceOrder[currentIndex - 1];
        }
      }
    }
    
    const roll = await new Roll(`1${dieSize}`).evaluate();
    let total = roll.total + damageBonus;
    
    // Double damage
    if (dieKey === "damage" && doubleDamage) {
      total = total * 2;
    }
    
    // Reactor die behavior
    if (dieKey === "reactor") {
      if (roll.total <= 2) {
        const degradeOrder = ["d20", "d12", "d10", "d8", "d6", "d4"];
        const currentIndex = degradeOrder.indexOf(dieSize);
        
        if (currentIndex < degradeOrder.length - 1) {
          const newDie = degradeOrder[currentIndex + 1];
          await this.update({ "system.dice.reactor": newDie });
          extraMessage = `<br><span class="reactor-degrade">⚠ REACTOR DEGRADED: ${dieSize.toUpperCase()} → ${newDie.toUpperCase()}</span>`;
        } else {
          // Already at d4 and rolled 1 or 2
          extraMessage = `<br><span class="reactor-overheat">🔥 REACTOR OVERHEATED!</span>`;
        }
      } else {
        // Roll was not 1 or 2
        extraMessage = `<br><span class="reactor-steady">✓ Reactor Steady</span>`;
      }
    }
    
    // Hit die heal mode
    if (dieKey === "hit" && mode === "heal") {
      const currentHP = this.system.hitPoints.value;
      const maxHP = this.system.hitPoints.max;
      const healAmount = roll.total;
      const newHP = Math.min(currentHP + healAmount, maxHP);
      const actualHeal = newHP - currentHP;
      
      await this.update({ "system.hitPoints.value": newHP });
      
      extraMessage = `<br><span class="heal-result">💚 Healed ${actualHeal} HP (${currentHP} → ${newHP})</span>`;
      
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        flavor: `<div class="mecha-roll heal-roll"><strong>${labels[dieKey]}</strong> (${dieSize.toUpperCase()}) — Heal Roll${extraMessage}</div>`
      });
      return;
    }
    
    // Damage roll with modifiers
    if (dieKey === "damage") {
      let damageDisplay = `${total}`;
      let damageCalc = "";
      
      if (damageBonus > 0 && doubleDamage) {
        damageCalc = ` <span style="color: var(--mecha-text-dim, #888);">((${roll.total} + ${damageBonus}) × 2)</span>`;
      } else if (damageBonus > 0) {
        damageCalc = ` <span style="color: var(--mecha-text-dim, #888);">(${roll.total} + ${damageBonus})</span>`;
      } else if (doubleDamage) {
        damageCalc = ` <span style="color: var(--mecha-text-dim, #888);">(${roll.total} × 2)</span>`;
      }
      
      let doubleLabel = doubleDamage ? ' <span style="color: var(--mecha-red, #e94560);">[DOUBLE]</span>' : '';
      
      await roll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this }),
        flavor: `<div class="mecha-roll damage-roll"><strong>${labels[dieKey]}</strong> (${dieSize.toUpperCase()})${modeLabel}${doubleLabel}<br><span class="damage-total" style="font-size: 1.3em; font-weight: bold; color: var(--mecha-yellow, #f0c040);">${damageDisplay} damage</span>${damageCalc}</div>`
      });
      return;
    }
    
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flavor: `<div class="mecha-roll"><strong>${labels[dieKey]}</strong> (${dieSize.toUpperCase()})${extraMessage}</div>`
    });
  }
}

// Item Document
class MechaHackItem extends Item {
  // Roll attack with damage for enemy attacks, recharge attacks, and boss attacks
  async rollAttack() {
    if (this.type !== "enemyAttack" && this.type !== "enemyRechargeAttack" && this.type !== "bossAttack" && this.type !== "bossRechargeAttack") return this.roll();
    
    // Check if recharge attack is ready
    if ((this.type === "enemyRechargeAttack" || this.type === "bossRechargeAttack") && !this.system.ready) {
      ui.notifications.warn(`${this.name} is not ready! Roll recharge die first.`);
      return;
    }
    
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    const damage = this.system.damage || "1d6";
    const defendStat = this.system.defendStat || "power";
    const attackRange = this.system.attackRange || "close";
    const targets = this.system.targets || 1;
    
    const statLabels = { power: "Power", mobility: "Mobility", system: "System", presence: "Presence" };
    const rangeLabels = { close: "Close", near: "Near", far: "Far", distant: "Distant" };
    
    const defendLabel = statLabels[defendStat];
    const rangeLabel = rangeLabels[attackRange];
    
    // Roll the damage
    let roll;
    try {
      roll = await new Roll(damage).evaluate();
    } catch (e) {
      ui.notifications.error(`Invalid damage formula: ${damage}`);
      return;
    }
    
    const damageTotal = roll.total;
    
    // Build chat content
    let content = `<div class="mecha-roll attack-roll attack-roll-damage">`;
    content += `<strong><i class="fas fa-crosshairs"></i> ${this.name}</strong>`;
    content += `<div class="attack-result">`;
    content += `<span class="damage-rolled">${damageTotal} damage</span>`;
    content += `<span class="damage-formula">(${damage})</span>`;
    content += `</div>`;
    content += `<div class="attack-details">`;
    content += `<span class="attack-info defend-info">Defend: <strong class="defend-stat-${defendStat}">${defendLabel}</strong></span>`;
    content += `<span class="attack-info range-info range-${attackRange}">${rangeLabel}</span>`;
    content += `<span class="attack-info targets-info">${targets} Target${targets > 1 ? 's' : ''}</span>`;
    content += `</div>`;
    if (this.system.description) {
      content += `<div class="item-description">${this.system.description}</div>`;
    }
    content += `</div>`;
    
    // If this is a recharge attack, unready it after use
    if (this.type === "enemyRechargeAttack" || this.type === "bossRechargeAttack") {
      await this.update({ "system.ready": false });
    }
    
    await roll.toMessage({
      speaker: speaker,
      flavor: content
    });
  }
  
  // Roll recharge die for recharge attacks
  async rollRechargeDie() {
    if (this.type !== "enemyRechargeAttack" && this.type !== "bossRechargeAttack") return;
    
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    const enemyName = this.actor?.name || "Enemy";
    
    const roll = await new Roll("1d6").evaluate();
    const result = roll.total;
    
    let content = `<div class="mecha-roll recharge-die-roll">`;
    content += `<strong><i class="fas fa-sync-alt"></i> ${enemyName}'s ${this.name}</strong>`;
    
    if (result >= 5) {
      // Ready!
      await this.update({ "system.ready": true });
      content += `<div class="recharge-success">`;
      content += `<span class="recharge-result">⚡ READY TO USE!</span>`;
      content += `<span class="recharge-roll-result">(Rolled ${result})</span>`;
      content += `</div>`;
    } else {
      // Still recharging
      content += `<div class="recharge-fail">`;
      content += `<span class="recharge-result">Still recharging...</span>`;
      content += `<span class="recharge-roll-result">(Rolled ${result})</span>`;
      content += `</div>`;
    }
    
    content += `</div>`;
    
    await roll.toMessage({
      speaker: speaker,
      flavor: content
    });
  }
  
  // Add prefix when creating enemy/boss-specific items from Foundry directly (not from sheet)
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);
    
    const enemyTypes = ["enemyTrait", "enemyAttack", "enemyRechargeAttack"];
    const bossTypes = ["bossAttack", "bossRechargeAttack"];
    
    // Only add prefix if:
    // 1. It's an enemy/boss-specific item type
    // 2. It's NOT being created on an actor (created directly in Items directory)
    // 3. The name doesn't already start with the prefix
    if (enemyTypes.includes(data.type) && !this.parent && !data.name.startsWith("enemy-")) {
      const typeNames = {
        enemyTrait: "enemy-Trait",
        enemyAttack: "enemy-Attack",
        enemyRechargeAttack: "enemy-Recharge Attack"
      };
      this.updateSource({ name: typeNames[data.type] || `enemy-${data.type}` });
    }
    
    if (bossTypes.includes(data.type) && !this.parent && !data.name.startsWith("boss-")) {
      const typeNames = {
        bossAttack: "boss-Attack",
        bossRechargeAttack: "boss-Recharge Attack"
      };
      this.updateSource({ name: typeNames[data.type] || `boss-${data.type}` });
    }
  }

  async roll() {
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    
    if (this.type === "weapon") {
      // Weapon: Link to chat with details
      const rangeLabel = this.system.range === "melee" ? "Melee" : "Ranged";
      const handsLabel = this.system.hands === "oneHanded" ? "One Handed" : "Two Handed";
      
      let content = `<div class="mecha-roll weapon-roll"><strong><i class="fas fa-crosshairs"></i> ${this.name}</strong>`;
      content += `<br><span class="weapon-detail"><span class="weapon-range-${this.system.range}">${rangeLabel}</span> | ${handsLabel}</span>`;
      if (this.system.qualities) {
        content += `<div class="item-qualities" style="margin-top: 4px; font-style: italic; color: var(--mecha-yellow);">${this.system.qualities}</div>`;
      }
      if (this.system.description) {
        content += `<div class="item-description">${this.system.description}</div>`;
      }
      content += `</div>`;
      
      await ChatMessage.create({
        speaker: speaker,
        content: content
      });
      
    } else if (this.type === "module") {
      // Module: Show type and description
      const typeLabels = { utility: "Utility", offensive: "Offensive", defensive: "Defensive" };
      const typeLabel = typeLabels[this.system.moduleType] || "Utility";
      
      let content = `<div class="mecha-roll module-roll"><strong><i class="fas fa-microchip"></i> ${this.name}</strong>`;
      content += ` <span class="module-type module-type-${this.system.moduleType}">${typeLabel}</span>`;
      if (this.system.description) {
        content += `<div class="item-description">${this.system.description}</div>`;
      }
      content += `</div>`;
      
      await ChatMessage.create({
        speaker: speaker,
        content: content
      });
      
    } else if (this.type === "armor") {
      // Armor: Show armor points and description
      let content = `<div class="mecha-roll armor-roll"><strong><i class="fas fa-shield-alt"></i> ${this.name}</strong>`;
      
      if (this.system.armorBonus) {
        content += ` <span style="color: var(--mecha-cyan);">+${this.system.armorBonus} AP</span>`;
      }
      if (this.system.description) {
        content += `<div class="item-description">${this.system.description}</div>`;
      }
      content += `</div>`;
      
      await ChatMessage.create({
        speaker: speaker,
        content: content
      });
      
    } else if (this.type === "equipment") {
      // Equipment: Link to chat with description
      let content = `<div class="mecha-roll equipment-roll"><strong><i class="fas fa-toolbox"></i> ${this.name}</strong>`;
      
      if (this.system.description) {
        content += `<div class="item-description">${this.system.description}</div>`;
      }
      content += `</div>`;
      
      await ChatMessage.create({
        speaker: speaker,
        content: content
      });
      
    } else if (this.type === "consumable") {
      // Consumable: Link to chat with uses
      let content = `<div class="mecha-roll consumable-roll"><strong><i class="fas fa-flask"></i> ${this.name}</strong>`;
      
      if (this.system.uses > 0) {
        content += ` <span style="color: var(--mecha-yellow);">(${this.system.uses} uses remaining)</span>`;
      } else {
        content += ` <span style="color: var(--mecha-red);">(No uses remaining)</span>`;
      }
      if (this.system.description) {
        content += `<div class="item-description">${this.system.description}</div>`;
      }
      content += `</div>`;
      
      await ChatMessage.create({
        speaker: speaker,
        content: content
      });
      
    } else if (this.type === "pilotAbility") {
      // Pilot Ability: Show description
      let content = `<div class="mecha-roll ability-roll pilot-ability-roll"><strong><i class="fas fa-user"></i> ${this.name}</strong>`;
      if (this.system.description) {
        content += `<div class="item-description">${this.system.description}</div>`;
      }
      content += `</div>`;
      
      await ChatMessage.create({
        speaker: speaker,
        content: content
      });
      
    } else if (this.type === "chassisAbility") {
      // Chassis Ability: Show description
      let content = `<div class="mecha-roll ability-roll chassis-ability-roll"><strong><i class="fas fa-robot"></i> ${this.name}</strong>`;
      if (this.system.description) {
        content += `<div class="item-description">${this.system.description}</div>`;
      }
      content += `</div>`;
      
      await ChatMessage.create({
        speaker: speaker,
        content: content
      });
      
    } else if (this.type === "enemyTrait") {
      // Enemy Trait: Show description
      let content = `<div class="mecha-roll trait-roll"><strong><i class="fas fa-star"></i> ${this.name}</strong>`;
      if (this.system.description) {
        content += `<div class="item-description">${this.system.description}</div>`;
      }
      content += `</div>`;
      
      await ChatMessage.create({
        speaker: speaker,
        content: content
      });
      
    } else if (this.type === "enemyAttack") {
      // Enemy Attack: Show details (link to chat, no roll)
      const statLabels = { power: "Power", mobility: "Mobility", system: "System", presence: "Presence" };
      const rangeLabels = { close: "Close", near: "Near", far: "Far", distant: "Distant" };
      
      const defendLabel = statLabels[this.system.defendStat] || "Power";
      const rangeLabel = rangeLabels[this.system.attackRange] || "Close";
      const targets = this.system.targets || 1;
      
      let content = `<div class="mecha-roll attack-roll"><strong><i class="fas fa-crosshairs"></i> ${this.name}</strong>`;
      content += `<div class="attack-details">`;
      if (this.system.damage) {
        content += `<span class="attack-info damage-info">Damage: <strong>${this.system.damage}</strong></span>`;
      }
      content += `<span class="attack-info defend-info">Defend: <strong class="defend-stat-${this.system.defendStat}">${defendLabel}</strong></span>`;
      content += `<span class="attack-info range-info range-${this.system.attackRange}">${rangeLabel}</span>`;
      content += `<span class="attack-info targets-info">${targets} Target${targets > 1 ? 's' : ''}</span>`;
      content += `</div>`;
      if (this.system.description) {
        content += `<div class="item-description">${this.system.description}</div>`;
      }
      content += `</div>`;
      
      await ChatMessage.create({
        speaker: speaker,
        content: content
      });
      
    } else if (this.type === "enemyRechargeAttack") {
      // Enemy Recharge Attack: Show description
      let content = `<div class="mecha-roll recharge-attack-roll"><strong><i class="fas fa-bolt"></i> ${this.name}</strong>`;
      if (this.system.description) {
        content += `<div class="item-description">${this.system.description}</div>`;
      }
      content += `</div>`;
      
      await ChatMessage.create({
        speaker: speaker,
        content: content
      });
      
    } else {
      // Fallback for unknown types
      await ChatMessage.create({
        speaker: speaker,
        content: `<div class="mecha-roll"><strong>${this.name}</strong><br>${this.system.description || ''}</div>`
      });
    }
  }
}

// Actor Sheet
class MechaHackActorSheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["mecha-hack", "sheet", "actor"],
      width: 720,
      height: 920,
      resizable: true,
      scrollY: [".sheet-body"],
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "main" }]
    });
  }

  get template() {
    return "systems/mecha-hack/templates/actor-sheet.hbs";
  }

  // Enable drag events for roll buttons
  _onDragStart(event) {
    const target = event.currentTarget;
    
    // Handle stat rolls
    if (target.classList.contains("stat-roll")) {
      const stat = target.dataset.stat;
      const statLabel = STATS[stat];
      event.dataTransfer.setData("text/plain", JSON.stringify({
        type: "Macro",
        actorId: this.actor.id,
        command: `game.actors.get("${this.actor.id}").rollStat("${stat}")`,
        name: `${this.actor.name}: ${statLabel} Roll`
      }));
      return;
    }
    
    // Handle die rolls
    if (target.classList.contains("die-roll")) {
      const die = target.dataset.die;
      const labels = { hit: "Hit Die", damage: "Damage Die", reactor: "Reactor Die" };
      event.dataTransfer.setData("text/plain", JSON.stringify({
        type: "Macro",
        actorId: this.actor.id,
        command: `game.actors.get("${this.actor.id}").rollDie("${die}")`,
        name: `${this.actor.name}: ${labels[die]}`
      }));
      return;
    }
    
    // Handle item rolls
    const li = target.closest(".item");
    if (li) {
      const itemId = li.dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (item) {
        event.dataTransfer.setData("text/plain", JSON.stringify({
          type: "Macro",
          actorId: this.actor.id,
          itemId: itemId,
          command: `game.actors.get("${this.actor.id}").items.get("${itemId}").roll()`,
          name: `${this.actor.name}: ${item.name}`
        }));
      }
    }
  }

  async getData(options) {
    const context = await super.getData(options);
    const actorData = this.document.toObject(false);
    
    context.system = actorData.system;
    context.flags = actorData.flags;
    context.diceTypes = DICE_TYPES;
    context.statLabels = STATS;
    context.isEditable = this.isEditable;
    
    // Organize items by type
    context.weapons = this.actor.items.filter(i => i.type === "weapon");
    context.armors = this.actor.items.filter(i => i.type === "armor");
    context.modules = this.actor.items.filter(i => i.type === "module");
    context.equipment = this.actor.items.filter(i => i.type === "equipment");
    context.consumables = this.actor.items.filter(i => i.type === "consumable");
    context.pilotAbilities = this.actor.items.filter(i => i.type === "pilotAbility");
    context.chassisAbilities = this.actor.items.filter(i => i.type === "chassisAbility");
    
    // Limit checks for abilities
    context.pilotAbilityFull = context.pilotAbilities.length >= 1;
    context.chassisAbilitiesFull = context.chassisAbilities.length >= 2;
    
    // Create chassis ability slots (always show 2 slots)
    context.chassisAbilitySlots = [];
    for (let i = 0; i < 2; i++) {
      if (context.chassisAbilities[i]) {
        context.chassisAbilitySlots.push(context.chassisAbilities[i]);
      } else {
        context.chassisAbilitySlots.push({ empty: true, slotNumber: i + 1 });
      }
    }
    
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;
    
    // Enable drag for roll buttons
    html.find(".stat-roll, .die-roll, .item-roll, .item-roll-consumable").each((i, el) => {
      el.setAttribute("draggable", true);
      el.addEventListener("dragstart", this._onDragStart.bind(this));
    });
    
    // Click on item name to open item sheet
    html.find(".item-list .item .name").click(ev => {
      ev.preventDefault();
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      if (item) item.sheet.render(true);
    });
    
    html.find(".stat-roll").click(async ev => {
      ev.preventDefault();
      const stat = ev.currentTarget.dataset.stat;
      const statLabel = STATS[stat];
      
      const dialogContent = `
        <p>How do you want to roll <strong>${statLabel}</strong>?</p>
        <div class="modifier-row" style="display: flex; align-items: center; justify-content: center; gap: 8px; margin: 12px 0;">
          <label style="font-weight: bold;">Modifier:</label>
          <button type="button" class="mod-decrease" style="width: 28px; height: 28px; cursor: pointer;">−</button>
          <input type="number" class="roll-modifier" value="0" style="width: 50px; text-align: center;" />
          <button type="button" class="mod-increase" style="width: 28px; height: 28px; cursor: pointer;">+</button>
        </div>
      `;
      
      const dialog = new Dialog({
        title: `${statLabel} Check`,
        content: dialogContent,
        buttons: {
          advantage: {
            icon: '<i class="fas fa-angle-double-up"></i>',
            label: "Advantage",
            callback: (html) => {
              const mod = parseInt(html.find(".roll-modifier").val()) || 0;
              this.actor.rollStat(stat, "advantage", mod);
            }
          },
          normal: {
            icon: '<i class="fas fa-dice-d20"></i>',
            label: "Normal",
            callback: (html) => {
              const mod = parseInt(html.find(".roll-modifier").val()) || 0;
              this.actor.rollStat(stat, "normal", mod);
            }
          },
          disadvantage: {
            icon: '<i class="fas fa-angle-double-down"></i>',
            label: "Disadvantage",
            callback: (html) => {
              const mod = parseInt(html.find(".roll-modifier").val()) || 0;
              this.actor.rollStat(stat, "disadvantage", mod);
            }
          }
        },
        default: "normal",
        render: (html) => {
          html.find(".mod-decrease").click(() => {
            const input = html.find(".roll-modifier");
            input.val(parseInt(input.val()) - 1);
          });
          html.find(".mod-increase").click(() => {
            const input = html.find(".roll-modifier");
            input.val(parseInt(input.val()) + 1);
          });
        }
      }).render(true);
    });
    
    html.find(".die-roll").click(ev => {
      ev.preventDefault();
      const dieKey = ev.currentTarget.dataset.die;
      
      // Hit die has a special dialog
      if (dieKey === "hit") {
        new Dialog({
          title: "Hit Die Roll",
          content: `<p>How do you want to use your <strong>Hit Die</strong>?</p>`,
          buttons: {
            normal: {
              icon: '<i class="fas fa-dice"></i>',
              label: "Normal Roll",
              callback: () => this.actor.rollDie("hit", "normal")
            },
            heal: {
              icon: '<i class="fas fa-heart"></i>',
              label: "Heal Roll",
              callback: () => this.actor.rollDie("hit", "heal")
            }
          },
          default: "normal"
        }).render(true);
      } else if (dieKey === "damage") {
        // Damage die dialog with attack type and double damage options
        const currentDie = this.actor.system.dice.damage;
        const dialogContent = `
          <p>How do you want to roll <strong>Damage</strong>?</p>
          <div style="margin: 12px 0; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 4px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" class="double-damage" style="width: 18px; height: 18px;" />
              <span style="font-weight: bold; color: var(--mecha-red, #e94560);">Double Damage</span>
            </label>
          </div>
        `;
        
        new Dialog({
          title: "Damage Roll",
          content: dialogContent,
          buttons: {
            normal: {
              icon: '<i class="fas fa-dice"></i>',
              label: "Normal",
              callback: (html) => {
                const doubleDamage = html.find(".double-damage").is(":checked");
                this.actor.rollDie("damage", "normal", doubleDamage);
              }
            },
            heavy: {
              icon: '<i class="fas fa-bomb"></i>',
              label: "Heavy Weapon",
              callback: (html) => {
                const doubleDamage = html.find(".double-damage").is(":checked");
                this.actor.rollDie("damage", "heavy", doubleDamage);
              }
            },
            unarmed: {
              icon: '<i class="fas fa-hand-rock"></i>',
              label: "Unarmed",
              callback: (html) => {
                const doubleDamage = html.find(".double-damage").is(":checked");
                this.actor.rollDie("damage", "unarmed", doubleDamage);
              }
            }
          },
          default: "normal"
        }).render(true);
      } else if (dieKey === "reactor") {
        // Reactor die confirmation dialog
        const currentDie = this.actor.system.dice.reactor;
        new Dialog({
          title: "Reactor Die Roll",
          content: `<p>Roll <strong>Reactor Die</strong> (${currentDie.toUpperCase()})?</p>
            <p style="font-size: 0.9em; color: #888;">⚠ Rolling 1 or 2 will degrade the reactor die.</p>`,
          buttons: {
            roll: {
              icon: '<i class="fas fa-bolt"></i>',
              label: "Roll Reactor",
              callback: () => this.actor.rollDie("reactor")
            },
            cancel: {
              icon: '<i class="fas fa-times"></i>',
              label: "Cancel"
            }
          },
          default: "roll"
        }).render(true);
      } else {
        this.actor.rollDie(dieKey);
      }
    });
    
    html.find(".item-roll").click(ev => {
      ev.preventDefault();
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      if (item) item.roll();
    });
    
    // Use consumable with confirmation
    html.find(".item-roll-consumable").click(async ev => {
      ev.preventDefault();
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      if (!item) return;
      
      const currentUses = item.system.uses || 0;
      
      if (currentUses <= 0) {
        ui.notifications.warn(`${item.name} has no uses remaining.`);
        return;
      }
      
      new Dialog({
        title: "Use Consumable",
        content: `<p>Use <strong>${item.name}</strong>?</p><p style="color: var(--mecha-yellow);">Uses remaining: ${currentUses}</p>`,
        buttons: {
          yes: {
            icon: '<i class="fas fa-check"></i>',
            label: "Use",
            callback: async () => {
              const newUses = currentUses - 1;
              await item.update({ "system.uses": newUses });
              
              // Post to chat
              const speaker = ChatMessage.getSpeaker({ actor: this.actor });
              let content = `<div class="mecha-roll consumable-use-roll"><strong><i class="fas fa-flask"></i> Used ${item.name}</strong>`;
              content += `<br><span style="color: var(--mecha-yellow);">${newUses} uses remaining</span>`;
              if (item.system.description) {
                content += `<div class="item-description">${item.system.description}</div>`;
              }
              content += `</div>`;
              
              await ChatMessage.create({
                speaker: speaker,
                content: content
              });
              
              if (newUses <= 0) {
                ui.notifications.info(`${item.name} is now empty.`);
              }
            }
          },
          no: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "no"
      }).render(true);
    });
    
    html.find(".item-edit").click(ev => {
      ev.preventDefault();
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      if (item) item.sheet.render(true);
    });
    
    html.find(".item-delete").click(async ev => {
      ev.preventDefault();
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      if (item) await item.delete();
    });
    
    // Delete with confirmation (for all items)
    html.find(".item-delete-confirm").click(async ev => {
      ev.preventDefault();
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      if (!item) return;
      
      new Dialog({
        title: "Delete Item",
        content: `<p>Are you sure you want to delete <strong>${item.name}</strong>?</p>`,
        buttons: {
          yes: {
            icon: '<i class="fas fa-trash"></i>',
            label: "Delete",
            callback: async () => await item.delete()
          },
          no: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "no"
      }).render(true);
    });
    
    // Restore HP button
    html.find(".restore-hp").click(async ev => {
      ev.preventDefault();
      const currentHP = this.actor.system.hitPoints.value;
      const maxHP = this.actor.system.hitPoints.max;
      
      if (currentHP >= maxHP) {
        ui.notifications.info("Hit Points already at maximum.");
        return;
      }
      
      new Dialog({
        title: "Restore Hit Points",
        content: `<p>Restore Hit Points to maximum (<strong>${maxHP}</strong>)?</p>`,
        buttons: {
          yes: {
            icon: '<i class="fas fa-check"></i>',
            label: "Restore",
            callback: async () => {
              await this.actor.update({ "system.hitPoints.value": maxHP });
              ui.notifications.info(`Hit Points restored to ${maxHP}.`);
            }
          },
          no: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "no"
      }).render(true);
    });
    
    // Restore AP button
    html.find(".restore-ap").click(async ev => {
      ev.preventDefault();
      const currentAP = this.actor.system.armorPoints.value;
      const maxAP = this.actor.system.armorPoints.max;
      
      if (currentAP >= maxAP) {
        ui.notifications.info("Armor Points already at maximum.");
        return;
      }
      
      new Dialog({
        title: "Restore Armor Points",
        content: `<p>Restore Armor Points to maximum (<strong>${maxAP}</strong>)?</p>`,
        buttons: {
          yes: {
            icon: '<i class="fas fa-check"></i>',
            label: "Restore",
            callback: async () => {
              await this.actor.update({ "system.armorPoints.value": maxAP });
              ui.notifications.info(`Armor Points restored to ${maxAP}.`);
            }
          },
          no: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "no"
      }).render(true);
    });
    
    html.find(".item-create").click(async ev => {
      ev.preventDefault();
      const type = ev.currentTarget.dataset.type;
      
      // Better default names for different item types
      const typeNames = {
        weapon: "New Weapon",
        armor: "New Armor",
        module: "New Module",
        equipment: "New Equipment",
        consumable: "New Consumable",
        pilotAbility: "New Pilot Ability",
        chassisAbility: "New Chassis Ability"
      };
      
      const itemData = {
        name: typeNames[type] || `New ${type}`,
        type: type
      };
      await Item.create(itemData, { parent: this.actor });
    });
  }
}

// Enemy Actor Sheet
class MechaHackEnemySheet extends ActorSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["mecha-hack", "sheet", "actor", "enemy-sheet"],
      width: 700,
      height: 1000,
      resizable: true,
      scrollY: [".sheet-body"]
    });
  }

  get template() {
    return "systems/mecha-hack/templates/enemy-sheet.hbs";
  }

  // Enable drag events for roll buttons
  _onDragStart(event) {
    const target = event.currentTarget;
    const li = target.closest(".item");
    
    if (li) {
      const itemId = li.dataset.itemId;
      const item = this.actor.items.get(itemId);
      if (item) {
        // Determine the roll type based on button class
        let command = `game.actors.get("${this.actor.id}").items.get("${itemId}").roll()`;
        let name = `${this.actor.name}: ${item.name}`;
        
        if (target.classList.contains("item-roll-attack") || 
            target.classList.contains("item-roll-recharge-attack") ||
            target.classList.contains("item-roll-boss-attack") ||
            target.classList.contains("item-roll-boss-recharge-attack")) {
          command = `game.actors.get("${this.actor.id}").items.get("${itemId}").rollAttack()`;
          name = `${this.actor.name}: ${item.name} (Attack)`;
        } else if (target.classList.contains("item-roll-recharge-die") ||
                   target.classList.contains("item-roll-boss-recharge-die")) {
          command = `game.actors.get("${this.actor.id}").items.get("${itemId}").rollRechargeDie()`;
          name = `${this.actor.name}: ${item.name} (Recharge)`;
        }
        
        event.dataTransfer.setData("text/plain", JSON.stringify({
          type: "Macro",
          actorId: this.actor.id,
          itemId: itemId,
          command: command,
          name: name
        }));
      }
    }
  }

  async getData(options) {
    const context = await super.getData(options);
    const actorData = this.document.toObject(false);
    
    context.system = actorData.system;
    context.flags = actorData.flags;
    context.isEditable = this.isEditable;
    
    // Get items by type
    context.traits = this.actor.items.filter(i => i.type === "enemyTrait");
    context.attacks = this.actor.items.filter(i => i.type === "enemyAttack");
    context.rechargeAttacks = this.actor.items.filter(i => i.type === "enemyRechargeAttack");
    context.bossAttacks = this.actor.items.filter(i => i.type === "bossAttack");
    context.bossRechargeAttacks = this.actor.items.filter(i => i.type === "bossRechargeAttack");
    
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (!this.isEditable) return;
    
    // Enable drag for roll buttons
    html.find(".item-roll, .item-roll-attack, .item-roll-recharge-attack, .item-roll-recharge-die, .item-roll-boss-attack, .item-roll-boss-recharge-attack, .item-roll-boss-recharge-die").each((i, el) => {
      el.setAttribute("draggable", true);
      el.addEventListener("dragstart", this._onDragStart.bind(this));
    });
    
    // Click on item name to open item sheet
    html.find(".item-list .item .name").click(ev => {
      ev.preventDefault();
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      if (item) item.sheet.render(true);
    });
    
    // Boss Mode toggle - post to chat when enabled
    html.find("input[name='system.boss']").change(async ev => {
      const isChecked = ev.currentTarget.checked;
      if (isChecked) {
        const speaker = ChatMessage.getSpeaker({ actor: this.actor });
        await ChatMessage.create({
          speaker: speaker,
          content: `<div class="mecha-roll boss-mode-roll"><strong><i class="fas fa-skull"></i> ${this.actor.name}</strong> has engaged <span class="boss-mode-text">BOSS MODE!</span></div>`
        });
      }
    });
    
    // Link to chat
    html.find(".item-roll").click(ev => {
      ev.preventDefault();
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      if (item) item.roll();
    });
    
    // Roll attack with damage
    html.find(".item-roll-attack").click(ev => {
      ev.preventDefault();
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      if (item) item.rollAttack();
    });
    
    // Roll recharge attack with damage
    html.find(".item-roll-recharge-attack").click(ev => {
      ev.preventDefault();
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      if (item) item.rollAttack();
    });
    
    // Roll recharge die with confirmation
    html.find(".item-roll-recharge-die").click(ev => {
      ev.preventDefault();
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      if (!item) return;
      
      new Dialog({
        title: "Recharge Die",
        content: `<p>Roll recharge die for <strong>${item.name}</strong>?</p><p style="font-size: 0.9em; color: #888;">Roll 5-6 to ready the attack.</p>`,
        buttons: {
          roll: {
            icon: '<i class="fas fa-sync-alt"></i>',
            label: "Roll Recharge",
            callback: () => item.rollRechargeDie()
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "roll"
      }).render(true);
    });
    
    // Toggle ready checkbox
    html.find(".recharge-ready").change(async ev => {
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      if (item) {
        await item.update({ "system.ready": ev.currentTarget.checked });
      }
    });
    
    // Boss attack roll - only works when boss mode is enabled
    html.find(".item-roll-boss-attack").click(ev => {
      ev.preventDefault();
      if (!this.actor.system.boss) {
        ui.notifications.warn("Boss Mode must be enabled to use boss attacks.");
        return;
      }
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      if (item) item.rollAttack();
    });
    
    // Boss recharge die roll - only works when boss mode is enabled
    html.find(".item-roll-boss-recharge-die").click(ev => {
      ev.preventDefault();
      if (!this.actor.system.boss) {
        ui.notifications.warn("Boss Mode must be enabled to use boss attacks.");
        return;
      }
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      if (!item) return;
      
      new Dialog({
        title: "Recharge Die",
        content: `<p>Roll recharge die for <strong>${item.name}</strong>?</p><p style="font-size: 0.9em; color: #888;">Roll 5-6 to ready the attack.</p>`,
        buttons: {
          roll: {
            icon: '<i class="fas fa-sync-alt"></i>',
            label: "Roll Recharge",
            callback: () => item.rollRechargeDie()
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "roll"
      }).render(true);
    });
    
    // Boss recharge attack roll - only works when boss mode is enabled
    html.find(".item-roll-boss-recharge-attack").click(ev => {
      ev.preventDefault();
      if (!this.actor.system.boss) {
        ui.notifications.warn("Boss Mode must be enabled to use boss attacks.");
        return;
      }
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      if (item) item.rollAttack();
    });
    
    // Toggle boss recharge ready checkbox - only works when boss mode is enabled
    html.find(".boss-recharge-ready").change(async ev => {
      if (!this.actor.system.boss) {
        ev.currentTarget.checked = !ev.currentTarget.checked;
        ui.notifications.warn("Boss Mode must be enabled to toggle ready state.");
        return;
      }
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      if (item) {
        await item.update({ "system.ready": ev.currentTarget.checked });
      }
    });
    
    html.find(".item-edit").click(ev => {
      ev.preventDefault();
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      if (item) item.sheet.render(true);
    });
    
    // Delete with confirmation
    html.find(".item-delete-confirm").click(async ev => {
      ev.preventDefault();
      const li = ev.currentTarget.closest(".item");
      const item = this.actor.items.get(li.dataset.itemId);
      if (!item) return;
      
      new Dialog({
        title: "Delete Item",
        content: `<p>Are you sure you want to delete <strong>${item.name}</strong>?</p>`,
        buttons: {
          yes: {
            icon: '<i class="fas fa-trash"></i>',
            label: "Delete",
            callback: async () => await item.delete()
          },
          no: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "no"
      }).render(true);
    });
    
    html.find(".item-create").click(async ev => {
      ev.preventDefault();
      const type = ev.currentTarget.dataset.type;
      
      const typeNames = {
        enemyTrait: "enemy-Trait",
        enemyAttack: "enemy-Attack",
        enemyRechargeAttack: "enemy-Recharge Attack",
        bossAttack: "boss-Attack",
        bossRechargeAttack: "boss-Recharge Attack"
      };
      
      const itemData = {
        name: typeNames[type] || `New ${type}`,
        type: type
      };
      await Item.create(itemData, { parent: this.actor });
    });
    
    // Restore HP button
    html.find(".restore-hp").click(async ev => {
      ev.preventDefault();
      const currentHP = this.actor.system.hitPoints.value;
      const maxHP = this.actor.system.hitPoints.max;
      
      if (currentHP >= maxHP) {
        ui.notifications.info("Hit Points already at maximum.");
        return;
      }
      
      new Dialog({
        title: "Restore Hit Points",
        content: `<p>Restore Hit Points to maximum (<strong>${maxHP}</strong>)?</p>`,
        buttons: {
          yes: {
            icon: '<i class="fas fa-check"></i>',
            label: "Restore",
            callback: async () => {
              await this.actor.update({ "system.hitPoints.value": maxHP });
              ui.notifications.info(`Hit Points restored to ${maxHP}.`);
            }
          },
          no: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "no"
      }).render(true);
    });
    
    // Restore AP button
    html.find(".restore-ap").click(async ev => {
      ev.preventDefault();
      const currentAP = this.actor.system.armorPoints.value;
      const maxAP = this.actor.system.armorPoints.max;
      
      if (currentAP >= maxAP) {
        ui.notifications.info("Armor Points already at maximum.");
        return;
      }
      
      new Dialog({
        title: "Restore Armor Points",
        content: `<p>Restore Armor Points to maximum (<strong>${maxAP}</strong>)?</p>`,
        buttons: {
          yes: {
            icon: '<i class="fas fa-check"></i>',
            label: "Restore",
            callback: async () => {
              await this.actor.update({ "system.armorPoints.value": maxAP });
              ui.notifications.info(`Armor Points restored to ${maxAP}.`);
            }
          },
          no: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel"
          }
        },
        default: "no"
      }).render(true);
    });
  }
}

// Item Sheet
class MechaHackItemSheet extends ItemSheet {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["mecha-hack", "sheet", "item"],
      width: 520,
      height: 450
    });
  }

  get template() {
    return "systems/mecha-hack/templates/item-sheet.hbs";
  }

  async getData(options) {
    const context = await super.getData(options);
    const itemData = this.document.toObject(false);
    
    context.system = itemData.system;
    context.flags = itemData.flags;
    context.diceTypes = DICE_TYPES;
    context.isEditable = this.isEditable;
    
    return context;
  }
  
  // Set size when rendering based on item type
  setPosition(options = {}) {
    const largeTypes = ["pilotAbility", "chassisAbility", "enemyTrait", "enemyAttack", "enemyRechargeAttack", "bossAttack", "bossRechargeAttack"];
    if (largeTypes.includes(this.item.type)) {
      options.width = options.width || 600;
      options.height = options.height || 500;
    }
    return super.setPosition(options);
  }
}

// Initialize System
Hooks.once("init", () => {
  console.log("Mecha Hack | Initializing System");

  CONFIG.Actor.documentClass = MechaHackActor;
  CONFIG.Item.documentClass = MechaHackItem;

  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("mecha-hack", MechaHackActorSheet, {
    types: ["mecha"],
    makeDefault: true,
    label: "MECHA.SheetActor"
  });
  Actors.registerSheet("mecha-hack", MechaHackEnemySheet, {
    types: ["enemy"],
    makeDefault: true,
    label: "MECHA.SheetEnemy"
  });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("mecha-hack", MechaHackItemSheet, {
    types: ["weapon", "armor", "module", "equipment", "consumable", "pilotAbility", "chassisAbility", "enemyTrait", "enemyAttack", "enemyRechargeAttack", "bossAttack", "bossRechargeAttack"],
    makeDefault: true,
    label: "MECHA.SheetItem"
  });

  Handlebars.registerHelper("eq", (a, b) => a === b);
  Handlebars.registerHelper("upper", (s) => s?.toUpperCase());
  Handlebars.registerHelper("lt", (a, b) => a < b);
});

Hooks.once("ready", () => {
  console.log("Mecha Hack | System Ready");
});

// Handle macro creation from drag-and-drop
Hooks.on("hotbarDrop", async (bar, data, slot) => {
  // Only handle our custom Macro type with command
  if (data.type !== "Macro" || !data.command) return true;
  
  // Modify command to show dialog instead of rolling directly
  let macroCommand = data.command;
  
  // For stat rolls, show the dialog by triggering the sheet's click handler
  if (data.command.includes(".rollStat(")) {
    const actorId = data.actorId;
    const statMatch = data.command.match(/\.rollStat\("(\w+)"\)/);
    if (statMatch) {
      const stat = statMatch[1];
      macroCommand = `
const actor = game.actors.get("${actorId}");
if (!actor) return ui.notifications.warn("Actor not found");
const sheet = actor.sheet;
if (sheet._state <= 0) sheet.render(true);
// Simulate clicking the stat roll button to show dialog
const STATS = { power: "Power", mobility: "Mobility", system: "System", presence: "Presence" };
const statLabel = STATS["${stat}"];
const dialogContent = \`
  <p>How do you want to roll <strong>\${statLabel}</strong>?</p>
  <div class="modifier-row" style="display: flex; align-items: center; justify-content: center; gap: 8px; margin: 12px 0;">
    <label style="font-weight: bold;">Modifier:</label>
    <button type="button" class="mod-decrease" style="width: 28px; height: 28px; cursor: pointer;">−</button>
    <input type="number" class="roll-modifier" value="0" style="width: 50px; text-align: center;" />
    <button type="button" class="mod-increase" style="width: 28px; height: 28px; cursor: pointer;">+</button>
  </div>
\`;
new Dialog({
  title: \`\${statLabel} Check\`,
  content: dialogContent,
  buttons: {
    advantage: {
      icon: '<i class="fas fa-angle-double-up"></i>',
      label: "Advantage",
      callback: (html) => {
        const mod = parseInt(html.find(".roll-modifier").val()) || 0;
        actor.rollStat("${stat}", "advantage", mod);
      }
    },
    normal: {
      icon: '<i class="fas fa-dice-d20"></i>',
      label: "Normal",
      callback: (html) => {
        const mod = parseInt(html.find(".roll-modifier").val()) || 0;
        actor.rollStat("${stat}", "normal", mod);
      }
    },
    disadvantage: {
      icon: '<i class="fas fa-angle-double-down"></i>',
      label: "Disadvantage",
      callback: (html) => {
        const mod = parseInt(html.find(".roll-modifier").val()) || 0;
        actor.rollStat("${stat}", "disadvantage", mod);
      }
    }
  },
  default: "normal",
  render: (html) => {
    html.find(".mod-decrease").click(() => {
      const input = html.find(".roll-modifier");
      input.val(parseInt(input.val()) - 1);
    });
    html.find(".mod-increase").click(() => {
      const input = html.find(".roll-modifier");
      input.val(parseInt(input.val()) + 1);
    });
  }
}).render(true);
`;
    }
  }
  
  // For hit die rolls, show dialog
  else if (data.command.includes('.rollDie("hit")')) {
    const actorId = data.actorId;
    macroCommand = `
const actor = game.actors.get("${actorId}");
if (!actor) return ui.notifications.warn("Actor not found");
new Dialog({
  title: "Hit Die Roll",
  content: \`<p>How do you want to use your <strong>Hit Die</strong>?</p>\`,
  buttons: {
    normal: {
      icon: '<i class="fas fa-dice"></i>',
      label: "Normal Roll",
      callback: () => actor.rollDie("hit", "normal")
    },
    heal: {
      icon: '<i class="fas fa-heart"></i>',
      label: "Heal Roll",
      callback: () => actor.rollDie("hit", "heal")
    }
  },
  default: "normal"
}).render(true);
`;
  }
  
  // For damage die rolls, show dialog
  else if (data.command.includes('.rollDie("damage")')) {
    const actorId = data.actorId;
    macroCommand = `
const actor = game.actors.get("${actorId}");
if (!actor) return ui.notifications.warn("Actor not found");
const dialogContent = \`
  <p>How do you want to roll <strong>Damage</strong>?</p>
  <div style="margin: 12px 0; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 4px;">
    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
      <input type="checkbox" class="double-damage" style="width: 18px; height: 18px;" />
      <span style="font-weight: bold; color: #e94560;">Double Damage</span>
    </label>
  </div>
\`;
new Dialog({
  title: "Damage Roll",
  content: dialogContent,
  buttons: {
    normal: {
      icon: '<i class="fas fa-dice"></i>',
      label: "Normal",
      callback: (html) => {
        const doubleDamage = html.find(".double-damage").is(":checked");
        actor.rollDie("damage", "normal", doubleDamage);
      }
    },
    heavy: {
      icon: '<i class="fas fa-bomb"></i>',
      label: "Heavy Weapon",
      callback: (html) => {
        const doubleDamage = html.find(".double-damage").is(":checked");
        actor.rollDie("damage", "heavy", doubleDamage);
      }
    },
    unarmed: {
      icon: '<i class="fas fa-hand-rock"></i>',
      label: "Unarmed",
      callback: (html) => {
        const doubleDamage = html.find(".double-damage").is(":checked");
        actor.rollDie("damage", "unarmed", doubleDamage);
      }
    }
  },
  default: "normal"
}).render(true);
`;
  }
  
  // For reactor die rolls, show confirmation
  else if (data.command.includes('.rollDie("reactor")')) {
    const actorId = data.actorId;
    macroCommand = `
const actor = game.actors.get("${actorId}");
if (!actor) return ui.notifications.warn("Actor not found");
const currentDie = actor.system.dice.reactor;
new Dialog({
  title: "Reactor Die Roll",
  content: \`<p>Roll <strong>Reactor Die</strong> (\${currentDie.toUpperCase()})?</p>
    <p style="font-size: 0.9em; color: #888;">⚠ Rolling 1 or 2 will degrade the reactor die.</p>\`,
  buttons: {
    roll: {
      icon: '<i class="fas fa-bolt"></i>',
      label: "Roll Reactor",
      callback: () => actor.rollDie("reactor")
    },
    cancel: {
      icon: '<i class="fas fa-times"></i>',
      label: "Cancel"
    }
  },
  default: "roll"
}).render(true);
`;
  }
  
  // For recharge die rolls, show confirmation
  else if (data.command.includes('.rollRechargeDie()')) {
    const actorId = data.actorId;
    const itemId = data.itemId;
    macroCommand = `
const actor = game.actors.get("${actorId}");
if (!actor) return ui.notifications.warn("Actor not found");
const item = actor.items.get("${itemId}");
if (!item) return ui.notifications.warn("Item not found");
new Dialog({
  title: "Recharge Die",
  content: \`<p>Roll recharge die for <strong>\${item.name}</strong>?</p><p style="font-size: 0.9em; color: #888;">Roll 5-6 to ready the attack.</p>\`,
  buttons: {
    roll: {
      icon: '<i class="fas fa-sync-alt"></i>',
      label: "Roll Recharge",
      callback: () => item.rollRechargeDie()
    },
    cancel: {
      icon: '<i class="fas fa-times"></i>',
      label: "Cancel"
    }
  },
  default: "roll"
}).render(true);
`;
  }
  
  // Create the macro
  const macro = await Macro.create({
    name: data.name || "Mecha Hack Macro",
    type: "script",
    img: "icons/svg/dice-target.svg",
    command: macroCommand,
    flags: { "mecha-hack.actorId": data.actorId, "mecha-hack.itemId": data.itemId }
  });
  
  // Assign to hotbar slot
  await game.user.assignHotbarMacro(macro, slot);
  
  return false; // Prevent default behavior
});

// Custom initiative for combat
// Override the default initiative rolling behavior

// Set enemy initiative to 0 when added to combat
Hooks.on("preCreateCombatant", async (combatant, data, options, userId) => {
  const actor = combatant.actor;
  if (actor?.type === "enemy") {
    combatant.updateSource({ initiative: 0 });
  }
});

// Override the Combat.rollInitiative method to use our custom system
Hooks.once("ready", () => {
  // Store original method
  const originalRollInitiative = CONFIG.Combat.documentClass.prototype.rollInitiative;
  
  // Override with custom method
  CONFIG.Combat.documentClass.prototype.rollInitiative = async function(ids, options = {}) {
    // Handle single ID or array
    ids = typeof ids === "string" ? [ids] : ids;
    
    for (const id of ids) {
      const combatant = this.combatants.get(id);
      if (!combatant) continue;
      
      const actor = combatant.actor;
      if (!actor) continue;
      
      // Enemy always gets initiative 0
      if (actor.type === "enemy") {
        await combatant.update({ initiative: 0 });
        continue;
      }
      
      // Mecha actors choose between Mobility or System
      if (actor.type === "mecha") {
        await showInitiativeDialog(combatant, actor);
        continue;
      }
      
      // Fallback to original for other types
      await originalRollInitiative.call(this, [id], options);
    }
    
    return this;
  };
});

// Show initiative dialog for mecha actors
async function showInitiativeDialog(combatant, actor) {
  return new Promise((resolve) => {
    new Dialog({
      title: "Initiative Roll",
      content: `
        <p>Choose a stat to test for <strong>${actor.name}</strong>'s initiative:</p>
        <p style="font-size: 0.9em; color: #aaa;">Success = Initiative 1 (act first)<br>Failure = Initiative -1 (act last)</p>
      `,
      buttons: {
        mobility: {
          icon: '<i class="fas fa-running"></i>',
          label: `Mobility (${actor.system.stats.mobility.value})`,
          callback: async () => {
            await rollInitiativeTest(combatant, actor, "mobility");
            resolve();
          }
        },
        system: {
          icon: '<i class="fas fa-cogs"></i>',
          label: `System (${actor.system.stats.system.value})`,
          callback: async () => {
            await rollInitiativeTest(combatant, actor, "system");
            resolve();
          }
        }
      },
      default: "mobility",
      close: () => resolve()
    }).render(true);
  });
}

// Function to roll initiative test
async function rollInitiativeTest(combatant, actor, statKey) {
  const stat = actor.system.stats[statKey];
  const statLabel = statKey === "mobility" ? "Mobility" : "System";
  
  const roll = await new Roll("1d20").evaluate();
  const result = roll.total;
  
  // Check for criticals
  const isCritSuccess = result === 1;
  const isCritFailure = result === 20;
  
  // Success if roll is LOWER than target (fail on equal or higher)
  let success = result < stat.value;
  if (isCritSuccess) success = true;
  if (isCritFailure) success = false;
  
  // Set initiative based on success/failure
  const initiative = success ? 1 : -1;
  await combatant.update({ initiative: initiative });
  
  // Build result text
  let resultText = success ? "SUCCESS" : "FAILURE";
  let critText = "";
  let critClass = "";
  
  if (isCritSuccess) {
    critText = " — CRITICAL!";
    critClass = " critical-success";
  } else if (isCritFailure) {
    critText = " — CRITICAL FAILURE!";
    critClass = " critical-failure";
  }
  
  // Post to chat
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: actor }),
    flavor: `
      <div class="mecha-roll initiative-roll ${success ? 'success' : 'failure'}${critClass}">
        <strong><i class="fas fa-flag-checkered"></i> Initiative Test</strong> (${statLabel})<br>
        Target: ${stat.value} | Roll: ${result}<br>
        <span class="result">${resultText}${critText}</span><br>
        <span class="initiative-result" style="font-size: 1.1em; margin-top: 4px; display: block;">
          Initiative: <strong style="color: ${success ? 'var(--mecha-green, #22c55e)' : 'var(--mecha-red, #e94560)'};">${initiative}</strong>
        </span>
      </div>`
  });
}

// Roll hit dice for enemy tokens when created
Hooks.on("createToken", async (token, options, userId) => {
  // Only run for the user who created the token
  if (game.user.id !== userId) return;
  
  const actor = token.actor;
  if (!actor || actor.type !== "enemy") return;
  
  const hitDice = actor.system.hitDice || "1d8";
  
  // Roll the hit dice
  let roll;
  try {
    roll = await new Roll(hitDice).evaluate();
  } catch (e) {
    console.error(`Mecha Hack | Invalid hit dice formula: ${hitDice}`);
    return;
  }
  
  const hpTotal = roll.total;
  
  // Update the token's actor with the rolled HP
  await token.actor.update({
    "system.hitPoints.value": hpTotal,
    "system.hitPoints.max": hpTotal
  });
  
  // Show notification only (no chat message)
  ui.notifications.info(`${actor.name} has ${hpTotal} Hit Points.`);
});
