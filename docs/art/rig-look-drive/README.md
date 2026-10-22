# The drive rig-look parts: tracks and wheels per engine stage

The Blender source and review renders of
[Rig look: tracks and wheels art per engine stage (#731)](https://github.com/bjor2/steampunk-miner/issues/731),
wave 576-3A of [Rig look ladder and mineral skins (#576)](https://github.com/bjor2/steampunk-miner/issues/576):
the drive look of the rig. Since [#723](https://github.com/bjor2/steampunk-miner/issues/723) the
`engine` track is the only drive purchase, so the Game Director keyed the drive look on
`levels.engine` with the engine row's own thresholds and had the tracks and wheels **replace** the
engine's drive units on `chassis.drive` (GD rulings on #726 and #576 comment 6345096886; drill-speed
buys never move it). The stages are Systems' engine steps at 2, 18 and 26 purchases (comment
6300543785 on #157), the on-curve counts the player leaves planets 1, 5 and 8 with, named by
Progression Single piston, Triple flywheel and Guild turbine (6300549964); the linear tail above
the top step keeps every later purchase visible. The base rig's hub is the unnamed default.

**Wired by #726.** This ticket ships the asset: `rigLook.json`'s `lookAssets` names
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
file, and `art/blender/vehicle-look-drive/vehicle-look-drive.blend` is the source from now on (Git
LFS). The sheets below are the headless renders; the box's Blender MCP was not up in this session,
so the look-over was done on the renders at 512 px/m, in-game size and phone size.

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
| `guild-track` | 26, Guild turbine   | a guild-green enamel belt shod in brass, bronze frames with brass trim, enamel bosses, a glass window over a faintly lit blue core with four swept brass vanes |

The guild track's core is the one glow (emission 0.3, the engine turbine's, under a fifth of the
nose seams' 1.6), so the drill nose stays the brightest part of the rig with every look.

## Files

| File                       | What it is                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `parts.png`                | each part alone in the game's front view at 768 px/m                                                               |
| `tier-1.png`, `tier-3.png` | the rig at that tier, bare and with each look on the slot, 512 px/m, the nose lit as while drilling                |
| `tier-<n>.ingame.png`      | the same at 90 px/m, about what a 1080p screen shows at the default 12 m zoom                                      |
| `tier-<n>.phone.png`       | the same at a 360 px wide phone's 30 px/m over the 12 m zoom, enlarged 8x with no smoothing                        |
| `glow.png`                 | the tier-1 rig, bare and with each look, by its emission alone: what the emissive map carries                      |
| `outline.json`             | each look's silhouette cells outside the rig at tiers 1 and 3, inside and beyond the undercarriage window          |
| `readability.json`         | the phone-size pixels each step changes, and the nose's brightest pixel against the undercarriage's and the rest's |
| `driveLooks.json`          | the asset, its slot, its window, its parts with their step names and thresholds                                    |
| `author_drive_looks.py`    | wrote the first version of the source (Blender)                                                                    |
| `render_drive_looks.py`    | the renders above (Blender), on the casing driller review's frame and stage, draw order kept                       |
| `check_outline.py`         | writes `outline.json` (Blender); exits 1 when a look leaves the rig outline and the undercarriage window           |
| `sheet_drive_looks.py`     | lays the renders out into the sheets and writes `readability.json` (Pillow, numpy)                                 |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drive/author_drive_looks.py
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
