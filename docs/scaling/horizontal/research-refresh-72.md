# Research refresh #72 - Schedule C horizontal proposal set

AFK research for [Research: Refresh campaign horizontal proposal set from scaler schedule C](https://github.com/bjor2/steampunk-miner/issues/72).
Map: [Wayfinder: Campaign horizontal & vertical scaling](https://github.com/bjor2/steampunk-miner/issues/71).

## Cache citation

| Field | Value |
| --- | --- |
| Path | [`docs/scaling/horizontal/stats.json`](./stats.json) + [`review.html`](./review.html) |
| `updated` | `2026-10-05T13:38:16.870112+00:00` (UTC) |
| `source_hash` | `sha256:decb5cb93f82ed73f22cf64a151ae83b5cb6bf486c3802e69bcbe3dd1440c5c9` |
| `source_hash_method` | sha256 of base feature ids + schedule C rows |
| `schedule_approved` | **C** |
| Sources | `docs/design.md`, `issues/14`, `issues/35`, `issues/54`, `schedule_C_auto_approved` |

**Prefer / Approve UI:** not required. Bjor standing preference (map #71 Notes + cache `source_note`): schedule proposals **auto-approve** into cache unless Bjor intervenes.

## Schedule C summary

Option **C** = five **act arcs** + **artefact drip** through planet 40 (see `review.html` section 3). Cadence: never more than two planets without a new capability; archetype / vehicle change / boss every 3-4 planets; artefact sets + enemy behaviours fill gaps.

| Act | Planets | Beat |
| --- | --- | --- |
| Act I - Leaving the slice | 3-7 | Bridge: refinery bay, early guns, tunnel enemy, blasting |
| Act II - Fire | 8-16 | Heat archetype + lining, merchants, wagons, core guardian |
| Act III - Ice | 17-24 | Cold archetype, drones, swarm/ranged, research lab |
| Act IV - Storm and relic | 25-32 | Magnetic archetype, EMP, quests, relic planet |
| Act V - Hollow and core | 33-40 | Hollow worlds, escape, forge, finale + endless |

Campaign rules called out in `review.html` section 4 (do not reopen #35):

1. **Casing:** grade stays vertical; **lining types** are the horizontal beats per archetype.
2. **Artefacts:** one cache per planet; pool grows by **two picks** at planets 5, 11, 19, 27, 35.
3. **`auto_guns`** moved **15 -> 4**; planet 15 gets `core_guardian` instead.

## Feature counts

- **Feature rows:** 53 (matches review.html "53 feature rows").
- **Weighted cumulative at planet 40:** 58 (artefact sets count x2 via `count`).
- By status: **shipped** 6, **building** 1, **planned** 8, **vision** 38.
- Vision-weighted units: 43 across 38 vision rows.

### Shipped / building / planned (slice 1-2) - not campaign vision candidates

| id | name | planet | status | slice |
| --- | --- | --- | --- | --- |
| `sell_upgrade_loop` | Sell & upgrade loop | 1 | shipped | 1 |
| `mobile_platform` | Mobile platform dock | 1 | shipped | 1 |
| `crawler` | Crawler enemy | 1 | shipped | 1 |
| `burrower` | Burrower enemy | 1 | shipped | 1 |
| `core_harvest` | Core harvest & travel | 1 | shipped | 1 |
| `planet_2` | Second planet travel | 2 | shipped | 1 |
| `fluid_ground` | Density-field fluid ground | 1 | building | 2 |
| `casing_cement` | Auto casing & cement tiers | 1 | planned | 2 |
| `collapse_vacuum` | Collapse / vacuum hazard | 1 | planned | 2 |
| `two_bay_shops` | Separate Sell & Upgrade bays | 1 | planned | 2 |
| `artefacts` | Ground artefacts (3 unique picks) | 1 | planned | 2 |
| `music_layers` | Layered music & stingers | 1 | planned | 2 |
| `ore_whisper` | Ore whisper (artefact pick) | 1 | planned | 2 |
| `breathing_room` | Breathing room (artefact pick) | 1 | planned | 2 |
| `assay_beacon` | Assay beacon (artefact pick) | 1 | planned | 2 |

These are Feel & Fluid Ground / first-slice world ([#35](https://github.com/bjor2/steampunk-miner/issues/35) / [#54](https://github.com/bjor2/steampunk-miner/issues/54)) or already shipped - **assumed settled**; this map schedules campaign horizontals on top.

## Unlock milestones by planet (vision only)

### Act I - Leaving the slice (P3-P7)

| id | name | planet | lane | origin |
| --- | --- | --- | --- | --- |
| `refinery_bay` | Refinery bay | 3 | Facility | new |
| `auto_guns` | Automated guns (moved from planet 15) | 4 | Upgrade | vision |
| `artefact_set_1` | Artefact set I: Seismic ping, Second wind (x2) | 5 | Unique item | new |
| `tunnel_wrecker` | Tunnel wrecker (the new enemy family) | 6 | Enemy | vision |
| `blasting_charges` | Blasting charges | 7 | Feature | new |

### Act II - Fire (P8-P16)

| id | name | planet | lane | origin |
| --- | --- | --- | --- | --- |
| `heat_lava` | Heat / lava planets | 8 | Environment | vision |
| `refractory_lining` | Refractory lining | 8 | Upgrade | new |
| `magma_tick` | Magma tick | 9 | Enemy | new |
| `merchants` | Specialist merchants | 10 | Merchant | vision |
| `artefact_set_2` | Artefact set II: Ember valve, Overclock (x2) | 11 | Unique item | new |
| `wagons` | Cargo wagon | 12 | Upgrade | vision |
| `side_drills` | Side drill arms | 13 | Upgrade | new |
| `scanner_station` | Scanner station | 14 | Facility | new |
| `core_guardian` | Core guardian chamber | 15 | Enemy | new |
| `special_wagons` | Repair or weapons wagon | 16 | Upgrade | new |

### Act III - Ice (P17-P24)

| id | name | planet | lane | origin |
| --- | --- | --- | --- | --- |
| `frozen_planets` | Frozen planets | 17 | Environment | new |
| `insulated_lining` | Insulated lining | 17 | Upgrade | new |
| `frost_spitter` | Frost spitter | 18 | Enemy | new |
| `artefact_set_3` | Artefact set III: Thermal lance, Glide treads (x2) | 19 | Unique item | new |
| `drone_bay` | Drone bay (hauler drones) | 20 | Facility | new |
| `swarm_nests` | Swarm nests | 21 | Enemy | new |
| `shields` | Steam shield | 22 | Upgrade | new |
| `ore_thief` | Ore thief | 23 | Enemy | new |
| `research_lab` | Research lab | 24 | Facility | new |

### Act IV - Storm and relic (P25-P32)

| id | name | planet | lane | origin |
| --- | --- | --- | --- | --- |
| `magnetic_planets` | Magnetic / electrified planets | 25 | Environment | new |
| `grounded_lining` | Grounded lining | 25 | Upgrade | new |
| `emp_mite` | EMP mite | 26 | Enemy | new |
| `artefact_set_4` | Artefact set IV: Relay coil, Salvage magnet (x2) | 27 | Unique item | new |
| `quest_office` | Quest office (NPC contracts) | 28 | Feature | new |
| `processing_wagon` | Processing wagon | 29 | Upgrade | new |
| `relic_planet` | Relic story planet | 30 | Feature | new |
| `deployables` | Deployable turrets and mines | 31 | Upgrade | new |

### Act V - Hollow and core (P33-P40)

| id | name | planet | lane | origin |
| --- | --- | --- | --- | --- |
| `hollow_planets` | Hollow planets | 33 | Environment | new |
| `artefact_set_5` | Artefact set V: Grapple anchor, Core sense (x2) | 35 | Unique item | new |
| `unstable_cores` | Unstable cores (escape run) | 36 | Feature | new |
| `core_forge` | Core forge | 38 | Facility | new |
| `finale` | Finale story planet | 40 | Feature | new |
| `endless_unlock` | Endless mode unlock | 40 | Feature | new |

## Shipped/building vs vision

- **Shipped (slice 1):** sell/upgrade loop, mobile platform, crawler, burrower, core harvest, planet 2 travel.
- **Building / planned (slice 2):** `fluid_ground` building; casing, collapse, two-bay shops, artefacts (+3 picks), music - planned under [#54](https://github.com/bjor2/steampunk-miner/issues/54).
- **Vision (campaign):** 38 rows from `refinery_bay` (P3) through `finale` / `endless_unlock` (P40). Analysis tickets #73 / #74 grill **these** only.

## Conflicts with Feel & Fluid Ground (#35 / #54)

**No reopen of fluid-ground, casing placement rules, or shop bay layout.** Cross-check vs design.md Horizontal Scaling + #35 assumptions:

| Topic | Finding |
| --- | --- |
| Fluid ground / density field | Cache marks `fluid_ground` **building** on P1 - schedule C does not alter representation. |
| Casing & cement | Slice casing stays; schedule adds **lining types** as horizontal (heat/cold/magnetic) - extends, does not rewrite placement. |
| Two-bay shops | `two_bay_shops` planned slice 2; later `merchants` / facilities must stay *new decisions*, not a second Sell screen. |
| Artefacts | Slice 2 three picks remain; act drip adds sets I-V - same exclusive 3-pick cache rule. |
| Auto guns timing | design.md hints "around the third major planet"; C at **P4** matches better than the old P15 seed. |
| Heat / wagons / drones / shields | Named in design.md horizontal examples - C places them; no contradiction. |

**Soft flags (not #35 reopen):** open points already in `review.html` section 4 - re-lining cost; artefact re-pick when pool exhausted (suggested: upgrade owned = vertical tail). Leave for grilling / Producer.

## Pointer list for impact (#73)

Start from every vision row in the tables above. Prioritize loop-reshape candidates:

- `refinery_bay` - Refinery bay (P3, Facility)
- `auto_guns` - Automated guns (moved from planet 15) (P4, Upgrade)
- `tunnel_wrecker` - Tunnel wrecker (the new enemy family) (P6, Enemy)
- `blasting_charges` - Blasting charges (P7, Feature)
- `heat_lava` - Heat / lava planets (P8, Environment)
- `wagons` - Cargo wagon (P12, Upgrade)
- `side_drills` - Side drill arms (P13, Upgrade)
- `core_guardian` - Core guardian chamber (P15, Enemy)
- `drone_bay` - Drone bay (hauler drones) (P20, Facility)
- `quest_office` - Quest office (NPC contracts) (P28, Feature)
- `hollow_planets` - Hollow planets (P33, Environment)
- `unstable_cores` - Unstable cores (escape run) (P36, Feature)
- `finale` - Finale story planet (P40, Feature)
- `endless_unlock` - Endless mode unlock (P40, Feature)

Also score lining + artefact-set rows for interaction with casing / Discover beats (without reopening #35):

- `refractory_lining` - Refractory lining (P8)
- `insulated_lining` - Insulated lining (P17)
- `grounded_lining` - Grounded lining (P25)
- `artefact_set_1` - Artefact set I: Seismic ping, Second wind (P5)
- `artefact_set_2` - Artefact set II: Ember valve, Overclock (P11)
- `artefact_set_3` - Artefact set III: Thermal lance, Glide treads (P19)
- `artefact_set_4` - Artefact set IV: Relay coil, Salvage magnet (P27)
- `artefact_set_5` - Artefact set V: Grapple anchor, Core sense (P35)

Remaining vision ids for completeness: `magma_tick`, `merchants`, `scanner_station`, `special_wagons`, `frozen_planets`, `frost_spitter`, `swarm_nests`, `shields`, `ore_thief`, `research_lab`, `magnetic_planets`, `emp_mite`, `processing_wagon`, `relic_planet`, `deployables`, `core_forge`.

## Pointer list for uniqueness (#74)

Cluster vision rows by lane first (`Upgrade`, `Enemy`, `Facility`, `Environment`, `Unique item`, `Feature`, `Merchant`). Watch clusters:

| Candidate | Compare with | Why |
| --- | --- | --- |
| `special_wagons` | wagons | wagon family - merge risk |
| `processing_wagon` | wagons / drone_bay | hauling/processing overlap |
| `deployables` | auto_guns | automated combat clone risk |
| `shields` | hull vertical | may read as vertical armor |
| `scanner_station` | assay_beacon / research_lab | info-facility cluster |
| `research_lab` | scanner_station / quest_office | meta-progression facility cluster |
| `core_forge` | refinery_bay | late facility vs early bay |
| `merchants` | two_bay_shops | shop surface - ensure new decision not second sell screen |

Vertical tracks to compare against (per #74): `drill_power`, `drill_tip`, `hull`, `cargo_hold`, `boiler`, `engine`, `casing_grade` - see [`docs/scaling/vertical/stats.json`](../vertical/stats.json).

## Out of scope for this note

- Editing map #71 **Decisions so far** (Producer-owned).
- Resolving #73 / #74 or starting build tickets.
- Prefer/Approve UI or changing `schedule_approved`.

