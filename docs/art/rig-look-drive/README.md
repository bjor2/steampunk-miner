# The drive rig-look parts: tracks and wheels per engine stage

The Blender source and review renders of
[Rig look: tracks and wheels art per engine stage (#731)](https://github.com/bjor2/steampunk-miner/issues/731),
wave 576-3A of [Rig look ladder and mineral skins (#576)](https://github.com/bjor2/steampunk-miner/issues/576),
and of the engine line's LK3 steps,
[LK3: engine look steps to 5+ (#811)](https://github.com/bjor2/steampunk-miner/issues/811), wave
647-7K of the P1-P5 map, and its LK8 steps to about P40,
[LK8: engine and drive look steps to P40 (#871)](https://github.com/bjor2/steampunk-miner/issues/871),
wave 647-7Z: the drive look of the rig. Since
[#723](https://github.com/bjor2/steampunk-miner/issues/723) the `engine` track is the only drive
purchase, so the Game Director keyed the drive look on `levels.engine` and had the tracks and wheels
**replace** the engine's drive units on `chassis.drive` (GD rulings on #726 and #576 comment
6345096886; drill-speed buys never move it). The stages were Systems' engine steps at 2, 18 and 26
purchases (comment 6300543785 on #157), named by Progression Single piston, Triple flywheel and
Guild turbine (6300549964); since LK1 ([#809](https://github.com/bjor2/steampunk-miner/issues/809))
they sit on the engine line's band edges of 5 (5, 10, 15), and LK3 (#811) fits two more parts on
the guild track at 20 and 25, the GD lock of 24 Oct 14:54: at least 5 authored steps on every line,
each a new outline or an added part in a socket, never a recolour. The finish tail above the top
step keeps every later band visible. The base rig's hub is the unnamed default.

**LK3 (#811):** the ticket names `art/blender/vehicle-look-engine/`, but that asset was retired by
#726 (the engine's drive units; [docs/art/rig-look-engine/](../rig-look-engine/README.md)), and the
engine line's art is this one, so the flywheel and the stacks are drive parts: `flywheel-track` and
`exhaust-track`, authored into this source by `author_drive_steps.py`.

**LK8 (#871):** the same holds for the fifteen steps from 30 to 100 (the GD lock of 25 Oct 06:48
and Systems' sizing row: at least 13 steps, so the median bot never goes more than 3 planets
without a band step through P40; every LK1 edge to 100 is authored, 20 steps). Each is the exhaust
track with one more part fitted in a socket, authored by `author_drive_p40_steps.py`: engine
fittings first, then heavier running gear, then the aetheric glows of the guild's drive. See
"The LK8 steps" and "Checks (25 Oct 2026, LK8)" below.

**Wired by #726**: the engine's three step rows name `iron-track`, `steel-track` and `guild-track` with `asset: "vehicle-look-drive"`, the parts join the track's glow slots so the tail paints them, and `vehicle-look-engine` is retired (its `.blend` kept as source). Below 2 purchases nothing is drawn, so `bare-hub` ships unused. #731 shipped the asset: `rigLook.json`'s `lookAssets` names
`vehicle-look-drive` with its four parts (registered through `r.artAssets`, ticket 640), the
manifest entry and placeholder sidecar are in, and `npm run art:export -- vehicle-look-drive` wrote
`public/assets/vehicle/vehicle-look-drive/` (4 parts, 512x512), so the load test
(`rigLookArt.test.ts`) sees the final art with no missing asset. The engine steps' rows still name
the drive units (`vehicle-look-engine`): the wiring points them at these parts, retires the drive
units and adds the parts to the track's glow slots so the tail paints them. `driveLooks.json` here
is the one table this folder's scripts share; the wiring keeps the registry's rows (#576
"Registry": data, not code). The asset id follows the #52 kebab form under the vehicle category,
`vehicle-look-<look>`, named for the slot's drive rather than the track, since
`vehicle-look-engine` is the drive units'.

Authored in Blender 4.2.9 on the shared box: `author_drive_looks.py` wrote the first version of the
file, `author_drive_steps.py` fitted the two LK3 parts into it (a re-run rewrites those two objects
and leaves the rest), and `art/blender/vehicle-look-drive/vehicle-look-drive.blend` is the source
from now on (Git LFS). The sheets below are the headless renders; the look-over was done on the
renders at 512 px/m, in-game size and phone size.

## The parts

The asset is authored in its own frame with the track's attach slot, `chassis.drive`, at the
origin, as the engine looks are (#586), so the game draws a part at the slot's `atM` from the
vehicle sidecar with no offset. The slot is the middle roller's hub: `vehicle.parts.json` puts it
and `t1-wheel-2` both at (0, -0.36), with the other rollers 0.32 m to each side, radius 0.12 at
tier 1 and 0.13 at tier 3, rolling as wheels (`partMotion`). No rig part stands on the slot (the
table's `replaces` is null), so a look lies over the undercarriage rather than replacing a part.
Draw order `z` 3: over the chassis's 2 (the legs' own hub caps sit at the slot), under the
thrusters' 4 and the armour's 5, which hang into the gaps between the rollers.

Each step is one part, the whole undercarriage, 0.88 by 0.24 m: a belt of 46 links running over
the three rollers **inside their own radius** (outer edge 0.118 m, inner 0.088 m, clear of the
roller's lugs), a cleat on every other link, a side frame in each gap between the rollers, a hub
boss on each axle over the leg's cap, and the engine stage's drive unit on the middle one. The belt
covers the rollers' treads and sits on the ground line they stand on; every roller's face inside
the belt is left open, so the rig's own rollers keep turning under the look with no wiring work.
The steps differ by what the belt, frames and hubs are made of, which is what reads at a phone's
size, and by the drive unit on the middle hub.

| Part          | Step                | Look                                                                                                                                                           |
| ------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bare-hub`    | 0, the default      | the leg's own brass hub cap and dark-iron axle nut, piece for piece (`leg_pieces` of the casing driller's author script), 1 mm proud: the rig is unchanged     |
| `iron-track`  | 2, Single piston    | a rubber belt with iron cleats, riveted iron-plate frames, brass hub bosses with dark-iron nuts, a brass steam cylinder lying along the axle's left            |
| `steel-track` | 18, Triple flywheel | a pale steel belt with brass cleats, dark steel frames under a brass rail, steel bosses with brass nuts, a six-spoked brass flywheel face on a steel rim       |
| `guild-track` | 15, Guild turbine   | a guild-green enamel belt shod in brass, bronze frames with brass trim, enamel bosses, a glass window over a faintly lit blue core with four swept brass vanes |

The steps' thresholds are LK1's edges (`driveLooks.json`; #731 drew them at 2, 18 and 26). The
LK3 steps (#811) are the guild track with one more part fitted in a socket, in the ticket's order:

| Part             | Step                    | Adds                                                                                                                                                                              |
| ---------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flywheel-track` | 20, Drive flywheel      | a brass-rimmed flywheel on the tail roller's axle, eight steel spokes from the hub boss, a dark-iron crank pin on the rim and a brass hub nut; the rim keeps inside the belt loop |
| `exhaust-track`  | 25, Twin exhaust stacks | twin dark-iron exhaust stacks on brass feet rising from the belt's top run either side of the thrusters, brass-banded, each under a brass spark-arrestor bonnet with a glowing    |
|                  |                         | ember mesh, a soot cap and three sparks over it                                                                                                                                   |

Why those sockets: a look may not leave the rig's silhouette or the undercarriage window, and the
thruster bells (`z` 4) are drawn over the look between the rollers, so the flywheel takes the tail
axle (its spokes open over the roller's turning face, inside the belt's inner edge) and the stacks
take the pod's belly either side of the thrusters, inboard of the outer legs' hips and clear of the
headlamp, where the pod's own outline covers them. Piston count is the existing steps' (Single
piston, Triple flywheel), so the new flywheel is the big side wheel of a traction engine, not a
third piston.

### The LK8 steps (#871)

Each step from 30 to 100 is the exhaust track with one more part fitted, in this order:

| Part               | Step                  | Adds                                                                                                                      |
| ------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `sprocket-track`   | 30, Drive sprocket    | a toothed brass drive sprocket with six steel spokes and a brass nut on the bow axle, mirroring the tail axle's flywheel  |
| `idler-track`      | 35, Idler wheels      | a brass-rimmed steel idler wheel with a dark-iron hub riding the belt's bottom run in each gap between the rollers        |
| `coupled-track`    | 40, Coupling rods     | a dark-iron crank pin with a brass rod end on each of the three axles and one steel side rod through them, a locomotive's |
| `guard-track`      | 45, Belt guards       | a pale steel guard plate with three dark-iron rivets over the belt's bottom run in each gap                               |
| `governor-track`   | 50, Spinning governor | a brass centrifugal governor on the keel bar between the thrusters: base, spindle, two steel arms and balls, a finial     |
| `cylinder-track`   | 55, Twin cylinders    | twin brass steam cylinders with iron end flanges and dark-iron glands lying along the belly over the governor             |
| `piped-track`      | 60, Steam lines       | a copper steam line from each cylinder's outer end out along the belly and down beside its stack's bonnet, brass unions   |
| `locker-track`     | 65, Side lockers      | a riveted dark-iron side locker with a brass hinge strip and hasp on the belly over each thruster's top                   |
| `lamped-track`     | 70, Running lamps     | a brass running lamp with an amber lens (lit) over each locker, inboard of the stack's bonnet                             |
| `geared-track`     | 75, Bull gear         | a toothed brass bull gear round the guild turbine's vanes, inside the belt loop                                           |
| `studded-track`    | 80, Belt studs        | a bright steel stud on every cleat round the belt, its crown at the roller's own radius                                   |
| `coiled-track`     | 85, Induction coils   | three copper induction coils round each stack's shaft, over the tier-3 skirt line                                         |
| `aether-hub-track` | 90, Aether hubs       | a glowing teal lens on each axle's hub and each idler's                                                                   |
| `haloed-track`     | 95, Wheel halos       | a glowing teal halo inside the sprocket's and the flywheel's rims and round the turbine's vanes                           |
| `aether-track`     | 100, Aether drive     | glowing teal strips along the side rod and the guards, and glowing rings round the cylinders' ends                        |

Why those sockets: the thruster bells (`z` 4, x ±0.119..0.221 m, from the belt's top run up to
0.19 m over the hub line) and the tier-3 belly skirt (`z` 5, 0.105 to 0.175 m over the hub line)
are drawn over the look, the window ends at the roller tops, and the stacks of LK3 take the belly
outside the thrusters, so what is left open is: the bow axle inside the belt loop (the sprocket;
the tail axle carries the flywheel), the lower half of each frame gap under the bells' reach (the
idlers), the line just under the axles across the whole loop (the side rod, 0.03 m under the hub
line, clear of the turbine window above and the idlers below), the belt's bottom run in the gaps
(the guards), the pod's belly between the thrusters over the keel bar and the middle leg's hip
(the governor from 0.225 m up, the cylinders at 0.385 m, under the look box's top at 0.42 m), the
belly over each thruster's top and inboard of the stacks (the lockers at 0.20 to 0.28 m, the lamps
over them), the ring round the turbine inside the belt (the bull gear), the cleats' faces (the
studs, whose crowns stay at the roller's radius so the ground line holds), the stacks' shafts
between the skirt line and their lower band (the coils), and the wheels' hubs and rims (the aether
glows). Every belly part keeps inside the pod's own silhouette (the pod's underside is 0.11 m over
the hub line at the belly, its caps curve up from there), so the rig's drawn outline does not grow;
the wheel parts keep inside the belt's inner edge (0.088 m). The side rod is the one part that
crosses the rollers' open faces; it is a 16 mm bar, so the rollers still turn visibly behind it.
The lamps' lenses and the aether glows are at the turbine core's emission (0.3), so the drill nose
stays the brightest part of the rig.

The guild track's core and the spark arrestors' mesh are the glows (emission 0.3, the engine
turbine's, under a fifth of the nose seams' 1.6), so the drill nose stays the brightest part of the
rig with every look.

## Files

| File                        | What it is                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `parts.png`                 | each part alone in the game's front view at 768 px/m                                                          |
| `tier-1.png`, `tier-3.png`  | the rig at that tier, bare and with each look on the slot, 512 px/m, the nose lit as while drilling           |
| `tier-<n>.ingame.png`       | the same at 90 px/m, about what a 1080p screen shows at the default 12 m zoom                                 |
| `tier-<n>.phone.png`        | the same at a 360 px wide phone's 30 px/m over the 12 m zoom, enlarged 8x with no smoothing                   |
| `glow.png`                  | the tier-1 rig, bare and with each look, by its emission alone: what the emissive map carries                 |
| `outline.json`              | each look's silhouette cells outside the rig at tiers 1 and 3, inside and beyond the undercarriage window     |
| `readability.json`          | the phone-size pixels each step changes at the default and the closest zoom, and the nose's brightest pixel   |
|                             | against the look's (the window and the belly strip) and the rest of the rig's                                 |
| `driveLooks.json`           | the asset, its slot, its window, its look box and belly strip, its parts with their step names and thresholds |
| `author_drive_looks.py`     | wrote the first version of the source (Blender)                                                               |
| `author_drive_steps.py`     | fitted the LK3 flywheel and exhaust stacks into the source (Blender, #811)                                    |
| `author_drive_p40_steps.py` | fitted the fifteen LK8 parts, 30 to 100, into the source (Blender, #871)                                      |
| `render_drive_looks.py`     | the renders above (Blender), on the casing driller review's frame and stage, draw order kept                  |
| `check_outline.py`          | writes `outline.json` (Blender); exits 1 when a look leaves the rig outline and the undercarriage window      |
| `sheet_drive_looks.py`      | lays the renders out into the sheets and writes `readability.json` (Pillow, numpy)                            |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drive/author_drive_looks.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drive/author_drive_steps.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drive/author_drive_p40_steps.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drive/check_outline.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drive/render_drive_looks.py [-- alone|rig|glow]
python3 docs/art/rig-look-drive/sheet_drive_looks.py
npm run art:export -- vehicle-look-drive
```

## Checks (23 Oct 2026)

Against the ticket's acceptance, with the numbers the scripts wrote:

- **One sprite set per engine stage** (`parts.png`): the bare hub and the three stages, at the
  engine row's thresholds 2, 18 and 26 (`driveLooks.json`), Systems' table. The tail above 26
  (tint, plating, glow through the registry's bounded ladders) is the wiring's, on the guild track.
- **Each part swaps on the track's slot** (`tier-1.png`, `tier-3.png`): every look stands on
  `chassis.drive` at (0, -0.36), the middle roller's hub, on the tier-1 rig the steps are bought on
  and on the tier-3 rig with its larger grousered rollers and belly skirt. The slot has no tiered
  part of its own, so the same four looks serve every rig.
- **Inside the rig and the undercarriage window** (`outline.json`): on a 4 mm grid, no look has a
  cell outside the union of the rig's silhouette and the window
  `[-0.44, -0.48, 0.44, -0.24]` (between the end rollers' outer edges, from the roller bottoms up
  to the roller tops) at tier 1 or 3; the belt's runs over the gaps between the rollers are the only
  cells outside the rig itself (2021 at tier 1, 1676 at tier 3, of about 5600 per look), and none is
  below the ground line the rollers stand on. The bare hub adds 0 cells to the tier-1 rig inside the
  window. The author script also refuses a part reaching past the window.
- **Collision and hitbox unchanged:** the vehicle collider is a code constant (`COLLIDER_M`, 0.9 m)
  that no art feeds, and `vehicle.blend` is untouched. The wiring's digest check (#726) is where
  byte-identity is proved on the running game, as #587's was for the drive units.
- **Reads at 360 px** (`tier-<n>.phone.png`, `readability.json`): at 30 px/m the undercarriage's
  footprint is 252 pixels (28 by 9), and each step changes these many of them from the look before
  it (a channel moving by more than 24 of 255):

  | Step                       | Changed of 252, tier 1 | Tier 3 |
  | -------------------------- | ---------------------: | -----: |
  | bare rig to bare hub       |                      0 |      0 |
  | bare hub to Iron track     |                     71 |     64 |
  | Iron track to Steel track  |                     96 |     61 |
  | Steel track to Guild track |                     84 |     64 |

  The rollers' dark treads go to a black belt with a lower band of iron frames, then to a pale
  steel loop, then to a green one: each step moves a quarter or more of the footprint, against the
  drive units' 15 to 20 of 42 (#586), since the belt and frames cover the whole undercarriage.

- **Reads at 1280 px and above** (`tier-<n>.ingame.png`, `tier-<n>.png`): at 90 px/m the links,
  cleats, rivets, rail and the drive unit on the middle hub show; at 512 px/m the spokes and the
  turbine's vanes.
- **The drill nose stays the brightest part** (`glow.png`, `readability.json`): by emission alone
  the nose's brightest pixel is 247 against the guild core's 115 (the other looks' 15 is the rig's
  own). Lit, no look raises the undercarriage's brightest pixel: 214 to 215 at tier 1 against the
  bare rig's own 217 there (the thrusters' brass bells hang into the footprint), 223 to 224 at
  tier 3 against 224, with the lit nose at 203 and 253.
- **Drill-speed buys never change this art:** nothing here reads a stat; the registry keys the
  look on the owned count of one track (#577), and the wiring keys it on `levels.engine`.
- **Load test:** `npx vitest run src/features/rig-look/systems/rigLookArt.test.ts` sees the asset as
  final with exactly the four parts, each with the slot at the origin; the asset lint
  (`src/systems/art/assetLint.test.ts`) sees every shipped map and the placeholder's part ids.

## Checks (24 Oct 2026, LK3)

Against #811's acceptance, with the numbers the scripts wrote:

- **Five authored steps on the first edges** (`driveLooks.json`, `rigLook.json`): 5, 10, 15, 20,
  25, the step of 5 LK1 froze for the engine; the line's 20 bands to about P40 continue on the
  finish tail over the exhaust track. Each new step is an added part, none a recolour, and the
  ticket's two parts are the only ones the rule adds (3 existing + 2 = 5).
- **Inside the rig outline** (`outline.json`): on a 4 mm grid the flywheel track and the exhaust
  track have 0 cells outside the rig and the undercarriage window at tier 1 and at tier 3; the
  flywheel stays inside the belt loop and the stacks inside the pod's silhouette (their cells
  outside the rig inside the window, 1995 and 2026, are the belt's, as before). The drill tip is not
  touched (the parts live on `chassis.drive` only), and the collider is the code constant
  (`COLLIDER_M`, 0.9 m) no art feeds.
- **Readable at 360 px** (`tier-<n>.phone.png`, `readability.json`): the pixels of the look box
  each step changes against the look before it, a channel moving more than 24 of 255. At the
  closest zoom (8 m, 45 px/m), where the sweep spec judges one visible step as 16 pixels: flywheel
  45, exhaust stacks 96 (tier 1); 37 and 60 (tier 3). At the default 12 m zoom (30 px/m): 22 and
  38 (tier 1), 16 and 27 (tier 3). The flywheel reads as a pale ring on the dark tail roller, the
  stacks as two dark verticals with brass caps up the belly.
- **The drill nose stays the brightest glow** (`glow.png`, `readability.json`): by emission alone
  the nose's brightest pixel is 247 against the look's 121 (flywheel track) and 131 (exhaust track,
  the spark mesh at 0.3; the guild core alone was 115, the other looks' 15 is the rig's own). Lit,
  the look's brightest pixel (the window and the belly strip, clear of the headlamp) is 215 at
  tier 1 against the bare rig's own 217 there and 225 at tier 3 against 224, the brass highlights
  of the bonnets and the rim under the key light, with the lit nose at 203 and 253. The step glows
  in `rigLook.json` rise 0.72 and 0.74, under the `rigBody` cap of 1 with the glint's 0.25.
- **Desktop and phone** (`tier-<n>.ingame.png`, `tier-<n>.phone.png`): checked at 90 px/m and at
  30 px/m. Screenshots of the running game at each step are the browser specs' (`rigLookEngine.spec.ts`
  and `rigLookSweep.spec.ts`), which the Tester runs.
- **Band names:** `Drive flywheel` and `Twin exhaust stacks`, data strings of 2 and 3 words in
  `rigLook.json` (`card`) and `driveLooks.json`; the table checks refuse longer ones.

## Checks (25 Oct 2026, LK8)

Against #871's acceptance, with the numbers the scripts wrote:

- **Step count and edges** (`driveLooks.json`, `rigLook.json`): twenty authored steps on every
  LK1 edge of 5 from 5 to 100, about P40 on the median path; at least the 13 Systems' sizing row
  asks for, so the median bot never goes more than 3 planets without a band step through P40.
  The five steps of #731 and LK3 stay the first steps; the fifteen LK8 parts follow, each an added
  part in a socket, none a recolour. The band rule, the edges and the finish cycle are LK1's as
  they were, so the economy and the thresholds do not move; above 100 the finish tail keeps the
  aether track. The PK7 trace (#826) is not on main yet, so the thresholds are LK1's frozen edges,
  and the cadence lane (`rigLookPlanets.lane.test.ts`) is where the 3-planet rule is measured.
- **Inside the rig outline and the undercarriage window** (`outline.json`): on a 4 mm grid every
  LK8 look has **0 cells** outside the rig and the window at tier 1 and at tier 3 (the cells
  outside the rig inside the window, 2108 to 2112 and 1732 to 1733, are the belt's, as before;
  the studs add 2 and the aether strips 2 at the belt's edge). The parts live on `chassis.drive`
  only, so the drawn drill tip is untouched (#789), and the collider is the code constant
  (`COLLIDER_M`, 0.9 m) no art feeds; `vehicle.blend` is untouched.
- **Readable at 360 px and 1280+** (`tier-<n>.phone.png`, `tier-<n>.ingame.png`,
  `readability.json`): the pixels of the look box each step changes against the step before it, a
  channel moving more than 24 of 255, untinted renders. At the closest zoom (8 m, 45 px/m on a
  360 px phone, where `rigLookSweep.spec.ts` judges one visible step as 16 pixels), tier 1 / tier 3:

  | Step (from)            | Closest zoom, tier 1 | Tier 3 | Default zoom, tier 1 | Tier 3 |
  | ---------------------- | -------------------: | -----: | -------------------: | -----: |
  | Drive sprocket (30)    |                   32 |     26 |                   13 |      9 |
  | Idler wheels (35)      |                    9 |      7 |                    1 |      2 |
  | Coupling rods (40)     |                   37 |     18 |                   16 |      2 |
  | Belt guards (45)       |                   13 |     13 |                   10 |      8 |
  | Spinning governor (50) |                   14 |     15 |                    3 |      6 |
  | Twin cylinders (55)    |                   12 |     14 |                    5 |      8 |
  | Steam lines (60)       |                   20 |     21 |                   10 |     10 |
  | Side lockers (65)      |                   33 |     29 |                   18 |     15 |
  | Running lamps (70)     |                   14 |     14 |                    2 |      4 |
  | Bull gear (75)         |                   27 |     23 |                   13 |      9 |
  | Belt studs (80)        |                    0 |      0 |                    0 |      0 |
  | Induction coils (85)   |                   12 |     13 |                    3 |      2 |
  | Aether hubs (90)       |                   10 |      9 |                    4 |      3 |
  | Wheel halos (95)       |                   39 |     33 |                   13 |     12 |
  | Aether drive (100)     |                   18 |     35 |                    0 |      0 |

  The sprocket, the rods, the steam lines, the lockers, the bull gear, the halos and the aether
  drive clear the line by geometry alone. The parts that are small by nature (a 22 mm idler, a
  26 mm lamp, 30 mm coils, 15 mm lenses) sit at 7 to 15 pixels: a 20 mm part is under a pixel at
  45 px/m, and the studs (7.5 mm domes) move no phone pixel at all; the guards, the governor and
  the cylinders are each 1 to 2 px tall there. A first authoring had the studs, lenses, lamps and
  strips smaller still (0, 6, 7 and 1); they were enlarged to what their sockets allow. In the
  game every band also wears its own tint and glow from `rigLook.json` on the whole look, which
  the sweep's crop diff sees and these renders leave out; whether that carries the small steps on
  a phone is the Tester's sweep and G&V's call (**finding for G&V**, as LK6 and LK7 found for
  their rivets and face parts). At 90 px/m (`tier-<n>.ingame.png`, a 1280 px desktop) every step
  reads on the rig: the idlers as pale discs under the thrusters, the lamps as amber dots over the
  lockers, the coils as copper bands on the stacks, the studs as a bright dotted belt edge.

- **Glow under the `rigBody` cap** (`glow.png`, `readability.json`): the lamps' lenses and the
  aether parts glow at the turbine core's emission (0.3). By emission alone the drill nose stays
  the brightest part: 245 to 246 against the look's 128 to 145 (the halos and the aether drive at
  145; the exhaust track alone was 131). Lit, the look's brightest pixel is 214 to 217 at tier 1
  against the bare rig's own 217 there, and 223 to 225 at tier 3 against 224, with the lit nose
  at 203 and 253. The step glows in `rigLook.json` are 0.74 on every LK8 step, the brightest LK3
  left under the `rigBody` cap of 1 with the glint's 0.25 (`rigLookTableChecks` refuses more).
- **Band names:** fifteen data strings of 2 words in `rigLook.json` (`card`) and
  `driveLooks.json`; the table checks refuse longer ones. Progression and G&V may rename them in
  those two files.
- **Look-only:** no kernel, state, save or digest change; `engineLooks.test.ts` pins the state
  digest byte-identical at the lowest and the highest look, and `rigLookLines.test.ts` plays a
  dock run buying across every edge with the slice registered and looked at, or not, to the same
  digest.

## Known limits

- **Tier 3's grousers stand outside the belt.** The belt keeps inside the tier-1 roller's 0.12 m
  so the rig's outline and ground line hold on every tier; the tier-3 roller is 0.13 m with its
  grousers at 0.124, so at 512 px/m their teeth show round the belt's edge (`tier-3.png`). At
  in-game and phone sizes they read as the belt's own cleats. A tier-3 belt is a follow-up if G&V
  want one; the registry's one part per step has no tier today.
- **The thrusters hang into the frames.** The thruster bells (`z` 4) cover the upper half of each
  frame plate between the rollers, as the game's draw order has it; the renders bring every rig
  part the game draws over the look forward along Y, so the sheets show what the game will.
- **The rollers turn, the belt does not.** The rig's own rollers spin inside the open loop; the
  belt's links are a still sprite. If the wiring wants a running belt, the links would need a
  part of their own per phase, which the registry's one-part swap does not carry.
- Below the first step the wiring can draw nothing or the bare hub; the bare hub exists so the swap
  is one rule for every step, not so the base rig changes.
- **The flywheel does not turn.** Like the belt it is a still sprite over the tail roller, whose
  own face keeps spinning between the spokes; at in-game and phone sizes that is not seen.
- **The side rod crosses the rollers' open faces.** It is the one LK8 part that does: a 16 mm steel
  bar 30 mm under the hub line (from 40 purchases), as a locomotive's side rod crosses its wheels;
  the rollers keep turning visibly above and below it. Like the belt and the flywheel it does not
  move.
- **The belt studs move no phone pixel by geometry.** 7.5 mm domes are a third of a pixel at
  45 px/m; at 90 px/m they read as a dotted belt edge. The step is an added part (23 studs round
  the loop), never a recolour; its phone read rests on the band's tint and glow, which the
  sweep's crop diff sees.
- **Tier 3's skirt covers the lockers' feet and the coils' lower ring.** The belly skirt (`z` 5)
  is drawn over the look from 0.105 to 0.175 m over the hub line; the lockers start at 0.20 m and
  the coils at 0.19 m, so the skirt's top edge brushes them on the tier-3 rig (`tier-3.png`).
- **The stacks stand in front of the belly.** The look draws at `z` 3 over the chassis's legs and
  keel, so the stacks read as mounted on the pod's belly in front of the hip joints; the thruster
  bells (`z` 4) are clear of them.
