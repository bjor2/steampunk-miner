# Project Design & Team Structure
## Infinite 2D Steampunk Mining Game

## 1. High-Level Concept

The game is a large-scale 2D mining, progression, exploration, and multiplayer game inspired by the core loop of **Motherload**, but expanded into an effectively infinite planetary progression system.

The player controls a mining vehicle and travels between round planets. Each planet can be mined from the surface all the way to its center. The deeper the player travels, the harder the material becomes, the more valuable the resources become, and the more dangerous the environment becomes.

Each planet has a harvestable core. The core is composed of multiple special core tiles rather than a single pickup. Core material is a strategic progression resource and is used, together with money and other requirements, to reach increasingly distant planets.

A mobile platform travels with the player between planets. This platform acts as the player's persistent home base and may contain facilities such as:

- Shop
- Workshop
- Charging station
- Repair facilities
- Storage
- NPCs
- Quest systems
- Upgrade stations
- Specialized production facilities
- Research or technology systems
- Multiplayer/social functionality
- Other facilities unlocked later through horizontal progression

The game should support:

- Effectively infinite planet progression
- Effectively infinite resource tiers
- Effectively infinite vehicle upgrade levels
- Exponential economy scaling
- Multiplayer
- Procedural or semi-procedural planets
- Round planets that can be drilled through completely
- Vehicle customization and visual evolution
- Combat
- Enemies and environmental hazards
- Planet-specific mechanics
- Lightweight campaign progression
- Extensive automated testing
- Deterministic debug/test scenarios
- Full playthrough event logging and statistics comparison

---

# 2. Core Gameplay Loop

The fundamental gameplay loop should remain simple even as the game becomes extremely deep.

1. Land on a planet.
2. Drill downward and explore.
3. Collect resources.
4. Manage vehicle limitations such as storage, energy, health, heat, or other systems.
5. Return to the mobile platform.
6. Sell or process resources.
7. Upgrade the vehicle.
8. Unlock new mechanics and facilities.
9. Go deeper.
10. Reach and harvest the planetary core.
11. Use money, core material, and other requirements to unlock travel to more distant planets.
12. Travel to the next planet.
13. Repeat at a larger scale with new mechanics, hazards, enemies, environments, and progression systems.

The core loop should remain recognizable throughout the entire game.

---

# 3. Progression Terminology

The project should use two main progression concepts consistently:

## Vertical Scaling

Vertical scaling means increasing the power, difficulty, value, or magnitude of an existing system.

Examples:

- Higher drilling speed
- Greater drill damage
- Higher vehicle health
- Larger storage capacity
- More powerful engines
- Faster movement speed
- Higher armor
- Higher weapon damage
- More valuable resources
- Harder ground
- Stronger enemies
- More expensive upgrades
- More expensive planets
- Greater core energy requirements
- Greater travel distances
- Higher resource tiers

Vertical scaling answers:

> "How much stronger, harder, faster, more valuable, or more expensive does this existing thing become?"

Vertical scaling should be designed to continue for an extremely long time without requiring manually authored content for every level.

---

## Horizontal Scaling

Horizontal scaling means introducing new gameplay possibilities, mechanics, decisions, and content categories.

Examples:

- Unlocking guns
- Unlocking automatic turrets
- Adding wagons
- Adding additional drills
- Adding new vehicle attachment points
- Unlocking NPCs
- Unlocking quests
- Unlocking new facilities
- Unlocking research systems
- Unlocking drones
- Unlocking shields
- Unlocking scanners
- Unlocking automation
- Unlocking special planet types
- Unlocking new environmental mechanics
- Unlocking multiplayer cooperative systems
- Unlocking new mining methods

Horizontal scaling answers:

> "What can the player do now that they could not do before?"

Horizontal progression prevents the game from becoming only a numbers game.

---

# 4. Combining Vertical and Horizontal Scaling

The game should deliberately combine both types of progression.

Example:

- **Horizontal:** Lava planets introduce heat management.
- **Vertical:** Later lava planets have higher temperatures.

- **Horizontal:** Burrowing enemies are introduced.
- **Vertical:** Later burrowing enemies have more health, damage, speed, armor, and more dangerous behavior parameters.

