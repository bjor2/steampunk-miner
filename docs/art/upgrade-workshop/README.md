# Upgrade workshop (Engineering Works)

The upgrade workshop of
[Art: upgrade workshop building — steampunk hangar (Blender MCP), replaces Engineering Works (#395)](https://github.com/bjor2/steampunk-miner/issues/395),
from the concept Bjor approved on 14 Oct 2026 (`upgrade-workshop-ref.jpg`). It replaced the #174
sawtooth hall in place. The asset is still `platform-building-upgrade`, the source is still
`art/blender/platform-building-upgrade/platform-building-upgrade.blend` (Git LFS), and the export
still ships in `public/assets/platform/platform-building-upgrade/`. None of the hall's meshes,
materials or maps are left.

`author_upgrade_workshop.py` wrote the first version over the old `.blend`. From now on the
`.blend` is the source: change the art in Blender and re-export with
`npm run art:export -- platform-building-upgrade`.

## The building

A towering brass-and-iron hangar, 10.4 m wide and 9.7 m tall at its tallest stack, so it still
reads wider than tall against the Sell building's silhouette.

- **The door.** The front is a huge arched door, 6.9 m wide, with straight jambs up to a 4.05 m
  springline and a half-ellipse crown at 5.8 m. Its riveted brass arch is studded with warm lamps
  and big rivets in turn, with a bronze keystone that has a lamp in it. The door clears the
  showcase rig (#182): the rail hangs at 3.3 m, 6.4 m long and 4.0 m at its top.
- **Inside the door.** The back wall shows two racks. The left one holds spare stepped drill
  heads (the casing driller's nose) and bronze armour plates; the right one holds vectored
  thruster bells, collars and plates. Between them is a riveted pressure hatch, and above them
  copper steam pipes and gauges, a rose window with gear tracery, four small arched clerestory
  windows, and two lamps hung from the vault above the rail.
- **The towers and the roof.** Riveted iron storeys banded in brass flank the door, with amber
  arched windows, portholes, copper downpipes, a lantern each side of the door and cogwheels on
  the facade. The left tower carries two smokestacks with brass bands and crowns. Over the door a
  soot plaque in a brass frame reads **ENGINEERING WORKS**, the game's own name for the building;
  the concept's "Aetherdrill Upgrade Works" sign is not used. The plaque is crested with the bay's
  #158 emblem (wrench and gear) inside a brass cogwheel. Right of the plaque the facade steps down
  to a shoulder, which with the right tower's railed roof makes the stepped terrace the drone
  hangar (#197) stands on.

The palette is the casing driller's (ticket 393) bronze and brass on the shop buildings' iron and
soot. The only light is warm glass (windows, lamps, the plaque's letters, the turntable's rim
lamps), so orange stays reserved for heat (#170). The building has no lit or unlit state: the game
draws building parts at zero emissive intensity, as it did the hall, and the glass reads lit from
its pale albedo.

## Parts, attach points and idle motion

| Part                        | What it is                                                      | Idle motion (dock-buildings slice)                                                   |
| --------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `platform-building-upgrade` | the static shell, everything above                              | the steam from its stacks (particles off `workshop.stack`, `WorksSteam.tsx`)         |
| `workshop-gantry`           | a jointed arm folded up under the vault, pivot at its root      | sways a couple of degrees about the root bearing (`gantrySwayAt`)                    |
| `workshop-turntable`        | a 3.6 m iron drum with brass rings, 0.16 m over the pad, origin | turns once every 48 s; eases to a stop while a car is docked on it (`turntableSpin`) |

| Attach point            | Where (m)     | Read by                                                      |
| ----------------------- | ------------- | ------------------------------------------------------------ |
| `workshop.platform`     | (0, 0)        | the auto-roll (#170) and the showcase rig's origin (#182)    |
| `workshop.showcase_cam` | (0, 1.8)      | the docked camera                                            |
| `workshop.gantry`       | (−2.45, 4.85) | the gantry's root bearing                                    |
| `workshop.stack`        | (−4.6, 9.65)  | the steam's vents (ticket 395); the second vent hangs off it |

- **The turntable turns on flat art.** The baked band is the drum seen side on. The slice draws it
  in 96 vertical strips and remaps their texture coordinates each frame: a point across the band
  sits on the drum at `asin(2 × share − 1)`, and after a turn it shows the rim that stood that far
  behind. The rim repeats every 15° (a lamp, then a brass strap, with one lamp facing the camera),
  so only the turn's remainder within a period matters, and the lamps travel round with no seam
  and no shader.
- **Motion effects off** (#33) holds the turntable and the arm still. The steam still rises, as the
  Refinery's smoke does.
- The numbers (turn period, ease, sway, the vents' rates, puffs and look) are in
  `src/features/dock-buildings/worksIdle.json`. `steampunkDebug.features['dock-buildings'].getWorksIdle()`
  reports the turn, its speed, the sway and the live steam.

## Fit

- **The car and the rig** (`fitted.png`): the casing driller parks on the turntable under the
  showcase rig. The rail hangs inside the door clear of the arch band and the hanging lamps, the
  gantry arm stays above the rail, and the rig's arms hang clear either side of the car.
- **The add-ons** (`host.desktop.png`): the research annex (P15) stays at its old offset behind
  the shell, and its dome, condenser and orrery rise over the left roof between the stacks and the
  crest. The drone hangar (P20) moved from (1.9, 5.6), which would have covered the plaque, to
  (3.75, 7.22) on the terrace: its short legs stand on the shoulder and its long ones on the
  tower roof (`dockAddOns.json`).
- **The atlas** is 4096 × 4096. At the platform's 256 px/m, the 9.7 m shell no longer fits the
  hall's 4096 × 2048.

## Files

| File                                        | What it is                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `upgrade-workshop-ref.jpg`                  | the approved concept                                                                           |
| `front.png`, `three-quarter.png`            | the hangar alone in the game's front view at 128 px/m, and from front-right and above          |
| `fitted.png`                                | the casing driller on the turntable under the showcase rig, at 128 px/m                        |
| `host.desktop.png`, `host.desktop-gray.png` | the hangar with the annex and the drone hangar and the car at 1080p's 90 px/m, colour and gray |
| `host.phone.png`, `host.phone-gray.png`     | the same at the #173 phone's 32.5 px/m (390 CSS px over the 12 m zoom)                         |
| `host.silhouette.png`                       | the render's coverage alone, ink on parchment                                                  |
| `idle.motion.png`                           | four idle frames: the turntable a quarter rim period further each, the gantry swaying          |
| `ingame.docked.png`                         | the dev build docked at the Works at the 20 m zoom (canvas only): the turntable held, steam up |
| `author_upgrade_workshop.py`                | wrote the first version of the `.blend`                                                        |
| `render_upgrade_workshop.py`                | the review renders (Blender)                                                                   |
| `sheet_upgrade_workshop.py`                 | the gray, phone and silhouette sheets and the idle strip (Pillow)                              |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/upgrade-workshop/render_upgrade_workshop.py  # ~6 min
python3 docs/art/upgrade-workshop/sheet_upgrade_workshop.py
```

## Hand checks (14 Oct 2026)

- **Looked over live** in the shared Blender through the MCP before the export (front and
  three-quarter views, materials).
- **In the dev build** (headless Chromium on SwiftShader, `ingame.docked.png`): the hangar stands
  over the Workshop zone beside the Exchange. Its sign, emblem, racks and arch lamps read at the
  20 m zoom. Undocked, `getWorksIdle()` showed the turntable at its idle speed (0.13 rad/s) and
  37 to 89 live steam puffs. Docked, the turn eased to 2e-5 rad/s within 10 s while the car stood
  on the turntable. The stack plumes read against the dusk sky once they were 12 px at 0.6
  opacity.
