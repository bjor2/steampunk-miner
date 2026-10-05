# Research uniqueness #74 — Horizontal proposals vs each other and vertical tracks

AFK research for [Research: Uniqueness of horizontal proposals vs each other and vertical tracks](https://github.com/bjor2/steampunk-miner/issues/74).
Map: [Wayfinder: Campaign horizontal & vertical scaling](https://github.com/bjor2/steampunk-miner/issues/71).
Arms: [Grilling: Which horizontal proposals survive impact and uniqueness](https://github.com/bjor2/steampunk-miner/issues/78).

## Cache citation

| Field | Value |
| --- | --- |
| Horizontal inventory | [`research-refresh-72.md`](./research-refresh-72.md) + [`stats.json`](./stats.json) + [`review.html`](./review.html) |
| Horizontal `updated` | `2026-10-05T13:38:16.870112+00:00` (UTC) → **15:38 Europe/Oslo** |
| Horizontal `source_hash` | `sha256:decb5cb93f82ed73f22cf64a151ae83b5cb6bf486c3802e69bcbe3dd1440c5c9` |
| `schedule_approved` | **C** |
| Vertical tracks | [`docs/scaling/vertical/stats.json`](https://github.com/bjor2/steampunk-miner/blob/research/vertical-audit-75/docs/scaling/vertical/stats.json) `tracks[]` (from [#75](https://github.com/bjor2/steampunk-miner/issues/75)) |
| Vertical tracks list | `drill_power`, `drill_tip`, `hull`, `cargo_hold`, `boiler`, `engine`, `casing_grade` |
| Vertical skim | [`research-audit-75.md`](https://github.com/bjor2/steampunk-miner/blob/research/vertical-audit-75/docs/scaling/vertical/research-audit-75.md) — drill+tip ~78% spend + hardness lockstep = **felt growth must come from horizontals**, so clones that only rename a vertical sink fail Experience First |

Vision scope only: **38** schedule-C vision rows (slice 1–2 assumed settled under #35 / #54). No Prefer/Approve UI (standing auto-approve for C scaffold).

## Method

1. Cluster vision rows by **player-facing decision** (new verb, new hazard, new facility, new enemy family, environment archetype, artefact set) — not by lane label alone.
2. Flag **clones** (same decision twice), **near-duplicates** (same verb with a skin), and **vertical disguises** (reads as +N on one of the seven tracks).
3. Recommend **keep / merge / cut** for grilling #78. This note does **not** pick the surviving N; it arms the grill with candidates.

Decision test (from `docs/design.md`):

> Vertical improves an existing capability. Horizontal introduces a new capability or decision.

## Explicit comparison vs seven vertical tracks

| Vertical track | Horizontal risk if disguised as… | Verdict on vision set |
| --- | --- | --- |
| `drill_power` | Extra dig DPS, faster carve with no new verb | `side_drills` **keep only if** attachment-point + sideways shaft geometry; cut/merge if it is just more forward power |
| `drill_tip` | Harder tip / better break on same dig | No vision row is a tip clone |
| `hull` | Passive more HP / armour | `shields` **keep only if** timed active energy sink; kill if it becomes passive armour stacked on hull |
| `cargo_hold` | Bigger bag with no new logistics verb | `wagons` keep (coupling + tunnel width); `drone_bay` keep (ferry while drilling); both **fail** if they only add capacity numbers |
| `boiler` | More energy pool / regen | No vision row is a boiler clone (`shields`/`auto_guns` *spend* energy — that is a cost, not a boiler track) |
| `engine` | Faster move with no new locomotion | Hollow-world flight is an archetype verb, not engine tier; do not fold into `engine` |
| `casing_grade` | Higher grade renamed per planet | Lining **types** (`refractory` / `insulated` / `grounded`) stay horizontal archetype beats (review §4.1); grade curve stays vertical. Do **not** ship three parallel +grade sinks |

## Clusters

### A. Wagon / hauler family (highest clone pressure)

| id | Planet | Player decision | Recommendation |
| --- | --- | --- | --- |
| `wagons` | 12 | Couple first wagon; turning circle + tunnel width matter | **Keep** — new logistics verb; vertical tail = wagon capacity/armour (not `cargo_hold` alone) |
| `special_wagons` | 16 | Second slot: repair **or** weapons car | **Merge into `wagons`** — same attachment family; express as wagon *types* / second slot unlock on the wagons beat, not a separate schedule row |
| `processing_wagon` | 29 | Refine while underground | **Cut or merge into `refinery_bay`** — mobile refine is a vertical/mobile tail of the P3 sell-vs-refine decision, not a new verb; also overlaps wagon family |
| `drone_bay` | 20 | Drones ferry cargo while player keeps drilling | **Keep** — automation verb distinct from wagon coupling; guard: must not read as second `cargo_hold` |

**Grill #78:** one wagon unlock + optional type/slot progression; one drone unlock; kill standalone `processing_wagon` / `special_wagons` rows.

### B. Combat automation (auto_guns vs deployables vs weapons wagon)

| id | Planet | Player decision | Recommendation |
| --- | --- | --- | --- |
| `auto_guns` | 4 | First self-aiming hull weapon | **Keep** — first combat verb (design.md example) |
| `deployables` | 31 | Drop turrets/mines at a junction | **Merge into `auto_guns` or cut** — placeable defence is a mode/vertical of automated guns, not a second combat family; if kept, must be a distinct “place before core push” verb with hard resource/slot limits |
| `special_wagons` (weapons) | 16 | Turret car | Covered by **merge into wagons** above — do not also keep as a third gun system |

### C. Defence: shields vs `hull`

| id | Planet | Player decision | Recommendation |
| --- | --- | --- | --- |
| `shields` | 22 | Timed active steam shield (energy cost) | **Keep with guardrail** — design.md lists shields as horizontal; kill/reshape if implementation is passive absorb stacked on `hull` |

### D. Dig verbs: side drills vs blasting vs `drill_*`

| id | Planet | Player decision | Recommendation |
| --- | --- | --- | --- |
| `side_drills` | 13 | Sideways cut / widen shafts / eat lining | **Keep with guardrail** — new attachment point + tunnel geometry; cut if it is only +`drill_power` |
| `blasting_charges` | 7 | Plant, back off, clear radius (can trigger collapse) | **Keep** — new mining method / risk trade |

### E. Facilities (info / process / meta)

| id | Planet | Player decision | Recommendation |
| --- | --- | --- | --- |
| `refinery_bay` | 3 | Sell now vs timed refine for alloy | **Keep** — first platform third-bay decision |
| `scanner_station` | 14 | Pre-dive band ore outline | **Keep** — discovery verb (not assay_beacon artefact; not research forks) |
| `research_lab` | 24 | Pick permanent branch per tier | **Keep** — meta forks ≠ scan ≠ quests |
| `quest_office` | 28 | Optional NPC contracts (leave the straight dive) | **Keep** — optional side-purpose; do not merge into research_lab |
| `core_forge` | 38 | Spend **core** on one legendary part per tier | **Keep** — different resource and stakes than refinery ore→alloy |
| `merchants` | 10 | Visiting trader, rotating unique parts | **Keep with guardrail** — must not become a second Sell screen (`two_bay_shops` stays slice-2) |

**Near-duplicate watch (not auto-kill):** `scanner_station` ↔ `research_lab` ↔ `quest_office` are three different decisions; only kill if grilling collapses “meta platform” to one surface.

**Clone watch:** `processing_wagon` ↔ `refinery_bay` (see cluster A). `core_forge` is **not** a late refinery rename if it spends core and yields legendary unique parts.

### F. Environment archetypes + lining types

| id | Planet | Player decision | Recommendation |
| --- | --- | --- | --- |
| `heat_lava` | 8 | Heat gauge + lava routing | **Keep** (archetype) |
| `frozen_planets` | 17 | Cold drain + regenerating ice | **Keep** |
| `magnetic_planets` | 25 | Storm bands scramble scan/drones | **Keep** |
| `hollow_planets` | 33 | Thin shell + low-g interior; flight/anchor | **Keep** |
| `refractory_lining` | 8 | Casing **type** for lava | **Keep as lining family** (paired with heat) |
| `insulated_lining` | 17 | Type vs refreeze | **Keep as lining family** (paired with ice) |
| `grounded_lining` | 25 | Type vs storms | **Keep as lining family** (paired with magnetic) |

Lining rows are **not** vertical `casing_grade` clones when they are type-choice beats on the existing grade curve (already locked in schedule C / review §4.1). Grill may **bundle** the three lining ids as one “lining types” capability drip rather than three full feature bills — still **keep the decisions**, optionally merge schedule accounting.

### G. Enemy families (behaviour uniqueness)

| id | Planet | Distinct behaviour | Recommendation |
| --- | --- | --- | --- |
| `tunnel_wrecker` | 6 | Gnaws lining behind vehicle | **Keep** |
| `magma_tick` | 9 | Follows heat, explodes on contact | **Keep** (archetype-tied) |
| `core_guardian` | 15 | Boss chamber at core | **Keep** |
| `frost_spitter` | 18 | First ranged enemy | **Keep** |
| `swarm_nests` | 21 | Nest clear-or-route event | **Keep** |
| `ore_thief` | 23 | Steals from wagons/drones | **Keep** (stress-tests automation; depends on wagon/drone keep) |
| `emp_mite` | 26 | Disables one attachment until repair | **Keep** |

No two vision enemies share the same player answer. Cut only if a behaviour collapses into “more HP crawler” at implementation — out of scope for this note.

### H. Artefact drip (sets I–V)

| id | Planets | Recommendation |
| --- | --- | --- |
| `artefact_set_1` … `artefact_set_5` | 5 / 11 / 19 / 27 / 35 | **Keep as schedule drip** — pool growth by two picks; not clones of each other. Individual pick verbs (ping, overclock, lance, …) stay unique within the exclusive 3-pick cache rule. Soft open (from #72): re-pick when pool exhausted → upgrade owned = vertical tail |

### I. Story / structure features

| id | Planet | Recommendation |
| --- | --- | --- |
| `relic_planet` | 30 | **Keep** — act story beat |
| `unstable_cores` | 36 | **Keep** — escape-run verb |
| `finale` | 40 | **Keep** — campaign red line |
| `endless_unlock` | 40 | **Keep** — post-campaign mode gate (#14) |

## Keep / merge / cut tally (input for #78)

Counts are of the **38 vision ids**. Bundle suggestions do not delete decisions; they shrink schedule rows.

### Keep (unique decision) — 35 ids

`refinery_bay`, `auto_guns`, `artefact_set_1`, `tunnel_wrecker`, `blasting_charges`, `heat_lava`, `refractory_lining`, `magma_tick`, `merchants`, `artefact_set_2`, `wagons`, `side_drills`, `scanner_station`, `core_guardian`, `frozen_planets`, `insulated_lining`, `frost_spitter`, `artefact_set_3`, `drone_bay`, `swarm_nests`, `shields`, `ore_thief`, `research_lab`, `magnetic_planets`, `grounded_lining`, `emp_mite`, `artefact_set_4`, `quest_office`, `relic_planet`, `hollow_planets`, `artefact_set_5`, `unstable_cores`, `core_forge`, `finale`, `endless_unlock`

(38 vision − 3 merge candidates. Keep still carries guardrails in the vertical-disguise watchlist.)

### Merge candidates — 3 ids

| id | Merge into | Rationale |
| --- | --- | --- |
| `special_wagons` | `wagons` | Same family; slot/type progression |
| `deployables` | `auto_guns` (or cut) | Placeable mode of automated defence |
| `processing_wagon` | `refinery_bay` (or cut) | Mobile refine = same sell-vs-refine decision |

Optional **accounting merge** (keep decisions): three lining ids → one “lining types” drip row for schedule cost — grill call.

### Cut candidates — 0 hard cuts beyond merges

No vision row is a pure rename of another with zero distinct decision after the merges above. **Conditional cuts** if guardrails fail:

| id | Cut if… |
| --- | --- |
| `shields` | Becomes passive `hull` absorb |
| `side_drills` | Becomes +`drill_power` only |
| `wagons` / `drone_bay` | Become +`cargo_hold` only |
| `merchants` | Becomes second Sell bay |
| `deployables` | If not merged and still a third gun system |
| `processing_wagon` / `special_wagons` | Prefer cut over keep-as-row once merged |

### Vertical-disguise watchlist (for implementers + #78)

1. `shields` ↔ `hull`
2. `wagons` / `drone_bay` ↔ `cargo_hold`
3. `side_drills` ↔ `drill_power`
4. Lining types ↔ `casing_grade` (type choice OK; parallel grade sinks not OK)
5. `deployables` / weapons-wagon ↔ `auto_guns` vertical

## What this does *not* decide

- Surviving **N** and final kill list → grilling [#78](https://github.com/bjor2/steampunk-miner/issues/78).
- Game-loop impact ranking → research [#73](https://github.com/bjor2/steampunk-miner/issues/73) (still open at write time; uniqueness stands alone from #72 inventory).
- Map [#71](https://github.com/bjor2/steampunk-miner/issues/71) **Decisions so far** — Producer-owned; untouched.
- Schedule C act scaffold — default unless #78 kills enough beats to force a re-pace.

## Acceptance check

- [x] Clustering by player-facing decision for all 38 vision candidates
- [x] Explicit comparison against the seven vertical tracks
- [x] Keep / merge / cut recommendations ready for #78
- [x] Note linked from issue resolution (no matrices pasted into GitHub)