- **Horizontal:** The player unlocks automated guns.
- **Vertical:** Gun damage, fire rate, range, projectile count, and ammunition efficiency can scale indefinitely.

- **Horizontal:** The vehicle unlocks wagons.
- **Vertical:** Wagons gain increasingly large storage capacity, armor, energy systems, or specialized functions.

The design rule should be:

> Vertical progression improves an existing capability.  
> Horizontal progression introduces a new capability or decision.

---

# 5. Infinite Vertical Scaling

The game should avoid manually defining thousands of levels.

Instead, most vertical systems should be generated using formulas.

Important variables may include:

- `planetIndex`
- `planetTier`
- `depth`
- `depthPercent`
- `resourceTier`
- `upgradeLevel`
- `enemyTier`
- `hazardTier`
- `coreTier`
- `travelDistance`
- `playerPower`
- `partySize`
- `difficultyModifiers`

Core functions may conceptually include:

```text
resourceValue(resourceTier)
resourceRarity(resourceTier, depth, planetTier)
blockHardness(planetTier, depth)
upgradeCost(system, level)
upgradeEffect(system, level)
planetUnlockPrice(planetIndex)
planetTravelCost(planetIndex)
coreEnergyYield(planetTier)
enemyHealth(enemyType, tier)
enemyDamage(enemyType, tier)
hazardIntensity(hazardType, tier)
```

These values should generally use exponential, polynomial, logarithmic, or piecewise formulas rather than large manually authored tables.

---

# 6. Resources

Resources become more valuable the deeper the player travels and the further the player progresses between planets.

The game should support effectively unlimited resource tiers.

It is not practical to hand-author an infinite number of minerals. Therefore resources should come from reusable families.

Example resource families:

- Metals
- Crystals
- Radioactive materials
- Organic materials
- Volcanic materials
- Fossil materials
- Exotic matter
- Mechanical relics
- Alien materials
- Energy crystals
- Ancient technology

Each family can generate higher-tier variants using:

- Prefixes
- Suffixes
- Material names
- Colors
- Glow effects
- Particle effects
- Tile details
- Rarity
- Value multipliers
- Hardness
- Processing requirements
- Special properties

A resource might conceptually be generated using:

```text
family + tier + planetModifier + depthModifier + rarityModifier
```

The player should continue encountering meaningful increases in resource value without requiring unique handcrafted art and names for every individual tier.

---

# 7. Planet System

Planets are round and fully mineable.

The player should be able to drill:

- Around the surface
- Downward
- Sideways
- Through the center
- Potentially all the way through to the opposite side

Each planet should have:

- Surface layer
- Geological layers
- Depth bands
- Resource distribution
- Hardness curve
- Caves or geological structures
- Environmental hazards
- Enemies
- Special events
- Core region
- Core resource
- Optional landmarks
- Optional narrative content

Planet difficulty should generally increase with distance/progression.

However, planets should not only become numerically harder.

New planet archetypes should introduce horizontal variation.

Examples:

- Volcanic planets
- Frozen planets
- Toxic planets
- Mechanical planets
- Ancient planets
- Crystal planets
- Hollow planets
- High-gravity planets
- Electrified planets
- Organic planets
- Unstable planets
- Infested planets
- Relic planets
- Story planets

Planet archetypes can alter:

- Gravity
- Ground behavior
- Heat
- Visibility
- Enemy behavior
- Resource composition
- Vehicle energy consumption
- Drilling mechanics
- Environmental destruction
- Core behavior
- Navigation

---

# 8. Planet Core System

Every planet has a core region.

The core should not simply be one collectible object.

Instead, it should consist of a region containing multiple high-value core tiles.

Core material may be used for:

- Powering long-distance travel
- Unlocking planets
- Ship/platform upgrades
- High-tier technologies
- Special vehicle upgrades
- Story progression
- Multiplayer objectives
- Special facilities

Reaching the core should feel like completing the major objective of a planet.

Core extraction may also trigger:

- Planet instability
- Boss encounters
- Escape sequences
- Environmental changes
- Story events
- Rare enemies
- Multiplayer events
- Temporary resource opportunities

Not every planet needs all of these features.

---

