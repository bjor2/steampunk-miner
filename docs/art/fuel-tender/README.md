# The coal tender

The Blender source and review renders of the rig half of
[Star map S5: map art pass (#758)](https://github.com/bjor2/steampunk-miner/issues/758), wave
647-6C of [the star map plan (#650)](https://github.com/bjor2/steampunk-miner/issues/650): the GD
lock shows the fuel tank as "a coal tender wagon on the #576 ladder". The tank track
([#756](https://github.com/bjor2/steampunk-miner/issues/756)) is its own price-only, uncapped
track outside `UPGRADE_IDS`, so its ladder is the kernel's, `src/data/vehicle/fuelTender.json`
(read by `fuelTenderLookOf`), and the wagon is a kernel vehicle piece, `FuelTenderPiece`, not a
rig-look row: a rig-look part never takes the wagon hitch (HS on #577), and a wagon's own visual
wins it.

Authored in Blender 4.2.9 on the shared box: `author_fuel_tender.py` wrote the first version of the
file, and `art/blender/vehicle-fuel-tank/vehicle-fuel-tank.blend` is the source from now on (Git
LFS); `author_fuel_tender_steps.py` fitted the three LK5 parts into it (ticket 813, below) and
`author_fuel_tender_p40_steps.py` the ten LK11 fittings (ticket 874, below). The sheets below are
the headless renders; the look-over was done on them at 512 px/m, in-game size and phone size.

## The parts

The asset is authored in its own frame with the wagon hitch, `hull.hitch`, at the origin, as the
tech gear is (#166), so the game draws a wagon at the hitch's `atM` from the vehicle sidecar with
no offset. The hitch is at (-0.52, -0.30) in the vehicle frame, under the stern behind the casing
arms and 0.18 m over the ground line the rollers stand on, so the wagon's two wheels stand on that
line and the wagon trails the rig to the left. Draw order `z` 0, behind every rig part (the hitch's
own `z` is 1, behind the pod). The asset id follows the #52 kebab form of the kernel fuel tank
item, `service:fuel_tank`, under the vehicle category.

Every wagon is one part: the brass hitch ring and drawbar at the origin, a riveted iron frame on
two small spoked rollers, and the step's body with its coal. The steps are tank levels; Systems'
per-planet threshold table has no tank column (the on-curve bot buys no tank level, #756), so the
levels are this pass's choice:

| Part             | Tank level            | Look                                                                                             |
| ---------------- | --------------------- | ------------------------------------------------------------------------------------------------ |
| `coal-cart`      | 1, the starting tank  | a low timber-plank bin on three iron straps, a small heap of coal                                |
| `bunker-tender`  | 2, the first purchase | a taller riveted iron-plate bunker under a brass rail, a full heap of coal                       |
| `riveted-tender` | 3                     | a steel bunker framed in brass with two rivet rows, a banded copper water tank with a brass dome |
| `guild-tender`   | 5                     | a guild-green enamel tender in a brass frame with ring filigree, twin coal bunkers, a lantern    |

Above level 18 (level 8 before ticket 874, level 5 before ticket 813) the log tail
(`fuelTender.json` `tail`, ticket 809) wears the top wagon in the next of ten named finishes per
purchase, painted as a glow of 0.35 in the finish's colour on the wagon's slot through the kernel's
vehicle look (`fuelTenderLookSource.ts`), under the rig body's cap of 1 so the drill nose stays the
brightest part, and the rig-look slice draws a finish badge with pips counting decades of tank
capacity (9 levels a decade; the art covers the first two, so the tail starts at 2 pips). The wagon
itself has no emissive map.

## The LK5 steps (ticket 813)

[LK5 (#813)](https://github.com/bjor2/steampunk-miner/issues/813), wave 647-7K of the P1-P5 map
#647: the GD lock of 24 Oct 14:54 wants at least 5 authored steps on every line, each a new outline
or an added part in a socket, never a recolour. The tender is exempt from the decade rule and keeps
one step per purchase, so the #758 wagons stay the first steps and each step here is the guild
tender with one more part fitted, one level a purchase, in the order the ticket named. The cards
are the hover line's band names, data strings of 3 words or fewer in `fuelTender.json`.

| Part                | Tank level | Card               | Adds                                                                                                                                          |
| ------------------- | ---------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `twin-tank-tender`  | 6          | `Second tank`      | a brass-banded copper water tank lying over the middle of the tender, a brass filler dome on its top                                          |
| `hopper-tender`     | 7          | `Coal hopper`      | a riveted iron-plate coal hopper, wide side up, over the left bunker between the lantern and the tank, braced, its brass rim heaped with coal |
| `glass-tank-tender` | 8          | `Sight glass tank` | a pale steel belly tank slung under the frame between the wheels on two iron straps, brass-banded, a water sight glass in brass fittings      |

**Where the parts sit (the socket).** The wagon trails the rig behind the stern, clear of the
rig's own outline, and the footprint the game lays out (the union of the four #758 wagons' boxes:
vehicle x -1.092..-0.492, z -0.48..0.008, `outline.json` `footprintM`) may not grow, so the parts
fill the room the guild tender leaves inside it: over the body top under the 0.31 m ceiling the
riveted tender's copper tank set (the second tank and the hopper), and under the frame between the
two wheels above the ground line (the belly tank). The one place the rig reaches the wagon is its
two casing arms, which reach back to vehicle x -0.733 over the wagon's stern end: the second tank
stops short of them (a first pass ran under them and hid 84 cells; `check_outline.py` refused it).

### Checks (24 Oct 2026)

- **Rig bounds, drill tip, footprint, collider** (`check_outline.py` → `outline.json`, 4 mm grid,
  tiers 1 and 3): every LK5 wagon adds **0 cells inside the rig** over the guild tender, has the
  same 390 cells behind the stern the guild tender has (the hitch ring and drawbar of every #758
  wagon), and its box stays inside the #758 footprint. The drill tip's drawing is untouched (the
  wagon is a `vehicle-fuel-tank` part at the hitch; `vehicle.blend` is untouched), and the collider
  is the code constant no art feeds.
- **Readable at 360 px and 1280+** (`readability.json`, wagon-footprint pixels each step changes
  against the step before, a channel moving > 24/255). At the closest zoom (8 m → 45 px/m on a 360
  px phone, where `rigLookSweep.spec.ts` judges one visible step as ≥ 16 px): second tank **33**,
  hopper **20**, belly tank **32** (tiers 1 and 3 alike), against the #758 steps' 189-236. At the
  default 12 m zoom (30 px/m) the wagon is an 18 by 17 pixel box and the steps move 14, 12 and 10.
  At 1280 px the parts are 3x larger again (`tier-1.ingame.png`).
- **Glow under the `rigBody` cap:** the wagon still ships no emissive map (`fuelTenderArt.test.ts`
  pins it), so the drill nose stays the brightest part by construction; the `brightest` readings are
  lit brass highlights on both, as in #758. The tail's finish glow is `fuelTender.json`'s 0.35.
- **Band names:** `Second tank`, `Coal hopper`, `Sight glass tank`: data strings of 2-3 words
  (`fuelTenderLook.ts` refuses longer ones in the tail; the spec checks the steps). Progression and
  G&V may rename them in `fuelTender.json`.
- **Desktop and phone**: checked by eye on `parts.png`, `tier-1.ingame.png` and `tier-1.phone.png`.
  Screenshots of the running game at each level are the Tester's (`e2e/browser/fuelTenderLook.spec.ts`).

## The LK11 steps (ticket 874)

[LK11 (#874)](https://github.com/bjor2/steampunk-miner/issues/874), wave 647-7Z of the P1-P5 map
#647: the GD lock of 25 Oct 06:48 (the LK6/LK7 pattern) reuses the LK1 input, parts added in
sockets, a fixed footprint and silhouette or part changes only, never a recolour; Systems' sizing
row of 06:53 wants at least 13 steps on every line through P40. The tender is exempt from the
decade rule (LK1, #809: one step a purchase, and no band edges to re-space), and the median bot
buys no tank level, so there is no owned-level trace to set thresholds from: the line is authored
through the second decade of tank capacity, levels 9 to 18 (seventeen steps, over the floor of 13),
so the finish tail starts with the third decade's pips. Each step is the sight-glass tender with
one more fitting, one level a purchase. The cards are the hover line's band names, data strings of
3 words or fewer in `fuelTender.json`.

| Part                 | Tank level | Card             | Adds                                                                                                                                     |
| -------------------- | ---------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `tooled-tender`      | 9          | `Stoker's tools` | a bright steel shovel on a timber haft hung from an iron hook, and a pick leaning head-up, on the right bunker's face                    |
| `plated-tender`      | 10         | `Works plate`    | a black-enamel works plate in a brass rim with corner rivets, a crest boss and two name bars, across the middle post                     |
| `lamped-tender`      | 11         | `Head lamp`      | a dark-iron head lamp with an amber lens in a brass rim and a short chimney, on the left bunker's face under the lantern                 |
| `piped-tender`       | 12         | `Feed pipes`     | a copper feed pipe along the frame's face with two brass unions, a brass injector with a steel wheel and an elbow down to the belly tank |
| `gauged-tender`      | 13         | `Water gauge`    | a brass-rimmed water gauge with a pale dial, three marks and a dark needle on the second tank's face                                     |
| `sprung-tender`      | 14         | `Leaf springs`   | a bright steel leaf spring pack of four leaves with an iron clamp and brass eyes over each wheel                                         |
| `guarded-tender`     | 15         | `Wheel guards`   | a bright steel mudguard arc on two iron stays over each wheel                                                                            |
| `screened-tender`    | 16         | `Coal screen`    | a bright steel slotted screen with corner rivets bolted over the hopper's mouth                                                          |
| `aether-tank-tender` | 17         | `Aether tank`    | a teal-glass aether tank in brass caps and straps with a filler boss, over the left bunker's foot band                                   |
| `aether-coil-tender` | 18         | `Aether coils`   | four teal-glass coils round the belly tank either side of its sight glass, and a teal feed line down from the aether tank                |

**Where the parts sit (the sockets).** LK5 filled the room over the body and under the frame, so
the LK11 fittings go on the faces the camera sees, standing out towards -Y where the orthographic
camera cannot tell the depth: the two bunkers' enamel faces, the middle post, the frame's face, the
wheels, the second tank's end, the hopper's mouth and the belly tank. The footprint (`outline.json`
`footprintM`) may not grow and does not: every fitting lies inside the sight-glass tender's own box.
The one place the rig reaches the wagon is its casing arms, which hang over the wagon's stern end
from asset x -0.22 and z 0.118 up (the outline check's rig silhouette, tiers 1 and 3 alike): a
wagon part there would hide behind the rig (the wagon draws at `z` 0), so the author script refuses
a new piece in that shadow, and the stoker's tools keep to the right bunker's near half and its
lower face. Each fitting is sized to move a 360 px phone's pixels at the closest zoom (a 45 px/m
pixel is 22 mm): bright steel over green enamel, black and brass over enamel, copper over the iron
frame, a pale dial over copper, teal glass over enamel and pale steel. A first pass had brass wheel
guards and a 14 mm pipe at 12 and 16 changed pixels: brass read as the foot band's own at phone
size, so the guards became bright steel on a wider arc and the pipe 17 mm with a larger injector.

### Checks (25 Oct 2026, LK11)

- **Rig bounds, drill tip, footprint, collider** (`check_outline.py` → `outline.json`, 4 mm grid,
  tiers 1 and 3): every LK11 wagon adds **0 cells inside the rig** over the guild tender, has the
  same 390 cells inside the rig the guild tender has (its stern end under the casing arms, as every
  wagon since the bunker tender), and its box stays inside the #758 footprint; the fittings lie on
  the faces, so the silhouette grows by 8 to 420 cells a step and the outline the game draws is the
  sight-glass tender's. The drill tip's drawing is untouched (`vehicle.blend` is untouched; the
  wagon is a hitch part), and the collider is the code constant no art feeds.
- **Readable at 360 px and 1280+** (`readability.json`, wagon-footprint pixels each step changes
  against the step before, a channel moving > 24/255). At the closest zoom (8 m → 45 px/m on a 360
  px phone, where `rigLookSweep.spec.ts` judges one visible step as ≥ 16 px): stoker's tools
  **47**, works plate 21, head lamp 24, feed pipes 21, water gauge 20, leaf springs **28**, wheel
  guards 18, coal screen 25, aether tank **29**, aether coils 19 (tiers 1 and 3 alike), against the
  LK5 steps' 20-33. At the default 12 m zoom (30 px/m) the wagon is an 18 by 17 pixel box and the
  steps move 4 to 16 (the works plate 4, the aether tank 16), as the LK5 steps move 10 to 14 there.
  At 1280 px the parts are 3x larger again (`tier-1.ingame.png`). The step-to-step counts are each
  fitting against the wagon before it, so no later fitting hides an earlier one at this size.
- **Glow under the `rigBody` cap:** the wagon still ships no emissive map (`fuelTenderArt.test.ts`
  pins it on the placeholder and the export); the aether glass is a bright teal material, not a
  glow, so the drill nose stays the brightest part by construction. The `brightest` readings in
  `readability.json` are lit brass highlights on both, as in #758. The tail's finish glow is
  `fuelTender.json`'s 0.35.
- **Look-only (Systems):** no kernel, state, save or digest change; `fuelTenderLook.ts` reads the
  table as before, and `rigLookLines.test.ts` plays a dock run buying across every line with the
  rig-look slice registered and looked at, or not, to the same digest. The byte-identical NDJSON
  replay on the running game is the Tester's (`rigLookPlanets.lane.test.ts` and the e2e specs).
- **Visible progress (Systems):** one step a purchase, so the line steps on every tank level bought
  up to 18 and wears a new finish on every purchase past it; the gap between band steps is set by
  how often the player buys a tank level, which no threshold here can re-space. The cadence lane
  logs tank buys per planet (the median bot buys none: the VS finding of LK1).
- **Band names:** ten data strings of 2 words in `fuelTender.json` (`card`); the spec refuses a
  card over 3 words. Progression and G&V may rename them there.
- **Desktop and phone**: checked by eye on `parts.png`, `tier-1.png`, `tier-1.ingame.png` and
  `tier-1.phone.png`. Screenshots of the running game at each level are the Tester's
  (`e2e/browser/fuelTenderLook.spec.ts`).

## Files

| File                               | What it is                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `parts.png`                        | each of the seventeen wagons alone in the game's front view at 768 px/m, six a row             |
| `tier-1.png`, `tier-3.png`         | the rig at that tier bare and with each wagon at the hitch, 512 px/m, the nose lit as drilling |
| `tier-<n>.ingame.png`              | the same at 90 px/m, about what a 1080p screen shows at the default 12 m zoom                  |
| `tier-<n>.phone.png`               | the same at a 360 px wide phone's 30 px/m over the 12 m zoom, enlarged 8x with no smoothing    |
| `readability.json`                 | the phone-size pixels each step changes at the default and closest zoom, the brightest pixels  |
| `author_fuel_tender.py`            | wrote the first version of the source (Blender); reads `src/data/vehicle/fuelTender.json`      |
| `author_fuel_tender_steps.py`      | fitted the LK5 parts into the source (Blender, re-runnable; ticket 813)                        |
| `author_fuel_tender_p40_steps.py`  | fitted the LK11 fittings into the source (Blender, re-runnable; ticket 874)                    |
| `check_outline.py`, `outline.json` | the wagons' silhouettes against the rig's and the #758 footprint (Blender; tickets 813, 874)   |
| `render_fuel_tender.py`            | the renders above (Blender), on the casing driller review's stage, framed wider to the left    |
| `sheet_fuel_tender.py`             | lays the renders out into the sheets and writes `readability.json` (Pillow, numpy)             |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/fuel-tender/author_fuel_tender.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/fuel-tender/author_fuel_tender_steps.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/fuel-tender/author_fuel_tender_p40_steps.py
npm run art:export -- vehicle-fuel-tank
blender -b --factory-startup --python-exit-code 1 -P docs/art/fuel-tender/check_outline.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/fuel-tender/render_fuel_tender.py [-- alone|rig]
python3 docs/art/fuel-tender/sheet_fuel_tender.py
```

The render needs the vehicle's `.blend` as a file, not its LFS pointer (`git lfs pull --include
art/blender/vehicle/vehicle.blend`).

## Checks (24 Oct 2026)

- **Four wagons modelled** (`parts.png`), one per step of the ladder; the author script refuses a
  part set that differs from the table, a hitch outside a wagon's bounds or a wheel under the
  ground line.
- **At the hitch, on the ground line** (`tier-1.png`, `tier-3.png`): every wagon stands behind the
  stern with its wheels on the rollers' line, at tier 1 and under tier 3's belly skirt alike, and
  nothing of it crosses the rig's own parts.
- **Distinct at 360 px** (`tier-1.phone.png`, `readability.json`): of the 304 phone pixels of the
  wagon's footprint, 100 change from the bare rig to the coal cart and 86, 101 and 102 between
  each later step and the one before (a channel moving by more than 24 of 255). Timber, grey iron,
  pale steel with a copper tank and teal enamel read as four wagons.
- **No glow of its own**: the wagon ships no emissive map, so the nose's lead is untouched; the
  `brightest` readings in `readability.json` are lit brass highlights on both, not emission.
- **Collision and hitbox unchanged**: the collider is a code constant no art feeds, and
  `vehicle.blend` is untouched.
- **Desktop and phone**: checked at 90 px/m and at 30 px/m on these sheets. Screenshots of the
  running game at each level are the Tester's.
