# The drill tip rig-look parts

The Blender source and review renders of
[Rig look art: drill_tip Blender parts (6 parts) (#578)](https://github.com/bjor2/steampunk-miner/issues/578),
wave 576-1A of [Rig look ladder and mineral skins (#576)](https://github.com/bjor2/steampunk-miner/issues/576),
grown to about P40 by
[LK6: drill_tip look steps to P40 (#815)](https://github.com/bjor2/steampunk-miner/issues/815),
wave 647-7K of the P1-P5 map (#647): every band of the `drill_tip` track visibly changes the rig.
Since LK1 ([#809](https://github.com/bjor2/steampunk-miner/issues/809)) the track steps on the
power-decade band rule, a band every 60 purchases, so the look steps sit on 60, 120, ..., 1200 (the
on-curve count the player leaves planet 40 with); Systems' first table had put the five #578 steps
at 70, 100, 130, 190 and 280 (comment 6300543785 on #157). Progression named those five Steel cone,
Fluted bit, Toothed crown, Gem-set crown and Aether-cut crown (6300549964); the base rig's cutter
crown is the unnamed default. The fifteen LK6 steps (ticket 815) each fit one more part onto the
aether-cut crown, the bit-finish steps first and the spin-blur steps after, and the finish tail of
#809 keeps every later band visible above 1200.

**Wired by #579.** The rig-look slice registers and exports the asset and swaps each step's part
onto the slot from the registry's rows (`src/features/rig-look/rigLook.json`, #577). `drillTipLooks.json` here is the one table this folder's scripts share;
the wiring keeps its own rows (#576 "Registry": data, not code). The asset id follows the #52 kebab
form under the vehicle category, `vehicle-look-<track>`, so the registry can name it from the track
id; the part ids are the step names.

Authored in Blender 4.2.9 on the shared box: `author_drill_tip_looks.py` wrote the first version of
the file, `author_drill_tip_steps.py` fitted the LK6 parts into it (a re-run rewrites those fifteen
objects and leaves the six of #578 alone), and
`art/blender/vehicle-look-drill-tip/vehicle-look-drill-tip.blend` is the source from now on (Git
LFS). The six #578 parts were appended into the live Blender through the Blender MCP and looked
over from the front and three-quarter after each cut (see Checks); the sheets below are the
headless renders.

## The parts

The asset is authored in its own frame with the track's attach slot, `drill.head`, at the origin,
as the tech gear is (#166), so the game draws a part at the slot's `atM` from the vehicle sidecar
with no offset. Every look stands in place of the rig's tier-1 cutter crown, `t1-drill-bit`, whose
centre sits 0.118 m right of the slot (`vehicle.parts.json`), and sheathes the last step of the
stepped cone behind it from 40 mm ahead of the slot. Draw order `z` 9, the crown's.

The rig's outline at the tip is the crown's steel disc (radius 40 mm) with eight teeth on it and the
cone's last step (radius 41 mm down to 18 mm). A look keeps inside that: the cones keep to the disc's
chord and the rig's tooth at the point, the crowns keep their cutters where the rig's teeth stand and
no further out. So the steps differ by colour, by what fills the disc and by which of the tooth
positions they keep, not by growing the nose.

The LK6 parts take the sockets behind the crown as well (ticket 815: the bit layers onto the drill
head and is never a second head sprite). At tier 1 the head's cone ahead of the gimbal steps from
radius 100 mm down to 18 mm over three steps, measured from the staged head's rings (look x -132 to
-45 mm at 100 down to 76.5 mm, -45 to +41 at 70.6 down to 47, +41 to +128 at 41 down to 17.6); the
carbide collar sits on the second step, the ferrule and the reamer ring on the first (ahead of the
hot seam band, and just ahead of the gimbal), every rim 1.5 mm under the cone's radius, and each
stands with its axis 40 mm nearer the camera than the head's so its whole face is in front of the
cone's in the review renders, as the game draws the look sprite over the head sprite (draw order 9
over 8). The sheath and bridge keep their collars, and every face-on ring stays inside the wheel's
disc, because a face-on ring covers its whole radius in the silhouette and the arc between the
teeth is outside the rig. Every LK6 part keeps the aether-cut crown's front edge (174.1 mm ahead
of the slot, the cutters on the rig's tooth positions), so the drawn drill tip never moves
(`drillTipAheadOf`, #789; the author script refuses a part that does).

The LK6 steps (ticket 815), each the aether-cut crown with every part before it and one more
fitted. The bit-finish steps put hardware on the bit's working surface; the spin-blur steps add
the glowing halos, collars, streaks and fan of a bit spinning fast.

| Part                  | Step | Adds                                                                                                                                                                                                               |
| --------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `collared-crown`      | 360  | **Carbide collar**: a dark-iron collar over the cone's second step, from 26 mm behind the slot to the step's end, a brass bead on the seam ahead                                                                   |
| `ferruled-crown`      | 420  | **Steel ferrule**: a bright steel ferrule on the cone's first step (92 to 56 mm behind the slot), dark iron rim bands at both ends; the seam band and a bare brass band of the cone stay between it and the collar |
| `knurled-crown`       | 480  | **Knurled bands**: two bright steel knurl bands and ten studs across the dark collar, a dark band across the bright ferrule                                                                                        |
| `reamed-crown`        | 540  | **Reamer ring**: a dark-iron reamer ring on the cone's first step just ahead of the gimbal (128 to 98 mm behind the slot), a brass rim, six steel teeth                                                            |
| `chromed-crown`       | 600  | **Chrome face**: a polished-chrome ring on the wheel's face over the teal ring, chrome collars on the bridge and the sheath                                                                                        |
| `bossed-crown`        | 660  | **Brass bosses**: five brass bosses on the reamer ring's camera side and four on the ferrule's                                                                                                                     |
| `cooled-crown`        | 720  | **Coolant lines**: a copper ring in the gap between the ferrule and the reamer ring, two copper lines along the bit's camera side from a copper fitting on the ferrule to the collar                               |
| `inlaid-crown`        | 780  | **Diamond inlays**: eight diamond inlays set in the chrome ring where the rig's teeth stand                                                                                                                        |
| `haloed-crown`        | 840  | **Spin halo**: a glowing teal halo round the wheel's face at the fins' roots, inside the disc                                                                                                                      |
| `blur-collar-crown`   | 900  | **Blur collars**: glowing collars on the ferrule's and the carbide collar's front edges                                                                                                                            |
| `streaked-crown`      | 960  | **Spin streaks**: eight glowing streaks along the chrome ring between the inlays                                                                                                                                   |
| `double-halo-crown`   | 1020 | **Double halo**: a second, inner halo round the hot core                                                                                                                                                           |
| `fanned-crown`        | 1080 | **Blur fan**: eight glowing fan blades radiating between the teeth, proud of the streaks and the halo                                                                                                              |
| `vortex-crown`        | 1140 | **Vortex core**: a bright vortex core over the hot core under a chrome hub                                                                                                                                         |
| `aether-vortex-crown` | 1200 | **Aether vortex**: glow collars along the whole bit, on the reamer ring, the ferrule, the sheath and the bridge                                                                                                    |

A swap, as the wiring will draw it (`render_drill_tip_looks.py`): the rig's `t1-drill-bit` is
left out and the look's part stands on the slot. The cutter crown reproduces the crown exactly, so
the wiring may draw the base look either way (the rig's part, or the cutter crown in its place) and
the rig is the same below the first step. Every look reaches back to the slot by a 6 mm shaft in the
cone's own colours, hidden under the cone, because the export requires a part's origin inside its
bounds.

The crowns keep the rig's hot core (`nose-glow`, the material of the nose seams, emission 1.6) and
the cones a hot seam of it, so the drill nose stays the brightest part of the rig with every look;
the gem (0.8), aether (1.2), diamond (0.4), spin-blur (0.9) and vortex core (1.2) glows sit under
it.

## Files

| File                                     | What it is                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `parts.png`                              | each part alone in the game's front view at 768 px/m                                                               |
| `tier-1.png`, `tier-2.png`, `tier-3.png` | the rig at that tier with each look on the slot, seven a row, 512 px/m, the nose lit as while drilling             |
| `tier-<n>.ingame.png`                    | the same at 90 px/m, about what a 1080p screen shows at the default 12 m zoom                                      |
| `tier-<n>.phone.png`                     | the same at a 360 px wide phone's 30 px/m over the 12 m zoom, enlarged 8x with no smoothing                        |
| `glow.png`                               | the tier-1 rig with each look by its emission alone: what the emissive map carries                                 |
| `outline.json`                           | each look's silhouette cells outside the rig at tiers 1, 2 and 3, and the base look's against the rig              |
| `readability.json`                       | the phone-size pixels each step changes from the one before (default and closest zoom), the nose's brightest pixel |
| `drillTipLooks.json`                     | the asset, its slot, its parts with their step names and thresholds                                                |
| `author_drill_tip_looks.py`              | wrote the first version of the source (Blender)                                                                    |
| `author_drill_tip_steps.py`              | fits the fifteen LK6 parts into the source, re-runnable (Blender, ticket 815)                                      |
| `render_drill_tip_looks.py`              | the renders above (Blender), on the casing driller review's frame and stage                                        |
| `check_outline.py`                       | writes `outline.json` (Blender); exits 1 when a look leaves the rig outline                                        |
| `sheet_drill_tip_looks.py`               | lays the renders out into the sheets and writes `readability.json` (Pillow, numpy)                                 |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drill-tip/author_drill_tip_looks.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drill-tip/author_drill_tip_steps.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drill-tip/check_outline.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drill-tip/render_drill_tip_looks.py [-- alone|rig|glow]
python3 docs/art/rig-look-drill-tip/sheet_drill_tip_looks.py
```

## Checks (25 Oct 2026, LK6)

Against ticket 815's acceptance, with the numbers the scripts wrote after the LK6 parts:

- **Step count and edges** (`drillTipLooks.json`, `rigLook.json`): twenty authored steps, one on
  each band edge LK1 froze for the line, 60 to 1200 (about P40 on the median path, the on-curve
  count at planet 40). The five #578 parts stay the first five steps, in their order; nothing in
  the drill_tip row of `rigLookLines.golden.txt` below 360 changed, and no band to P40 is an
  `it.todo` any more.
- **A new part every step, never a recolour** (`parts.png`): each LK6 part is the step before
  with one more part fitted in a socket (the table above). Each step keeps its own tint and glow
  in `rigLook.json` as the #578 steps do, so a band's colour changes with its part.
- **Inside the rig outline, the tip where it was** (`outline.json`, 4 mm grid): every look has 0
  silhouette cells outside the rig at tiers 1, 2 and 3; the cutter crown still changes the tier-1
  outline by 0 cells. The LK6 parts grow from 922 cells (the collar) to 1808 (the aether vortex),
  all of them cells of the head's cone or the crown's disc. Every LK6 part's front edge is the
  aether-cut crown's, 174.1 mm ahead of the slot (the exported `sizeM` less `pivotM`), so
  `drillTipAheadOf` and the drawn tip read the same from 300 purchases up
  (`drillTipLooks.test.ts`). The collider is the code constant no art feeds; `vehicle.blend` is
  untouched.
- **Readable at 360 px and 1280+** (`readability.json`): nose-footprint pixels each step changes
  against the step before (a channel moving more than 24 of 255) at a 360 px phone, at the default
  12 m zoom (30 px/m) and at the closest 8 m zoom (45 px/m), where `rigLookSweep.spec.ts` judges
  one visible step as at least 16 px over the whole rig:

  | Step                               | Tier 1, 30 / 45 px/m | Tier 2, 30 / 45 px/m |
  | ---------------------------------- | -------------------: | -------------------: |
  | Aether-cut crown to Carbide collar |              11 / 21 |              10 / 21 |
  | Carbide collar to Steel ferrule    |                4 / 7 |                2 / 6 |
  | Steel ferrule to Knurled bands     |                0 / 0 |                0 / 0 |
  | Knurled bands to Reamer ring       |              10 / 16 |              10 / 15 |
  | Reamer ring to Chrome face         |                0 / 1 |                0 / 1 |
  | Chrome face to Brass bosses        |                0 / 2 |                0 / 2 |
  | Brass bosses to Coolant lines      |               1 / 10 |                1 / 9 |
  | Coolant lines to Diamond inlays    |                0 / 0 |                0 / 0 |
  | Diamond inlays to Spin halo        |                1 / 4 |                1 / 4 |
  | Spin halo to Blur collars          |                0 / 4 |                0 / 6 |
  | Blur collars to Spin streaks       |                0 / 0 |                0 / 0 |
  | Spin streaks to Double halo        |                0 / 0 |                0 / 0 |
  | Double halo to Blur fan            |                0 / 0 |                0 / 0 |
  | Blur fan to Vortex core            |                0 / 0 |                0 / 0 |
  | Vortex core to Aether vortex       |                1 / 2 |                0 / 1 |

  The two steps that re-dress a whole cone step (the carbide collar, the reamer ring) clear the
  sweep's 16 by geometry alone at 45 px/m; the coolant lines and the ferrule move 7 to 10. The
  steps that fit detail to the wheel's face or the bit's surface (bands, studs, bosses, inlays,
  the face halos, streaks, fan and core) move 0 to 6 phone pixels: the wheel is 3.6 px across at
  45 px/m and 7 px at a 1280 px desktop's 90 px/m, so nothing fitted inside it can move a 4 x 4
  patch there (the #578 limit below). In the game each band also wears its own tint and glow
  (`rigLook.json`), which the untinted renders here leave out; the sweep's crop diff sees both.
  Tier 3's cone covers the parts behind the crown, as it covers the #578 looks. At 90 px/m
  (`tier-1.ingame.png`) the collar, ferrule, reamer ring and coolant lines read; the face parts
  read on `parts.png` and `tier-1.png`.

- **The drill nose stays the brightest part** (`glow.png`, `readability.json`): by emission alone
  the nose's brightest pixel is 247 with every bit-finish look, the stock rig's own, and rises
  to 248-255 only with the spin-blur looks, whose glows (spin-blur 0.9, vortex core 1.2) sit on
  the nose itself under the seams' 1.6; no look adds a glow anywhere else, and the rest of the
  rig reads 253 (the headlamp lens) as on the stock rig. In `rigLook.json` the LK6 step glows are
  0.51 to 0.58, so the nose slot's sum with drill_power's 2.4 stays under the `drillNose` cap of 3
  and every drill_tip glow is under 1 (`drillTipLooks.test.ts`, `rigLookReadability.test.ts`).
- **Band names**: `Carbide collar`, `Steel ferrule`, `Knurled bands`, `Reamer ring`, `Chrome
face`, `Brass bosses`, `Coolant lines`, `Diamond inlays`, `Spin halo`, `Blur collars`, `Spin
streaks`, `Double halo`, `Blur fan`, `Vortex core`, `Aether vortex`: data strings of 2 words in
  `rigLook.json` (`card`) and `drillTipLooks.json`; the table checks refuse longer ones.
- **Review renders:** the first LK6 cut stood 1.5 mm under the cone's radius on the head's own
  axis and so lay inside the cone in the composite renders (0 pixels moved at every step), though
  the game would have drawn its sprite over the head; the parts now stand 40 mm nearer the camera
  (see The parts) and the composite shows what the game draws.

## Checks (21 Oct 2026, #578)

Against the ticket's acceptance, with the numbers the scripts wrote:

- **Six parts modelled** (`parts.png`): the cutter crown and Progression's five steps; the
  thresholds served are 70, 100, 130, 190 and 280 (`drillTipLooks.json`), Systems' table.
- **Each part swaps on the track's slot** (`tier-1.png`, `tier-2.png`, `tier-3.png`): every look
  stands on `drill.head` at (0.65, 0) in place of `t1-drill-bit`, on the tier-1 rig the first steps
  are bought on, on the tier-2 rig with its bigger nose, and on the tier-3 rig.
- **Inside the rig outline** (`outline.json`): on a 4 mm grid, no look has a cell outside the rig's
  silhouette at tier 1, 2 or 3, and the cutter crown in place of the rig's own crown changes the
  tier-1 outline by 0 cells. The first cut had 8 to 48 cells out per look: the crown's silhouette is
  a disc and eight teeth, not a circle, and a ring facing the camera covers its whole radius; the
  looks were re-cut to the disc and the tooth positions, and the sheath bands became edge-on collars.
- **Collision and hitbox unchanged:** the vehicle collider is a code constant (`COLLIDER_M`, 0.9 m)
  that no art feeds, and `vehicle.blend` is untouched. The wiring's digest check (#579) is where
  byte-identity is proved on the running game.
- **Distinct at 360 px** (`tier-<n>.phone.png`, `readability.json`): at 30 px/m the nose's footprint
  is 96 pixels at tier 1 and 108 at tier 2, and each step changes these many of them from the look
  before it (a channel moving by more than 24 of 255):

  | Step                              | Tier 1 | Tier 2 | Tier 3 |
  | --------------------------------- | -----: | -----: | -----: |
  | cutter crown to Steel cone        |      7 |      7 |      5 |
  | Steel cone to Fluted bit          |      5 |      3 |      0 |
  | Fluted bit to Toothed crown       |      7 |      7 |      4 |
  | Toothed crown to Gem-set crown    |      7 |      7 |      2 |
  | Gem-set crown to Aether-cut crown |      7 |      7 |      7 |

  Seven is the crown's whole footprint at that size: the wheel looks swap their whole colour (grey
  gear, brass gear with a pale core, dark wheel with violet, pale teal wheel). The two cones are the
  tight pair: a cone the size of the rig's own tip is two phone pixels, so the first cut's Fluted bit
  changed 2 at tier 1 and none at tier 2; its steel guide ring and lands put area back in the wheel's
  disc and lift it to 5 and 3. Tier 3's cone covers the looks (below).

- **The drill nose stays the brightest part** (`glow.png`, `readability.json`): by emission alone
  the nose's brightest pixel is 247 with every look, the stock rig's own; no look raises it, and no
  look adds a glow anywhere else. The rest of the rig reads 253 with every look, which is the
  headlamp lens (`lamp-lens`, 1.5), the same on the stock rig: the looks leave that comparison as
  they found it. The crowns' cores are the nose's own `nose-glow` (1.6); the gem (0.8) and aether
  (1.2) glows stay under it. Lit, the nose is 255 against 226 at tier 3; at tiers 1 and 2 the
  brass highlights of the body saturate at 255, as on the stock rig (the boiler review found the
  same), and the looks do not change them.
- **Desktop and phone** (`tier-<n>.ingame.png`, `tier-<n>.phone.png`): checked at 90 px/m and at
  30 px/m. The screenshots of the running game at each step and two tail points are the wiring's
  (#579), since nothing draws the asset yet.
- **Blender MCP:** the six parts were appended into the box's live Blender through the MCP after
  each cut and looked over from the front and three-quarter. That is where the first cut's hot
  seam read as a broad band and its flutes stood off the cone as fins, where the Fluted bit's lands
  floated free of the cone (now on spokes at the cone's depth), and where the final cut was
  accepted. The live Blender dropped once mid-session and was relaunched on the box's display.

## Known limits

- The looks are sized for the tier-1 and tier-2 nose, which carry the cutter crown. Tier 3's nose
  has no tip crown (its `drill-bit` is the reamer collar round the cone's base) and a longer cone, so
  there a look stands over the cone's third step, 9 cm short of the point; the outline check proves
  the cone covers it. A tier-3 cut of each look is the same follow-up the tech gear's drill heads
  noted (docs/art/tech-gear: sized for the tier-2 bit).
- The sheath covers the cone's last step from 40 mm ahead of the slot. At tiers 1 and 2 that is
  clear of every glowing seam of the nose (tier 2's second seam ends 27 mm ahead of the slot); at
  tier 3 the third seam and half of the second are under it while a look is on. The crowns' own hot
  core and the cones' hot seam glow in their place.
- The nose is a small part of the rig: at a 360 px phone the crown's footprint is three pixels
  across and a cone's two, so the steps read there by colour and by the cone-or-wheel silhouette
  more than by detail; `readability.json` counts what changes. The Steel cone to Fluted bit step is
  the least visible there (5 pixels at tier 1, 3 at tier 2); if #590's pixel-diff threshold asks for
  more, the Fluted bit's guide ring is where to add area.
- Below the first step the wiring can draw the rig's own `t1-drill-bit` or the cutter crown; the
  cutter crown exists so the swap is one rule for every step, not so the base rig changes.
- The tail above 1200 (a finish and rank pips a band, #809) is the wiring's, on the aether vortex
  crown. Since #789's retry tier 3's `drill-bit` is a tip crown too; a look hides it and stands
  over the cone's third step as before, so the tier-3 point is the cone's own steel tip.