# 9. Vehicle Progression

The mining vehicle is one of the primary long-term progression systems.

Almost every important vehicle property should be upgradeable.

Possible vertically scalable properties:

- Drill speed
- Drill damage
- Drill hardness penetration
- Movement speed
- Acceleration
- Wheel traction
- Fuel capacity
- Energy capacity
- Energy efficiency
- Health
- Armor
- Storage
- Cooling
- Heat resistance
- Weapon damage
- Weapon fire rate
- Weapon range
- Repair efficiency
- Resource collection radius
- Scanner strength

Upgrade costs should grow substantially, generally exponentially or near-exponentially.

---

# 10. Vehicle Horizontal Progression

Major upgrades should visually and mechanically transform the vehicle.

Examples:

- Additional drill heads
- Side drills
- Rear drills
- Larger drill assembly
- Additional wheels
- Tracks
- Larger chassis
- Armor sections
- Steam engines
- Boilers
- Exhaust stacks
- Additional lights
- Turrets
- Automatic guns
- Cargo modules
- Wagons
- Repair wagons
- Weapons wagons
- Energy wagons
- Processing wagons
- Drone bays
- Shields
- Specialized mining tools

The vehicle should increasingly resemble a bizarre, powerful steampunk mining train or mobile industrial machine.

Major horizontal milestones should be visible on the vehicle whenever possible.

This provides a strong visual representation of progression.

---

# 11. Combat

Combat should be integrated into mining rather than completely separated from it.

Important rule:

> Enemies are always damaged when drilled into.

If the drill is facing the enemy:

- The enemy takes significant drilling damage.
- The player receives limited collision/contact damage.

If an enemy strikes the side, rear, or an unprotected part of the vehicle:

- The player receives more damage.

This encourages vehicle orientation and positioning.

Later horizontal progression may unlock:

- Automatic guns
- Turrets
- Forward cannons
- Defensive weapons
- Mines
- Drones
- Shields
- Area damage
- Specialized anti-enemy drilling systems

Automatic guns could appear around the third major planet or progression milestone, depending on pacing.

---

# 12. Enemy Scaling

Enemy progression should use both horizontal and vertical scaling.

## Horizontal Enemy Scaling

Introduce new enemy behaviors.

Examples:

- Basic contact enemy
- Flying enemy
- Burrowing enemy
- Armored enemy
- Ranged enemy
- Swarm enemy
- Exploding enemy
- Resource-stealing enemy
- Enemy that attacks the player's tunnel
- Enemy that disables equipment
- Enemy that follows heat or noise
- Boss enemy

## Vertical Enemy Scaling

Existing enemies increase in:

- Health
- Damage
- Armor
- Speed
- Detection distance
- Attack frequency
- Knockback
- Resistance
- Spawn density
- Coordination

Enemy skins and visual intensity should also change with difficulty where practical.

---

# 13. Environmental Challenge Scaling

Challenge should not rely only on enemies.

Horizontal environmental features may include:

- Heat
- Cold
- Pressure
- Toxic gas
- Radiation
- Lava
- Water
- Electrical storms
- Cave collapse
- Corrosive material
- Low visibility
- High gravity
- Low gravity
- Unstable ground
- Regenerating ground
- Explosive minerals
- Magnetic interference

Each hazard can then scale vertically.

Example:

```text
Heat is a horizontal mechanic.
Increasing temperature is vertical difficulty scaling.
```

---

# 14. Depth Events

Planets should contain events that can occur at specific depths or conditions.

Examples:

- Large cave discovery
- Ancient machine
- Enemy nest
- Abandoned mining site
- Rare resource formation
- NPC encounter
- Boss chamber
- Underground settlement
- Distress signal
- Geological collapse
- Hidden facility
- Story transmission
- Massive fossil
- Core warning event
- Planet instability event

These events create memorable moments during long drilling sessions.

---

# 15. Mobile Platform

The player's facilities exist on a platform or ship that travels between planets.

The platform acts as the persistent base of operations.

Initial facilities may include:

- Shop
- Workshop
- Charging station

Later horizontal progression can add:

