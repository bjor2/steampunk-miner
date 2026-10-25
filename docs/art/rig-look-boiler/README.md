# The boiler rig-look parts

The Blender source and review renders of the `boiler` track's look steps:
[Rig look art: boiler Blender parts (2 parts) (#582)](https://github.com/bjor2/steampunk-miner/issues/582),
wave 576-1B of [Rig look ladder and mineral skins (#576)](https://github.com/bjor2/steampunk-miner/issues/576),
drew the base look and the twin-drum boiler; the wiring
([#583](https://github.com/bjor2/steampunk-miner/issues/583)) swaps it in on the slot; LK1
([#809](https://github.com/bjor2/steampunk-miner/issues/809)) moved every line onto the
power-decade band rule, which puts the boiler's bands 5 purchases apart and freezes its edges to
about P40 (115); LK2 ([#810](https://github.com/bjor2/steampunk-miner/issues/810), wave 647-7K)
fitted five more parts so the line had six authored steps, one on each of its first edges; and
LK10 ([#873](https://github.com/bjor2/steampunk-miner/issues/873), wave 647-7Z) fitted seventeen
cooling fittings on the edges 35 to 115, so every band to about P40 wears its own part. The GD
lock on #810 and #873: at least 5 (then, by Systems' sizing row, at least 13) authored steps,
each a new outline or an added part in a socket, never a recolour; the footprint fixed; nothing
past the rig bounds or moving the drawn drill tip (#789); band names of 3 words or fewer from
data; looks never unlocks, look-only, with byte-identical logs.

Authored in Blender 4.2.9 on the shared box: `author_boiler_looks.py` wrote the first version of
the file, `author_boiler_steps.py` fitted the LK2 parts into it, `author_boiler_p40_steps.py` the
LK10 parts, and `art/blender/vehicle-look-boiler/vehicle-look-boiler.blend` is the source from
now on (Git LFS). All three scripts are re-runnable: the first rewrites the whole file, the others
only their own parts. The sheets below are the headless renders. `boilerLooks.json` here is the
one table this folder's scripts share; the game reads `src/features/rig-look/rigLook.json`
(#577), which carries the same edges, parts and names.

## The parts

The asset is authored in its own frame with the track's attach slot, `hull.boiler`, at the origin,
as the tech gear is (#166), so the game draws a part at the slot's `atM` from the vehicle sidecar
with no offset. Every part fills the footprint of the rig's own `t1-boiler` dome, whose base sits
0.01 m right of and 0.1 m under the slot (`vehicle.parts.json`). Draw order `z` 3, the dome's.
Each LK2 step is the step before it with one more part fitted, in the order G&V named on #810;
each LK10 step is the step before it with one more cooling fitting, the boiler being the cooling
line (`heatEconomy.ts`): the water-side fittings first, then the condensing gear, then the
ice-blue aether chill glows.

| Part                  | Step (purchases) | Band name         | Look                                                                                                                                                                                                                                       |
| --------------------- | ---------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kettle-boiler`       | 0, the default   | (the rig's own)   | the rig's brass pressure dome, piece for piece (`dome_pieces` of the casing driller's author script), re-based on the slot: 0 cells differ from `t1-boiler` (`outline.json`)                                                               |
| `twin-drum-boiler`    | 5                | Twin-drum boiler  | two copper drums end-on, each a dished steel head rimmed in brass with eight rivets and a boss; between them an iron firebox with an ember door, a brass steam column with a gauge, its domed cap and the kettle's own safety valve on top |
| `gauged-boiler`       | 10               | Pressure gauge    | a large brass-rimmed pressure gauge on a stem from the right (drill-side) drum's head, its needle high                                                                                                                                     |
| `whistle-boiler`      | 15               | Valve and whistle | three brass whistles of rising pitch on a base across the left head; a lever safety valve on a pipe from the right drum's shoulder, a ball weight on its lever                                                                             |
| `manifold-boiler`     | 20               | Pipe manifold     | a brass header pipe along the plate front, capped at both ends, four handwheels on their bonnets and a riser into each drum                                                                                                                |
| `steam-drum-boiler`   | 25               | Steam drum        | a third copper drum end-on over the column, headed, rimmed and riveted like the two: the steam drum (the ticket's "second drum", named for what the part is on a boiler)                                                                   |
| `firebox-boiler`      | 30               | Firebox door      | a brass-framed iron door on the firebox under a brass hood, riveted, hinged and latched, a glowing ember port and two grate slots, an iron ash pan under it along the plate                                                                |
| `jacketed-boiler`     | 35               | Water jackets     | a bolted steel water jacket ring round each drum head, over its brass rim and outside its rivets, a dark-iron lug outboard and on top                                                                                                      |
| `sight-glass-boiler`  | 40               | Sight glasses     | a brass-guarded pale glass level tube with a brass cock at each end on each head's inboard lower quarter, beside the door                                                                                                                  |
| `pumped-boiler`       | 45               | Feed pump         | a brass feed pump lying on the left head's lower band under the whistle rack, iron end caps, a dark-iron flywheel with a brass rim outboard and a steel crank rod                                                                          |
| `cocked-boiler`       | 50               | Blow-down cocks   | a brass blow-down cock with an iron T-handle on the header line each side of the door, and a steel drip tray under each along the plate front                                                                                              |
| `finned-boiler`       | 55               | Cooling fins      | eleven bright steel cooling fins round the steam drum's head, from its rim out under the dome's crown; the fins that would point down behind the door are left out                                                                         |
| `radiator-boiler`     | 60               | Radiator grille   | a finned radiator grille of bright steel in a dark-iron frame with a brass top bar on the right head's lower band, over the gauge's empty lower dial                                                                                       |
| `blower-boiler`       | 65               | Blower fan        | an iron blower housing with six bright steel blades and a brass hub on the left head's upper-outboard quarter, over the first whistle's top                                                                                                |
| `feed-tank-boiler`    | 70               | Feedwater tank    | a standing copper feedwater tank with two brass bands and a brass filler cap on the steam drum's left rim, beside the tallest whistle                                                                                                      |
| `condenser-boiler`    | 75               | Condenser coils   | copper condenser coils: four rings round the feedwater tank and three round the pump cylinder                                                                                                                                              |
| `thermometer-boiler`  | 80               | Thermometer dial  | a brass-rimmed thermometer dial over the steam drum's boss, inside its rivets, the needle low                                                                                                                                              |
| `hooped-boiler`       | 85               | Brass hoop        | a brass hoop rail of twenty segments just inside the dome's outline, from the plate up over the crown under the fins' roots and down to the plate again                                                                                    |
| `rimed-boiler`        | 90               | Frost rime        | pale, unlit frost rime: seven caps along each jacket's upper arc, a bead on every fin's tip, a cap on the tank's filler                                                                                                                    |
| `cryo-coil-boiler`    | 95               | Cryo coils        | glowing ice-blue coils laid over the condenser coils round the tank and the pump                                                                                                                                                           |
| `chill-lens-boiler`   | 100              | Chill lenses      | glowing ice-blue dial faces behind the pressure gauge's and the thermometer's needles, and a lens on the blower's hub                                                                                                                      |
| `chiller-boiler`      | 105              | Aether chiller    | a glowing halo round the steam drum inside the fins, and one round the blower's housing                                                                                                                                                    |
| `frost-line-boiler`   | 110              | Frost lines       | glow lines along the plate front over the drip trays, and a glow hoop inside the brass hoop                                                                                                                                                |
| `aether-frost-boiler` | 115              | Aether frost      | glow rings along both water jackets and round the three whistles' collars                                                                                                                                                                  |

Where each part sits, and why: the rig outline a look may not leave is the kettle dome's ellipse
(x +-0.24, z 0..0.22 in the dome's frame), its base plate (z +-0.0175), its valve stem and the
stem's ring, so LK2's sockets are the two drum heads, the shoulder over the right drum, the plate
front, the column between the drums and the firebox front. Every fitted part stands in front of
the heads (nearer the camera) so it draws over them. LK10's sockets are what LK2 left open: the
ring round each drum head outside its rivets (the jackets, the aether frost; the ellipse lets a
ring round a drum's axis reach 0.091 m at its 45-degree point, so the jackets are 0.089 m rings
over the heads' own brass rims, and a first cut at 0.098 m left 40 cells outside the rig), each
head's inboard lower quarter beside the door (the sight glasses), the left head's lower band
under the whistle rack (the pump, the coils), the header line between the handwheels and the
plate front under it (the cocks, the trays, the frost lines), the ring round the steam drum's
head under the stem (the fins, the chiller halo), the right head's lower band under the gauge's
empty dial half (the grille), the left head's upper-outboard quarter over the first whistle (the
blower), the steam drum's left rim beside the tallest whistle (the tank, the coils), the steam
drum's boss (the thermometer, a chill lens), the gauge's dial face behind its needle (a chill
lens), the outline's own edge just inside it (the hoop, the frost lines) and the jackets' upper
arcs (the rime). A later part stands nearer the camera than what it is fitted over, so it draws
over it; the jackets alone stand behind LK2's fittings, so the safety valve's lever and the
whistles keep their outline. Above 115 the wiring's finish tail (#809) keeps the aether-frost
boiler and paints it in the band's finish.

## Files

| File                         | What it is                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `parts.png`                  | each part alone in the game's front view at 768 px/m, six a row                                      |
| `tier-1.png`, `tier-3.png`   | the rig at that tier with each look on the slot, 512 px/m, the nose lit as while drilling, six a row |
| `tier-<n>.ingame.png`        | the same at 90 px/m, about what a 1080p screen shows at the default 12 m zoom                        |
| `tier-<n>.phone.png`         | the same at a 360 px wide phone's 30 px/m over the 12 m zoom, enlarged 8x with no smoothing          |
| `glow.png`                   | the tier-1 rig with each look by its emission alone: what the emissive map carries                   |
| `outline.json`               | each look's silhouette cells outside the rig at tiers 1 and 3, and the kettle's against the dome     |
| `readability.json`           | the phone-size pixels each step changes, and the nose's brightest pixel against the boiler's         |
| `boilerLooks.json`           | the asset, its slot, its parts with their step names and edges                                       |
| `author_boiler_looks.py`     | wrote the first version of the source (Blender): the kettle and the twin-drum boiler                 |
| `author_boiler_steps.py`     | fitted the five LK2 parts into the source (Blender); a re-run rewrites them in place                 |
| `author_boiler_p40_steps.py` | fitted the seventeen LK10 parts into the source (Blender); a re-run rewrites them in place           |
| `render_boiler_looks.py`     | the renders above (Blender), on the casing driller review's frame and stage                          |
| `check_outline.py`           | writes `outline.json` (Blender); exits 1 when a look leaves the rig outline                          |
| `sheet_boiler_looks.py`      | lays the renders out into the sheets and writes `readability.json` (Pillow, numpy)                   |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-boiler/author_boiler_looks.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-boiler/author_boiler_steps.py
blender -b --factory-startup --python-exit-code 1 -P docs/art/rig-look-boiler/author_boiler_p40_steps.py
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

## Checks (25 Oct 2026, LK10)

Against #873's acceptance, with the numbers the scripts wrote:

- **Twenty-three authored steps, one on every edge to about P40** (`boilerLooks.json`,
  `rigLook.json`): 5 to 115, the step of 5 LK1 froze for the boiler, the six steps of #582 and
  LK2 first and the seventeen LK10 fittings after them, so no boiler band to P40 is an `it.todo`
  any more and the median bot gets a band step at least every 3 planets by construction (the
  sizing row asked for 13). Each step is an added part, none a recolour.
- **Inside the rig outline** (`outline.json`): on a 4 mm grid every look has 0 cells outside the
  rig's silhouette at tier 1 and at tier 3, and the kettle still differs from the rig's own dome
  by 0 cells. The parts live on `hull.boiler` only, so the drawn drill tip is untouched, and the
  collider is the code constant (`COLLIDER_M`, 0.9 m) no art feeds. The first pass had the water
  jackets at 0.098 m (40 cells outside, at their 45-degree points) and the blower's housing 2 mm
  past the ellipse (1 cell); both were re-sized, as the author script's comments say.
- **Readable at 360 px** (`tier-<n>.phone.png`, `readability.json`): the pixels of the boiler's
  footprint each step changes against the look before it, a channel moving more than 24 of 255,
  untinted. At the closest zoom (8 m, 45 px/m), where the sweep spec judges one visible step as 16
  pixels over the whole rig, tier 1 (tier 3 within 1): water jackets **16**, sight glasses 10,
  feed pump **17**, blow-down cocks 12, cooling fins **18**, radiator grille 12, blower fan 7,
  feedwater tank 7, condenser coils 10, thermometer dial 11, brass hoop **35**, frost rime 10,
  cryo coils **19**, chill lenses 15, aether chiller 6, frost lines **50**, aether frost 14. At the
  default 12 m zoom (30 px/m): 5, 5, 7, 3, 7, 6, 3, 2, 2, 5, 10, 2, 8, 6, 0, 19, 2. A first pass
  had 5 mm fins, 10 mm jacket bands, copper coils on a copper tank and 8 mm rime caps at 0, 11, 0
  and 1; a 45 px/m pixel is 22 mm, so a part thinner than about a fifth of that moves no pixel
  by geometry alone, and those were thickened (the fins to 14 mm, the jackets to 14 mm bands,
  the tank to steel under the copper coils, the rime to 14 mm slabs over the jackets and the
  trays). What is small by nature on a 0.5 m boiler (a 27 mm blower, a 30 mm tank, 12 mm coils,
  a 7 mm halo) stays at 6 to 11 pixels; in the game every band also wears its own tint and glow
  from `rigLook.json`, which the sweep's crop diff sees and these renders leave out. At 90 px/m
  every step reads on the rig (`tier-1.ingame.png`).
- **The drill nose stays the brightest glow** (`glow.png`, `readability.json`): by emission alone
  the nose's brightest pixel is 246 to 247 against the boiler's 150 to 163 across the LK10 looks
  (the chill glows at 0.3, the drive's aether emission, under the firebox port's 0.5 and the nose
  seams' 1.6). Lit, the looks' brightest pixel is 206 to 220 up to the cryo coils, the brass and
  dial highlights under the key light as LK2's 209 to 215; from the chill lenses on it is 249 to
  250, the pale glowing dial faces under the key light, against the lit nose's 203 at tier 1 and
  253 at tier 3. The step glows in `rigLook.json` are 0.74, under the `rigBody` cap of 1 with the
  glint's 0.25 (`rigLookTableChecks` refuses more).
- **Band names:** seventeen data strings of 2 words in `rigLook.json` (`card`) and
  `boilerLooks.json`; the table checks refuse longer ones.
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
- The LK10 fittings overlay LK2's: the radiator grille covers the gauge's empty lower dial, the
  blower the first whistle's top, the feedwater tank the tallest whistle's inner edge, and the
  sight glasses the door frame's edges; the water jackets stand behind LK2's fittings so the
  safety valve's lever and the whistles keep their outline.
- The chill lenses lie behind the gauge's and thermometer's needles, so the needles still read;
  lit, those pale glowing faces are the look's brightest pixels (above), though by emission the
  nose stays far ahead.
