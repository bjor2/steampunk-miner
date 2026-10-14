# The armoury module mounts

The review renders of
[Art: armoury module mounts Blender sources and renders, no wiring (#364)](https://github.com/bjor2/steampunk-miner/issues/364),
the art half of [#321](https://github.com/bjor2/steampunk-miner/issues/321) (build 5 of the GD
decision on [Spec: Per-weapon tech trees (#310)](https://github.com/bjor2/steampunk-miner/issues/310)).
Every module of the two Armoury lanes (builds 2 and 3) has a Blender source, so each can be mounted
visibly on its gun once bought, and each carries the gilded plate a Mastered module shows.

**Art only.** Nothing here is wired: no attach-point ids, placeholder sidecars, manifest entries,
`r.artAssets` registration or vehicle piece. Those are the TD's and the wiring's (#321, with #314,
#250 and #235). The asset ids follow the vehicle-item rule in `src/systems/art/artIds.ts`
(`weapon.gimbal_sight` is `vehicle-item-weapon-gimbal-sight`), so the wiring registers them as they
are.

Authored in Blender 4.2.9 on the shared box headlessly: `author_armoury.py` wrote the first version
of every file, and the `.blend` files under `art/blender/<id>/` are the sources from now on (Git
LFS). `armouryMounts.json` is the one table both scripts read.

## The modules

Each asset is authored in its own frame with its mount at the origin, as the tech gear is (#166).
A bore module's gun fires along +X; a turret module's along -X, since the auto guns rest pointing at
the rear. A part that moves has its origin at its hinge.

| Asset (`vehicle-item-weapon-…`) | Content's mount | Parts                         | Look                                                         |
| ------------------------------- | --------------- | ----------------------------- | ------------------------------------------------------------ |
| `gimbal-sight`                  | `bore.sight`    | `sight-gimbal`, `sight-scope` | a scope in two brass gimbal rings on a post; the scope turns |
| `steam-sear`                    | `bore.breech`   | `sear-block`, `sear-lever`    | a sear plate with a steam cylinder and gauge; a trip lever   |
| `long-barrel`                   | `bore.barrel`   | `barrel-sleeve`               | a forged iron sleeve over the fore barrel, ribbed per length |
| `rifled-bore`                   | `bore.barrel`   | `rifled-jacket`               | a steel jacket by the breech with a raised brass helix       |
| `splay-choke`                   | `bore.muzzle`   | `splay-choke`                 | a slotted brass choke with two splayed lips                  |
| `earthing-spike`                | `bore.muzzle`   | `earthing-spike`              | a coil-wound copper spike under the barrel, past the muzzle  |
| `cementing-round`               | `bore.magazine` | `cement-magazine`             | a drum under the breech, cement-grey rounds in its window    |
| `strut-bore`                    | `bore.magazine` | `strut-rack`                  | three iron struts clipped under the barrel                   |
| `fire-director`                 | `turret.*`      | `director-box`                | a brass rangefinder on the cupola, a lens each end, a dial   |
| `sentry-cam`                    | `turret.*`      | `cam-wheel`, `cam-follower`   | an iron cam on the trunnion side and its follower arm        |
| `extended-barrels`              | `turret.*`      | `barrel-extension`            | two steel extensions on the twin muzzles, a brass brace      |
| `grapeshot-breech`              | `turret.*`      | `grapeshot-breech`            | a hinged breech cover with a hopper of loose iron shot       |
| `concussion-shells`             | `turret.*`      | `concussion-box`              | a belt box under the guns, blunt brass shells feeding up     |
| `flushing-shell`                | `turret.*`      | `flushing-cradle`             | one fat iron shell in a brass cradle on the cupola's back    |
| `overpressure-burst`            | `turret.*`      | `overpressure-tank`           | an upright copper pressure tank, gauge and vent whistle      |
| `ricochet-shot`                 | `turret.*`      | `ricochet-hopper`             | a gunmetal hopper of steel balls with a deflector lip        |

Every asset also has a `gilded-plate` part: a gilt name plate in a brass rim, shown only once the
module is Mastered. It is the one material that glows, faintly, so it reads at gameplay zoom.

Modules that share one of Content's bore mounts are drawn so both fit when both are bought: the
rifled jacket takes the barrel's rear 12 cm and the long barrel's sleeve starts 14 cm up; the choke
rides the muzzle and the spike hangs under it; the magazine drum sits under the breech and the
struts clip on ahead of it. Content names the turret mounts only as `turret.*`, so the table's
`turret.sight`, `cam`, `barrel`, `breech`, `magazine`, `cradle`, `boiler` and `hopper` are review
positions on the turret, not ids.

## Files

| File                                   | What it is                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| `<id>.front.png`                       | the asset alone in the game's front view at 768 px/m, its gilded plate shown       |
| `bore.bare.png`, `turret.bare.png`     | the gun alone at 512 px/m                                                          |
| `bore.bought.png`, `turret.bought.png` | the gun with every module of its lane mounted, no plates                           |
| `bore.mastered.png`, `-mastered`       | the same with every module Mastered, the gilded plates shown                       |
| `<gun>.<look>.ingame.png`              | each look at 90 px/m, about what a 1080p screen shows at the default 12 m zoom     |
| `armouryMounts.json`                   | the modules, their parts and Content's mount, and the review positions of each     |
| `author_armoury.py`                    | wrote the first version of the sources (Blender)                                   |
| `render_armoury.py`                    | the renders above (Blender), reusing the dynamite review's stage, lights and frame |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/armoury/author_armoury.py [-- <id> ...]
blender -b --factory-startup --python-exit-code 1 -P docs/art/armoury/render_armoury.py [-- alone|guns]
```

## Hand checks (14 Oct 2026)

- **Every module has a model** (`<id>.front.png`, 16 assets): the eight `bore_gun` modules and
  the eight `auto_guns` modules of the #310 node table, the ids of `groundGun.json`'s modules plus
  the long barrel.
- **Every module reads as its own shape on the gun** (`bore.bought.png`, `turret.bought.png`): no
  two modules of a lane overlap, and each changes the gun's silhouette or its face.
- **Mastered reads at gameplay zoom** (`*.mastered.ingame.png`): the gilt plates show as bright
  dots against the brass and iron at 90 px/m.
- Not looked over live in the MCP Blender: the review is the headless renders above, the same way
  #145, #166 and #197 were reviewed.

## Known limits, for the wiring (#321)

- **The bore gun is a stand-in.** The real mount is #362's, not merged when these were drawn. The
  module sizes match the stand-in's 3 cm barrel and 12 x 9 cm breech; if #362's gun differs, the
  wiring scales or re-seats the modules in Blender, not in code.
- **No attach points.** The TD picks the ids and their `atM` on #362's mount and on the auto guns'
  turret; `armouryMounts.json`'s positions only stage the renders.
- **No export yet.** `npm run art:export` needs each id registered (`r.artAssets`) and a placeholder
  sidecar listing its part ids; both come with the wiring. The part ids are in `armouryMounts.json`.
- The draw order is a suggestion: the parts carry `z` 13 and the plates 14, one over the auto guns'
  head (12).