- Repair bay
- Storage facility
- Refinery
- Research laboratory
- Weapons workshop
- Vehicle customization garage
- NPC housing
- Quest office
- Trading post
- Scanner station
- Drone workshop
- Automation control
- Multiplayer hub
- Museum/archive
- Core processing facility

The platform itself should visually evolve as facilities are added.

---

# 16. Campaign and Narrative

The game should contain a campaign, but the campaign should not constantly interrupt mining.

The player should always understand that there is a larger purpose or mystery behind the journey.

Narrative delivery can use:

- Communications
- NPC dialogue
- Environmental storytelling
- Planet-specific discoveries
- Rare structures
- Core discoveries
- Logs
- Story planets
- Special enemies
- Ruins
- Relics
- Changes to the mobile platform

Some planets can contain significantly more campaign content than others.

The campaign should act as a red line through the larger infinite sandbox.

After the authored campaign ends, infinite progression should remain possible.

---

# 17. Multiplayer

Multiplayer must be considered from the beginning.

Important questions include:

- Who owns mined tiles?
- How is planet destruction synchronized?
- Who receives resources?
- Are resources shared or individual?
- How is the economy synchronized?
- Who can harvest the core?
- What happens if players are at different depths?
- What happens when a player joins or leaves?
- How are enemies synchronized?
- How are planet events synchronized?
- Can multiple vehicles drill the same tile?
- How are wagons and attachments synchronized?
- Who owns the planet state?

Important world changes should generally be authoritative.

Multiplayer should not be added after the core architecture is already complete.

---

# 18. Data-Driven Architecture

Most game content should be defined through data rather than hardcoded logic.

Examples:

- Upgrade definitions
- Resource families
- Planet archetypes
- Enemy definitions
- Facilities
- Unlock requirements
- Quests
- Depth events
- Core types
- Vehicle modules
- Hazard definitions
- Visual variants
- Difficulty curves

This enables:

- Faster balancing
- Easier automated testing
- Procedural generation
- More content
- Modularity
- Easier multiplayer synchronization
- Better debugging

---

# 19. Testability

Testability should be treated as a first-class feature.

Developers and automated tests must never need to manually play hundreds of hours to test late-game content.

The game should include a debug/scenario interface.

Example commands:

```text
setPlanet(300)
setPlanetSeed(83921)
teleportToDepth(0.82)
teleportToCore()
giveMoney(1e100)
giveResource(resourceTier=500, amount=1000)
setUpgrade("drillSpeed", 1500)
setUpgrade("armor", 800)
unlock("automaticGuns")
unlock("wagons")
spawnEnemy("burrower", tier=500)
setVehicleLoadout("test_loadout_7")
setCoreFragments(5)
setFacilityLevel("workshop", 100)
```

The exact API can differ, but equivalent capabilities are required.

---

# 20. Playwright and AI Testing

Automated browser/game tests should be able to create arbitrary game states.

An AI-driven Playwright test should be able to specify:

- Planet
- Planet seed
- Planet tier
- Depth
- Position
- Resources
- Money
- Vehicle upgrades
- Vehicle appearance
- Vehicle modules
- Weapons
- Wagons
- Facilities
- NPC states
- Quests
- Enemies
- Core status
- Multiplayer players
- Difficulty

Example scenario:

```text
Planet: 317
Seed: 83921
Depth: 82%
Drill level: 1500
Armor level: 900
Wagons: 4
Automatic guns: unlocked
Core fragments: 5
Party size: 3
Enemy tier: 420
```

The test should launch directly into that state.

This is essential because the progression space will become too large to test manually.

---

# 21. Game Event Logging

The game should log important gameplay events into an ordered event list.

Each playthrough should have its own session or run identifier.

A simple event structure might contain:

```json
{
  "timestamp": 1023.52,
  "runId": "run_2026_10_04_001",
  "playerId": "player_1",
  "planet": 17,
  "planetSeed": 83921,
  "depth": 0.73,
  "event": "resource_collected",
  "data": {
    "resourceTier": 42,
    "amount": 6,
    "value": 1250000
  }
}
```

Logs should be append-only during normal gameplay.

---

# 22. Events Worth Logging

Important events include:

## Progression

