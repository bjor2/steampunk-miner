# Grilling #78 — Which Schedule C horizontals survive

AFK grilling for [Grilling: Which horizontal proposals survive impact and uniqueness](https://github.com/bjor2/steampunk-miner/issues/78).
Map: [Wayfinder: Campaign horizontal & vertical scaling](https://github.com/bjor2/steampunk-miner/issues/71).
Inputs: [`research-impact-73.md`](./research-impact-73.md), [`research-uniqueness-74.md`](./research-uniqueness-74.md), cache [`stats.json`](./stats.json) `source_hash` `sha256:decb5cb93f82ed73f22cf64a151ae83b5cb6bf486c3802e69bcbe3dd1440c5c9` (Schedule **C**).

**Decider:** Progression & Content Designer (cool-feature pick). Schedule C scaffold stands — no Prefer/Approve UI; standing auto-approve. No preference fork.

## Verdict

**Survive: 35 vision schedule rows.** Drop 3 clone rows via merge/cut. Act arcs + artefact drip unchanged. Endless extras stay Not yet specified on the map.

## Merges / cuts (drop as standalone schedule rows)

| id | Action | Into / note |
| --- | --- | --- |
| `special_wagons` | **Merge** | `wagons` — express as wagon *types* / second slot on the P12 wagons beat |
| `processing_wagon` | **Cut** | Fold any mobile-refine as a late optional upgrade on `refinery_bay`, not a P29 row |
| `deployables` | **Cut** | Placeable defence becomes a late *mode* unlock under `auto_guns` (slot/resource-capped), not a second combat family |

## Surviving vision ids (35)

`refinery_bay`, `auto_guns`, `artefact_set_1`, `tunnel_wrecker`, `blasting_charges`, `heat_lava`, `refractory_lining`, `magma_tick`, `merchants`, `artefact_set_2`, `wagons`, `side_drills`, `scanner_station`, `core_guardian`, `frozen_planets`, `insulated_lining`, `frost_spitter`, `artefact_set_3`, `drone_bay`, `swarm_nests`, `shields`, `ore_thief`, `research_lab`, `magnetic_planets`, `grounded_lining`, `emp_mite`, `artefact_set_4`, `quest_office`, `relic_planet`, `hollow_planets`, `artefact_set_5`, `unstable_cores`, `core_forge`, `finale`, `endless_unlock`

## Keep with implementation guardrails (from #73/#74 — not schedule cuts)

| id | Guardrail |
| --- | --- |
| `shields` | Timed active steam spend only — cut at implement if it becomes passive `hull` |
| `side_drills` | Lateral attachment + shaft geometry — cut if only +`drill_power` |
| `wagons` / `drone_bay` | Coupling / ferry verbs — fail if only +`cargo_hold` |
| `drone_bay` | Dilution: drone cargo must settle at platform **Sell**; cap autonomy so Return/Sell cadence survives |
| `merchants` | Rotating unique parts only — never a second Sell screen (`two_bay_shops` stays slice) |
| `quest_office` | Optional contracts only; rewards feed Sell/Upgrade/Travel — never replace core harvest |
| Lining triad (`refractory` / `insulated` / `grounded`) | Keep as **three** planet-paired rows (archetype answer beats); type choice on existing `casing_grade`, not parallel grade sinks |

## Lining accounting

Do **not** collapse the three lining ids into one schedule row — each pairs with its env archetype at P8/P17/P25 and is a visible progression beat. Treat them as one *capability family* for costing conversations only.

## What Horizontal Scaler should remesh

1. Remove `special_wagons`, `processing_wagon`, `deployables` from vision rows (or mark `status` cut / fold notes into parent ids).
2. Align remaining rows to [#79](https://github.com/bjor2/steampunk-miner/issues/79) shape: `id`, `planetIndex`, `lane`, `progressionAxis`, `status`, `bind` (`planet_gate` \| `artefact` \| `facility` \| `manual`).
3. Suggested `bind` defaults: artefact sets → `artefact`; facilities/merchants/quest/forge/drone/scanner/refinery → `facility`; env/enemy/upgrade/feature planet gates → `planet_gate`; `endless_unlock` / finale may be `manual` or `planet_gate` at 40 — Scaler pick, document in cache note.
4. Refresh `review.html` / `source_hash` after remesh. Schedule C remains `schedule_approved`.

## Out of scope

- Editing map #71 **Decisions so far** (Producer-owned) — gist only below.
- Opening build tickets.
- Endless-only extras beyond `endless_unlock`.
- Vertical cache (#77 drill r already closed separately).

## Producer gist (Decisions so far)

`#78 — Survive 35 vision horizontals; merge special_wagons→wagons; cut processing_wagon + deployables (fold into refinery_bay / auto_guns modes); keep Schedule C arcs + lining triad + artefact drip; guardrails on shields/side_drills/wagons/drones/merchants/quests.`
