# The drill-type rig-look parts

The Blender source and review renders of
[Drill-type Blender parts: cutters, Wide reamers, Deep crown, twin bit, boom (#622)](https://github.com/bjor2/steampunk-miner/issues/622),
wave 308-1B of [Spec: Drill width and drill type store items (#308)](https://github.com/bjor2/steampunk-miner/issues/308):
each drill-gear item that changes what the drill is shows on the rig as its own look, readable at a
360 px phone's width. The Gameplay & Vehicle close-out (comment 6301796899) set the shapes: the
cutters stick out to the sides, the reamers are a wide ring, the crown is a long spike ahead. The
GD lock (6301848748) put the parts in their own ticket on #578's slot and render setup, through the
#577 registry, and the Horizontal Scaler (6301809360) ruled that drill-head parts belong to the
drill-head slot and never to a module point.

**Not wired.** Nothing registers, exports or draws the asset: the wiring (#623) names the looks
from owned state through the rig-look registry (#577), swaps the parts on the slot, folds a
toggled-off cutter in and gives the #590 sweep its rows. `drillTypeLooks.json` here is the one
table this folder's scripts share; the wiring keeps its own rows. The asset id follows the #52
kebab form under the vehicle category, `vehicle-look-drill-type`, beside #578's
`vehicle-look-drill-tip`; the part ids are the looks' names. #578 does not grow: this is a second
asset on the same slot.

Authored in Blender 4.2.9 on the shared box: `author_drill_type_looks.py` wrote the first version
of the file, and `art/blender/vehicle-look-drill-type/vehicle-look-drill-type.blend` is the source
from now on (Git LFS). The eleven parts were then appended into the live Blender through the
Blender MCP, in a scene of their own, and looked over from the front and three-quarter; the sheets
below are the headless renders.

## The parts

The asset is authored in #578's frame: its own frame with the `drill_tip` track's attach slot,
`drill.head`, at the origin, so the game draws a part at the slot's `atM` (0.65, 0) from the
vehicle sidecar with no offset. Every look stands in place of the rig's `t1-drill-bit` crown
(its centre 0.118 m right of the slot) and sheathes the last step of the stepped cone behind it,
as the drill_tip looks do, so a fitted type wins the slot over the drill_tip look step (the HS
rule on #576) and the rig shows one bit, never two. Draw order `z` 9, the crown's; the cutter
arms 10, over their yoke; the boom's ram 7, behind the head, so a retracted ram hides in the cone.

| Look                  | Item                               | Parts                                         | What it shows                                                                                                                                                      |
| --------------------- | ---------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bare`                | none                               | none                                          | the rig as it is, with its own crown                                                                                                                               |
| `side-cutters-mark-1` | `gear.side_cutters`, Mark 1        | `cutter-yoke-1`, `cutter-arm-up-1`, `-down-1` | the crown on a collared yoke; a steel arm each side from a brass hinge block, a geared cutter wheel at its end, 0.34 m out past the nose                           |
| `side-cutters-mark-2` | `gear.side_cutters`, Mark 2 (#620) | `cutter-yoke-2`, `cutter-arm-up-2`, `-down-2` | a heavier, twice-collared yoke; a braced twin-bar arm each side with two staggered wheels, the outer one bigger, 0.5 m out                                         |
| `gallery-reamers`     | `gear.gallery_reamers` (Wide)      | `gallery-reamers`                             | the crown inside a wide dark-iron ring on four brass spokes, a verdigris flute band and brass rim on its face, twelve steel reamer teeth standing out              |
| `plunge-crown`        | `gear.plunge_crown` (Deep)         | `plunge-crown`                                | a steel guard wheel with four brass fins where the crown was, and a long bright-steel spike to a point with two hot seams along it, 0.5 m out                      |
| `twin-bit`            | `gear.twin_bit`                    | `twin-bit-head`                               | an iron carrier across the cone's end, a hot core between two steel bits side by side, each collared in brass, ringed in gunmetal, fluted opposite                 |
| `reach-boom`          | `gear.reach_boom`                  | `boom-barrel`, `boom-ram`                     | a brass barrel with steel guide rails over the cone's last step; an open lattice ram of two steel rails and brass cross-braces carrying a bigger crown 0.4 m ahead |

A moving part has its origin at its hinge or slide and is authored at its deployed pose; the
table carries both poses as `techGear.json`'s rows do (a turn in radians, counter-clockwise on
screen, and a shift in metres), for the wiring to blend as `extractorPose.ts` does:

| Part                                     | Pivot (`pivotM`, in the slot's frame) | Folded                             | Deployed |
| ---------------------------------------- | ------------------------------------- | ---------------------------------- | -------- |
| `cutter-arm-up-1`, `cutter-arm-up-2`     | the upper hinge block, (0.06, 0.03)   | turned π/2, back along the rig     | as drawn |
| `cutter-arm-down-1`, `cutter-arm-down-2` | the lower hinge block, (0.06, −0.03)  | turned −π/2, back along the rig    | as drawn |
| `boom-ram`                               | the slide, the slot itself (0, 0)     | shifted −0.26 m, the crown at 0.14 | as drawn |

The crowns (the cutters', the reamers', the boom's) are the rig's own cutter crown piece for piece
(`crown_pieces` of the casing driller's author script), so they keep its hot core, `nose-glow`;
the plunge crown's guard and spike seams and the twin bit's core are the same material. Nothing
else glows, so the drill nose stays the brightest part of the rig (#576 rules).

## Files

| File                         | What it is                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `parts.png`                  | each look alone in the game's front view at 768 px/m                                                   |
| `tier-1.png`, `tier-3.png`   | the rig at that tier bare and with each look on the slot, 512 px/m, the nose lit as while drilling     |
| `tier-<n>.ingame.png`        | the same at 90 px/m, about what a 1080p screen shows at the default 12 m zoom                          |
| `tier-<n>.phone.png`         | the same at a 360 px wide phone's 30 px/m over the 12 m zoom, enlarged 8x with no smoothing            |
| `glow.png`                   | the tier-1 rig bare and with each look by its emission alone: what the emissive map carries            |
| `reach.json`                 | each look's silhouette cells outside the rig at tiers 1, 2 and 3, how far it stands out, pair diffs    |
| `readability.json`           | the phone-size pixels each look changes against bare and each other, and the nose's brightest pixel    |
| `drillTypeLooks.json`        | the asset, its slot, its looks with their items, parts and poses                                       |
| `author_drill_type_looks.py` | wrote the first version of the source (Blender)                                                        |
| `render_drill_type_looks.py` | the renders above (Blender), on the casing driller review's frame and the boiler review's stage        |
| `check_reach.py`             | writes `reach.json` (Blender); exits 1 when a look falls short of its shape or two looks read the same |
| `sheet_drill_type_looks.py`  | lays the renders out into the sheets and writes `readability.json` (Pillow, numpy)                     |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drill-type/author_drill_type_looks.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drill-type/check_reach.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-drill-type/render_drill_type_looks.py [-- alone|rig|glow]
python3 docs/art/rig-look-drill-type/sheet_drill_type_looks.py
```

## Checks (21 Oct 2026)

Against the ticket's acceptance, with the numbers the scripts wrote:

- **The six parts modelled** (`parts.png`): side cutters Mark 1 and Mark 2, the gallery reamers,
  the plunge crown, the twin bit and the reach boom, eleven parts in one asset.
- **#578's slot and render setup** (`tier-1.png`, `tier-3.png`): every look stands on `drill.head`
  at (0.65, 0) in place of `t1-drill-bit`, rendered on the same frame, stage and tiers as the
  drill_tip and boiler reviews. No module point is used, and the registry is not read: the table
  here names items, never thresholds or rows.
- **Each reads at 360 px wide** (`tier-1.phone.png`, `reach.json`, `readability.json`): at 30 px/m,
  the pixels of the drill window a look changes against the bare rig are 67 (Mark 1), 115
  (Mark 2), 142 (reamers), 22 (crown), 38 (twin bit) and 59 (boom) of 680 at tier 1; no two looks
  differ by fewer than 51 (the crown against the twin bit), and by silhouette alone no pair,
  bare included, by fewer than 16. On a 4 mm grid against the tier-1 rig:
  - the cutters stick out 0.34 m (Mark 1) and 0.50 m (Mark 2) past the nose both up and down,
    10 and 15 phone pixels;
  - the reamers are a ring 0.28 m past the nose up and down with 6752 open cells inside it;
  - the crown is a spike 0.32 m (10 px) ahead of the rig's tip and no wider than the crown it
    replaces (0.036 m);
  - the twin bit stands 0.18 m ahead and 0.10 m to each side, the boom's crown 0.30 m ahead.
    The same holds at tiers 2 and 3, a little less at tier 3 where the nose is longer and taller.
- **A fitted module wins the slot:** every look is a whole bit, crown included, so when the wiring
  draws a type at `drill.head` the drill_tip look step is not needed under it, and the rig shows
  one bit.
- **The drill nose stays the brightest part** (`glow.png`, `readability.json`): by emission alone
  the drill window's brightest pixel is 247 for every look and for the bare rig, the nose seams'
  own glow; the looks add no glow of their own. The 253 outside the window is the headlamp on
  every rig, the bare one included, as on the stock casing driller.
- **Collision and hitbox unchanged:** the vehicle collider is a code constant (`COLLIDER_M`, 0.9 m)
  that no art feeds, and `vehicle.blend` is untouched.
- **Desktop and phone** (`tier-<n>.ingame.png`, `tier-<n>.phone.png`): checked at 90 px/m and at
  30 px/m. The screenshots of the running game and the #590 sweep rows are the wiring's (#623),
  since nothing draws the asset yet.

## Known limits

- The plunge crown is the thinnest look at phone size (22 pixels changed against bare, 51 against
  the twin bit): a spike is thin by nature. Its hot seams and bright steel carry it; a tint on the
  spike is open to the wiring if the sweep wants more.
- The reach boom's ram is drawn behind the head so its retracted pose hides in the cone; a wiring
  that draws every look part in front of the head will show the retracted lattice over the cone.
- The side cutters already have item art at `drill.flank` (`vehicle-item-gear-side-cutters`, #166),
  and the twin bit and boom at `drill.head` and `drill.collar`. Which of the two draws once a type
  look is wired is the wiring's call; these looks are whole heads, meant to stand alone.
- Mark 2's item (#620) is not on main yet; its look is keyed by `gear.side_cutters` at Mark 2 in
  the table, for the wiring to map once the item lands.