- Game started
- Game ended
- Planet unlocked
- Planet entered
- Planet completed
- Core reached
- Core tile harvested
- Core completed
- Facility unlocked
- Facility upgraded
- Feature unlocked
- Quest started
- Quest completed

## Economy

- Resource collected
- Resource sold
- Resource processed
- Purchase made
- Upgrade purchased
- Repair purchased
- Money earned
- Money spent
- Core material earned
- Core material spent

## Mining

- Tile drilled
- Tile destroyed
- Drill damage dealt
- Depth milestone reached
- Cave discovered
- Rare resource discovered
- Mining session started
- Mining session ended

Logging every tile individually may become too large for normal analytics. If needed, raw tile events can be debug-only while production analytics use aggregated mining intervals.

## Vehicle

- Vehicle damaged
- Vehicle destroyed
- Vehicle repaired
- Energy depleted
- Storage full
- Module installed
- Module removed
- Wagon added
- Weapon added
- Vehicle configuration changed

## Combat

- Enemy spawned
- Enemy damaged
- Enemy killed
- Player damaged
- Player killed
- Weapon fired
- Enemy type encountered
- Boss started
- Boss defeated

## World

- Planet event triggered
- Hazard encountered
- Landmark discovered
- NPC encountered
- Story event triggered

## Multiplayer

- Player joined
- Player left
- Player revived
- Shared resource transfer
- Cooperative core harvest
- Multiplayer desync detected
- Host migration
- Network interruption

---

# 23. Local Log Storage

During development, logs should be stored locally in files.

Recommended formats:

### JSON Lines / NDJSON

Preferred for raw event logs.

Example:

```text
logs/
  run_2026-10-04_20-30-15/
    events.ndjson
    summary.json
    metadata.json
```

Each line in `events.ndjson` contains one JSON event.

Advantages:

- Easy to append
- Easy to stream
- Easy to parse
- Human-readable
- Works well with scripts
- Does not require rewriting the entire file
- Easy to inspect after crashes

---

# 24. Playthrough Metadata

Each playthrough should store metadata.

Example:

```json
{
  "runId": "run_2026_10_04_001",
  "gameVersion": "0.4.17",
  "buildCommit": "abc123",
  "worldSeed": 83921,
  "difficulty": "normal",
  "multiplayer": true,
  "players": 3,
  "startTime": "...",
  "endTime": "...",
  "durationSeconds": 14322
}
```

Recording the exact game version and build is especially important.

Otherwise statistics from different balance versions may become impossible to compare correctly.

---

# 25. Playthrough Summary

When a playthrough or session finishes, generate a summary file.

Example statistics:

- Total playtime
- Planets visited
- Planets completed
- Deepest planet
- Maximum depth reached
- Total tiles mined
- Total resources collected
- Total resource value collected
- Total money earned
- Total money spent
- Upgrade spending
- Repair spending
- Facility spending
- Core material collected
- Enemies killed
- Vehicle deaths
- Damage taken
- Damage dealt
- Average mining speed
- Average income per minute
- Average depth velocity
- Time between upgrades
- Time required to reach the core
- Time spent at the platform
- Time spent underground
- Most valuable resource found
- Most-used weapon
- Vehicle loadout
- Features unlocked
- Quests completed

---

# 26. Comparing Playthroughs

The logging system should make runs directly comparable.

Examples:

```text
Run A vs Run B

Time to Planet 5
Time to first weapon
Time to first wagon
Time to first death
Time to first core
Average income/minute
Average drilling speed
Average upgrade interval
Money spent on drill upgrades
Money spent on survival upgrades
Enemy deaths
Player deaths
Core completion time
```

This is useful for both balancing and automated AI testing.

---

# 27. Derived Analytics

Raw logs should remain separate from derived statistics.

For example:

```text
Raw:
resource_collected
resource_collected
resource_collected
upgrade_purchased

Derived:
income_per_minute
resources_per_minute
average_resource_tier
seconds_between_upgrades
```

This allows analysis formulas to change without losing the original data.

---

# 28. Balance Regression Testing

The logging system should support automated balance comparison.

Example:

A bot runs the same scenario against two game builds.

