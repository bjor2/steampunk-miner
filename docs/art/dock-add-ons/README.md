# The dock add-ons: scanner mast, research annex and drone hangar

The review renders of
[Build: Dock add-ons art and pure dock-buildings rules (#197a)](https://github.com/bjor2/steampunk-miner/issues/197),
for the three "upgrades in place" of the
[#170 amendment](https://github.com/bjor2/steampunk-miner/issues/170) (Horizontal Scaler's
schedule C): `scanner_station` (P14) is a mast on the Assay & Exchange, `research_lab` (P15) an
annex behind the Engineering Works and `drone_bay` (P20) a hangar on the Works' roof. Authored
headlessly in Blender 4.2.9 on the shared box (`scripts/art/author_dock_add_ons.py` wrote the
first version; the `.blend` files under `art/blender/<id>/` are the sources from now on, Git LFS)
from the [#174](https://github.com/bjor2/steampunk-miner/issues/174) kit: brass, rusted iron
sheet, rivets, warm glass on the emissive map only. Nothing is exported or drawn yet: the art ids
register through `r.artAssets` (#214) and the facility rows open through #221, both wired by #222.

## The three add-ons

| Asset                      | Row               | Host, origin (`atM`)          | Parts (at most 2)                          |
| -------------------------- | ----------------- | ----------------------------- | ------------------------------------------ |
| `platform-scanner-station` | `scanner_station` | Assay & Exchange, (2.4, 5.3)  | `platform-scanner-station`, `scanner-dish` |
| `platform-research-lab`    | `research_lab`    | Engineering Works, (−2.9, 0)  | `platform-research-lab`, `lab-orrery`      |
| `platform-drone-bay`       | `drone_bay`       | Engineering Works, (1.9, 5.6) | `platform-drone-bay`, `hangar-drone`       |

Each add-on is authored in its own frame; `atM` is where its origin bolts onto its host, in metres
from the host's origin (the zone centre on the pad top), from
`src/features/dock-buildings/dockAddOns.json`, which the slice's rules and the render script both
read. The shell is one part named for the asset; the second part is the one the code can move.

- **Scanner mast** (7 m over the tower's cornice, so the Exchange grows from 10 to 12.6 m): a
  gunmetal lattice up the tower's right flank, bracketed into the wall at its foot and the brass
  band and strutted off the cornice, clear of the funnel's rim; brass bands, a railed crow's nest
  with a lantern on an arm, and the dish in profile on its bearing, pointed up and right, a lit
  feed at its focus. The dish turns about the bearing.
- **Research annex** (behind the Works' back wall, so only what rises over the sawtooth roofline
  shows): a riveted iron block to 7.2 m with two tall arched windows and a brass nameplate above
  the roof, a glazed observatory dome ribbed in brass, a glass condenser column with a warm core
  and a copper cap piped into the dome, a short stack and a lantern. The armillary orrery on the
  dome's finial spins.
- **Drone hangar** (on the roof over the third and fourth sawtooth teeth, right of the gantry's
  reach and left of the stack): a riveted deck on short legs down to the slope, an arched iron
  shed open to the camera with a dark mouth under a lit lintel, rimmed in brass, a beacon on its
  roof, and a railed landing ring on the deck's left. The hauler drone, a small gas bag with a
  brass gondola, a stern screw, a headlamp and a hook, hovers over the ring.

## Files

| File                                              | What it is                                                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `<id>.front.png`                                  | the add-on alone in the game's front view at 128 px/m                                                                       |
| `<id>.three-quarter.png`                          | the same from front-right and above, to show the relief the flat view only hints at                                         |
| `<id>.on-host.png`                                | the add-on bolted onto its host building, front view at 128 px/m                                                            |
| `pad-p20.desktop.png`                             | the planet 20 dock (the −8..+18 pad, bare past +12) with both buildings and all three add-ons at 90 px/m (1080p, 12 m zoom) |
| `pad-p20.desktop-gray.png`                        | the same in grayscale                                                                                                       |
| `pad-p20.phone.png`, `-gray`                      | the pad at a phone's 32.5 px/m (390 CSS px over the 12 m zoom), colour and grayscale                                        |
| `pad-p20.phone-zoomout.png`, `-gray`              | the pad at a phone's 19.5 px/m (the 20 m zoom-out)                                                                          |
| `pad-p20.silhouette.png`                          | the render's coverage alone, ink on parchment, no shading                                                                   |
| `render_dock_add_ons.py`, `sheet_dock_add_ons.py` | the render (Blender) and sheet (Pillow) scripts                                                                             |

The "before" is `docs/art/shops/pair.desktop.png`: the same two buildings with no add-ons.

## Hand checks (7 Oct 2026)

- **Two parts each:** the render script lists the parts as it opens each source and refuses a
  third: `platform-scanner-station` + `scanner-dish`, `platform-research-lab` + `lab-orrery`,
  `platform-drone-bay` + `hangar-drone`. With today's 18 platform parts that is 24 of the
  48 the asset lint gates.
- **On the host:** on `platform-scanner-station.on-host.png` the mast stands off the Exchange's
  right flank on its two brackets and the cornice strut, clear of the funnel's rim, and lifts the
  tower from 10 to 12.6 m. On `platform-research-lab.on-host.png` the annex rises over the Works'
  sawtooth roofline behind the gantry's jib (windows, nameplate, dome, condenser, orrery, stack);
  its lower storey is hidden by the hall, as a building behind it should be. On
  `platform-drone-bay.on-host.png` the hangar sits on its legs over the third and fourth teeth,
  between the jib's hook and the stack, the drone over its landing ring.
- **Silhouette alone:** on `pad-p20.silhouette.png` each add-on changes its host's outline where
  it was quietest: a thin mast with a dish beside the funnel crown, a dome with a column and an
  orrery over the Works' left half, an arch with a small gas bag over its right half. The two
  buildings still read apart (vertical with a funnel against horizontal with a sawtooth roof).
- **Grayscale, phone size:** on `pad-p20.phone-gray.png` (the pad about 940 px wide) the mast,
  dish, dome, column, arch and drone all still read; the orrery and the beacon become marks. At
  the 20 m zoom-out (`pad-p20.phone-zoomout-gray.png`) the three outlines still tell the planet 20
  pad from the planet 1 pair in `docs/art/shops/`.
- **Palette:** brass, iron and soot with copper caps; the only light is the dish's feed, the
  lanterns, the annex windows, the condenser's core, the dome's glazing, the hangar lintel, the
  beacon and the drone's headlamp, all on the emissive map. No orange.
- **Not looked over live:** the shared Blender MCP was not listening on port 9876 during this
  session, so the sources were authored headlessly and reviewed through these renders only. The
  Game Director's sign-off is on the wiring ticket (#222), where the add-ons first draw in the
  game.
