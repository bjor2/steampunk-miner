# The aetheric vehicle parts

The review renders of
[Art: aetheric parts Blender sources and renders, no wiring (#363)](https://github.com/bjor2/steampunk-miner/issues/363),
the art half of [#265](https://github.com/bjor2/steampunk-miner/issues/265) (build 7 of the
[GD lock on #245](https://github.com/bjor2/steampunk-miner/issues/245#issuecomment-6044368631)).
Each of the five aetheric items mounts a visible part, as the lock requires ("it shows on the
vehicle"), and this folder holds those parts' Blender sources and how they look on the rig.

**Art only.** Nothing here is wired: no attach-point ids, placeholder sidecars, manifest entries,
`r.artAssets` registration or vehicle piece. Those are the TD's and the wiring's (#265, with #314,
#250 and #235). The asset ids follow the slot-item rule in `src/systems/art/artIds.ts`
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
| `aethericParts.json`             | the items, their assets and parts, the GD's place and the review positions  |
| `author_aetheric.py`             | wrote the first version of the sources (Blender)                            |
| `render_aetheric.py`             | the renders above (Blender), on the tech gear review's rig and frame        |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/aetheric/author_aetheric.py [-- <id> ...]
blender -b --factory-startup --python-exit-code 1 -P docs/art/aetheric/render_aetheric.py [-- alone|rig]
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

## Known limits, for the wiring (#265)

- **No attach points.** The TD picks the ids and their `atM`; `stageAtM` and `nearPoint` only
  stage the renders. The whistle stands next to `hull.stack`, not at it, since the turret's
  barrels pass over the stack's top.
- **No export yet.** `npm run art:export` needs each id registered (`r.artAssets`) and a
  placeholder sidecar listing its part ids; both come with the wiring. The part ids are in
  `aethericParts.json`.
- The draw order is a suggestion: `z` 3 for the whistle (over the stack's 2), 9 for the lantern
  (with the drill hood), 6 for the rest (with the slot items).
- The rig parts are drawn for the tier-3 hull; on tier 1 and 2 the stack and boilers sit a little
  differently and the TD's attach points absorb that.