```text
Build A:
Planet 10 completion: 43 minutes
Deaths: 3
Income/min: 21,500
Drill upgrade level: 28

Build B:
Planet 10 completion: 71 minutes
Deaths: 11
Income/min: 13,800
Drill upgrade level: 19
```

This immediately indicates that a balance or gameplay change had a major effect.

Automated scenario runs can become part of continuous integration.

---

# 29. Team Structure

A suitable core team is approximately **18-24 people**, depending on experience and outsourcing.

The most important disciplines are:

- Creative direction
- Economy/progression design
- Multiplayer architecture
- Procedural world systems
- Gameplay engineering
- Art direction
- Testability and automation
- Content production

---

# 30. Team Positions

## Game Director / Creative Director

### Purpose

Own the overall vision of the game.

### Responsibilities

- Define the central gameplay experience
- Protect the core mining loop
- Decide which systems deserve development
- Control feature scope
- Coordinate design, art, narrative, and engineering direction
- Decide how far the game should differ from its inspiration

### Direction

The core experience should remain:

```text
Mine -> Discover -> Return -> Sell -> Upgrade -> Go Deeper -> Harvest Core -> Travel
```

New systems should strengthen this loop rather than obscure it.

---

## Producer / Project Manager

### Purpose

Keep the large number of interconnected systems manageable.

### Responsibilities

- Development planning
- Milestones
- Cross-team coordination
- Dependencies
- Scope control
- Risk tracking
- Release planning

### Direction

Horizontal systems should be implemented as modular features rather than one giant interconnected feature set.

---

## Technical Director / Lead Engineer

### Purpose

Own the technical architecture.

### Responsibilities

- Overall architecture
- Code standards
- Performance
- Save system
- Multiplayer architecture
- Procedural architecture
- Tooling architecture
- Large-number support
- Determinism

### Direction

Plan from the beginning for:

- Very large numbers
- Very high upgrade levels
- Large planet indices
- Procedural worlds
- Multiplayer
- Deterministic testing
- Data-driven content

---

## Lead Systems / Economy Designer

### Purpose

Own the mathematical progression of the game.

This is one of the most important positions on the project.

### Responsibilities

- Resource value curves
- Upgrade prices
- Upgrade effectiveness
- Planet prices
- Planet difficulty
- Drill hardness curves
- Enemy power curves
- Travel cost
- Core value
- Progression pacing
- Inflation
- Economic sinks
- Balance targets

### Direction

Avoid manually balancing thousands of individual progression tiers.

Build mathematical systems that generate progression.

The designer should define target experiences such as:

```text
Expected time between meaningful upgrades
Expected time to reach a core
Expected number of mining trips per planet
Expected money accumulation rate
Expected upgrade affordability
```

---

## Progression / Content Designer

### Purpose

Own horizontal progression.

### Responsibilities

- Feature unlock schedule
- Facility unlocks
- Vehicle modules
- Weapons
- Wagons
- NPC systems
- Quests
- Automation
- Research
- New mining mechanics
- New planet mechanics

### Direction

The player should regularly receive something fundamentally new.

Avoid long stretches where progression is only:

```text
+20% damage
+20% storage
+20% health
```

---

## Gameplay / Vehicle Designer

### Purpose

Own the mining vehicle and moment-to-moment gameplay.

### Responsibilities

- Vehicle movement
- Drilling
- Vehicle damage
- Controls
- Collision combat
- Storage
- Energy systems
- Heat systems
- Weapons
- Attachments
- Vehicle upgrades

### Direction

The vehicle should begin simple and eventually become a visually complex steampunk mining machine.

---

## Planet / World Designer

### Purpose

Own the structure of the planets.

### Responsibilities

- Geological layers
- Depth pacing
- Cave structures
- Resource placement
- Hazard placement
- Events
- Planet archetypes
- Core encounters

### Direction

Deeper should mean more than bigger numbers.

Depth should periodically introduce new visual, mechanical, and strategic changes.

---

## Narrative Designer / Writer

### Purpose

Create the campaign's red thread.

### Responsibilities

- Worldbuilding
- Dialogue
- NPCs
- Story planets
- Communications
- Quests
- Discoveries
- Environmental storytelling

### Direction

The narrative should support exploration rather than constantly interrupting it.

---

