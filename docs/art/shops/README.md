# The shop buildings: Assay & Exchange and Engineering Works

The review renders of
[Art: Sell shop and Workshop buildings in Blender (MCP) (#174)](https://github.com/bjor2/steampunk-miner/issues/174),
for the look locked in
[Spec: Two dedicated shop buildings (#170)](https://github.com/bjor2/steampunk-miner/issues/170).
Authored in Blender 4.2.9 on the shared box through the Blender MCP
(`scripts/art/author_shop_buildings.py` wrote the first version; the `.blend` files under
`art/blender/platform-building-<bay>/` are the sources from now on, Git LFS) and exported with
`npm run art:export` at the platform density of 256 px/m. The build
([#175](https://github.com/bjor2/steampunk-miner/issues/175)) draws them at the zone centres from
the `dock-buildings` slice; its in-game dock screenshots are at the end of this page.

## The two buildings

| Asset                       | Building                     | Parts                                                                        | Attach points                                                                     |
| --------------------------- | ---------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `platform-building-sell`    | Assay & Exchange (Sell)      | `platform-building-sell` (shell), `sell-ticker`                              | `sell.chute`, `sell.ticker`, `sell.stack`                                         |
| `platform-building-upgrade` | Engineering Works (Workshop) | `platform-building-upgrade` (shell), `workshop-gantry`, `workshop-turntable` | `workshop.gantry`, `workshop.platform`, `workshop.stack`, `workshop.showcase_cam` |

Each building's origin is its dock zone's centre column on the pad, where `bayRestPointOf` puts
the vehicle, so the build places the asset at the rest point and nothing else.

- **Assay & Exchange**, 6 m wide and 10 m tall: a riveted iron tower in brass bands with a copper
  hopper funnel for a crown, a smokestack up its left flank, a beam balance out front on the right
  and two storeys of arched windows. The intake chute comes out of the tower face and hangs its
  flared mouth over the vehicle's rear (`sell.chute`, 1.3 m up, left of the rest point), where the
  sale burst of #171 launches. The split-flap ticker above the sign is its own part (`sell-ticker`,
  pivot at its centre) and `sell.stack` is the stack's top. Its sign is the `emblem-bay-sell` glyph
  (scale and coin) extruded in brass on a soot plaque.
- **Engineering Works**, 10 m wide and 6.8 m tall at the stack: a low hall cut away to the camera,
  so the floor, the tool racks and pipes on the back wall, the three hanging lamps and whatever
  stands on the turntable are always in view. A brass lintel carries the `emblem-bay-upgrade` glyph
  (wrench and gear); four sawtooth teeth with glazed skylights make the roofline; a boiler stack
  sits through the right-hand tooth. The crane jib (`workshop-gantry`, pivot at its root bearing,
  `workshop.gantry`) reaches up and right over the roof with a hook block on its cable. The
  turntable (`workshop-turntable`) is a riveted iron disc with a brass rim, flush with the pad, its
  centre at `workshop.platform` (the origin). `workshop.showcase_cam` is 1.8 m above it.

The palette is brass, iron and soot; the only light is warm window, lamp, skylight and ticker glass,
on the emissive maps, so orange stays reserved for heat (#170). With the hub and the Sell and Upgrade
bay art retired (#175), they and the Refinery bay are the platform's parts, inside the 48-part budget
the asset lint gates (`MAX_PLATFORM_PARTS`, base set at most 30).

## Files

| File                                        | What it is                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `platform-building-<bay>.front.png`         | the building alone in the game's front view at 128 px/m                                            |
| `platform-building-<bay>.three-quarter.png` | the same from front-right and above, to show the relief the flat view only hints at                |
| `pair.desktop.png`                          | both buildings at their zone centres (−5 and +7) on the −8..+12 pad, at 90 px/m (1080p, 12 m zoom) |
| `pair.desktop-gray.png`                     | the same in grayscale                                                                              |
| `pair.phone.png`, `pair.phone-gray.png`     | the pair at a phone's 32.5 px/m (390 CSS px over the 12 m zoom), colour and grayscale              |
| `pair.phone-zoomout.png`, `-gray.png`       | the pair at a phone's 19.5 px/m (the 20 m zoom-out)                                                |
| `pair.silhouette.png`                       | the silhouette pair: the render's coverage alone, ink on parchment, no shading                     |
| `render_shops.py`, `sheet_shops.py`         | the render (Blender) and sheet (Pillow) scripts                                                    |

## Hand checks (6 Oct 2026)

- **Silhouette alone:** on `pair.silhouette.png` the two read apart with no shading at all: a
  vertical mass with a funnel crown and a stack against a horizontal mass with a sawtooth roofline
  and a crane arm.
- **Grayscale, phone size:** on `pair.phone-gray.png` (the pair about 700 px wide, the Sell tower
  about 330 px tall) the funnel, stack, scale, the glyph plaques, the sawtooth teeth and the crane
  all still read. At the 20 m zoom-out (`pair.phone-zoomout-gray.png`) the silhouettes still tell
  them apart; the plaques and ticker become marks.
- **TV:** not sheeted here: a 4K TV at the 12 m zoom shows 180 px/m, above this render's 90 and
  below the bake's 256, so a sheet would only upsample the render. The TV look is #175's dock
  screenshot from the #173 matrix; the texel density leaves headroom for it.
- **Looked over live** in the shared Blender through the MCP before the export (front and
  three-quarter views of each building, material shading).

## In the game (#175, 7 Oct 2026)

The look set of record is the #173 screen matrix: `docs/screens/<cell>/dock.jpg` in every
reference cell, TV mode included, written by `npm run screens:update`. `dock-<size>.png` here are
the first hand-check screenshots, taken before the matrix landed, of the production build (`vite preview`, headless Chromium on
SwiftShader) after `steampunkDebug.ui.setZoom(20)` and `teleportToDock('upgrade')`, once the
atlases loaded: the car on the Works' turntable, the camera on `workshop.showcase_cam`, the yard
with its lamp posts and signpost between the buildings. The Upgrade bay screen was hidden with a
style rule for the shot only (it covers the scene while docked), and the opening transmission
dismissed with a key.

| File                               | Size                                                 |
| ---------------------------------- | ---------------------------------------------------- |
| `dock-desktop-1920x1080.png`       | desktop 1920×1080                                    |
| `dock-phone-landscape-844x390.png` | phone landscape, 844×390 CSS px at 3× (2532×1170)    |
| `dock-tv-3840x2160.png`            | TV 3840×2160 (no TV mode exists yet; #173 builds it) |

Hand checks: both buildings, the yard and the car on the turntable show at all three sizes and
the silhouettes read apart. On the phone the HUD's gauge cluster covers the Exchange's lower
storeys at this zoom; the HUD's phone layout is #173's.
