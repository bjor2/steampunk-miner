# The dynamite sizes: rack sticks and planted props

The review renders of
[Art/VFX: Dynamite sizes and explosion effects (#145)](https://github.com/bjor2/steampunk-miner/issues/145),
for the ladder locked in
[Grilling: Dynamite sizes vs the shipped blasting_charges (#153)](https://github.com/bjor2/steampunk-miner/issues/153)
and the ten sizes of
[Spec: Dynamite in ~10 sizes (#143)](https://github.com/bjor2/steampunk-miner/issues/143).
Authored in Blender 4.2.9 on the shared box headlessly (`scripts/art/author_dynamite_sizes.py`
wrote the first version; the `.blend` files under `art/blender/vehicle-dynamite-rack/` and
`art/blender/prop-dynamite-charge/` are the sources from now on, Git LFS). Nothing is exported,
listed in the manifest or registered yet: the wiring
([#215](https://github.com/bjor2/steampunk-miner/issues/215)) exports them through the art-id
registry, swaps them in for the kernel's `vehicle-blasting-charges` and `prop-blasting-charge`,
and shows each size as it unlocks.

## What is here

| Asset                   | Parts                                                                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vehicle-dynamite-rack` | `rack-frame`, the five-shelf rack with its arm and the reel's bracket; `stick-1` to `stick-10`, one model per size, two a shelf, size 1 bottom left; `wire-reel`, the detonator's reel (P22) |
| `prop-dynamite-charge`  | `planted-1` to `planted-10`, every one at the origin with its pivot at its centre like today's charge; `lamp-1` to `lamp-10`, the one glowing piece of each, kept apart so it can blink      |

The rack is authored in its own frame with the `hull.rear` attach point at the origin (K5: gear
is drawn at its point's `atM`), where today's rack already hangs, with the arm towards the
chassis. The wire reel is part of the rack asset, on the arm side, so no new attach point and no
Schedule C row (#153 amendment 2).

The ladder escalates by family as well as by scale, so a size reads at a glance and in grayscale:

| Sizes | Family                                                                                                             | Planted extent (w × h, m) |
| ----- | ------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| 1–3   | three, four and five red sticks in brass straps with a clockwork timer, fuse cord and the fuse lamp                | 0.27×0.28 to 0.44×0.32    |
| 4     | two rows of four sticks in an iron cradle, the timer box on top                                                    | 0.45×0.39                 |
| 5, 6  | wooden crates with brass corners, the stick ends showing on the face (3×2, then 4×3 with a bell dome by the timer) | 0.48×0.47, 0.56×0.59      |
| 7, 8  | iron powder kegs in brass hoops with galvanic terminals and the lead wire (remote, #153 section 2)                 | 0.57×0.63, 0.65×0.69      |
| 9     | a riveted iron drum on chocks with brass end caps, a pressure gauge and the terminals                              | 0.73×0.72                 |
| 10    | the bomb: a drum between two domes in three brass bands, a glowing charge window, twin terminals                   | 0.90×0.78                 |

The rack's sticks are the same models scaled to a slot that grows with the size (`RACK_SLOTS` in
the author script), 0.05 × 0.045 m for size 1 to 0.125 × 0.108 m for size 10, so the rack reads
as the ladder. The lamp is the only emissive piece; the size-10 charge window glows faintly too.

## Files

| File                                            | What it is                                                                                      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `rack.front.png`, `rack.front-gray.png`         | the rack with all ten sizes and the reel in the game's front view at 768 px/m, and in grayscale |
| `rack.three-quarter.png`                        | the same from front-right and above, to show the relief the flat view only hints at             |
| `planted.ladder.png`, `planted.ladder-gray.png` | the ten planted sizes on their tiles at 256 px/m, colour and grayscale                          |
| `planted.ingame.png`, `planted.ingame-gray.png` | the ladder at 90 px/m, about what a 1080p screen shows at the default 12 m zoom (#39)           |
| `planted.three-quarter.png`                     | the ladder from front-right and above                                                           |
| `render_dynamite.py`, `sheet_dynamite.py`       | the render (Blender) and sheet (Pillow) scripts                                                 |

## Hand checks (7 Oct 2026)

- **The ladder escalates** (`planted.ladder.png`): width and height both grow from size 1 to 10
  (0.27 × 0.28 m to 0.90 × 0.78 m, measured on the evaluated meshes), and every family step is a
  new silhouette: a row of sticks, a cradled block, a crate, a keg, a lying drum, the bomb. Every
  size stays inside its 1 m tile.
- **The rack reads as the ladder** (`rack.front.png`): five shelves, two sizes a shelf, bottom row
  first, each miniature bigger than the one before; the kegs and the drum read as kegs and a drum
  at 1 to 2 cm, and the reel with its crank and the wire running to its socket sits on the arm
  side where the vehicle's chassis is.
- **Grayscale at play size** (`planted.ingame-gray.png`, each size about 60 to 90 px wide): the
  families still tell apart with no colour; sizes 1 to 3 differ by width alone (three, four and
  five sticks at six pixels each), which is what the HUD size readout and the rack are for.
- **Pivots** (`rack-frame` at the attach point, every `planted-<n>` at its centre, every lamp at
  its socket) lie inside their meshes, as the exporter requires; every part is one mesh, nothing
  is rigged. The remote sizes (7 to 10) carry terminals and a lead instead of a fuse cord.
- Not looked over live in the MCP Blender: the shared instance was not listening on the box
  during this session, so the review is the headless renders above.
