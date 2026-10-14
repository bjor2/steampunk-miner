# The bore gun mount

The review renders of
[Art: bore gun mount Blender sources and renders, no wiring (#362)](https://github.com/bjor2/steampunk-miner/issues/362),
the art half of [#315](https://github.com/bjor2/steampunk-miner/issues/315), for the
[GD decision on Spec: Planet-1 ground weapon (#309)](https://github.com/bjor2/steampunk-miner/issues/309):
"a brass bore gun on the rig", visible once bought because a major unlock shows on the vehicle
(design 37.7). Authored in Blender 4.2.9 on the shared box headlessly
(`scripts/art/author_bore_gun.py` wrote the first version; the `.blend` under
`art/blender/vehicle-bore-gun/` is the source from now on, Git LFS).

#362 exported, listed and registered nothing. The wiring (#315) did: the `ground-gun` slice
registers the asset through `r.artAssets`, hangs it at `hull.front` and turns the barrel to the
aim (`src/features/ground-gun/systems/render/boreGunLook.ts`), and the export ships in
`public/assets/vehicle/vehicle-bore-gun/`. The casing lining, the other half of #315, is in
[../casing-lining/](../casing-lining/README.md): it goes through the #298 terrain channel.

## What is here

| Asset              | Parts                                                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vehicle-bore-gun` | `t1-bore-mount`, a riveted iron saddle that bolts to the hull, with the brass trunnion ring under it; `t1-bore-barrel`, the gun, pivoting on that trunnion, the code turns it |

- **Frame.** Authored in its own frame with the mounting point at the origin, like the other gear
  (K5: gear is drawn at its attach point's `atM`), so whichever point the TD gives it places it
  with no offset in code. The mount's pivot is the bolt plate's centre (the origin); the barrel's
  pivot is the trunnion at (0, -0.108). No `attach.*` empties are written: those ids are the TD's.
- **Rest pose.** The barrel rests along +X, the facing bearing (the #309 tap and idle aim). The
  wiring turns it down through the arc, horizontal to 60° below, mirrored with the rig's facing.
- **Size.** Mount 0.20 × 0.18 m; barrel 0.46 × 0.22 m, reaching 0.36 m ahead of the trunnion.
  Drawn at 1:1.2 over the first pass (`GUN_SCALE`), because at 1:1 the tube was 3 px thick at play
  zoom.
- **Draw order.** `z` 8 (mount) and 9 (barrel), over the hull's parts and under the auto guns'
  turret (10-12), which sits on the chassis top and never overlaps it. The wiring may re-order it
  against the drill head at its final point.
- **Look.** A heavy gunmetal bore tube in brass bands, the last band glowing as if hot from the
  shot (the one emissive material), and a toothed steel crown at the muzzle: the gun opens rock,
  so its mouth reads as a cutter, not a cannon. Behind the trunnion, a breech block with a copper
  steam feed; under it, the charge drum each shot spends; over the tube, a ring sight on a post.
  Same palette and pieces as the platform and the auto guns (`author_platform.py`).

The five zones of the barrel are where the #310 modules hang (`bore.sight`, `bore.breech`,
`bore.barrel`, `bore.muzzle`, `bore.magazine` in the #310 node table), so each module has a place
to sit when the TD names the points. In the barrel's frame (metres from the trunnion, the barrel
at rest):

| Zone     | Centre           | What sits there today           |
| -------- | ---------------- | ------------------------------- |
| sight    | (0.144, 0.079)   | the ring sight on its post      |
| breech   | (-0.042, 0.0)    | the breech block and steam feed |
| barrel   | (0.156, 0.0)     | the banded tube                 |
| muzzle   | (0.312, 0.0)     | the toothed crown               |
| magazine | (-0.036, -0.072) | the charge drum                 |

## Files

| File                                                         | What it is                                                                                      |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `gun.arc.png`, `gun.arc-gray.png`                            | the gun alone at 0°, 30° and 60° below horizontal (the arc's ends and middle) at 768 px/m       |
| `gun.three-quarter.png`                                      | the same from front-right and above, to show the relief the flat view only hints at             |
| `rig.tier-1.png`, `rig.tier-3.png` and their `-gray` twins   | the gun on the tier-1 and tier-3 rig at 512 px/m, aimed 30° down, at the review placement below |
| `rig.tier-1.ingame.png`, `rig.tier-3.ingame.png` and `-gray` | the same at 90 px/m, about what a 1080p screen shows at the default 12 m zoom (#39)             |
| `render_bore_gun.py`, `sheet_bore_gun.py`                    | the render (Blender) and sheet (Pillow) scripts                                                 |

The review placement (`REVIEW_MOUNT_AT` in the render script) hangs the mount on the hull's front
face under the drill head, at (0.47, -0.12) in the vehicle frame, near `hull.front`: the barrel
then swings below the drill and in front of wheel 3 across the whole arc. It is only where these
renders put it; the point is the TD's.

```
blender -b --factory-startup --python-exit-code 1 -P scripts/art/author_bore_gun.py      # ~5 s
blender -b --factory-startup --python-exit-code 1 -P docs/art/bore-gun/render_bore_gun.py  # ~30 s
python3 docs/art/bore-gun/sheet_bore_gun.py
```

## Hand checks (14 Oct 2026)

- **The arc** (`gun.arc.png`): at 0°, 30° and 60° the barrel turns about the trunnion inside the
  brass ring, and the breech, drum and sight turn with it. At 60° the breech's back rises into the
  saddle's legs: behind them in depth in the render, over them in the game, where the barrel's
  `z` 9 draws over the mount's 8. Either reads as a gun turning in its cradle.
- **On the rig** (`rig.tier-1.png`, `rig.tier-3.png`): the saddle sits on the chassis' front edge
  under the drill, and the barrel aimed 30° down clears the drill head and wheel 3 at both tiers;
  the tier-3 drill's teeth overlap the saddle's top, which the draw order decides in the game.
- **Play size** (`rig.tier-1.ingame.png`, about 40 px of gun on a 90 px rig): the gun reads as a
  grey tube with a brass crown under the nose, apart from the brown hull and the wheels; in
  grayscale it stays a lighter bar against the dark background and the wheel.
- **Pivots** (`t1-bore-mount` at the origin inside the bolt plate, `t1-bore-barrel` at the
  trunnion inside the brass ring) lie inside their meshes, as the exporter requires; each part is
  one mesh, nothing is rigged.
- Looked over in the headless renders above; not exported, so the atlas bake is unchecked until the
  wiring exports it.
