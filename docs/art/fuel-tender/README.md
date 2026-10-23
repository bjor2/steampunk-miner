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
LFS). The sheets below are the headless renders; the look-over was done on them at 512 px/m,
in-game size and phone size.

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

Above level 5 the tail (`fuelTender.json` `tail`) tints the guild tender one palette colour per
purchase, cycling through six, painted as a glow of 0.35 on the wagon's slot through the kernel's
vehicle look (`fuelTenderLookSource.ts`), under the rig body's cap of 1 so the drill nose stays the
brightest part. The wagon itself has no emissive map.

## Files

| File                       | What it is                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `parts.png`                | each wagon alone in the game's front view at 768 px/m                                          |
| `tier-1.png`, `tier-3.png` | the rig at that tier bare and with each wagon at the hitch, 512 px/m, the nose lit as drilling |
| `tier-<n>.ingame.png`      | the same at 90 px/m, about what a 1080p screen shows at the default 12 m zoom                  |
| `tier-<n>.phone.png`       | the same at a 360 px wide phone's 30 px/m over the 12 m zoom, enlarged 8x with no smoothing    |
| `readability.json`         | the phone-size pixels each step changes, and the brightest pixel of the nose and the wagon     |
| `author_fuel_tender.py`    | wrote the first version of the source (Blender); reads `src/data/vehicle/fuelTender.json`      |
| `render_fuel_tender.py`    | the renders above (Blender), on the casing driller review's stage, framed wider to the left    |
| `sheet_fuel_tender.py`     | lays the renders out into the sheets and writes `readability.json` (Pillow, numpy)             |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/fuel-tender/author_fuel_tender.py
npm run art:export -- vehicle-fuel-tank
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