# 31. Engineering Positions

## Senior Gameplay Programmer x2

### Purpose

Implement the major player-facing systems.

### Responsibilities

- Vehicle systems
- Drilling
- Combat
- Items
- Inventory
- Shops
- Facilities
- Wagons
- Weapons
- Progression systems

### Direction

Use reusable components and modular systems.

---

## Procedural World / Simulation Engineer

### Purpose

Build scalable planet generation.

### Responsibilities

- Round planet generation
- Seeded generation
- Geological layers
- Resource generation
- Caves
- Events
- Cores
- Terrain destruction
- World persistence

### Direction

The same seed and game version should reproduce the same planet whenever practical.

This is extremely important for testing and debugging.

---

## Multiplayer / Network Engineer

### Purpose

Make shared mining worlds reliable.

### Responsibilities

- Networking architecture
- Player synchronization
- Enemy synchronization
- Tile destruction synchronization
- Item ownership
- Economy authority
- Planet state
- Core state
- Join/leave behavior
- Lag handling
- Desync diagnostics

### Direction

Important economy and world-state operations should be authoritative.

---

## Tools / Testability Engineer

### Purpose

Make every game state directly accessible to developers and automated tests.

### Responsibilities

- Debug commands
- Scenario creation
- Teleportation
- Resource injection
- Unlock commands
- Loadout creation
- Planet selection
- Enemy spawning
- Automated test hooks
- Playwright integration

### Direction

No developer should need to play 100 hours to test planet 300.

---

## UI / Client Engineer

### Purpose

Build the interfaces required by the growing progression system.

### Responsibilities

- HUD
- Inventory
- Shop
- Workshop
- Upgrade interfaces
- Vehicle configuration
- Facility interfaces
- Quest interface
- Multiplayer UI
- Large-number formatting

### Direction

The UI must remain readable even when the player owns huge numbers of resources and many upgrade systems.

---

## Analytics / Telemetry Engineer

This can initially be combined with the Tools/Testability Engineer.

### Purpose

Own logging and run comparison infrastructure.

### Responsibilities

- Event schema
- Run identifiers
- Local log files
- Summary generation
- Statistics aggregation
- Run comparison tools
- Balance reports
- Regression detection
- Performance logging

### Direction

Logging should be structured from the beginning rather than added after balancing becomes difficult.

---

# 32. Art Positions

## Art Director

### Purpose

Own the visual identity.

### Direction

The game should have a strong 2D steampunk identity:

- Brass
- Copper
- Iron
- Pistons
- Boilers
- Pipes
- Steam
- Gauges
- Mechanical joints
- Industrial lights
- Large drills
- Heavy machinery

The art system must also support procedural variation.

---

## Environment / Tile Artists x2

### Purpose

Create terrain and world content.

### Responsibilities

- Ground tiles
- Geological layers
- Caves
- Planet surfaces
- Facilities
- Backgrounds
- Props
- Planet archetypes

### Direction

Create reusable visual families rather than unique assets for every depth.

---

## Vehicle / Character Artist

### Purpose

Create vehicles, enemies, NPCs, and major mechanical objects.

### Direction

Vehicle art should be modular.

Possible attachment points:

- Drill
- Wheels
- Armor
- Engine
- Boiler
- Weapon mount
- Cargo
- Wagon
- Utility module

---

## 2D Animator

### Purpose

Make the mechanical world feel alive.

### Responsibilities

- Drill animation
- Wheels
- Suspension
- Pistons
- Steam systems
- Enemies
- Weapons
- Vehicle transformations
- Environmental animations

---

## VFX / Technical Artist

### Purpose

Give the game visual impact without requiring unique hand-drawn assets for every progression tier.

### Responsibilities

- Sparks
- Dust
- Smoke
- Steam
- Lighting
- Ore glow
- Lava
- Energy
- Explosions
- Core effects
- Weapon effects
- Procedural visual variation

---

## UI / UX Designer

### Purpose

Make a complex progression system understandable.

### Responsibilities

- Information hierarchy
- Upgrade comparison
- Vehicle configuration
- Shop UX
- Facility navigation
- Resource visualization
- Large-number presentation
- Multiplayer interfaces

