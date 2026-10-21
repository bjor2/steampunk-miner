# The first five planets' hazards (P2–P5)

Design output of ticket 651 (spec #647, map "Five open planets"). The Game Director's bar: a
planet counts as open only when its hazard, look and pool show within a minute of landing. The
Horizontal Scaler's conditions: one per-planet data row (pool, radius, solar system, look);
depth-placed content by fraction of radius; existing worlds keep their stamp; purchasables
price-only; the arrival card distinct at 360 px (ticket 343). The Vertical Scaler: these tickets
touch no power or cost curve.

The rows live on the planet registry (`src/features/ores/ores.economy.json`, `planets.rows[].hazard`,
ticket 642's rows), the kinds in `planets.hazards` and the caps in `planets.hazardCaps`. The loader
is `src/features/ores/systems/planetHazards.ts` and `hazardKinds.ts`; `planetHazards.test.ts` holds
every rule below. Ticket 652 lays the pockets, ticket 653 the look, ticket 654 the card. Ticket 653
gave each planet its rock tint, horizon and sky band on the same row (feature-slices.md 3.79); the
pockets' own look in the rock, read through ticket 652's `hazardPocketKindAt`, is a ticket of its own.

## The four hazards

| Planet | Kind           | Tag          | What the player meets                                                                                           | Effect on a cut cell                                                                                                                                                                                                           |
| ------ | -------------- | ------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2      | `rockfall`     | Rockfall     | Pockets of loose scree in the first shaft of the heavy planet. Cut one and the rubble above pours into the cut. | `refill`: the cut cell fills again with the pocket's rubble (the rubble cells above become air), and a rig in it is crushed for 300 bp of the on-curve hull, as a collapse refill crushes (`collapseRefill`, `collapseCrush`). |
| 3      | `firedamp`     | Firedamp     | Sealed gas pockets in the coal-dark rock of the fossil planet. Breach one and the boiler chokes.                | `drain`: 1500 bp of the on-curve energy drains over 180 ticks (3 s). No hull cost.                                                                                                                                             |
| 4      | `spinecrystal` | Spinecrystal | Brittle crystal clusters in the crystal-rich ground. Cut one and it shatters against the bit.                   | `bite`: 200 bp of the on-curve hull, once per cell, with a shard spray.                                                                                                                                                        |
| 5      | `steamvent`    | Steam vents  | Pressurised vents in the ground, the first breath of the Fire act three planets on. Cut one and it blows.       | `shove`: 200 bp of the on-curve hull (the scald) and the rig is pushed 3 tiles back up the shaft over 20 ticks, through the tug seam the magnetic class moves the rig with, in reverse.                                        |

**One trigger.** Every kind fires when the drill cuts one of its painted pocket cells, the hook
where the electrified check of the magnetic class already sits (`isElectrifiedCellAt` in the cut
path). Ticket 652 wires one generic hazard-contact reaction with four effects, not four systems.
A hazard pocket is visible in the rock before it is cut (ticket 653 gives each kind its look), so
every hazard is avoidable by going round it: that is what "purchasables price-only" means in play.
No item is required, and the card never names one (ticket 343's rule).

**Distinct from the later classes.** Heat and lava stay the Fire act's (P8–P16): steam vents
scald but add no heat gauge and no lava. Shock, fields and the probe stay magnetic's (P25).
Caverns stay hollow's (P33) and the escape run unstable's (P36). Rockfall is a pocket that falls
on the cut, not the lining collapse of #43, which stays keyed to casing.

## Placement: fractions of the radius

A window is `[fromDepth, toDepth]` as `[num, den]` fractions of the radius, read as
`floor(num * R / den)` whole cells from the surface (the TD's integer fraction rule on #302), so a
bigger planet keeps its hazard at the same place of the descent. The pocket lattice is lava's
(#113): plain ground in the window is cut into `pocketTiles` square blocks, and a block is a pocket
with `pocketChanceBp` from the block's own hash, the same in any chunk order.

| Planet | R   | Window (fraction) | Window (cells) | Surface layer S+K | Band 1 cells | Lattice | Chance  | Pockets in the pad view |
| ------ | --- | ----------------- | -------------- | ----------------- | ------------ | ------- | ------- | ----------------------- |
| 2      | 421 | 1/40 – 1/8        | 10 – 52        | 7                 | 33           | 3       | 800 bp  | about 15                |
| 3      | 492 | 1/32 – 1/5        | 15 – 98        | 7                 | 39           | 3       | 500 bp  | about 18                |
| 4      | 543 | 1/40 – 1/6        | 13 – 90        | 9                 | 43           | 3       | 1000 bp | about 34                |
| 5      | 582 | 1/48 – 1/7        | 12 – 83        | 10                | 46           | 3       | 400 bp  | about 13                |

**Seen within a minute.** Each window opens below the pinned surface layer (ticket 625's S + K(p)
cells) and inside band 1, so the first shaft from the pad reaches it, and the pad view (40 columns
either side of the dock point over the window) holds several pockets on average, so some are on
screen before the first cut. Ticket 652's acceptance: on each of the pacing seeds 83921, 31415 and
27182, at least one pocket within 20 columns of the dock point and inside the window on each of
P2–P5. A straight 40-cell shaft crosses about 13 blocks, so it meets a pocket on about 65% (P2),
50% (P3), 75% (P4) and 42% (P5) of descents; the rest are seen and passed.

**P1 is byte-identical.** Planet 1's row holds no hazard and the loader refuses one there. Planets
6 and on hold none yet.

**Existing worlds keep their stamp.** Ticket 652 lays the pockets under ore rules 8, stamped from
planet 2, so a P2–P5 planet a save holds under rules 7 or earlier has no pockets and never
regenerates; the P1 and old-save goldens stay as they are.

**As built (ticket 652).** A pocket is a read of the planet and the cell, never a repaint, as the
magnetic class's electrified cells are: plain ground whose radial depth lies in the window and whose
lattice block hashes under the chance, asked through the kernel's `hazardPockets` seam
(`src/systems/registries/hazardPockets.ts`, provided by `src/features/ores/systems/hazardPockets.ts`).
The generated cells of every planet stay byte-identical, so the generator version did not move. On
seeds 83921, 31415 and 27182 every one of P2–P5 holds a pocket within 20 columns of the dock
point (72 to 277 pocket tiles in those 41 columns, the nearest in column 0 or 1).
The contact reaction (the four effects above) and each kind's look are not part of ticket 652.

## The card line

The planet card (ticket 343) reads the tag and the arrival line keyed by the planet row (ticket
654). The copy is Planet & Narrative's, in the #159 ledger voice: the tag, a full stop, one clause
that says what happens and what to do, no digits, no item named.

| Planet | Tag          | Arrival line                                                     | Characters |
| ------ | ------------ | ---------------------------------------------------------------- | ---------- |
| 2      | Rockfall     | Rockfall. Loose scree pours into the cut; mind what hangs above. | 64         |
| 3      | Firedamp     | Firedamp. Sealed gas chokes the boiler when breached; back out.  | 63         |
| 4      | Spinecrystal | Spinecrystal. Brittle clusters shatter and score the hull.       | 58         |
| 5      | Steam vents  | Steam vents. A cut vent blasts up the shaft; stand clear of it.  | 63         |

**Fits 360 px.** The card's panel is capped at 30 rem and sits inside a 360 px viewport with the
kit's body size, about 38 characters a line. A line of at most 64 characters (`CARD_LINE_CHARACTERS`)
wraps to two lines at most; the magnetic precedent is 57. The loader refuses a longer line, a line
that does not open with its tag, a digit, and a tag of more than two sentence-case words or 12
characters. The spec also checks no line names an unlock id, which the card registry would refuse.

**For ticket 654.** `planetCardLines` sources must name a schedule row (`featureId`) that is open
on the planet, and the Horizontal Scaler asked for no new stats.json row. The `planet_2` row
(planet 2, shipped) is open on every planet from 2, so one source keyed on it can read the row's
hazard through `hazardOfPlanet` from the `ores` index. Ticket 654 built it that way: the `ores`
source `ores.hazard-card` (`hazardCardSource.ts`) waits on `planet_2` and reads the row's copy.

## Numbers that are provisional

The effect shares (300, 1500 over 180 ticks, 200, 200 with a 3-tile shove) and the caps (500 bp a
contact, 2500 bp of energy a contact, 2500 bp of hull a dive, magnetic's own dive cap) are the
designer's first values, bounded so no hazard forces a purchase. The Systems designer may retune
them on ticket 644's pace rows; the loader keeps any retune inside the caps. They touch no power
or cost curve, no hardness, no ore value and no price.
