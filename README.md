# The Mecha Hack - Foundry VTT System

An unofficial Foundry VTT v13 implementation of **The Mecha Hack**, a roll-under d20 mecha combat RPG.

![Foundry v13](https://img.shields.io/badge/Foundry-v13-green)
![Version](https://img.shields.io/badge/Version-1.0.0-blue)

## ⚠️ Disclaimer

This is an **unofficial, fan-made** implementation for Foundry VTT. This system requires ownership of **The Mecha Hack** rulebook to play.

**The Mecha Hack** is published by **[Absolute Tabletop](https://absolutetabletop.com/)**. Please support the official release by purchasing the game.

- [The Mecha Hack on DriveThruRPG](https://www.drivethrurpg.com/product/218665/The-Mecha-Hack)
- [Absolute Tabletop Website](https://absolutetabletop.com/)

---

## Features

### Mecha Actor Sheet
- **Stats**: Power, Mobility, System, Presence (roll-under d20)
- **Dice**: Hit Die, Damage Die, Reactor Die with degradation
- **Resources**: Hit Points, Armor Points with restore buttons
- **Abilities**: Pilot Ability (1 slot), Chassis Abilities (2 slots)
- **Items**: Weapons, Armor, Modules, Equipment, Consumables
- **Notes**: Full-page notes tab
- **Credits**: Track your mecha's funds

### Enemy Actor Sheet
- **Boss Mode**: Toggle for boss-level enemies
- **Hit Dice**: Auto-rolls HP when token is placed
- **Traits**: Enemy special abilities
- **Attacks**: With damage, defend stat, targets, and range
- **Recharge Attacks**: Require recharge roll (5-6 on d6)
- **Boss Attacks**: Only available when Boss Mode is enabled

### Combat System
- **Initiative**: Mecha test Mobility or System stat
  - Success → Initiative +1 (act first)
  - Failure → Initiative -1 (act last)
  - Enemies always act at Initiative 0

### Roll Mechanics
- **Roll-Under**: Roll d20 under your stat value (equal fails)
- **Critical Success**: Natural 1 (always succeeds)
- **Critical Failure**: Natural 20 (always fails)
- **Advantage**: Roll 2d20, keep lowest
- **Disadvantage**: Roll 2d20, keep highest
- **Modifiers**: Add +/- to your roll

### Reactor Die Degradation
- Roll 1-2 on Reactor Die → Die degrades one step
- d20 → d12 → d10 → d8 → d6 → d4
- At d4, rolling 1-2 causes "Reactor Overheated!"

---

## Installation

### Method 1: Manifest URL (Recommended)
1. Open Foundry VTT
2. Go to **Game Systems** tab
3. Click **Install System**
4. Paste this URL in "Manifest URL":
   ```
   https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/mecha-hack/main/system.json
   ```
5. Click **Install**

### Method 2: Manual Installation
1. Download the latest release
2. Extract to `Data/systems/mecha-hack/`
3. Restart Foundry VTT

---

## File Structure

```
mecha-hack/
├── system.json
├── template.json
├── mecha-hack.mjs
├── mecha-hack.css
├── lang/
│   └── en.json
└── templates/
    ├── actor-sheet.hbs
    ├── enemy-sheet.hbs
    └── item-sheet.hbs
```

---

## Item Types

| Type | Description |
|------|-------------|
| Weapon | Range, hands, qualities, cost |
| Armor | Armor points, cost |
| Module | Type (Utility/Offensive/Defensive) |
| Equipment | Description, cost |
| Consumable | Uses, cost |
| Pilot Ability | Player abilities |
| Chassis Ability | Mecha frame abilities |
| Trait | Enemy traits |
| Attack | Enemy attacks with damage/defend/range |
| Recharge Attack | Attacks requiring recharge |
| Boss Attack | Boss-only attacks |
| Boss Recharge Attack | Boss-only recharge attacks |

---

## License

This Foundry VTT system code is released under the MIT License.

**Note**: This license applies only to the code in this repository. The Mecha Hack game content, rules, and intellectual property are owned by Absolute Tabletop and are not covered by this license.

---

## Credits & Acknowledgments

### The Mecha Hack
- **Publisher**: [Absolute Tabletop](https://absolutetabletop.com/)
- **Game Design**: The Mecha Hack Team
- **Based on**: The Black Hack by David Black

### Foundry VTT System
- **System Developer**: Mecha Hack Developer

---

## Support the Publisher

If you enjoy this system, please support the creators by purchasing the official game:

🎮 **[Buy The Mecha Hack](https://www.drivethrurpg.com/product/218665/The-Mecha-Hack)**

🌐 **[Absolute Tabletop](https://absolutetabletop.com/)**
