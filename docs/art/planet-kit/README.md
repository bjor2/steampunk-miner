# The planet kit art: socket parts, merchant frontages, the crate

The Blender sources, exports and review sheets of
[PK6: Blender art: merchant variants, item socket parts, hazards (#825)](https://github.com/bjor2/steampunk-miner/issues/825),
under [Map: Five open planets (#647)](https://github.com/bjor2/steampunk-miner/issues/647) and the
GD lock of 24 Oct on the P1–P5 kits: one merchant variant per planet on the #175 shops and one
signature item per planet that shows on a socket. The sockets are G&V's on
[#823](https://github.com/bjor2/steampunk-miner/issues/823) (comment 6386881423); there is no hazard
art, because the lock adds no hazard (P1 stays byte-identical, P2–P5 keep the #651 hazards).

Authored in Blender 4.2.9 on the shared box headlessly: `author_planet_kit.py` wrote the first
version of every source, and the `.blend` files under `art/blender/<id>/` are the sources from now
on (Git LFS). The `planet-kit` slice registers the ten ids through `r.artAssets`
(`systems/planetKitArt.ts`), the exports ship under `public/assets/`, and the data the art follows
is the slice's: `kitSockets.json` (sockets, parts, poses) and `merchantArt.json` (frontages,
devices, where they bolt on). The star map cards (#795/#796) were only read.

## The socket parts

Each asset is authored in its own frame with its attach point at the origin, as the tech gear is
(#166), so the game draws it at the point's `atM` from the vehicle sidecar with no offset in code.
A part that moves has its origin at its hinge and carries a `resting` and an `acting` pose in the
table (a turn in radians, counter-clockwise on screen, and a shift in metres); #850 sets the acting
pose while the tool acts. Draw orders sit over the rig's part at each point.

| Asset (`vehicle-item-…`) | Point           | Parts                                    | What it shows                                                                                                                                                          |
| ------------------------ | --------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scree-plough`           | `drill.hood`    | `plough-cowl`; `plough-blade`            | a riveted iron cowl hanging from the drill head's crest over its collar, a brass lip at its forward edge; two steel blades swept back from a hinge, swung out to shove |
| `damp-flask`             | `cab.gauge`     | `flask-rack`; `flask-1`, `-2`, `-3`      | a brass shelf on a stem over the gauge cluster, three hoops; a glass flask of faintly glowing firedamp in each, one per held flask up to the stack limit of 3          |
| `shard-tongs`            | `hull.arm.left` | `tongs-arm`; `tongs-jaw`; `tongs-shard`  | a gripper arm off a brass shoulder bearing, reaching left and down, the fixed upper jaw; the lower jaw hung open, closed while acting; a lifted ice-teal shard then    |
| `vent-vane`              | `hull.roof.mid` | `vane-hinge`; `vane-leaf`; `vane-leaf-2` | a brass hinge barrel whose top is the roofline, the first leaf fixed along the roof; two more leaves stacked shut, swung down across the boiler to fan it open         |

- **The G&V guard** (ticket 823: no part draws past the rig's outline at any state, the drill tip
  does not move, #789). `kitSocketLook.test.ts` holds every part, at rest and acting, inside the
  rig's bounds at tiers 1 and 3 and behind the drawn drill tip, from the exported vehicle sidecar;
  `outline.json` adds the 4 mm silhouette read. Three of the four points sit in the air the rig's
  silhouette leaves (the roofline right of the dome, the crest over the drill head, the arm's reach
  past the chassis), so a part there widens the silhouette while staying inside the bounds: the
  cowl 1064 cells outside at tier 1 and 30 at tier 3, where the head is taller; the rack 142; the
  tongs 386 at rest and 583 acting; the vane every cell at tier 1. The containment hood, the acid
  etcher and the aether tether sit on the same three points (`techGear.json`) with the same effect.
  G&V has the numbers; the bounds rule is what the test enforces.
- **Shared points.** `cab.gauge` is the gauge cluster's point (shared, 3.11): the rack stands above
  the cluster on a stem, clear of the `hull.powerup.5` cradle under it. The three tool points are
  also the mining-gates rigs' (`rig.containment`, `rig.acid_etcher`, `rig.aether_tether`), the
  conflict #823 reported for #850 and G&V; nothing here changes it.
- **Readability** (`readability.json`): at a 360 px phone's 30 px/m over the default zoom the four
  tools change 114 of the tier-1 rig's 588 pixels at rest and 137 acting (115 and 129 of 745 at
  tier 3); the flasks' glow and the vane's brass read as points, the tongs and the cowl as shapes.

## The merchant frontages

One `platform` asset per first-system merchant of `planetKits.json`, bolted onto the Assay &
Exchange (ticket 398) at `atM` [1.05, 3.0] from the building's origin (the Sell zone's rest
point), as the dock add-ons are placed (#197): the frontage's own origin is the awning's left
bracket foot on the facade band. Two parts each (#170 amendment: an in-place add-on is at most 2),
so the platform stays at 38 of its 48 parts: the shell, named for the asset, and `merchant-banner`,
the part the code can move (pivot at the cross-arm it hangs from).

| Asset                 | Merchant (planet)     | Canvas (the planet's horizon) | Device on the shingle                                  |
| --------------------- | --------------------- | ----------------------------- | ------------------------------------------------------ |
| `platform-merchant-1` | Hearthmoor Assay (P1) | `#c98f5c`, the P1 palette sky | an assay crucible on its tripod, a honey-amber gem lit |
| `platform-merchant-2` | Scree Yard (P2)       | `#8a7aa8`                     | a crossed pick and shovel over a heap of scree         |
| `platform-merchant-3` | Gasworks (P3)         | `#7f8f5e`                     | a caged gas lamp burning the green firedamp flame      |
| `platform-merchant-4` | Lapidary (P4)         | `#8fb6c4`                     | a cut rose-quartz gem in a dop over its cutting wheel  |
| `platform-merchant-5` | Boilerhouse (P5)      | `#b4aca2`                     | a small riveted boiler, its steam whistle blowing      |

- **The shell**: a sloped canvas awning over the exchange arch, scalloped in the planet's rock
  colour along its brass front rail, on two brass brackets; a soot shingle in brass hung on chains
  in the arch's free corner by the hopper, the device on it; and the banner's pole on the assay
  house's roof terrace, left of where the scanner mast (P14) stands, with a brass finial.
- **The banner**: a swallow-tailed canvas pennant in the planet's colours with a brass roundel.
- **Identity**: canvas and banner take the planet's `horizon` from its registry look row (ticket
  653; planet 1 its archetype palette's sky), the same row the star map card is drawn from, so the
  dock and the card agree (`merchantArt.test.ts` pins the manifest colours to it and reads the five
  apart). At the phone's 30 px/m each frontage changes about 2,000 pixels of the station, mostly
  the awning and the banner.

## The Cache Crate prop

`prop-cache-crate`: a strapped plank crate (0.86 × 0.66 m, origin at its base's centre so it
stands on its cell) with rope handles and a brass hasp, and `crate-tag`, the owner's tag on the
hasp, the one part a tint tells whose crate it is (G&V: a placed world object, the owner shown by
a tag colour). It is exported and registered; nothing draws it in the world yet, because the
scene-layer line (#213, 27 calls and 1128 pieces) stands at 1127 pieces with every slice loaded,
so a crate layer needs a kernel allowance. The ticket 823 map markers keep showing the containers.

## Files

| File                                          | What it is                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `parts.png`, `parts-gray.png`                 | each socket asset and the crate alone in the game's front view (sockets 768 px/m, the crate 256)     |
| `frontages.png`, `frontages-gray.png`         | each frontage alone at 128 px/m                                                                      |
| `rig.desktop.png`, `-gray`                    | the rig at tiers 1 and 3, bare, every tool at rest and acting, at 1080p's 90 px/m (12 m zoom)        |
| `rig.phone.png`, `-gray`                      | the same at a 360 px phone's 30 px/m, enlarged 4x with no smoothing                                  |
| `merchants.desktop.png`, `-gray`              | the Assay & Exchange bare and with each frontage at 90 px/m                                          |
| `merchants.phone.png`, `-gray`                | the same at 30 px/m, enlarged 4x                                                                     |
| `outline.json`                                | each socket part's 4 mm silhouette cells outside the rig's at tiers 1 and 3, and the drill tip check |
| `readability.json`                            | the phone pixels each fitted look and each frontage changes                                          |
| `author_planet_kit.py`                        | wrote the first version of the ten sources (Blender)                                                 |
| `render_planet_kit.py`, `sheet_planet_kit.py` | the renders and the outline report (Blender), the sheets and readability (Pillow)                    |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/planet-kit/author_planet_kit.py [-- <id> ...]
blender -b --factory-startup --python-exit-code 1 -P docs/art/planet-kit/render_planet_kit.py [-- alone|rig|merchants|crate|outline]
python3 docs/art/planet-kit/sheet_planet_kit.py
npm run art:export -- <id>
```

## Hand checks (25 Oct 2026)

- **Every socket has its model** (`parts.png`): cowl and blades, rack and flasks, arm, jaw and
  shard, hinge and leaves, each at its own frame's origin.
- **On the rig** (`rig.desktop.png`): the cowl rides the drill head's crest behind the bit at both
  tiers; the rack stands over the cab cluster; the tongs reach past the chassis's rear under the
  casing arms; the vane lies along the roofline and fans down across the boiler when acting; the
  shard shows only acting. Nothing passes the drill bit (`outline.json` `behindDrillTip` true
  everywhere).
- **At the merchant** (`merchants.desktop.png`): five frontages on the one building, the awning
  colour and banner the first read, the device the second; the station's own parts (arcs, belt,
  scales, sign) stay clear.
- Not looked over live in the shared Blender or the running game on the box: the headless renders
  above are the review, as #362 and #363 were reviewed; `e2e/browser/planetKitArt.spec.ts` checks
  the state the game reports.
