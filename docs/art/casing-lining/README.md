# The casing lining

The review renders of the lining half of
[Art: bore gun mount and casing lining (#315)](https://github.com/bjor2/steampunk-miner/issues/315),
for decision 3 of the
[GD decision on Spec: Planet-1 ground weapon (#309)](https://github.com/bjor2/steampunk-miner/issues/309):
"cased cells show a brass ribbed lining with a rivet line on the open faces", through the #298
terrain channel with zero added draws, readable at phone size (about 24 px a cell).

The game draws the lining in the terrain shader from `CASING_LINING_LOOK`
(`src/constants/scene.ts`); nothing here is exported. `author_casing_lining.py` builds the Blender
reference scene from the same numbers (`art/blender/casing-lining/casing-lining.blend`, Git LFS)
and renders it; `sheet_casing_lining.py` makes the enlarged and grey copies.

```text
blender -b --python-exit-code 1 -P docs/art/casing-lining/author_casing_lining.py
python3 docs/art/casing-lining/sheet_casing_lining.py
```

## What is here

| File                         | What it shows                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `lining.review.png`, `-gray` | a 0.95 m bore and a level tunnel's floor in planet-1 band-1 rock, at 256 px/m    |
| `lining.phone-raw.png`       | the same at 24 px/m, one cell about what a phone shows at the widest zoom (#173) |
| `lining.phone.png`, `-gray`  | that render enlarged 8x with no smoothing, so each phone pixel shows             |

## The look

- **Plate.** Polished brass `#dcb35a`, a step brighter than the hull's, so it parts from band 1's
  light rock (`#8a6a48`) in grey too. 0.42 m deep on the rock side of the face, as the lining lines
  the rock side of the bore (#41 amended on #56).
- **Ribs.** A near-black groove `#3e2c14` every 0.25 m along the face, 26% of a rib wide, so a
  groove is about 1.5 px at phone size. In the game the ribs run on the tile axis nearest the face,
  so they stay pixel-straight and meet across cells; the reference turns them with the bore.
- **Rivets.** One pale `#fff0c4` rivet 0.12 m across in the middle of each rib, 0.2 m in from the
  face; in the game they glint faintly (`rivetGlow`), so the line still reads in band 5's dark.
- **Seam.** A 0.07 m dark band where the plate meets the rock behind it.

## Hand checks

- At 24 px/m (`lining.phone-gray.png`) the ring reads as a ribbed plate with a dotted line, not a
  smear, and parts from the rock and the bore's air.
- `src/systems/render/casingLiningLook.test.ts` checks the same in numbers over every band of every
  planet palette at the brightest and darkest tile shade; the screen matrix
  (`e2e/browser/screens/screenLayout.spec.ts`) checks a lined cell the game draws at each screen's
  widest zoom.
- The shader's look in the running game is a hand check for the Tester's eye pass: dig a shaft on
  P1 in `npm run dev` and look at its walls at the widest zoom.
