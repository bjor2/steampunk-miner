# The tech gear: mounted items and power-up effects

The review renders of
[Art: Tech-unlocked drill gear and power-up VFX in Blender (#166)](https://github.com/bjor2/steampunk-miner/issues/166),
for section 5 of
[Spec: Tech-unlocked store items and power-ups (#162)](https://github.com/bjor2/steampunk-miner/issues/162)
and the Technical Director's vehicle sockets locked there (K5 #188). **This is not a vehicle
reskin:** every bought item shows as its own parts at the attach point it was given, and the
tree changes nothing else about the rig. Authored in Blender 4.2.9 on the shared box headlessly
(`scripts/art/author_tech_gear.py` wrote the first version of every file; the `.blend` files under
`art/blender/<id>/` are the sources from now on, Git LFS). The 29 assets are exported, listed in
the manifest and registered by the tech-tree slice (`r.artAssets`, #214); nothing draws them in
the game yet. The slice's `index.ts` exposes the table, the pose blend and the quads at the
sidecar's points (`vehicleGearQuadsOf`), and the effect looks (`fxFrameOf`), for the wiring
ticket to mount in a scene piece.

## What is here

Everything is placed by the data the game reads: a part sits at its attach point's `atM` from
`public/assets/vehicle/vehicle/vehicle.parts.json`, posed by the folded and deployed poses of
`src/features/tech-tree/techGear.json`, blended as `extractorPose.ts` blends them. Nothing in the
render script is hand-placed (TD acceptance 6).

| Asset                                   | Point                 | Parts                                                                  |
| --------------------------------------- | --------------------- | ---------------------------------------------------------------------- |
| `vehicle-item-rig-resonance`            | `drill.fork`          | `fork-yoke`; `fork-prongs` slide forward 11 cm to work                 |
| `vehicle-item-rig-containment`          | `drill.hood`          | `hood-rail` with three canisters; `hood-shell` drops from raised       |
| `vehicle-item-rig-acid-etcher`          | `hull.arm.left`       | `etcher-shoulder` with the acid tank; `etcher-arm` swings out and down |
| `vehicle-item-rig-induction`            | `hull.front`          | `coil-mount`; `coil-ring` swings down from flat against the nose       |
| `vehicle-item-rig-aether-tether`        | `hull.roof.mid`       | `tether-reel`; `tether-harpoon` rises to 60°                           |
| `vehicle-item-gear-<head>` (4)          | `drill.head`          | one bit each: cam hammer, heated crown, counter-rotating pair, ceramic |
| `vehicle-item-gear-spoil-auger`         | `drill.collar`        | `auger-collar`; `auger-screw` under the housing, pointing back         |
| `vehicle-item-gear-sampling-corer`      | `drill.collar`        | `corer-collar`; `corer-tube` punches 22 cm forward                     |
| `vehicle-item-gear-reach-boom`          | `drill.collar`        | `boom-collar`; `boom-sleeve` slides 18 cm forward                      |
| `vehicle-item-gear-side-cutters`        | `drill.flank`         | `cutter-bracket`; `cutter-arm`, drawn again mirrored below the axis    |
| `vehicle-item-power-grapple-winch`      | `hull.arm.right`      | `winch-drum`; `winch-hook` on its launcher, the code aims it           |
| `vehicle-item-power-echo-sounder`       | `hull.roof.aft`       | `sounder-hammer`; `sounder-horn` pointing up and back                  |
| `vehicle-item-passive-threat-periscope` | `hull.roof.fore`      | `periscope-mast`; `periscope-head` the code turns                      |
| `vehicle-cab-gauges`                    | `cab.gauge`           | `gauge-cluster` once; `dial-assay-lens`, `dial-hazard-barometer`       |
| `vehicle-item-power-<power-up>` (11)    | `hull.powerup.<slot>` | one module housing each, the item's signature detail on its face       |
| `vehicle-rack-crates`                   | `hull.rear`           | `crate-shelf` once; a `crate-<item>` per consumable; `mortar-tube`     |

Each extractor's cap, the one glowing piece, keeps the family colour of the table's `capColour`
(teal fork rings, ice canisters, acid sight glass, violet coil core, lilac reel lamp): verdigris
tints for horizontal unlocks, orange left to heat.

## Files

| File                                        | What it is                                                                                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `<id>.front.png`                            | the asset alone in the game's front view at 768 px/m                                                                                |
| `rig.folded.png`, `rig.folded-gray.png`     | the tier-3 vehicle with its turret, rack and every item mounted, extractors folded, 512 px/m                                        |
| `rig.deployed.png`, `rig.deployed-gray.png` | the same with every moving part at its working pose                                                                                 |
| `rig.<look>.ingame.png`, `-gray`            | the loaded rig at 90 px/m, about what a 1080p screen shows at the default 12 m zoom (#39)                                           |
| `rig.bare.png`                              | the vehicle, turret and rack alone, the silhouette baseline                                                                         |
| `rig.extractors.png`                        | the bare rig with only the five extractors, folded: the G&V silhouette case                                                         |
| `silhouette.json`                           | opaque pixels of each rig render and the folded and deployed ratios over the bare rig                                               |
| `unfold-<extractor>.gif`                    | the extractor unfolding over the 8-tick deploy and holding, framed on its point at 384 px/m; the frames under `clips/` are not kept |
| `fx-<effect>.gif`                           | each power-up effect drawn frame by frame from `fxFrameOf` (the brass block is the hull)                                            |
| `fx-frames.json`                            | the frames `dumpFxFrames.ts` printed for those clips                                                                                |
| `render_tech_gear.py`, `sheet_tech_gear.py` | the render (Blender) and sheet (Pillow) scripts                                                                                     |

## Hand checks (7 Oct 2026)

- **Every physical row has a model** (`<id>.front.png`, 29 assets): the five extractors, eight
  drill gear items, the winch, horn and periscope, both cab dials, the eleven slot housings and
  the twelve consumables, checked against the catalogue by `techGear.test.ts`.
- **Nothing is placed by hand** (`rig.folded.png`): the render puts each asset at the exported
  sidecar's `atM`, the same numbers `mountedGearQuadsOf` moves the quads by; the attach coverage
  rule passes over the table against both vehicle sidecars.
- **Folded extractors stay compact** (`silhouette.json`): with the five extractors owned and folded
  the rig's opaque pixels are 103.3% of the bare rig's (`rig.extractors.png` against
  `rig.bare.png`), inside the G&V 110%; the whole loadout with every slot filled is 114.8%
  folded and 115.6% deployed, which the rule does not cover. The slice's spec measures the
  extractor rule on the sidecars' part rectangles at a centimetre (103.4%, conservative).
- **Deploy reads as the signal** (`unfold-*.gif`): the prongs slide out, the visor drops, the
  arm swings, the coil comes down and the harpoon rises within the 8-tick deploy, each from a
  pose flat against the hull with its brass edge and cap in view.
- **The three magnet verbs read differently** (`fx-induction-free.gif`, `fx-shifter-drag.gif`,
  `fx-lodestone-gather.gif`): one cell pulled clean out at range, a few nodules tumbling to the
  hull, many drawing into one vein by a planted beacon.
- **The flare lobs up and back first** (`fx-flare-burn.gif`): the shell is above the hull for
  more than ten ticks before it arcs to the aim side and burns where it lands.
- Not looked over live in the MCP Blender: the shared instance was not listening on the box
  during this session (`ss -ltn` showed nothing on 9876, no display for the MCP add-on), so the
  review is the headless renders above, the same way #145 and #197 were reviewed.

## Known limits, for the wiring and the Game Director

- The drill heads are sized for the tier-2 bit; #180 makes `drill_tip` a finish on whichever
  head is equipped, so the head gear will want a size per visual tier when that lands.
- The consumable crates share the charge rack's point as shelves above it rather than editing the
  kernel's `vehicle-blasting-charges` source (one session, one slice); the wiring may fold them
  into that asset as the TD's table intends.
- The slot housings and the gauge dials have no lit state yet: a toggle's pilot lamp is a part
  the wiring can add when it has the toggled state to show.
