# The hull rig-look parts

The Blender source and review renders of
[Rig look art: hull Blender parts (6 parts) (#584)](https://github.com/bjor2/steampunk-miner/issues/584),
wave 576-1B of [Rig look ladder and mineral skins (#576)](https://github.com/bjor2/steampunk-miner/issues/576),
and of [LK7: hull look steps to P40 (#816)](https://github.com/bjor2/steampunk-miner/issues/816),
wave 647-7K of the P1-P5 map (#647): every band on the `hull` track visibly changes the rig.
Since LK1 (#809) the line steps on the power-decade band rule, a band every 120 `levels.hull`
purchases, with the authored steps on the band edges: #584's five parts at 120, 240, 360, 480 and
600, named by Progression Riveted plate, Banded iron, Brass-trimmed armour, Layered armour and
Filigree armour (6300549964 on #157), then the fourteen LK7 parts on the edges 720 to 2280 (about
P40 on the bot's median path), each the filigree armour with one more part fitted. The base rig
keeps its unnamed default, here "Bronze pod".

**Wired by #585 and #809.** The rig-look registry (#577) reads the steps from `rigLook.json`
(`src/features/rig-look/`), swaps the part on the slot and runs the finish tail above the top
step; `hullLooks.json` here is the one table this folder's scripts share (#576 "Registry": data,
not code). The asset id follows the #52 kebab form under the vehicle category,
`vehicle-look-<track>`; the part ids are the step names.

Authored in Blender 4.2.9 on the shared box: `author_hull_looks.py` wrote the first version of
the file, `author_hull_steps.py` fitted the LK7 parts into it (a re-run rewrites those fourteen
objects and nothing else), and `art/blender/vehicle-look-hull/vehicle-look-hull.blend` is the
source from now on (Git LFS). The six #584 parts were appended into the live Blender through the
Blender MCP and looked over from the front and three-quarter; the LK7 parts were checked on the
headless composites below, at full size and at a 360 px phone's.

## The parts

The asset is authored in its own frame with the track's attach slot, `hull.plates`, at the
origin, as the tech gear is (#166), so the game draws a part at the slot's `atM` from the vehicle
sidecar with no offset. The slot sits on the deck line, 0.21 m above the pod's axis
(`vehicle.parts.json`: the slot at (0, 0.14), the chassis at (0, -0.07)), and no rig part sits on
it, so a look lies over the pod rather than replacing a part. Every armour is plating on the
pod's camera-side skin: three rows of facets tangent to its cross-section between the stern and
the bow socket (x -0.24 to 0.24, 0.13 m under the deck to 0.08 m over the axis), a hatch opening
round the driver's porthole, and two brass lifting eyes on the deck line between the dome base
plate's rivets. The eyes put the slot inside each part's bounds, which the export requires of a
pivot; the base look carries them too, inside the dome's base plate where neither the render nor
the game shows them. Draw order `z` 5 (the slot's, the armour's) for the steps, 2 (the pod's) for
the base.

| Part                   | Step | Look                                                                                                              |
| ---------------------- | ---- | ----------------------------------------------------------------------------------------------------------------- |
| `bronze-pod`           | 0    | the pod's own porthole, piece for piece, half a millimetre proud (`porthole_pieces` of the casing driller script) |
| `riveted-plate`        | 20   | warm grey iron plates, a brass rivet row round every plate                                                        |
| `banded-iron`          | 80   | dark iron plates under polished steel straps down every seam, steel studs where they cross                        |
| `brass-trimmed-armour` | 140  | pale steel plates edged in brass with a brass boss on each and a brass frame round the hatch                      |
| `layered-armour`       | 260  | two lapped courses of blued steel scales per bay on a dark iron backing, each scale lapping its neighbour         |
| `filigree-armour`      | 440  | guild-green enamel under a brass bar with a chain of beads either side, a teal gem glowing in each bay's centre   |

A swap, as the wiring draws it (`render_hull_looks.py`): the rig keeps every part of its own
and the look's part stands on the slot. The base look reproduces the porthole the hatch shows, so
the wiring may draw nothing below the first step (the registry has no part there) and the rig is
the same either way. The plating's top row ends under the dome's base plate and its bottom row
above the keel's rivets, so a step changes what the pod is clad in, not the rig's outline.

## The LK7 parts (ticket 816)

The GD lock on #816 wants each step a new outline or an added part in a socket, never a
recolour, the parts fitted in the order plates, then rivets, then armour skirts, and nothing
pushing the drawn outline past the rig bounds or moving the drill tip. The sockets are what the
pod leaves bare round the #584 plating, measured on the staged tier-1 rig (pod frame, the axis
0.21 m under the slot): the belly strip between the plating's bottom edge (0.06 m under the
axis) and the pod's own keel rivets (0.08 m under, on the keel bar's top edge); the stern and
bow caps beside the plating, under the dome's base plate (its bottom edge 0.155 m over the axis)
and clear of the stack's foot (x -0.326) and the piston (x 0.313), where a cap still reaches
0.168 m off the axis at x +-0.32; the plating's own four corner bays, where a doubling plate lies
over the filigree's beads and gems (0.025 m off the skin); and the hatch opening, where a heavy
ring lies over the filigree's hatch frame round the porthole (ring radius 0.056 m at (0.08,
0.02)). The skirts hang under the keel strake over the keel bar, the hips and the thrusters'
swivel mounts, as the tier-3 rig's own belly skirt does (`t3-armour-plate-3`, drawn over them
at draw order 5 as a look is): 0.30 m either side of the slot and no lower than 0.168 m under
the axis, inside the pod's silhouette out to the caps (which reach 0.1755 m under the axis at
x +-0.30) and far inside the 0.9 m collider box (`VEHICLE_COLLIDER_SIZE`, 0.45 m either way
from the vehicle's origin; the hem is 0.238 m under it), so a skirt never reads as extra hit
area. The skirt pieces are flat and face the camera, their faces 0.215 m nearer it than the
pod's axis, ahead of the hips (0.186) and the thigh rams (0.20) the legs put in front of the
pod, so the composites show them as the game draws them: the look's sprite (draw order 5) over
the chassis (2) and the thrusters (4). Every plate is a metal that contrasts with what it lies
on (dark iron on the bronze stern and the dark keel strip, pale steel on the grey bow cap, over
the dark filigree bays and over the dark keel bar), and rivets and bolts are 10 to 11 mm domes
in a metal that contrasts with their plate (bright steel on dark iron, dark iron on pale steel),
in double or ringed rows along a whole edge. No LK7 part glows: the filigree's gems stay the
hull's one emission.

| Part                    | Step | Adds                                                                     |
| ----------------------- | ---- | ------------------------------------------------------------------------ |
| `keel-strake-armour`    | 720  | a dark-iron keel strake along the plating's bottom edge, brass-lipped    |
| `stern-plated-armour`   | 840  | a brass-rimmed dark-iron plate on the bronze stern cap, three facets     |
| `bow-plated-armour`     | 960  | a brass-rimmed pale steel plate on the grey bow cap, three facets        |
| `corner-plated-armour`  | 1080 | pale steel doubling plates with dark chamfers over the four corner bays  |
| `hatch-ringed-armour`   | 1200 | a heavy dark-iron ring round the porthole, brass hinge knuckles, a latch |
| `keel-riveted-armour`   | 1320 | two staggered rows of bright steel rivets along the keel strake          |
| `cap-riveted-armour`    | 1440 | a ring of bright steel rivets round each cap plate                       |
| `corner-riveted-armour` | 1560 | a ring of dark-iron rivets round each corner plate                       |
| `hatch-bolted-armour`   | 1680 | twelve bright steel bolts round the hatch ring                           |
| `skirt-rail-armour`     | 1800 | a brass skirt rail under the keel strake on five brass hangers           |
| `stern-skirt-armour`    | 1920 | three pale steel skirt plates hung from the rail at the stern            |
| `bow-skirt-armour`      | 2040 | three more at the bow                                                    |
| `full-skirt-armour`     | 2160 | the three middle plates, closing the skirt                               |
| `bossed-skirt-armour`   | 2280 | a brass boss on every skirt plate and a brass trim bar along its hem     |

The hover line names each band with the `name` here and the `card` in `rigLook.json` (data
strings of 2 words; Progression and G&V may rename them in those two files). Above 2280 the LK1
finish tail keeps the bossed skirt and paints it in each band's finish.

## Files

| File                       | What it is                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `parts.png`                | each part alone in the game's front view at 768 px/m, seven a row                                       |
| `tier-1.png`, `tier-3.png` | the bare rig at that tier and the rig with each look on the slot, 512 px/m, the nose lit as drilling    |
| `tier-<n>.ingame.png`      | the same at 90 px/m, about what a 1080p screen shows at the default 12 m zoom                           |
| `tier-<n>.phone.png`       | the same at a 360 px wide phone's 30 px/m over the 12 m zoom, enlarged 8x with no smoothing             |
| `glow.png`                 | the tier-1 rig, bare and with each look, by its emission alone: what the emissive map carries           |
| `outline.json`             | each look's silhouette cells outside the rig at tiers 1, 2 and 3, and the base look's beyond the pod's  |
| `readability.json`         | the phone-size pixels each step changes at two zooms, and the nose's brightest pixel against the hull's |
| `hullLooks.json`           | the asset, its slot, its parts with their step names and thresholds                                     |
| `author_hull_looks.py`     | wrote the first version of the source (Blender)                                                         |
| `author_hull_steps.py`     | fits the fourteen LK7 parts into the source, re-runnable (Blender, ticket 816)                          |
| `render_hull_looks.py`     | the renders above (Blender), on the casing driller review's frame and stage                             |
| `check_outline.py`         | writes `outline.json` (Blender); exits 1 when a look leaves the rig outline                             |
| `sheet_hull_looks.py`      | lays the renders out into the sheets and writes `readability.json` (Pillow, numpy)                      |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-hull/author_hull_looks.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-hull/author_hull_steps.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-hull/check_outline.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-hull/render_hull_looks.py [-- alone|rig|glow]
python3 docs/art/rig-look-hull/sheet_hull_looks.py
```

## Checks (21 Oct 2026)

Against the ticket's acceptance, with the numbers the scripts wrote:

- **Six parts modelled** (`parts.png`): the base look and the five steps; the thresholds served
  are 20, 80, 140, 260 and 440 (`hullLooks.json`), the table's.
- **Each part swaps on the track's slot** (`tier-1.png`, `tier-3.png`): every look stands on
  `hull.plates` at (0, 0.14), on the tier-1 rig the first steps are bought on and on the tier-3
  rig with its heavy hull, shields and skirt, whose bands sit elsewhere under the plating.
- **Inside the rig outline** (`outline.json`): on a 4 mm grid, every armour has 0 cells outside
  the rig's silhouette at tier 1 and at tier 3, and the base look adds 0 cells to the pod's own
  skin where it lies. A first pass copied the pod's three bands as well: their lower rims left 8
  cells outside the tier-1 rig and 16 outside tier 3, and the heavy hull's bands sit at other
  positions, so the base keeps only the porthole, which is the same at every tier.
- **Collision and hitbox unchanged:** the vehicle collider is a code constant (`COLLIDER_M`, 0.9 m)
  that no art feeds, and `vehicle.blend` is untouched. The wiring's digest check (#585) is where
  byte-identity is proved on the running game.
- **Distinct at 360 px** (`tier-<n>.phone.png`, `readability.json`): at 30 px/m, each step
  changes 57 to 84 of the plating footprint's 144 pixels against the look before it at tier 1 (69,
  59, 77, 84, 57; a channel moving by more than 24 of 255) and 58 to 84 at tier 3 (70, 58, 76,
  84, 59); the bare rig to the base look changes 1 at either tier. The bronze pod goes warm grey and
  studded, then dark with pale straps, then pale and gold-edged, then blue-grey and ribbed, then
  deep green with gold tracery.
- **The drill nose stays the brightest part** (`glow.png`, `readability.json`): by emission alone
  the nose's brightest pixel is 247 against the filigree's gems at 163 (the gem material
  glows at 0.3 against the nose seams' 1.6; the other looks' 15 is the porthole glass). Lit, no
  step raises the plating's brightest pixel more than one unit over the bare rig's brass
  highlights (180 to 199 at tier 1 against the rig's 199, 190 to 199 at tier 3 against 198), all
  under the lit nose (203 at tier 1, 253 at tier 3).
- **Desktop and phone** (`tier-<n>.ingame.png`, `tier-<n>.phone.png`): checked at 90 px/m and at
  30 px/m. The screenshots of the running game at each step and two tail points are the wiring's
  (#585), since nothing draws the asset yet.

## Checks for the LK7 steps (25 Oct 2026)

Against #816's done-when, with the numbers the scripts wrote on the final export (blend
`134223ab`, 20 parts, 512x4096):

- **Nineteen authored steps on LK1's edges** (`hullLooks.json`, `rigLook.json`): #584's five
  parts stay the first steps at 120 to 600 and the fourteen LK7 parts take 720 to 2280, one per
  band edge, so no hull band to P40 is an `it.todo` in `rigLookLines.test.ts` any more. Each step
  is an added part in a socket (`parts.png`, `tier-1.png`), never a recolour; the plates come
  first, then the rivets, then the skirts.
- **Inside the rig outline, the drill tip and the collider unchanged** (`outline.json`): on a 4 mm
  grid every look has 0 silhouette cells outside the rig at tiers 1, 2 and 3 (the skirts' hem is
  0.168 m under the pod's axis, 0.238 m under the vehicle's origin, inside the 0.9 m collider box).
  The look sits on `hull.plates`, so the drill head and its tip are not touched; the collider is a
  code constant no art feeds and `vehicle.blend` is untouched.
- **Readable at 360 px** (`tier-<n>.phone.png`, `readability.json`): at the closest zoom (8 m,
  45 px/m on a 360 px phone, where `rigLookSweep.spec.ts` judges one visible step as at least 16
  pixels moved by more than 24 of 255 over the whole rig), each LK7 step changes these pixels of
  the 589-pixel hull footprint against the step before it at tier 1: keel strake 25, stern plate
  28, bow plate 25, corner plates 51, hatch ring 37, keel rivets 29, cap rivets 16, corner rivets
  20, hatch bolts 14, skirt rail 51, stern skirt 21, bow skirt 19, full skirt 20, skirt bosses 44
  (tier 3 within 6 of each). At the default 12 m zoom (30 px/m, 240 pixels) the plate and skirt
  steps move 5 to 20 and the rivet steps 4 to 10. **Finding for G&V:** the two bolt steps, cap
  rivets (16, 15 at tier 3) and hatch bolts (14), sit on the sweep's line by geometry alone, since
  an 11 mm dome is half a phone pixel at 45 px/m; in the game each band also wears its own tint
  and glow from `rigLook.json`, which the sweep's crop diff sees and these untinted renders leave
  out. At 90 px/m (`tier-<n>.ingame.png`) every step reads on the rig.
- **Glow under the `rigBody` cap** (`glow.png`, `readability.json`): no LK7 part glows, so by
  emission alone the hull's brightest pixel stays the filigree's gems (158 to 165, against the
  nose's 247) at every step. The step glows in `rigLook.json` are 0.61 to 0.74, each under the
  cap of 1 with the glint's 0.25. Lit, the pale steel plates raise the hull's brightest pixel to
  207-212 at tier 1 against the bare rig's 199 (the lit nose is 203 at tier 1, 253 at tier 3); that
  is lighting on steel, not emission, and the emissive map is what the cap is about.
- **Band names** (`rigLook.json` `card`, `hullLooks.json` `name`): fourteen data strings of two
  words; Progression and G&V may rename them in those two files.
- **Desktop and phone:** checked at 90 px/m and 30 px/m on the composites. The screenshots of the
  running game at every edge and two finish bands are `e2e/browser/rigLook.spec.ts`'s, which the
  Tester runs.

## Known limits

- The plating covers the pod's bands where it lies; at tier 3 the heavy hull's four bands show
  only above and below it. The lifting eyes stand in front of the dome's base plate, between
  its rivets, and in front of the twin-drum boiler's plate when #582's step is on.
- The hatch frame of the brass-trimmed and filigree looks lies over the neighbouring plates'
  edges; its sill runs along the plating's bottom edge inside the opening.
- The tail above 2280 (tint, glow, plating) is the wiring's, on the bossed skirt part.
- The skirt plates face the camera in front of the hips and thigh rams, as the look's sprite
  draws over the chassis; from the side they would hang clear of the legs.
