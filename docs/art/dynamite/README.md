# The dynamite art: typed sizes, the rack and the crater decals

The review renders of
[Art/VFX: Dynamite sizes and explosion effects (#145)](https://github.com/bjor2/steampunk-miner/issues/145),
for the ladder locked in
[Grilling: Dynamite sizes vs the shipped blasting_charges (#153)](https://github.com/bjor2/steampunk-miner/issues/153),
the twelve-row, three-type ladder of
[Dynamite D1 (#860)](https://github.com/bjor2/steampunk-miner/issues/860) and the typed art of
[Dynamite D7 (#866)](https://github.com/bjor2/steampunk-miner/issues/866): "each type has its own
stick colour, fuse sparks and crater decal; a rack socket with a slot per type and stock pips;
the `remote_detonator` plunger part" (the GD lock of 25 Oct on #647). Authored in Blender 4.2.9
on the shared box headlessly by `scripts/art/author_dynamite_sizes.py`, which also writes each
asset's placeholder sidecar; the `.blend` files under `art/blender/` are the sources (Git LFS).
The `dynamite-visuals` slice registers the ids through the art-id registry and draws them
(`docs/art-pipeline.md`, "Dynamite sizes").

## What is here

| Asset                   | Parts                                                                                                                                                                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vehicle-dynamite-rack` | `rack-frame`, three bays over eight pip sockets each; `slot-1` to `slot-3`, one type's bundle a bay (the strapped sticks, a keg, the bomb); `pip-<type>-1` to `pip-<type>-8`, the lit stock pips; `wire-reel` and `plunger`, the detonator's (P22); `casing-nozzle`, the Blast Casing node's |
| `prop-dynamite-charge`  | `planted-1` to `planted-12`, every one at the origin with its pivot at its centre; `lamp-1` to `lamp-12`, the one glowing piece of each, kept apart so it can blink                                                                                                                          |
| `prop-blast-crater`     | `crater-1`, `crater-2`, `crater-3`, one neutral decal a type; `crater-cased-rim` and `crater-cased-trim`, the lined crater's plates and seam, tinted by the build in the laid grade's plate colour and its lining's trim                                                                     |

The rack is authored in its own frame with the `hull.rear` attach point at the origin (K5: gear
is drawn at its point's `atM`), the arm towards the chassis. The reel, the plunger and the nozzle
are parts of the rack asset, so no new attach point and no Schedule C row (#153 amendment 2).

The type colours are the look rows' (`src/features/dynamite-visuals/dynamiteLooks.json`): the
author script reads them, so the art and the rows never drift. Every size of a type wears its
`stick` colour on its charge bodies and its `spark` colour in the lamp glass:

| Type | Sizes | Name            | Stick     | Families                                                                                                       |
| ---- | ----- | --------------- | --------- | -------------------------------------------------------------------------------------------------------------- |
| 1    | 1–4   | Breaking charge | `#b83a2a` | three, four and five red sticks in brass straps with a clockwork timer; two rows of four in an iron cradle (4) |
| 2    | 5–8   | Deep charge     | `#e8a93a` | wooden crates with the stick ends showing (5, 6); painted powder kegs in brass hoops with terminals (7, 8)     |
| 3    | 9–12  | Biggest charge  | `#24405e` | a riveted drum on chocks (9), the bomb (10), a caisson of two bombs in a brass yoke (11), the spiked mine (12) |

The three sticks stand at least 0.1 apart in luma (ticket 830's colour-blind rule), so the types
tell apart in grey. Every planted size stays inside its 1 m tile (0.27 × 0.28 m at size 1 to
0.87 × 0.93 m at size 12, measured on the evaluated meshes).

The crater decals are 1 m discs facing the camera, authored in neutral greys the decal shader
multiplies by a tint: the type's soot for a bare crater, the grade's plate colour and the lining's
trim colour (`casingGradeLooks.json`) once Blast Casing lines it. The crater edge sits at 0.84 of
the disc's radius (`DECAL_RIM_SHARE`), so a decal scaled to the ground radius keeps its rim just
outside the clearing.

## The explosion (D8, ticket 868)

The blast is procedural, not baked: `src/features/dynamite-visuals/systems/render/blastVfxPlan.ts`
names its stages per size and Blast Radius band, and the front layer plays them from fixed pools
(the pipeline section lists the stages). The committed golden
`systems/render/__goldens__/blastVfx.golden.txt` pins every stage at sizes 1, 6 and 12, levels 0,
10 and 1e6, on 360 px, 1280×800 and 1920×1080; `npm run bench:purchase-levels -- --rows vfx` times
the same rows a frame at a time. The type's colours come from the look rows above: the fire and
the fireball from `spark`, the shockwave from `ring`, the fireball's end and the smoke's hint from
`soot`. No render of the explosion is kept here: it moves, so it is checked by eye in `npm run dev`
through `steampunkDebug.features['dynamite-visuals'].previewBlast(size, 'showcase')`.

## Files

| File                                            | What it is                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `rack.front.png`, `rack.front-gray.png`         | the rack with all three bays lit, the reel, the plunger and the nozzle at 768 px/m, and in grayscale     |
| `rack.three-quarter.png`                        | the same from front-right and above, to show the relief the flat view only hints at                      |
| `planted.ladder.png`, `planted.ladder-gray.png` | the twelve planted sizes on their tiles at 256 px/m, colour and grayscale                                |
| `planted.ingame.png`, `planted.ingame-gray.png` | the ladder at 90 px/m, about what a 1080p screen shows at the default 12 m zoom (#39)                    |
| `planted.three-quarter.png`                     | the ladder from front-right and above                                                                    |
| `crater.decals.png`, `crater.decals-gray.png`   | the five decals on band rock at 256 px/m, tinted as the build tints them (soot, soot, soot, brass, seam) |
| `render_dynamite.py`, `sheet_dynamite.py`       | the render (Blender) and sheet (Pillow) scripts                                                          |

## Hand checks (25 Oct 2026, D7)

- **The ladder escalates** (`planted.ladder.png`): width and height both grow from size 1 to 12,
  and every family step is a new silhouette: a row of sticks, a cradled block, a crate, a keg, a
  lying drum, the bomb, the stacked caisson, the spiked mine. Every size stays inside its tile.
- **The types read as colours and in grey** (`planted.ladder-gray.png`): red, ochre and navy are
  three luma steps, so sizes 4 and 5, and 8 and 9, tell apart as a type change with no colour.
- **The rack reads as three bays** (`rack.front.png`): the sticks, a keg and the bomb each in its
  bay with eight pips under it, the reel and plunger on the arm side where the chassis is, the
  nozzle on the far side. The pips are 1 cm domes: they read on desktop at the default zoom and
  are a dot on a 360 px phone, as the pins in `chargeTypeLook.test.ts` say.
- **The decals** (`crater.decals.png`): a star of cracks, a pit of fissures, a shattered ring, and
  the plated rim with its seam; the rim's plates tint to brass without losing their rivets.
- Not looked over live in the MCP Blender: the shared instance was not used during this session,
  so the review is the headless renders above, plus the baked atlases.
