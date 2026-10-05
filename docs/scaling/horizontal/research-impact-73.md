# Research impact #73 - Game-impact of Schedule C horizontals on the core loop

AFK research for [Research: Game-impact of horizontal proposals on the core loop](https://github.com/bjor2/steampunk-miner/issues/73).
Map: [Wayfinder: Campaign horizontal & vertical scaling](https://github.com/bjor2/steampunk-miner/issues/71).
Prereq: [#72 refresh](./research-refresh-72.md) (closed).

## Cache citation

| Field | Value |
| --- | --- |
| Inventory | [`research-refresh-72.md`](./research-refresh-72.md) |
| Cache | [`stats.json`](./stats.json) + [`review.html`](./review.html) |
| `updated` | `2026-10-05T13:38:16.870112+00:00` (UTC) → **15:38 Europe/Oslo** |
| `source_hash` | `sha256:decb5cb93f82ed73f22cf64a151ae83b5cb6bf486c3802e69bcbe3dd1440c5c9` |
| `schedule_approved` | **C** |
| Vision rows scored | **38** (all `status: vision` in cache) |

Scoring rubric (per loop stage): **none** / **light** / **reshapes**. Overall verdict: **helps** / **hurts** / **neutral** relative to preserving `Mine → Discover → Return → Sell → Upgrade → Go Deeper → Harvest Core → Travel` (design.md §2 / §Game Director). Dilution = risk the unlock obscures or skips a beat rather than strengthening it. Feel & Fluid Ground (#35 / #54) deps noted without reopening those tickets.

Loop stage abbreviations: **M**ine · **D**iscover · **R**eturn · **S**ell · **U**pgrade · **G**o deeper · **H**arvest core · **T**ravel.

---

## Producer shortlist (grilling first)

### High-impact (reshape ≥1 core beat; schedule keepers if uniqueness holds)

| id | Why |
| --- | --- |
| `refinery_bay` | Reshapes **Sell**: timed refine vs sell-now; first platform bay beyond slice shops. |
| `auto_guns` | Reshapes **Mine** combat orientation; early P4 keeps flanks meaningful for rest of campaign. |
| `tunnel_wrecker` | Reshapes **Go Deeper** / casing value: tunnels can fail behind you. |
| `blasting_charges` | Reshapes **Mine** method (plant-and-clear); couples to collapse. |
| `heat_lava` + `refractory_lining` | Act opener: **Mine/Go Deeper** routing + casing type choice (archetype + lining pair). |
| `wagons` | Reshapes **Mine/Return**: vehicle length, turning, capacity as a new decision. |
| `side_drills` | Reshapes **Mine**: lateral carve + lining spend. |
| `core_guardian` | Reshapes **Harvest Core**: boss chamber before core. |
| `drone_bay` | Reshapes **Return** (async haul) — **dilution watch**: must not erase the dock visit. |
| `frozen_planets` + `insulated_lining` | Cold/refreeze changes **Mine/Go Deeper**; lining is the answer beat. |
| `magnetic_planets` + `grounded_lining` | Storm/HUD/drone interference; lining = safe corridor decision. |
| `hollow_planets` | Hard reshape of **Mine**: flight/anchor vs dig. |
| `unstable_cores` | Reshapes **Harvest Core → Return**: timed escape after harvest. |
| `quest_office` | Optional off-loop contracts — **dilution watch**: keep optional, rewards feed Sell/Upgrade. |
| `finale` / `endless_unlock` | Cap **Travel** / post-campaign loop; finale is narrative, endless recombines formulas. |

### Weak loop-fit / clone-risk (grill with #74 uniqueness)

| id | Flag |
| --- | --- |
| `shields` | Reads close to vertical **hull**; keep as timed active energy spend or kill. |
| `special_wagons` | Wagon-family merge risk with `wagons`; OK only if slot choice is a real fork. |
| `processing_wagon` | Overlaps `refinery_bay` + `wagons` / `drone_bay`; may inflate numbers underground. |
| `deployables` | Automated combat clone of `auto_guns`; differentiate placement/junction defence. |
| `scanner_station` | Light **Discover**; overlaps slice `assay_beacon` / later `research_lab`. |
| `research_lab` | Meta forks — can become vertical-disguised; must be permanent branch picks. |
| `merchants` | Must stay *new parts decision*, not a second Sell screen (two-bay shops stay slice). |
| `core_forge` | Late facility twin of early refinery pattern; legendary-part spend is the distinct beat. |
| Enemy fillers (`magma_tick`, `frost_spitter`, `swarm_nests`, `ore_thief`, `emp_mite`) | Help **Mine/Go Deeper** pressure; loop-fit OK if behaviours stay distinct (uniqueness #74). |
| Artefact sets I–V | Help **Discover** drip; low dilution if exclusive 3-pick rule holds (#35 assumed). |

---

## Feel & Fluid Ground (#35) dependency map

Do **not** reopen fluid-ground, casing placement, or shop bay layout. Campaign vision rides on settled slice assumptions:

| #35 / #54 assumption | Vision features that depend on it | Impact note |
| --- | --- | --- |
| `fluid_ground` (building) | All Environment archetypes (`heat_lava`, `frozen_planets`, `magnetic_planets`, `hollow_planets`); blasting / tunnel enemies | Env beats need density-field ground; schedule does not change representation. |
| `casing_cement` (planned) | `refractory_lining`, `insulated_lining`, `grounded_lining`; `tunnel_wrecker`; `side_drills` (lining spend) | Grade = vertical; lining types = horizontal beats. Soft open: re-lining cost (`review.html` §4.1). |
| `collapse_vacuum` (planned) | `blasting_charges`, `tunnel_wrecker`, `unstable_cores` | Collapse rule makes blast/escape/wrecker meaningful. |
| `two_bay_shops` (planned) | `merchants`, `refinery_bay`, `scanner_station`, `drone_bay`, `research_lab`, `quest_office`, `core_forge` | New facilities/merchants must be new decisions, not a second Sell UI. |
| `artefacts` + 3 slice picks (planned) | `artefact_set_1`…`_5` | Same exclusive 3-pick cache; pool grows by two per drip planet. Soft open: re-pick when exhausted → suggested vertical upgrade of owned (`review.html` §4.2). |

---

## Grouped impact by act

Per-feature loop scores below. Stages omitted as **none** unless noted. "Overall" = helps / hurts / neutral for loop integrity.

### Act I — Leaving the slice (P3–P7)

| id | Overall | Dilution | #35 dep | Loop notes |
| --- | --- | --- | --- | --- |
| `refinery_bay` | **helps** | low | two-bay | **S reshapes** (refine batch vs sell now); light **U** (alloy sinks). Strengthens platform as Return destination. |
| `auto_guns` | **helps** | low | — | **M reshapes** (flank defence while drilling); light **U** (gun tiers). P4 timing matches design §11 "third major planet" better than old P15. |
| `artefact_set_1` | **helps** | low | artefacts | **D light→reshape** (Seismic ping outlines caves; Second wind one free tow). Tow lightly softens **R** failure — keep rare. |
| `tunnel_wrecker` | **helps** | low | casing, collapse | **G/M reshape** (gnaws lining; cased tunnels not forever-safe). Makes casing horizontal matter early. |
| `blasting_charges` | **helps** | med | collapse, fluid | **M reshapes** (plant/clear radius); can skip careful carve — price + collapse trigger keep risk. Light **U** (charges carried). |

**Act I standout:** `refinery_bay` + `auto_guns` + `tunnel_wrecker` jointly teach Sell choice, combat-while-mine, and tunnel permanence — strong bridge off the slice without inventing a parallel loop.

### Act II — Fire (P8–P16)

| id | Overall | Dilution | #35 dep | Loop notes |
| --- | --- | --- | --- | --- |
| `heat_lava` | **helps** | low | fluid | **M/G reshape** (heat gauge, lava pockets → cooling/routing). Archetype opener; vertical tail = hotter planets. |
| `refractory_lining` | **helps** | low | casing | **U/G reshape** (second casing type for lava bands). Paired with heat — not a bare vertical hull bump. |
| `magma_tick` | **helps** | low | fluid | **M light** (heat-seeking explode). Punishes "run hot" — reinforces heat beat. |
| `merchants` | **helps** / watch | med | two-bay | **U light–reshape** if stock is unique parts; **hurts** if it becomes alternate Sell. Keep rotating unique parts only. |
| `artefact_set_2` | **helps** | low | artefacts | **M light** (Ember valve heat vent; Overclock drill burst). Feeds Mine under heat pressure. |
| `wagons` | **helps** | med | — | **M/R reshape** (length, turning, capacity). Risk: cargo vertical clone — OK if tunnel geometry decisions are real. |
| `side_drills` | **helps** | low | casing | **M reshapes** (side carve, more lining). Visible vehicle milestone (design §10). |
| `scanner_station` | neutral | med | two-bay, artefacts | **D light** (pre-descent ore band). Overlap with `assay_beacon` — grill uniqueness; don't replace Discover-in-ground. |
| `core_guardian` | **helps** | low | — | **H reshapes** (boss before core). Restores climax stolen when guns moved off P15. |
| `special_wagons` | neutral / watch | med | — | **U light** (repair vs weapons slot). Clone risk vs `wagons`; keep only if the fork changes Mine/Return feel. |

**Act II standout:** `heat_lava`/`refractory_lining` pair is the template for later archetype+lining acts. `wagons` is the highest vehicle-shape beat; grill vs cargo vertical. `core_guardian` protects Harvest Core drama.

### Act III — Ice (P17–P24)

| id | Overall | Dilution | #35 dep | Loop notes |
| --- | --- | --- | --- | --- |
| `frozen_planets` | **helps** | low | fluid | **M/G reshape** (cold energy drain, refreeze). Regenerating ground changes path planning. |
| `insulated_lining` | **helps** | low | casing | **U/G reshape** (keep ice out of lined tunnels). Same lining pattern as refractory. |
| `frost_spitter` | **helps** | low | — | **M light–reshape** (first ranged: drill-facing no longer enough). Pushes gun/shield value. |
| `artefact_set_3` | **helps** | low | artefacts | **M light** (Thermal lance; Glide treads). Answers ice without replacing lining choice. |
| `drone_bay` | **helps** / watch | **high** | two-bay | **R reshapes** (drones ferry cargo while player stays down). **Dilution:** can skip dock Return/Sell cadence — require drone trips still settle at platform Sell, or cap autonomy. |
| `swarm_nests` | **helps** | low | — | **D/G light** (nest depth events: clear or route). Memorable Discover without new meta loop. |
| `shields` | neutral / watch | med | — | **M light** if timed energy absorb; **hurts** if passive HP = hull vertical. Grill as active Steam spend. |
| `ore_thief` | **helps** | low | — | **R/M light** (steals from wagons/drones). Counters drone automation — good dilution antidote for `drone_bay`. |
| `research_lab` | neutral / watch | med | two-bay | **U light–reshape** only if permanent branch forks; else vertical-disguised. Must not replace Upgrade bay. |

**Act III standout:** `drone_bay` is the biggest dilution risk in the whole schedule; pair with `ore_thief` and hard Return-to-Sell rules. Ice archetype+lining mirrors Fire cleanly.

### Act IV — Storm and relic (P25–P32)

| id | Overall | Dilution | #35 dep | Loop notes |
| --- | --- | --- | --- | --- |
| `magnetic_planets` | **helps** | low | fluid | **M/G reshape** (HUD/drone scramble in storm bands). Attacks info + automation. |
| `grounded_lining` | **helps** | low | casing | **U/G reshape** (safe corridors). Completes lining triad. |
| `emp_mite` | **helps** | low | — | **M light** (disables attachment until repair). Makes guns/side drills/shields feel earned. |
| `artefact_set_4` | **helps** | low | artefacts | **M/D light** (Relay coil; Salvage magnet). Storm/wreck Discover tools. |
| `quest_office` | **helps** / watch | **high** | two-bay | Off-axis contracts (**D**/side). **Dilution:** can become quest treadmill — keep optional; rewards feed Sell/Upgrade/Travel, never replace core harvest. |
| `processing_wagon` | neutral / watch | med | — | **S/M light** (refine underground). Overlaps `refinery_bay`; OK only if mobile refine is a scarce wagon slot, not free money. |
| `relic_planet` | **helps** | low | — | **D/H light–reshape** (story depth event powered by core). Strengthens Discover/Harvest without new loop. |
| `deployables` | neutral / watch | med | — | **M/H light** (junction defence before core). Clone watch vs `auto_guns` — placement ritual is the differentiator. |

**Act IV standout:** `quest_office` is the second major dilution watch (after drones). Lining triad completes; `relic_planet` is the soft story beat design wants without interrupting mining constantly (§16).

### Act V — Hollow and core (P33–P40)

| id | Overall | Dilution | #35 dep | Loop notes |
| --- | --- | --- | --- | --- |
| `hollow_planets` | **helps** | med | fluid | **M/G hard reshape** (thin shell → low-g interior; flight/anchor). Biggest Mine rewrite — still ends at core harvest. |
| `artefact_set_5` | **helps** | low | artefacts | **M/H light** (Grapple anchor; Core sense). Enables hollow traversal + core heading. |
| `unstable_cores` | **helps** | low | collapse | **H/R reshape** (harvest starts timed collapse escape). Strengthens Return urgency; design escape sequence. |
| `core_forge` | **helps** / watch | med | two-bay | **U/H light–reshape** (spend core on legendary part). Distinct from Sell ore; watch twin-feel vs `refinery_bay`. |
| `finale` | **helps** | low | — | **T/H reshape** (campaign mystery resolves at last core). Caps Travel narrative; mining loop intact through resolution. |
| `endless_unlock` | **helps** | low | — | **T reshape** (post-finale recombined planets). Preserves loop forever via formulas (#14); not a new genre. |

**Act V standout:** `hollow_planets` + `unstable_cores` are peak Experience-First beats; fewer features, bigger reshape — matches C's late cadence. `endless_unlock` protects "whole start to finish" without handcrafted infinity.

---

## Per-stage rollup (vision only)

| Stage | Strongly helped by | Dilution threats |
| --- | --- | --- |
| **Mine** | auto_guns, blasting, heat/ice/magnetic/hollow, side_drills, wagons length, enemies, shields (if active) | blasting skipping carve; hollow rewriting dig identity |
| **Discover** | artefact sets, scanner, swarm nests, relic, quest (optional) | scanner replacing in-ground Discover; quest treadmill |
| **Return** | wagons, ore_thief pressure, unstable escape | **drone_bay** skipping dock |
| **Sell** | refinery_bay (process choice), merchants (if not sell-alt) | merchants / processing_wagon as second cash path |
| **Upgrade** | linings, wagons/special, guns, shields, research forks, forge | research_lab / shields as vertical clones |
| **Go Deeper** | tunnel_wrecker, linings, env pressure, nests | — |
| **Harvest Core** | core_guardian, unstable_cores, relic/finale | deployables if they trivialize guardian |
| **Travel** | finale, endless_unlock; forge/core sinks feed travel costs | quest rewards bypassing travel gates |

---

## Vertical-track duplication flags (for #74)

Features that risk answering "how much stronger" instead of "what can I do now":

- `shields` ↔ hull
- `wagons` / `special_wagons` / `processing_wagon` ↔ cargo_hold (keep geometry/slot/role, not raw capacity)
- `side_drills` ↔ drill_power (keep lateral attachment identity)
- lining types ↔ casing_grade (already ruled: grade vertical, type horizontal — OK if enforced)
- `research_lab` branches ↔ any vertical multiplier disguised as a "branch"

---

## Acceptance checklist

- [x] Every vision candidate has a loop-stage impact note (act tables + shortlist)
- [x] High-impact vs low/clone-risk shortlists for grilling
- [x] Cache paths cited; no large tables dumped into the issue body
- [x] Feel & Fluid Ground interactions called out; #35 not reopened
- [x] Map #71 **Decisions so far** not edited

## Out of scope

- Resolving uniqueness #74 or opening build tickets
- Editing map #71 Decisions so far (Producer-owned)
- Changing `stats.json` / schedule_approved
