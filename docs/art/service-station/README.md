# Service station (Assay & Exchange)

The Sell bay's building, from
[Art: service station — charge, repair & sell bays (Blender MCP), replaces Assay & Exchange (#398)](https://github.com/bjor2/steampunk-miner/issues/398)
and the concept Bjor approved on 14 Oct 2026 (`service-station-ref.jpg`). Selling, repairing and
recharging all happen at the Sell bay, so the station is one building with three arched bays over
the one Sell zone; it adds no zone. It replaced the #174 "Assay & Exchange" tower in place: the
asset is still `platform-building-sell`, the source is still
`art/blender/platform-building-sell/platform-building-sell.blend` (Git LFS), and the export still
ships in `public/assets/platform/platform-building-sell/`. The tower's meshes, ticker part, atlas
and maps are gone; nothing of it is left unused.

`author_service_station.py` wrote the first version from an empty scene. From now on the `.blend`
is the source: change the art in Blender and re-export with
`npm run art:export -- platform-building-sell`.

## The building

- **Frame and fit.** The origin is the Sell zone's rest point (`bayRestPointOf`), so the casing
  driller parks in the middle bay. The building keeps the tower's 6 m width, which is all the pad
  has between its left edge and the Refinery's yard, and stands 8.4 m to the tall stack's top.
  Each bay is 2 m wide round the 1.6 m driller.
- **Left, charging.** Two big Tesla coils on the roof, copper windings banded in brass, a brass
  sphere on each; inside the arch a blue charging portal between two floor coils.
- **Middle, repair.** Two welding arms hang from a gantry beam over the parked vehicle, their
  torches just above its dome; a lamp and tool racks behind.
- **Right, selling.** The conveyor rises from its intake beside the vehicle into a copper ore
  hopper; the hopper's spout feeds the assay scales on the exchange counter, whose arched teller's
  window is lit. Above it the assay house carries the Sell bay's #158 emblem (the scale and coin).
- **Roof and facade.** A brass boiler with cogs, two smokestacks, gauges on every keystone, and a
  soot board across the facade that reads the game's name, "ASSAY & EXCHANGE".
- **Palette.** The #174 buildings' brass, iron and soot with the #393 driller's bronze. The light
  is warm window and lamp glass, the charging bay's blue and the white-hot weld; orange stays
  reserved for heat (#170).

## Parts and attach points

| Part / point             | What it is                                                     | Motion (`stationIdleMotion.ts`)                            |
| ------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------- |
| `platform-building-sell` | the static shell                                               | none                                                       |
| `sell-arc`               | lightning between the roof coils' spheres (pivot between them) | strikes 12 times a second, lit or dark, upright or flipped |
| `sell-arc-2`             | lightning between the charging bay's floor coils               | as `sell-arc`, on its own strikes                          |
| `sell-conveyor`          | the ore and cleats on the belt (pivot at the belt's middle)    | slides up the belt's line, starting over each 0.2 m pitch  |
| `sell-spark`, `-2`       | the weld stars at the two torches                              | burn 1.3 s of every 2 s, flickering and turning            |
| `sell.chute`             | the conveyor's intake, 0.64 m up beside the vehicle            | where the sale burst's chunks leave (#171)                 |
| `sell.ticker`            | the hopper's mouth                                             | where the chunks drop in                                   |
| `sell.stack`             | the tall stack's top, 8.4 m up                                 | where the coins burst out                                  |

The idle parts draw over the shell (draw order 1). With motion effects off the belt stands and the
arcs and welds glow steadily. The arcs and welds glow white over their emissive maps' own blue and
white-hot (`glowColourOf`). The scanner mast add-on (#197) still stands on the assay house's roof
at 5.3 m.

**Lit and unlit:** the old tower had no lit and unlit states in the game (the shell is drawn from
its albedo; nothing turns its emissive map up), and neither has the station. The shell's
emissive map carries the windows, lamps and the charging portal for the lit render to come.

## Files

| File                                    | What it is                                                               |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `front.png`                             | the building alone in the game's front view at 128 px/m                  |
| `three-quarter.png`                     | from front-right and above, to show the relief                           |
| `dock.png`                              | on the pad with the driller parked at the rest point, at 1080p's 90 px/m |
| `dock.phone.png`, `dock.phone-gray.png` | the same at a phone's 32.5 px/m, colour and grayscale                    |
| `idle.motion.png`                       | four idle poses side by side, posed as the code poses them               |
| `author_service_station.py`             | wrote the first `.blend`                                                 |
| `render_service_station.py`             | the review renders (Blender, into `build/`)                              |
| `sheet_service_station.py`              | the sheets above from the raw renders (Pillow)                           |

## Hand checks (14 Oct 2026)

- Looked over live in the shared Blender through the MCP (front and three-quarter, material
  shading) before the export.
- **Phone, grayscale:** on `dock.phone-gray.png` the three arches, the coils with their arcs, the
  stacks, the hopper and conveyor, and the sign still read; the driller is small but clear in the
  middle bay.
- Not checked in the running game here (shared box, no capture runs); the screen matrix
  (`npm run screens:update`) shows it on the dock.
