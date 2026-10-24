# The boiler rig-look parts

The Blender source and review renders of the `boiler` track's look steps:
[Rig look art: boiler Blender parts (2 parts) (#582)](https://github.com/bjor2/steampunk-miner/issues/582),
wave 576-1B of [Rig look ladder and mineral skins (#576)](https://github.com/bjor2/steampunk-miner/issues/576),
drew the base look and the twin-drum boiler; the wiring
([#583](https://github.com/bjor2/steampunk-miner/issues/583)) swaps it in on the slot; LK1
([#809](https://github.com/bjor2/steampunk-miner/issues/809)) moved every line onto the
power-decade band rule, which puts the boiler's bands 5 purchases apart; and LK2
([#810](https://github.com/bjor2/steampunk-miner/issues/810), wave 647-7K) fitted five more parts
so the line has six authored steps, one on each of its first edges. The GD lock on #810: at least 5
authored steps on every line, each a new outline or an added part in a socket, never a recolour;
the footprint fixed; nothing past the rig bounds or moving the drawn drill tip (#789); band names
of 3 words or fewer from data.

Authored in Blender 4.2.9 on the shared box: `author_boiler_looks.py` wrote the first version of
the file, `author_boiler_steps.py` fitted the LK2 parts into it, and
`art/blender/vehicle-look-boiler/vehicle-look-boiler.blend` is the source from now on (Git LFS).
Both scripts are re-runnable: the first rewrites the whole file, the second only its five parts.
The sheets below are the headless renders. `boilerLooks.json` here is the one table this folder's
scripts share; the game reads `src/features/rig-look/rigLook.json` (#577), which carries the same
edges, parts and names.

## The parts

The asset is authored in its own frame with the track's attach slot, `hull.boiler`, at the origin,
as the tech gear is (#166), so the game draws a part at the slot's `atM` from the vehicle sidecar
with no offset. Every part fills the footprint of the rig's own `t1-boiler` dome, whose base sits
0.01 m right of and 0.1 m under the slot (`vehicle.parts.json`). Draw order `z` 3, the dome's.
Each LK2 step is the step before it with one more part fitted, in the order G&V named on #810.

| Part                | Step (purchases) | Band name         | Look                                                                                                                                                                                                                                       |
| ------------------- | ---------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kettle-boiler`     | 0, the default   | (the rig's own)   | the rig's brass pressure dome, piece for piece (`dome_pieces` of the casing driller's author script), re-based on the slot: 0 cells differ from `t1-boiler` (`outline.json`)                                                               |
| `twin-drum-boiler`  | 5                | Twin-drum boiler  | two copper drums end-on, each a dished steel head rimmed in brass with eight rivets and a boss; between them an iron firebox with an ember door, a brass steam column with a gauge, its domed cap and the kettle's own safety valve on top |
| `gauged-boiler`     | 10               | Pressure gauge    | a large brass-rimmed pressure gauge on a stem from the right (drill-side) drum's head, its needle high                                                                                                                                     |
| `whistle-boiler`    | 15               | Valve and whistle | three brass whistles of rising pitch on a base across the left head; a lever safety valve on a pipe from the right drum's shoulder, a ball weight on its lever                                                                             |
| `manifold-boiler`   | 20               | Pipe manifold     | a brass header pipe along the plate front, capped at both ends, four handwheels on their bonnets and a riser into each drum                                                                                                                |
| `steam-drum-boiler` | 25               | Steam drum        | a third copper drum end-on over the column, headed, rimmed and riveted like the two: the steam drum (the ticket's "second drum", named for what the part is on a boiler)                                                                   |
| `firebox-boiler`    | 30               | Firebox door      | a brass-framed iron door on the firebox under a brass hood, riveted, hinged and latched, a glowing ember port and two grate slots, an iron ash pan under it along the plate                                                                |

Where each part sits, and why: the rig outline a look may not leave is the kettle dome's ellipse
(x +-0.24, z 0..0.22 in the dome's frame), its valve stem and the stem's ring, so the sockets are
the two drum heads, the shoulder over the right drum, the plate front, the column between the drums
and the firebox front. Every fitted part stands in front of the heads (nearer the camera) so it
draws over them. Above 30 the wiring's finish tail (#809) keeps the firebox-door boiler and paints
it in the band's finish.

## Files

| File                       | What it is                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `parts.png`                | each part alone in the game's front view at 768 px/m                                             |
| `tier-1.png`, `tier-3.png` | the rig at that tier with each look on the slot, 512 px/m, the nose lit as while drilling        |
| `tier-<n>.ingame.png`      | the same at 90 px/m, about what a 1080p screen shows at the default 12 m zoom                    |
| `tier-<n>.phone.png`       | the same at a 360 px wide phone's 30 px/m over the 12 m zoom, enlarged 8x with no smoothing      |
| `glow.png`                 | the tier-1 rig with each look by its emission alone: what the emissive map carries               |
| `outline.json`             | each look's silhouette cells outside the rig at tiers 1 and 3, and the kettle's against the dome |
| `readability.json`         | the phone-size pixels each step changes, and the nose's brightest pixel against the boiler's     |
| `boilerLooks.json`         | the asset, its slot, its parts with their step names and edges                                   |
| `author_boiler_looks.py`   | wrote the first version of the source (Blender): the kettle and the twin-drum boiler             |
| `author_boiler_steps.py`   | fitted the five LK2 parts into the source (Blender); a re-run rewrites them in place             |
| `render_boiler_looks.py`   | the renders above (Blender), on the casing driller review's frame and stage                      |
| `check_outline.py`         | writes `outline.json` (Blender); exits 1 when a look leaves the rig outline                      |
| `sheet_boiler_looks.py`    | lays the renders out into the sheets and writes `readability.json` (Pillow, numpy)               |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-boiler/author_boiler_looks.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-boiler/author_boiler_steps.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-boiler/check_outline.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-boiler/render_boiler_looks.py [-- alone|rig|glow]
python3 docs/art/rig-look-boiler/sheet_boiler_looks.py
npm run art:export -- vehicle-look-boiler
```

## Checks (24 Oct 2026, LK2)

Against #810's acceptance, with the numbers the scripts wrote:

- **Six authored steps on the first edges** (`boilerLooks.json`, `rigLook.json`): 5, 10, 15, 20,
  25, 30, the step of 5 LK1 froze for the boiler; the line's 23 bands to about P40 continue on the
  finish tail. Each step is an added part, none a recolour.
- **Inside the rig outline** (`outline.json`): on a 4 mm grid every look has 0 cells outside the
  rig's silhouette at tier 1 and at tier 3, and the kettle still differs from the rig's own dome by
  0 cells. The drill tip is not touched: the parts live on `hull.boiler` only, and the collider is
  the code constant (`COLLIDER_M`, 0.9 m) no art feeds.
- **Readable at 360 px** (`tier-<n>.phone.png`, `readability.json`): the pixels of the boiler's
  footprint each step changes against the look before it, a channel moving more than 24 of 255.
  At the closest zoom (8 m, 45 px/m), where the sweep spec judges one visible step as 16 pixels:
  gauge 29, valve and whistle 33, manifold 38, steam drum 26, firebox door 21 (tier 1; tier 3
  within 1). At the default 12 m zoom (30 px/m): 12, 17, 17, 11, 8. The first pass of the door
  moved 15 at 45 px/m; its brass hood over the steam drum's head and the iron ash pan over the
  plate took it to 21.
- **The drill nose stays the brightest glow** (`glow.png`, `readability.json`): by emission alone
  the nose's brightest pixel is 247 against the boiler's 142 to 152 across the looks (the firebox
  door's port, the `firebox` material at 0.5 against the nose seams' 1.6). Lit, the looks'
  brightest pixel is 209 to 215: the brass and dial highlights under the key light, the same
  range as the stock kettle's 210, and under the lit nose at tier 3 (253). The step glows in
  `rigLook.json` rise 0.5 to 0.7, under the `rigBody` cap of 1 with the glint's 0.25.
- **Desktop and phone** (`tier-<n>.ingame.png`, `tier-<n>.phone.png`): checked at 90 px/m and at
  30 px/m. Screenshots of the running game at each step are the browser specs' (`rigLook.spec.ts`
  and `rigLookSweep.spec.ts`), which the Tester runs.

## Known limits

- The drums are end-on, so their copper barely shows from the front: the steps read by their
  steel heads, brass rims and the pale dial, which is what tells at 360 px.
- The steam drum covers the twin-drum's column and its small gauge; the kettle's valve stem still
  rises over it, so the top of the outline is unchanged.
- At the default 12 m zoom on a 360 px phone a fitted part is a few pixels; the steps are judged
  at the closest zoom, where the sweep spec judges them.
