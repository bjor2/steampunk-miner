# Research audit #75 — Vertical curve findings

**Ticket:** [Research: Vertical curve audit (drill/ore drift, hardness lockstep, casing formula gap)](https://github.com/bjor2/steampunk-miner/issues/75)  
**Map:** [Wayfinder: Campaign horizontal & vertical scaling](https://github.com/bjor2/steampunk-miner/issues/71)  
**Cache cited:** [`docs/scaling/vertical/review.html`](./review.html) + [`stats.json`](./stats.json)  
**sourceHash:** `03c55a635812b640` (`sha256-16` of path+bytes for `economy-constants`, `vehicle-table`, `price-table`)  
**Prefer/Approve on review:** none (panel tally 0) — AFK from cache as ticket Notes allow.

This note **confirms** the Vertical Scaler cuts. No full recompute: `stats.json` says skip when `sourceHash` matches; it matches.

---

## 1. Cost vs ore drift (arms grilling [#77](https://github.com/bjor2/steampunk-miner/issues/77))

| Claim | Confirmed | Where |
| --- | --- | --- |
| Drill upgrade ratio `r = 1.24` | Yes (`economy-constants.json`) | review §1.1 |
| Six drill levels/planet → cost ×`1.24^6` ≈ **3.63×/planet** | Yes | §1.1 hero + body |
| Ore value ×`1.5^3` ≈ **3.38×/planet** | Yes | §1.1 |
| Gap ≈ **7.5%/planet** steeper than income | Yes | §1.1 Impact |
| Ore-units per next drill upgrade drifts **~16 → 281** by planet 40 (~**18×**) | Yes (15.6 → 281.3 band-5 ore units) | §1.3 chart/caption |
| Flatten fork: `r` so `r^6 = 1.5^3` → **`r ≈ 1.225`** | Yes (Scaler suggested change) | §1.3 |
| Keep-drift fork: explicit per-planet time budget / `paceScale` after p20 | Yes (Scaler alternative) | §1.3 + §3.1 |

**Decision options for #77 (do not pick here):**

1. **Flatten to `r ≈ 1.225`** — ore-units/upgrade stays near-flat across planets 1–40; regenerate price/vehicle tables + bot run.
2. **Keep `r = 1.24`** — publish intentional per-planet minute budgets (and optional `paceScale` after p20); gate with pacing targets.
3. **Hybrid** — flatten through p20, controlled drift + budgets for p21–40 / endless.
4. **Other** — state `r`, band-ore coupling, and verification metric.

---

## 2. Drill power ↔ hardness lockstep (arms task [#81](https://github.com/bjor2/steampunk-miner/issues/81))

| Claim | Confirmed | Where |
| --- | --- | --- |
| Drill power at end of planet tracks hardness **1:1** (both ~**1.97×/planet**) | Yes | §1.2 |
| Distance between power and hardness never changes | Yes | §1.2 figcaption |
| Track alone = **maintenance, not felt growth** | Yes | §1.2 Finding |

**Spend concentration (felt-growth pressure):** cumulative upgrade spend to end-of-planet levels (from `c0`/`r`/`rTip`/`w` in `economy-constants.json`, levels via `Lon` in `docs/economy/tools/gen.py`) is **~78% drill_power + drill_tip** from planet 5 onward (p5 78.5%, p10–p40 ~78.4%). Cargo / boiler / engine sit on diminishing-return curves (capacity step / energy step / asymptotic speed), so late money preference stays on drill+tip even though those tracks do not deliver a new feel under the hardness lockstep.

**Decision options for #81 (do not pick here):**

1. **Horizontals carry feel** — new verbs/hazards/facilities; vertical stays readability/pacing.
2. **Rebalance vertical feel** — tip breakpoints, hull durability reads, casing grade as visible sink/pressure.
3. **Deliberate mix** — short checklist of which track/feature owns each campaign act’s “wow”.
4. **Other** — state acceptance signal (telemetry or playtest rubric).

---

## 3. `casing_grade` formula gap (arms grilling [#76](https://github.com/bjor2/steampunk-miner/issues/76))

| Claim | Confirmed | Where |
| --- | --- | --- |
| `casing_grade` listed in `stats.json` tracks | Yes | `stats.json` `tracks[]` |
| **No samples / price formula** yet | Yes | §2.1 |
| `travel_fee` is a healthy **~1.2× band-5 ore** flat sink (grows 3.38×/planet with ore) | Yes | §1.4 |
| Travel-fee pattern is the natural **price/metre** template for casing | Yes | §2.1 Suggested change |
| Grade levels gate collapse pressure (behaviour already decided elsewhere) | Assumed from map/#41 world; not reopened here | §2.1 |
| Casing as money sink targets slice-2 shortfall | Yes | §2.2 |

**Slice-2 pacing gap (sink sizing numbers for #76):** bot **68.3 min** vs target **90–130 min** (`stats.json` `pacing_targets_min.slice2`; review §2.2 / §3 table). At ~550 money/min, closing to 90 / 110 / 130 min implies new sinks (casing + others) absorb about **25% / 39% / 48%** of money earned (§2.2 Impact). Scaler suggests tune casing fraction toward the **110-minute midpoint** first, then re-run the bot (collapse risk also slows mining).

**Decision options for #76 (do not pick here):**

1. **Travel-fee fraction template (Scaler default):** `pricePerMetre(grade, band) = k × bandOreTemplate(band)` with `k` in the travel_fee / band-5 family (~1.2); grade steps multiply/step `k`; grade gates collapse pressure.
2. **Independent exponential track** — own `r` and base, soak surplus without referencing travel_fee.
3. **Hybrid** — travel-fee-linked grades 1–3, diverge for deep grades.
4. **Other** — describe variables explicitly.  
   Also settle whether casing spend alone is meant to close ~68→90–130 without changing drill `r`.

---

## 4. Pacing notes (shared inputs for #76 / #77 / #81)

| Note | Confirmed | Where |
| --- | --- | --- |
| Add **45–60 min per-planet** to `pacing_targets_min` | Yes (Scaler suggestion) | §3.1 |
| Per-planet time already rising by planet 7–8 (~69 min vs 45–54 earlier) | Yes | §3.1 chart |
| Bot did not reach planet 40 inside budget | Yes | §3.1 figcaption |
| `stats.json` planet-40 samples previously wrong (p36); **already corrected** | Yes | §1.5 + `stats.json` notes |

Current `pacing_targets_min` keys: `first_ten_minutes`, `planet1_core` (30–60), `slice2` (90–130) — **no per-planet key yet**.

---

## 5. What this audit does *not* decide

- Does **not** choose flatten vs keep-drift (`#77`).
- Does **not** lock casing formula variables (`#76`).
- Does **not** pick where felt progression lives (`#81`).
- Does **not** edit map [#71](https://github.com/bjor2/steampunk-miner/issues/71) _Decisions so far_ (Producer owns that).

Recompute only if economy tables/constants change and `sourceHash` drifts from `03c55a635812b640`.