---

# 33. Audio

## Sound Designer / Composer

This role may initially be outsourced.

### Responsibilities

- Mining impacts
- Drill sounds
- Engines
- Steam
- Vehicle damage
- Weapons
- Explosions
- Resource pickups
- Planet atmosphere
- Music

### Direction

Mechanical sounds should make upgrading the vehicle feel physically satisfying.

---

# 34. QA

## QA / Automation Lead

### Purpose

Own the project's verification strategy.

### Responsibilities

- Automated scenario coverage
- Regression tests
- Multiplayer tests
- Economy tests
- Save/load tests
- Procedural generation tests
- Logging validation
- Balance comparison

### Direction

Work very closely with the Tools/Testability Engineer.

---

## QA Testers

### Purpose

Find problems that automation does not.

### Focus

- Procedural edge cases
- Multiplayer edge cases
- Strange upgrade combinations
- Sequence breaking
- Economy exploits
- Vehicle configurations
- Very long progression runs
- User experience problems

---

# 35. Optional Later Roles

As the project grows, useful specialist roles may include:

- Dedicated balance/data analyst
- Backend engineer
- DevOps/build engineer
- Additional gameplay programmers
- Additional environment artists
- Additional animators
- Additional QA testers
- Localization
- Community manager
- Marketing artist
- Trailer editor
- Additional narrative designers

---

# 36. Recommended Initial Core Team

A strong initial production team could be:

### Direction and Design — 6

- 1 Game Director
- 1 Producer
- 1 Systems/Economy Designer
- 1 Progression/Content Designer
- 1 Gameplay/Vehicle Designer
- 1 Planet/Narrative Designer

### Engineering — 6

- 1 Technical Director
- 2 Gameplay Programmers
- 1 Procedural World Engineer
- 1 Multiplayer Engineer
- 1 Tools/Test/Analytics Engineer

### Art — 6

- 1 Art Director
- 2 Environment/Tile Artists
- 1 Vehicle/Character Artist
- 1 Animator
- 1 VFX/Technical Artist

### UX — 1

- 1 UI/UX Designer

### QA — 2

- 1 QA/Automation Lead
- 1 QA Tester

### Audio

- Outsourced or part-time initially

Total core team:

**Approximately 21 people**

The exact count can change depending on how many roles are combined.

---

# 37. Critical Project Principles

## 1. Infinite does not mean infinite handcrafted content

Infinite progression must come primarily from:

- Mathematical systems
- Procedural generation
- Data-driven content
- Reusable visual families
- Modular mechanics

---

## 2. Preserve the simple core loop

The game can become extremely large while still having a very understandable primary loop.

---

## 3. Separate vertical and horizontal progression

Every progression feature should be identifiable as:

- Vertical
- Horizontal
- Or a deliberate combination of both

---

## 4. Testability is a product feature

Debug APIs, scenario systems, deterministic seeds, and automated testing must be designed early.

---

## 5. Logging starts at the beginning

Structured event logs will allow:

- Playthrough comparison
- Economy balancing
- Bug reproduction
- AI-agent evaluation
- Regression testing
- Multiplayer debugging
- Long-term progression analysis

---

## 6. Design for multiplayer early

Networking affects almost every important system:

- Terrain
- Resources
- Economy
- Enemies
- Core extraction
- Planet state
- Vehicle state

It should not be retrofitted late.

---

## 7. Major progression should be visible

Whenever the player unlocks a major vehicle feature, facility, or capability, the world or vehicle should visually reflect it.

---

# 38. Project Identity

The intended long-term fantasy is:

> Start with a small, vulnerable mining machine on an unknown world.

> Dig deeper, become richer, build stranger machinery, expand your traveling industrial platform, survive increasingly dangerous planets, harvest planetary cores, cross greater distances, discover new mechanics and civilizations, and gradually transform your humble miner into an enormous steampunk planetary-harvesting machine.

The numerical progression may continue effectively forever.

The mechanical possibilities should expand for a long time.

The campaign provides direction.

The planets provide discovery.

The economy provides momentum.

The vehicle provides identity.

The mobile platform provides continuity.

And the act of drilling should remain satisfying from the first planet to the thousandth.
