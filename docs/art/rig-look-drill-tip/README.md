# The drill tip rig-look parts

The Blender source and review renders of
[Rig look art: drill_tip Blender parts (6 parts) (#578)](https://github.com/bjor2/steampunk-miner/issues/578),
wave 576-1A of [Rig look ladder and mineral skins (#576)](https://github.com/bjor2/steampunk-miner/issues/576):
every purchase on the `drill_tip` track visibly changes the rig. Systems' table puts the track's
five look steps at 70, 100, 130, 190 and 280 purchases (comment 6300543785 on #157), the on-curve
counts the player leaves planets 1, 2, 3, 5 and 8 with, and the linear tail above the top step keeps
every later purchase visible. Progression named the steps Steel cone, Fluted bit, Toothed crown,
Gem-set crown and Aether-cut crown (6300549964); the base rig's cutter crown is the unnamed default.

**Wired by #579.** The rig-look slice registers and exports the asset and swaps each step's part
onto the slot from the registry's rows (`src/features/rig-look/rigLook.json`, #577). `drillTipLooks.json` here is the one table this folder's scripts share;
the wiring keeps its own rows (#576 "Registry": data, not code). The asset id follows the #52 kebab
form under the vehicle category, `vehicle-look-<track>`, so the registry can name it from the track
id; the part ids are the step names.

Authored in Blender 4.2.9 on the shared box: `author_drill_tip_looks.py` wrote the first version of
the file, and `art/blender/vehicle-look-drill-tip/vehicle-look-drill-tip.blend` is the source from
now on (Git LFS). The six parts were then appended into the live Blender through the Blender MCP and
looked over from the front and three-quarter after each cut (see Checks); the sheets below are
the headless renders.

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

| Part               | Step           | Look                                                                                                                                                                                |
| ------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cutter-crown`     | 0, the default | the rig's own crown, piece for piece (`crown_pieces` of the casing driller's author script), re-based on the slot: the rig's outline is unchanged with it in place (`outline.json`) |
| `steel-cone`       | 70 purchases   | a polished steel cone on a brass collar, over a steel sheath, one hot seam near the point                                                                                           |
| `fluted-bit`       | 100 purchases  | the same cone in blued steel, three dark spiral flutes lying on it, a bright steel point                                                                                            |
| `toothed-crown`    | 130 purchases  | eight brass cutters where the rig's teeth stand and eight short steel ones between, on a steel wheel round a wider hot core with a brass hub                                        |
| `gem-set-crown`    | 190 purchases  | a dark iron wheel rimmed in brass, six violet gems round a bezelled centre gem, four brass prongs on the rig's diagonal teeth, a brass band on the sheath                           |
| `aether-cut-crown` | 280 purchases  | a pale ceramic wheel with eight aether-glass fins where the rig's teeth stand and eight ceramic ones between, round a teal core; teal collars on the sheath                         |

A swap, as the wiring will draw it (`render_drill_tip_looks.py`): the rig's `t1-drill-bit` is
left out and the look's part stands on the slot. The cutter crown reproduces the crown exactly, so
the wiring may draw the base look either way (the rig's part, or the cutter crown in its place) and
the rig is the same below the first step. Every look reaches back to the slot by a 6 mm shaft in the
cone's own colours, hidden under the cone, because the export requires a part's origin inside its
bounds.

The crowns keep the rig's hot core (`nose-glow`, the material of the nose seams, emission 1.6) and
the cones a hot seam of it, so the drill nose stays the brightest part of the rig with every look;
the gem (0.8) and aether (1.2) glows sit under it.

## Files

| File                                     | What it is                                                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `parts.png`                              | each part alone in the game's front view at 768 px/m                                                                    |
| `tier-1.png`, `tier-2.png`, `tier-3.png` | the rig at that tier with each look on the slot, 512 px/m, the nose lit as while drilling                               |
| `tier-<n>.ingame.png`                    | the same at 90 px/m, about what a 1080p screen shows at the default 12 m zoom                                           |
| `tier-<n>.phone.png`                     | the same at a 360 px wide phone's 30 px/m over the 12 m zoom, enlarged 8x with no smoothing                             |
| `glow.png`                               | the tier-1 rig with each look by its emission alone: what the emissive map carries                                      |
| `outline.json`                           | each look's silhouette cells outside the rig at tiers 1, 2 and 3, and the base look's against the rig                   |
| `readability.json`                       | the phone-size pixels each step changes from the one before, and the nose's brightest pixel against the rest of the rig |
| `drillTipLooks.json`                     | the asset, its slot, its parts with their step names and thresholds                                                     |
| `author_drill_tip_looks.py`              | wrote the first version of the source (Blender)                                                                         |
| `render_drill_tip_looks.py`              | the renders above (Blender), on the casing driller review's frame and stage                                             |
| `check_outline.py`                       | writes `outline.json` (Blender); exits 1 when a look leaves the rig outline                                             |
| `sheet_drill_tip_looks.py`               | lays the renders out into the sheets and writes `readability.json` (Pillow, numpy)                                      |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drill-tip/author_drill_tip_looks.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drill-tip/check_outline.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drill-tip/render_drill_tip_looks.py [-- alone|rig|glow]
python3 docs/art/rig-look-drill-tip/sheet_drill_tip_looks.py
```

## Checks (21 Oct 2026)

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
- The tail above 280 (tint, glow, plating) is the wiring's, on the aether-cut crown.
