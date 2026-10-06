# The Workshop showcase: rig and reaction pieces

The review renders and clips of
[Art: Workshop showcase platform and per-track upgrade reactions in Blender (MCP) (#182)](https://github.com/bjor2/steampunk-miner/issues/182),
for section 7 of [Spec: Workshop redo (#180)](https://github.com/bjor2/steampunk-miner/issues/180).
Authored in Blender 4.2.9 on the shared box (`scripts/art/author_workshop_showcase.py` wrote the
first version; the `.blend` files under `art/blender/platform-workshop-showcase/` and
`art/blender/prop-workshop-reactions/` are the sources from now on, Git LFS), looked over in the
live Blender through the MCP, and exported with `npm run art:export`. Nothing draws them yet: the
workshop build ([#177](https://github.com/bjor2/steampunk-miner/issues/177)) poses the rig and
plays the reactions on each purchase. The conventions (pivots, lengths, densities) are in
[docs/art-pipeline.md](../../art-pipeline.md), "The Workshop showcase".

## What is here

| Asset                        | Parts                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `platform-workshop-showcase` | the overhead rail, the hoist (trolley, chain, hook), the left and right gantry arms (upper arm and forearm each), the lift     |
| `prop-workshop-reactions`    | per row, `<row>-step` (the small-step tool) and `<row>-major` (the big-level-up component), 18 pieces at the vehicle's density |

The reaction rows and their pieces, keyed to the vehicle attach points of the Gameplay & Vehicle
table on #180 (`UPGRADE_REACTION_ATTACH_IDS` in `src/systems/art/workshopShowcaseArt.ts`):

| Row                | Attach          | Small step: the arm brings | Big level-up: the hoist lowers      |
| ------------------ | --------------- | -------------------------- | ----------------------------------- |
| `drill_power`      | `drill.housing` | a box-end head wrench      | a motor housing with its gearbox    |
| `drill_tip`        | `drill.head`    | an angle grinder           | a gem-set tip                       |
| `engine`           | `chassis.drive` | a T-bar hub wrench         | a drive unit: gearbox and pistons   |
| `boiler`           | `hull.boiler`   | a valve key                | a boiler drum with a second stack   |
| `cargo_hold`       | `hull.cargo`    | an ore crate               | a pannier segment with its hatch    |
| `hull`             | `hull.plates`   | a rivet gun                | a plating set on its spreader beam  |
| `gun`              | `hull.turret`   | a barrel brush             | a turret unit with its barrel       |
| `blasting_charges` | `hull.rear`     | a charge stick             | a rack row of two slots             |
| `casing`           | `hull.liner`    | a lining spool             | a liner cassette with a grade badge |

## Files

| File                                            | What it is                                                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `showcase.front.png`, `showcase.front-gray.png` | the Workshop with the rig and the car on its lift at 128 px/m: the right arm bolting the drill housing, the hoist bringing the new one, the left arm folded at rest |
| `showcase.three-quarter.png`                    | the same from front-right and above                                                                                                                                 |
| `showcase.phone.png`, `showcase.phone-gray.png` | the front view at the #173 phone's 32.5 px/m (390 CSS px over the 12 m zoom)                                                                                        |
| `pieces.sheet.png`, `pieces.sheet-gray.png`     | every reaction piece as authored, tools under their components, labelled by row, at 384 px/m                                                                        |
| `reaction-<row>.gif`                            | one clip per row at 96 px/m: frames 0-4 the small step (the arm reaches the part by frame 3), frames 5-9 the big level-up (the component lands by frame 8)          |
| `reactions.motion.png`                          | the nine clips as one strip of frames                                                                                                                               |
| `render_showcase.py`, `sheet_showcase.py`       | the render (Blender) and sheet and clip (Pillow) scripts                                                                                                            |

The clips pose the arms with two-bone IK on their bearings, the way the build will in code, and
aim at the tops of the car's tier-1 parts standing in for the attach points K5 registers; the car
is lifted for the `engine` row. Timing, easing and the camera are the clip's, not the game's: the
spec's 4-tick small step and 72-90 tick big moment are #177's to hit.

## Hand checks (7 Oct 2026)

- **The rig in the hall** (`showcase.front.png`): the rail hangs under the roof clear of the lamps
  and the back-wall pipes, the shoulder pads sit on its face, and both arms fold out of the car's
  way at rest. The working arm reaches the drill housing from the shoulder with the elbow bowed
  outward, the wrench's ring on the housing; the hoist's chain, hook ring and the hanging
  component read as one line down to the car. The lift's cradle sits on the turntable with the
  car's wheels on it.
- **Grayscale at phone size** (`showcase.phone-gray.png`, the hall about 300 px wide): the rail,
  the two arms, the hook line and the cradle still read against the wall; the car is a small
  silhouette, as it is at gameplay zoom, which is why the showcase camera (`workshop.showcase_cam`)
  frames it closer.
- **The pieces** (`pieces.sheet.png`): every tool reads as a tool (a ring wrench, a grinder with its
  disc, a T-bar, a valve wheel, a strapped crate, a rivet gun with its nozzle, a brush, a red
  stick, a wound spool) and every component as the part it brings (a finned housing with a gear, a
  studded cone, a gearbox with pistons and a flywheel, a banded drum with a gauge and stack, a
  riveted pannier, two plates on a beam, a cupola with a barrel, a two-slot shelf, a cassette with
  a grade badge). Lugs and grips sit at every top; the pivots are the bottoms, which the spec
  (`workshopShowcaseArt.test.ts`) checks on the exported sidecar.
- **The clips** (`reactions.motion.png`, `reaction-<row>.gif`): in every row the arm nearer the
  part swings in over three frames with the tool held in the gripper, lands the tool's working end
  on the part (the wrench's ring on the housing, the grinder's disc on the head, the hub wrench on
  the drive of the lifted car, the valve key on the drum, the crate at the hopper, the rivet gun
  on the plate, the brush on the turret, the charge at the rack, the spool at the liner) and
  withdraws; then the trolley slides over the part, the chain pays out and the hook lands the
  component on it, and the hook rises leaving the component in place. Every reaction touches its
  own part, as the Gameplay & Vehicle readability rule asks.
- **Looked over live** in the shared Blender through the MCP before the export (front and
  three-quarter views of the rig inside the building, the pieces in two rows, material shading).
