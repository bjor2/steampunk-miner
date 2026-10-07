# Ore art: twelve families, five grades, four variants

The ore and mineral models of
[Art: Ore and mineral 3D models in Blender (#144)](https://github.com/bjor2/steampunk-miner/issues/144),
made to the closed
[Spec: Ore visual and model progression (#151)](https://github.com/bjor2/steampunk-miner/issues/151):
the Assay direction from the [ladder prototype](../ore-ladder/README.md) with Stamped's baked G2
glint and Voltaic's white-blue arcs, carried across the Game Director's 12 thematic families.
Every family is one silhouette that escalates through the five visual grades, each grade adding
one channel and keeping the ones below:

| grade | adds            | what the marks do                                                                          | glow                                   |
| ----- | --------------- | ------------------------------------------------------------------------------------------ | -------------------------------------- |
| G1    | form            | sparse, matte, half-sunk in the rock                                                       | none                                   |
| G2    | **sheen**       | denser; metallic, waxy or glassy specular; a pale glint baked into the albedo              | none                                   |
| G3    | **structure**   | three-dimensional, standing off the face in a cluster; faint rim light; sparkles           | rim, sparkle points                    |
| G4    | **inner light** | a ring around a pulsing core, veins to the four cell corners                               | core, veins, rim                       |
| G5    | **own effect**  | the marks hover in a crown; dichroic body; white core; arcs to the marks and a cell corner | core, arcs, rim; lights the neighbours |

Authored in Blender 4.2.9 on the shared box through the Blender MCP and these scripts; the
`.blend` files under `blend/` are the sources from now on (Git LFS). The family rows (silhouette,
hue band, luma band, glow hue) are the slice's data,
`src/features/ore-visuals/oreLooks.json`, read by both the game code and the bake, so the atlas
enumerates exactly the families the slice knows.

## Files

| File                                       | What it is                                                                                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blend/ore-<family>.blend`                 | the family's scene: 4 variant rows x 5 grade columns of 1 m cells on their band's rock, lamp rig                                                                        |
| `sheets/<family>.shallow.jpg`              | the family grid at 256 px/m under the headlamp and fill (the ground bake density, #151's size)                                                                          |
| `sheets/<family>.deep.jpg`                 | the same under the dim cool fill of band 5                                                                                                                              |
| `sheets/<family>.closeup.jpg`              | variant 0 at 480 px/m                                                                                                                                                   |
| `sheets/<family>.{shallow,deep}.luma.json` | measured ore and rock luma per cell and whether the order holds along every variant row                                                                                 |
| `sheets/<family>.budget.json`              | source triangles per cell (render-evaluated); they never reach the game                                                                                                 |
| `sheets/ladder.<palette>.jpg`              | all 12 families (variant 0) by grade on that planet palette's rock; `-gray` is the blind-order test, `-deutan` the deuteranopia check, `-ingame` the 85 px/m downsample |
| `sheets/mining-hit.jpg`                    | every family and grade with the drill tip on the cell and the grade's particle count bursting                                                                           |
| `sheets/sell-bay.g<grade>.jpg`             | the grade's sell-bay presentation for all 12 families: pile, sacks, crate, brass case, pedestal                                                                         |
| `sheets/silhouettes.png`                   | the baked masks of variant 0 filled solid black: the identity test at tile scale                                                                                        |
| `sheets/families.contact{,.deep}.jpg`      | one row per family, side by side                                                                                                                                        |
| `atlas-layout.json`                        | the atlas cell table (written by `atlas_layout.py`; the slice's spec compares against it)                                                                               |

## Pipeline

```
python3 docs/art/ores/atlas_layout.py                       # the cell table from the slice's family rows
BLENDER_USER_SCRIPTS=/tmp/empty blender -b --factory-startup --python-exit-code 1 \
  -P docs/art/ores/author_ores.py -- [family ...]           # author, bake tiles, render the family sheets
BLENDER_USER_SCRIPTS=/tmp/empty blender -b --factory-startup --python-exit-code 1 \
  -P docs/art/ores/render_sheets.py -- [ladder|hits|sell]   # the cross-family sheets
python3 docs/art/ores/assemble_atlas.py                     # pack the tiles into the three atlases, encode KTX2
python3 docs/art/ores/sheet_post.py                         # grayscale, deuteranopia, in-game, silhouettes, contacts
```

- `ore_families.py` builds one mark of each family's silhouette; `ore_grades.py` places the marks by
  grade (scatter, denser scatter, a cluster from a root, a ring round a core, a hovering crown) and
  adds the grade's material and glow layers; `ore_stage.py` is the stage (reusing the ladder
  prototype's scene, lamp rig, cameras and image post).
- `bake_cells.py` bakes each cell from a 1 m quad behind its marks with Cycles at 1 sample and
  seed 0: the albedo through emission stand-ins in each material's authored colour (so glass and
  metal bake their colour, not a lit result) with the mask from a white stand-in in the alpha, the
  tangent-space normal (OpenGL, +Y up) and the emission divided by `coreEmissionMax` (4), so the
  map holds strength / 4 for the shader to scale back. The host rock is never baked: the game draws
  its strata under the ore. Tiles are 248 px and go to `art/build/ores/` (gitignored).
- `assemble_atlas.py` places every tile in its 256 px cell with the edge pixels extended into the
  4 px gutter, writes `art/build/ores/ore-atlas.{albedo,normal,emissive}.png` and encodes them like
  `scripts/art/encode.sh` (ETC1S sRGB for albedo and emissive, UASTC linear for the normal, full
  mip chains, one thread).
- Through the MCP (`/workspace/claude-sessions/start-blender-mcp.sh`): add this folder to
  `sys.path`, `import author_ores`, `author('crystal', bake=False, render=False)` and `look`.
  Modules reload on every call.

## The families

<!-- families -->

| family      | silhouette (G1 to G5 escalates this shape)                          | hue band | sat  | luma band | kernel decal |
| ----------- | ------------------------------------------------------------------- | -------- | ---- | --------- | ------------ |
| alien       | pods: bulbous pod and egg clusters                                  | 120-135  | 0.70 | 0.38-0.62 | flecks       |
| ancient     | inlay: right-angle inlay lines, like a circuit                      | 55-65    | 0.75 | 0.46-0.72 | flecks       |
| cryo        | stars: six-point frost stars, hex plates                            | 200-212  | 0.30 | 0.64-0.92 | shards       |
| crystal     | shards: pointed prism shards                                        | 180-192  | 0.80 | 0.55-0.82 | shards       |
| energy      | forks: zig-zag lightning-fork veins                                 | 222-238  | 0.85 | 0.46-0.72 | shards       |
| exotic      | fragments: detached floating fragments with void gaps               | 295-310  | 0.75 | 0.38-0.62 | shards       |
| fossil      | shells: spiral shells, curled bone fragments                        | 46-50    | 0.25 | 0.55-0.82 | flecks       |
| metal       | flecks: angular flecks, blocky nuggets, ingot-like veins            | 205-215  | 0.12 | 0.38-0.62 | flecks       |
| organic     | tendrils: branching coral and root tendrils                         | 318-332  | 0.65 | 0.38-0.62 | flecks       |
| radioactive | pellets: smooth capsule pellets, each with a thin halo ring         | 80-95    | 0.85 | 0.55-0.82 | flecks       |
| relic       | cogs: broken cogs, rivet heads, gear teeth                          | 155-168  | 0.50 | 0.30-0.52 | flecks       |
| volcanic    | lumps: glassy obsidian lumps with curved, shell-like fracture lines | 345-358  | 0.60 | 0.14-0.32 | flecks       |

<!-- /families -->

Hue is the family's band, one position per variant (none on the band's edges). In the bake the
five grades sit evenly across the family's luma band (a cell is per grade); in the game the tier
tints that cell with the kernel's rank `t / (t + 4)` (#13), so two tiers of one grade still rank.
No family hue sits in the reserved heat band (15-45) or the enemy purple (268-285). Glow is
always the family's own hue, white at the G5 core; volcanic glows white-gold in veins, never
orange (#151 heat rule); exotic shifts to its dichroic hue on the grazing edge from G5. Glassy
families keep their transmission low (0.3-0.4) and G4 and G5 bodies give off a floor of their
rim glow all over: that is the "lightened bodies" fix of the direction pick, without which a
translucent body over band-5 rock fell below G2 in greyscale.

## The atlas

<!-- atlas -->

|            |                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| atlas      | 4096 x 4096 px, 256 cells of 256 px, 16 a row                                                                                                          |
| cell       | 248 px of content inside a 4 px gutter; cell `i` at column `i mod 16`, row `i div 16`                                                                  |
| order      | families by id (alien, ancient, cryo, crystal, energy, exotic, fossil, metal, organic, radioactive, relic, volcanic), then variant 0-3, then grade 1-5 |
| cells used | 240 of 256 (15 rows, the last 16 cells spare)                                                                                                          |
| maps       | albedo (mask in alpha, ETC1S sRGB), normal (UASTC linear), emissive (ETC1S sRGB; cells below G3 empty)                                                 |

<!-- /atlas -->

## Budgets per grade

Source triangles, measured on the `.blend` files (render-evaluated, modifiers applied, mean over
the 12 families x 4 variants); they do not reach the game, which draws baked maps.

<!-- budgets -->

| grade       | mean tris | min  | max  | maps                     |
| ----------- | --------- | ---- | ---- | ------------------------ |
| G1 Raw      | 1624      | 120  | 5088 | albedo, normal           |
| G2 Lustrous | 2452      | 328  | 7044 | albedo, normal           |
| G3 Crystal  | 2150      | 344  | 5368 | albedo, normal, emissive |
| G4 Lumen    | 3865      | 1180 | 8656 | albedo, normal, emissive |
| G5 Aether   | 2771      | 1232 | 6256 | albedo, normal, emissive |

<!-- /budgets -->

Per cell the game holds one 256 px cell in each of three 4096 atlases (albedo with the mask in
alpha, normal, emissive from G3), inside the Technical Director's budgets on #151: 240 of 256
cells, no per-frame textures, all motion shader-driven, particles per hit 4, 8, 12, 20 and 32 by
grade inside the 512 pool, G5 neighbour light from the 24-slot light buffer. Those shader and
buffer parts are the kernel renderer follow-up (below).

## Readability at tile scale

Measured on the shallow family sheets at 256 px/m (`report_grid_luma`): mean Rec. 709 luma of the
cell's central 0.7 m (ore) and its outer 0.1 m (rock), per grade, variant 0.

<!-- luma -->

| family | G1 ore / rock | G2  | G3  | G4  | G5  | order (all 4 rows) |
| ------ | ------------- | --- | --- | --- | --- | ------------------ |

<!-- /luma -->

The ladder sheets put all 12 families (variant 0) on each planet palette's rock; the grayscale
copy is the blind-order test and the deuteranopia copy the family check:

<!-- ladder -->

(ladder sheets not rendered yet)

<!-- /ladder -->

## Deferred to kernel tickets

The slice ticket (#144) could not land these without kernel edits (feature-slices.md rule 7); they
are listed in the resolution comment on #144:

- the ore atlas renderer (`src/systems/render/ore/`: atlas loader, ore shader reading the cell
  table, the 24-slot light buffer, the particle pool hook) and an `OreLook` that names the atlas
  cell; the slice's `oreLookOfCell` is built and tested but not registered until then
- an asset manifest form and id for the three atlases (`assetManifest.ts`, `artIds.ts`), so the
  encoded `ore-atlas.*.ktx2` can ship under `public/assets/` with their budget entry
- the in-game composite (a G1-G5 ladder on the live terrain shader) and the gate-marker
  readability checks, which need that renderer, the #148 markers and the #147 planet tints
