# The casing grade looks

The contact sheet of
[CG2: casing grade looks + red burst blink (#830)](https://github.com/bjor2/steampunk-miner/issues/830),
Progression's row in the GD lock on casing grades by depth: one plate metal per grade from five
authored rows, a finish cycle past them and pips for the uncapped tail, readable for colour-blind
players at phone size, with a crop diff of neighbouring grades at 24 px.

The game draws the plates in the terrain shader from `casingGradeLooks.json`
(`src/systems/render/`, the rows) and `CASING_LINING_LOOK` / `CASING_GRADE_MARKS`
(`src/constants/scene.ts`, the geometry); nothing here is exported. `npm run casing:sheet` draws
the sheets below through `src/systems/render/casingLiningCrop.ts`, the shader's rule in TS, which
is also what the tests read.

```text
npm run casing:sheet
```

## What is here

| File                    | What it shows                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `grades.phone.png`      | every grade 1 to 61 at 24 px a cell (a phone at the widest zoom, #173), enlarged 8x |
| `grades.phone-gray.png` | the same in grey (Rec. 601 luma), #13's readability check                           |
| `grades.review.png`     | the same at 96 px a cell                                                            |

Each row is one lap of the finish cycle: the five plates in one finish, then the same five in the
next, 15 cells. After grade 61 (the first with every pip) come grade 3's plate in each lining type:
standard, refractory, insulated, grounded. The first four rows lie over planet 1's band 1 rock, the
next four over its band 5 rock.

## The Blender reference

`author_casing_grades.py` builds a reference scene from the same numbers (headless Blender, as
ticket 315's lining reference) and renders a strip of one cell per look: the five plates plain,
burnished and chased, grade 61 with its pips, then grade 3 in each trim, on a level tunnel floor in
planet-1 band-1 rock. It is never exported and has no manifest entry.

```text
blender -b --python-exit-code 1 -P docs/art/casing-grades/author_casing_grades.py
python3 docs/art/casing-grades/sheet_casing_grades.py
```

| File                        | What it shows                                                   |
| --------------------------- | --------------------------------------------------------------- |
| `strip.review.png`, `-gray` | the strip at 96 px/m                                            |
| `strip.phone-raw.png`       | the strip at 24 px/m, one cell about a phone at the widest zoom |
| `strip.phone.png`, `-gray`  | that render enlarged 8x with no smoothing, so each pixel shows  |

The scene is `art/blender/casing-grades/casing-grades.blend` (Git LFS).

## The look

- **Plates** (`plates[(q - 1) mod 5]`): brass (ticket 315's ribbed plate and rivet line), copper
  (rivets on two rows, a groove every other rib), iron (a dark strap with square bolts, no grooves),
  steel (a lattice of grooves on both diagonals) and verdigris (rivets zigzagging between two rows).
  Every plate sits above 0.62 luma, so it clears every band rock by the phone-size step.
- **Finishes** (`finishes[floor((q - 1) / 5) mod 3]`): plain, burnished (a lit lip along the open
  face, the plate 10% brighter), chased (a dark band across the plate).
- **Pips**: one bright dot in the seam per lap of the finish cycle, up to four.
- **Trims**: the lining type's band over the seam: the cement seam, firebrick with glowing mortar
  joints, a frost wrap with stitches, an earth strap with a zigzag line.
- **Blink and burst**: not on the sheet. A warned ring blinks red over the collapse telegraph for the
  last 3 s of its hold (the whole hold today), steady red with reduce motion, and bursts into sparks,
  a cement puff and debris as the refill starts.

## Hand checks

- In `grades.phone-gray.png` every neighbouring pair of cells reads apart, and no plate smears into
  its rock. `casingLiningLook.test.ts` checks the same in numbers: between the grey crops of grades
  q and q + 1 at least 8% of the pixels move by 0.11 luma, over the light and the dark rock, for
  every pair up to and past the first grade with full pips; and every plate at every finish keeps
  ticket 315's plate and detail steps over every band of every planet.
- The shader in the running game is a hand check for the Tester's eye pass: `debug.lineCasing`
  rings at grades 1 to 5 in a P1 shaft at the widest zoom in `npm run dev`, then
  `debug.forceCollapse` on a lined block for the blink and the burst.
