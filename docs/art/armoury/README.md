# The armoury module mounts

The review renders of
[Art: armoury module mounts Blender sources and renders, no wiring (#364)](https://github.com/bjor2/steampunk-miner/issues/364),
the art half of [#321](https://github.com/bjor2/steampunk-miner/issues/321) (build 5 of the GD
decision on [Spec: Per-weapon tech trees (#310)](https://github.com/bjor2/steampunk-miner/issues/310)).
Every module of the two Armoury lanes (builds 2 and 3) has a Blender source, so each can be mounted
visibly on its gun once bought, and each carries the gilded plate a Mastered module shows.

**Wired by #321.** The ground-gun slice registers the sixteen assets (`r.artAssets`), ships their
export, and hangs each bought module on its gun: the bore gun piece and a turret piece draw them
at the points of `src/features/ground-gun/armouryMounts.json`, the one table of where each mount
sits, in the gun's barrel frame with the trunnion at the origin. The asset ids follow the
vehicle-item rule in `src/systems/art/artIds.ts` (`weapon.gimbal_sight` is
`vehicle-item-weapon-gimbal-sight`).

Authored in Blender 4.2.9 on the shared box headlessly: `author_armoury.py` wrote the first version
of every file, and the `.blend` files under `art/blender/<id>/` are the sources from now on (Git
LFS). `armouryMounts.json` here lists the modules and their parts for both scripts; the review
renders place them at the game's points.

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
| `armouryMounts.json`                   | the modules, their parts and Content's mount (the points are the game's table)     |
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

## The wiring (#321, 14 Oct 2026)

- **On the real gun.** The renders now stage #362's `vehicle-bore-gun` (trunnion at the origin)
  instead of #364's stand-in. Its tube is about 8 cm across against the stand-in's 6 cm, and its
  crown ends 36 cm ahead of the trunnion against the stand-in's 50 cm, so the modules keep their authored size and only their points moved: the
  sight rides ahead of the stock ring sight, the sear on the breech block, the rifled jacket at the
  tube's root, the magazine under the trunnion. The long barrel's sleeve runs 21 cm past the crown,
  so a muzzle module rides out to its end once the long barrel is bought (`extends` in the table).
- **Points are mine.** The TD named no ids on #310; the mount names are Content's (`bore.sight` ..
  `bore.magazine`, `turret.*`), and the turret's are #364's review positions, a `turret.barrel`
  module counted from the barrel look's tip.
- **Drawn over the gun.** The game draws by draw order (`z` 13, plates 14), so the renders stand
  every module 12 cm in front of the gun along -Y.
- **Turret modules wait on #388.** The turret piece draws a bought turret module, but the eight
  are held back until #388 registers them.
- Not looked over live in the MCP Blender or `npm run dev`: the review is the headless renders.
