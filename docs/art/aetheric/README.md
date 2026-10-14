# The aetheric vehicle parts

The review renders of
[Art: aetheric parts Blender sources and renders, no wiring (#363)](https://github.com/bjor2/steampunk-miner/issues/363),
the art half of [#265](https://github.com/bjor2/steampunk-miner/issues/265) (build 7 of the
[GD lock on #245](https://github.com/bjor2/steampunk-miner/issues/245#issuecomment-6044368631)).
Each of the five aetheric items mounts a visible part, as the lock requires ("it shows on the
vehicle"), and this folder holds those parts' Blender sources and how they look on the rig.

The wiring is ticket 265: each part is a `signature` row of the tech-tree's `techGear.json` on its
own point (ticket 376), so the #250 rig draws it once its item is owned. The asset ids follow the slot-item rule in `src/systems/art/artIds.ts`
(`power.arc_coil` is `vehicle-item-power-arc-coil`), so the wiring registers them as they are.

Authored in Blender 4.2.9 on the shared box headlessly: `author_aetheric.py` wrote the first
version of every file, and the `.blend` files under `art/blender/<id>/` are the sources from now on
(Git LFS). `aethericParts.json` is the one table both scripts read.

## The parts

Each asset is authored in its own frame with its mount at the origin, as the tech gear is (#166).
A part that moves has its origin at its hinge or slide. Aether glass (a pale blue that glows) is
the one family the five share, so they read as one science at gameplay zoom.

| Asset (`vehicle-item-power-…`) | GD's place (#245)        | Near point      | Parts                                  | Look                                                                       |
| ------------------------------ | ------------------------ | --------------- | -------------------------------------- | -------------------------------------------------------------------------- |
| `resonance-whistle`            | on the boiler stack      | `hull.stack`    | `whistle-body`, `whistle-lever`        | a brass steam whistle teed off the stack; a pull lever and cord on its tap |
| `phase-lantern`                | on the nose              | `drill.hood`    | `lantern-frame`, `lantern-shutter`     | a caged aether lantern on a post, a lens looking +X; a sliding shutter     |
| `arc-coil`                     | twin coils on the roof   | `hull.roof.mid` | `coil-plinth`, `coil-aft`, `coil-fore` | two Tesla coils with toroid tops and spark balls on an iron plinth         |
| `chronometric-governor`        | escapement cage, rear    | `hull.roof.aft` | `escapement-cage`, `escapement-wheel`  | a three-ring gyro cage in a frame, an aether core; the escape wheel ticks  |
| `aether-condenser`             | condenser tank, on flank | `hull.liner`    | `condenser-tank`, `condenser-needle`   | a banded copper tank in saddles, an aether sight glass and a charge gauge  |

Moving parts, for the wiring to pose: the whistle lever turns on the tap, the lantern shutter
slides down off the glass, each coil can flicker or tilt from its own foot, the escape wheel turns
on its arbor, and the condenser needle turns on its gauge pin.

## Files

| File                             | What it is                                                                  |
| -------------------------------- | --------------------------------------------------------------------------- |
| `<id>.front.png`                 | the asset alone in the game's front view at 768 px/m                        |
| `rig.bare.png`, `rig.fitted.png` | the tier-3 rig (look-3 turret, dynamite rack) bare and with all five fitted |
| `rig.bare.ingame.png`, `-fitted` | the same at 90 px/m, about what a 1080p screen shows at the default zoom    |
| `rig.clearance.folded.png`       | the loaded rig and the five parts at their points, every extractor folded   |
| `rig.clearance.deployed.png`     | the same with every extractor deployed                                      |
| `clearance.json`                 | each part's overlaps with what can be drawn with it: none (ticket 376)      |
| `aethericParts.json`             | the items, their assets, parts and attach points, the GD's place            |
| `author_aetheric.py`             | wrote the first version of the sources (Blender)                            |
| `render_aetheric.py`             | the renders above (Blender), on the tech gear review's rig and frame        |
| `check_clearance.py`             | writes `clearance.json` (Blender); exits 1 on any overlap                   |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/aetheric/author_aetheric.py [-- <id> ...]
blender -b --factory-startup --python-exit-code 1 -P docs/art/aetheric/render_aetheric.py [-- alone|rig|bare|fitted|clearance]
blender -b --factory-startup --python-exit-code 1 -P docs/art/aetheric/check_clearance.py
```

## Hand checks (14 Oct 2026)

- **Every item has a model** (`<id>.front.png`, 5 assets): the five items of the #245 table.
- **Each sits where the GD put it** (`rig.fitted.png`): the whistle on the stack's fore side, the
  lantern on the hull's nose by the drill, the coils on the fore boiler under the turret, the
  escapement cage on the aft roof over the rack, the condenser on the lower flank. None hides the
  turret, the drill or a gauge.
- **They read at gameplay zoom** (`rig.fitted.ingame.png`): the first sketch-size pass was a few
  pixels each, so every asset was scaled up (1.3x, the lantern 1.6x) before these renders; the
  aether glass shows as blue points against the brass.
- Not looked over live in the MCP Blender: the review is the headless renders above, the same way
  #362 and #364 were reviewed.

## Attach points (ticket 376, 14 Oct 2026)

Each part has its own point (TD lock on #265), placed in `vehicle.blend` by
`scripts/art/place_vehicle_attach.py`. `rig.fitted.png` and both clearance renders now stand the
parts there. `stageAtM` in the table is where the first renders put them, and it overlapped the
tether reel, the echo sounder, a slot housing and the acid etcher.

| Point             | Part                  | `atM`         | `z` | Where it sits                                               |
| ----------------- | --------------------- | ------------- | --- | ----------------------------------------------------------- |
| `hull.stack.side` | resonance whistle     | (-0.15, 0.29) | 3   | teed off the foot of the second stack, on its fore side     |
| `hull.nose`       | phase lantern         | (0.28, 0.12)  | 6   | on the fore deck behind the periscope                       |
| `hull.roof.coils` | arc coil              | (-0.18, 0.10) | 6   | on the hull's roof plate, before the aft boiler             |
| `hull.tail`       | chronometric governor | (-0.31, 0.35) | 6   | on the aft stack, beside the echo sounder and over the rack |
| `hull.flank`      | aether condenser      | (0.06, -0.23) | 6   | low on the flank, over the track, below the slot housings   |

These are as near the GD's places as clearance allows. `check_clearance.py` finds every one of
them clear, in the front view, of every gear row folded and deployed, every slot housing in each
cradle, the turret at every look, the rack, the bore gun, the `hull.stack` showcase stack, the
`hull.liner` point and the other four parts. Even so, three of them sit away from the place the GD
named:

- **The nose tip is taken.** The hood extractor and the side cutters cover the hull's nose
  whenever they are owned, so the lantern stands on the fore deck.
- **The roof over the boilers is taken.** The tether reel, the turret pillar and the stacks leave
  no 0.27 m span, so the coils stand on the roof plate the boilers sit on.
- **The rear is taken.** The rack, its crates, the echo sounder and the acid etcher fill it, so the
  escapement cage rides the aft stack.

## Known limits

- The draw order is each part's `z` in its `.blend`: 3 for the whistle (over the stack's 2), 6 for
  the coils, the cage and the condenser, and 9 for the lantern, left from the hood place it no
  longer takes. Nothing overlaps it at `hull.nose` (`clearance.json`), so the 9 stays.
- The rig parts are drawn for the tier-3 hull; on tier 1 and 2 the stack and boilers sit a little
  differently. On tier 1 there is no second stack, so the whistle stands on the boiler's crown.

## The whistle ships first (#262), then the wiring (ticket 265)

The resonance whistle was exported ahead of the wiring: its item shipped in #262, and the TD on
#162 wants every item drawn at a power-up slot to ship a model (`assetLint.test.ts`). It was a
`slot` row, drawn at its slot's `hull.powerup.n`, until ticket 265 moved it to `hull.stack.side`
with the other four. Each of the four was exported with `art:export` from the `.blend` unchanged;
its placeholder sidecar is the export's own layout with no source hash, as the whistle's is. The
rig draws only registered items, so the lantern, coils, cage and condenser stay off the car until
#261 and #263 ship their items; the tech-tree's attach use names their points already.
