# Casing driller (the player vehicle)

The player vehicle of
[Art: new player vehicle — compact casing driller (Blender MCP), replaces current machine (#393)](https://github.com/bjor2/steampunk-miner/issues/393),
from the concept Bjor approved on 14 Oct 2026 (`casing-driller-ref.jpg`). It replaced the S7a
box-and-wheels machine in place: the asset is still `vehicle`, the source is still
`art/blender/vehicle/vehicle.blend` (Git LFS), and the export still ships in
`public/assets/vehicle/vehicle/`. The old machine's meshes, materials, atlas and maps are gone;
nothing of it is left unused.

`author_casing_driller.py` wrote the first version of the new parts into the vehicle's own
`.blend`, keeping its 32 `attach.*` empties where they were. From now on the `.blend` is the
source: change the art in Blender and re-export with `npm run art:export -- vehicle`.

## The parts

The part ids and tiers are the S7a ones, so the Workshop milestones (`swap.part`), the slices'
part requests and the debug API keep working; each slot is re-cast on the new hull. Two part
names are new (`art/asset-rules.json`), with their motion in `src/systems/render/partMotion.ts`.

| Slot            | Tiers | The casing driller's piece                                                         | Motion (partMotion)                      |
| --------------- | ----- | ---------------------------------------------------------------------------------- | ---------------------------------------- |
| `chassis`       | 1, 3  | the riveted bronze pod, its steel keel and the three articulated legs              | squashes on landing, recoils on a hit    |
| `wheel` (×3)    | 1, 3  | a tracked roller at each leg's foot (0.24 m, 0.26 m at tier 3)                     | rolls with the ground speed              |
| `boiler`        | 1     | the brass pressure dome: gauges, the driver's viewport, a valve                    | breathes; bobs with the load             |
| `boiler-2`      | 3     | a second pressure tank on the fore deck                                            | as the boiler                            |
| `stack` (×2)    | 1-3   | the exhaust stacks behind the dome                                                 | none                                     |
| `hopper`        | 1     | the ore hatch on the fore deck                                                     | none                                     |
| `motor-housing` | 1     | the gimbal's drive rings on the bow                                                | none                                     |
| `piston`        | 1     | the steam ram beside the hatch                                                     | pumps with thrust                        |
| `headlamp`      | 1-3   | the warm lamps (a rear one at tier 3)                                              | flickers                                 |
| `armour-plate`  | 2, 3  | bow and stern shields; tier 3's belly skirt over the hips                          | none                                     |
| `drill-head`    | 1-3   | the gimbal collar and the stepped drill cone, its seams glowing                    | swivels (DrillHeadView); glows with load |
| `drill-bit`     | 1, 3  | the cutter crown at the tip; tier 3's reamer ring round the cone (the bore collar) | turns per drilling tick; glows with load |
| `thruster` (×2) | 1     | **new:** the brass vectored thrusters under the belly                              | **new:** glows while thrusting           |
| `casing-arm`    | 1     | **new:** the two rear arms, one holding a casing ring, one the cement gun          | **new:** swings once as a ring is laid   |

- **Frame.** The #52 conventions: 1 unit = 1 m, the chassis centre at the origin, the drill
  towards +X, the camera along +Y. The body keeps the S7a envelope (about 0.92 × 0.51 m, rollers
  at z -0.36), so the 0.9 m collider, the preview framing and every attach point still fit it.
- **The nose.** The head's origin is its bounds' centre, at (collider + head width) / 2 ahead,
  where `DrillHeadView` draws it facing right; it swivels round the body to all four facings. The
  head grows with the tier (0.33, 0.35, 0.43 m).
- **Glow.** The emissive map carries the nose seams and crown core (orange), the thruster plugs
  (blue-white) inside their orange lips, and the lamp lenses. At rest the thruster plug and lip
  are dark steel in the albedo; partMotion turns the emission up while thrusting and drilling.
  The nose glows in the sparks' colour, the thrusters white so the map's own colours show
  (`glowColourOf`).
- **Casing arms.** They hang behind the pod (draw order 1) from shoulders at (-0.36, 0.04) and
  (-0.38, -0.14). The `casingHiss` cue, the one the cement spray and the hiss play on, swings
  both down to the bore wall and home over `CASING_ARM_SECONDS`.
- **Draw order.** Rollers, stacks and arms 1; the pod 2; dome, hatch, drive rings, tank 3; lamps,
  ram and thrusters 4; armour 5; the tier-3 reamer 7; the head 8; the crown 9. The modules
  (auto guns 10-12 and the slices' gear) draw over all of it.

## Mounts

The 32 attach points (`vehicle-attach`, #162) did not move. `fitted.png` is the tier-3 rig with
every module the tech gear review mounts (the turret, the charge rack, every extractor, drill
gear, passive and the five slot housings, folded), each at its point from the exported sidecar:
they still sit on the new hull. The bore gun (`hull.front`) and the Armoury modules hang from
points that did not move either.

## Files

| File                       | What it is                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `casing-driller-ref.jpg`   | the approved concept                                                                      |
| `tiers.png`                | the three visual tiers at rest, 512 px/m                                                  |
| `states.png`               | tier 1 driving, flying with the thrusters lit, setting a casing ring, and drilling 4 ways |
| `states.ingame.png`        | the same at 90 px/m, about what a 1080p screen shows at the default 12 m zoom (#39)       |
| `turnaround.png`           | the drill swivelling from right to left through up, the short way a half turn takes       |
| `fitted.png`               | tier 3 with every module mounted at its attach point                                      |
| `author_casing_driller.py` | wrote the first version of the parts into `vehicle.blend`                                 |
| `render_casing_driller.py` | the review renders (Blender), posed as the code poses the parts                           |
| `sheet_casing_driller.py`  | lays the renders out into the sheets (Pillow)                                             |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/casing-driller/render_casing_driller.py  # ~6 min
python3 docs/art/casing-driller/sheet_casing_driller.py
```
