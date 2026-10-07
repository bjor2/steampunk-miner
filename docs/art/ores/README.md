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

| File                                              | What it is                                                                                                                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blend/ore-<family>.blend`                        | the family's scene: 4 variant rows x 5 grade columns of 1 m cells on their band's rock, lamp rig                                                                        |
| `sheets/<family>.shallow.jpg`                     | the family grid at 256 px/m under the headlamp and fill (the ground bake density, #151's size)                                                                          |
| `sheets/<family>.deep.jpg`                        | the same under the dim cool fill of band 5                                                                                                                              |
| `sheets/<family>.closeup.jpg`                     | variant 0 at 480 px/m                                                                                                                                                   |
| `sheets/<family>.{shallow,deep}.luma.json`        | measured ore and rock luma per cell and whether the order holds along every variant row                                                                                 |
| `sheets/<family>.budget.json`                     | source triangles per cell (render-evaluated); they never reach the game                                                                                                 |
| `sheets/ladder.<palette>.jpg`                     | all 12 families (variant 0) by grade on that planet palette's rock; `-gray` is the blind-order test, `-deutan` the deuteranopia check, `-ingame` the 85 px/m downsample |
| `sheets/mining-hit.jpg`                           | every family and grade with the drill tip on the cell and the grade's particle count bursting                                                                           |
| `sheets/sell-bay.g<grade>.jpg`                    | the grade's sell-bay presentation for all 12 families: pile, sacks, crate, brass case, pedestal                                                                         |
| `sheets/silhouettes.png`                          | the baked masks of variant 0 filled solid black: the identity test at tile scale                                                                                        |
| `sheets/families.contact{,.deep}.jpg`             | one row per family, side by side                                                                                                                                        |
| `atlas-layout.json`                               | the atlas cell table (written by `atlas_layout.py`; the slice's spec compares against it)                                                                               |
| `../../../public/assets/ground/ground-ore-atlas/` | the shipped asset: the three 4096 KTX2 atlases and the schema-1 `parts.json` sidecar with one part per cell (written by `assemble_atlas.py`)                            |

## Pipeline

```
python3 docs/art/ores/atlas_layout.py                       # the cell table from the slice's family rows
BLENDER_USER_SCRIPTS=/tmp/empty blender -b --factory-startup --python-exit-code 1 \
  -P docs/art/ores/author_ores.py -- [family ...]           # author, bake tiles, render the family sheets
BLENDER_USER_SCRIPTS=/tmp/empty blender -b --factory-startup --python-exit-code 1 \
  -P docs/art/ores/render_sheets.py -- [ladder|hits|sell]   # the cross-family sheets
python3 docs/art/ores/assemble_atlas.py                     # the three atlases, KTX2, the shipped asset and its sidecars
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
  mip chains, one thread). It then ships the asset: the maps and the exported `parts.json` sidecar
  under `public/assets/ground/ground-ore-atlas/`, plus the placeholder sidecar under
  `art/placeholders/`, every cell a part (`<family>-v<variant>-g<grade>`, its content rect, 248 px
  as metres at 256 px/m), hashed over the 12 `.blend` sources. The slice registers the same id and
  part ids (`oreAtlasArtAssetOf`, #214), so the kernel's asset lint checks the files, and a slice
  spec pins both sidecars to the cell table. A glowing-grade cell whose bake found no emission
  texel (4 of the 144: `alien-v3-g3`, `fossil-v0-g3`, `fossil-v1-g3`, `metal-v1-g3`, whose few
  sparkle points fell between texels) ships dark and is named in the run's output; the G3 rim and
  sparkle are shader-driven on top (#151 motion), so the cell still escalates in the game.
- Through the MCP (`/workspace/claude-sessions/start-blender-mcp.sh`): add this folder to
  `sys.path`, `import author_ores`, `author('crystal', bake=False, render=False)` and `look`.
  Modules reload on every call.

## The families

<!-- families -->

| family      | silhouette (G1 to G5 escalates this shape)                          | hue band | sat  | luma band | kernel decal |
| ----------- | ------------------------------------------------------------------- | -------- | ---- | --------- | ------------ |
| alien       | pods: bulbous pod and egg clusters                                  | 120-135  | 0.70 | 0.52-0.74 | flecks       |
| ancient     | inlay: right-angle inlay lines, like a circuit                      | 55-65    | 0.75 | 0.58-0.80 | flecks       |
| cryo        | stars: six-point frost stars, hex plates                            | 200-212  | 0.30 | 0.70-0.92 | shards       |
| crystal     | shards: pointed prism shards                                        | 180-192  | 0.80 | 0.64-0.86 | shards       |
| energy      | forks: zig-zag lightning-fork veins                                 | 222-238  | 0.85 | 0.58-0.80 | shards       |
| exotic      | fragments: detached floating fragments with void gaps               | 295-310  | 0.75 | 0.52-0.74 | shards       |
| fossil      | shells: spiral shells, curled bone fragments                        | 46-50    | 0.25 | 0.64-0.86 | flecks       |
| metal       | flecks: angular flecks, blocky nuggets, ingot-like veins            | 205-215  | 0.12 | 0.52-0.74 | flecks       |
| organic     | tendrils: branching coral and root tendrils                         | 318-332  | 0.65 | 0.52-0.74 | flecks       |
| radioactive | pellets: smooth capsule pellets, each with a thin halo ring         | 80-95    | 0.85 | 0.64-0.86 | flecks       |
| relic       | cogs: broken cogs, rivet heads, gear teeth                          | 155-168  | 0.50 | 0.46-0.68 | flecks       |
| volcanic    | lumps: glassy obsidian lumps with curved, shell-like fracture lines | 345-358  | 0.60 | 0.30-0.55 | flecks       |

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
| encoded    | albedo 1.4 MiB, normal 4.2 MiB, emissive 0.4 MiB                                                                                                       |

<!-- /atlas -->

## Budgets per grade

Source triangles, measured on the `.blend` files (render-evaluated, modifiers applied, mean over
the 12 families x 4 variants); they do not reach the game, which draws baked maps.

<!-- budgets -->

| grade       | mean tris | min  | max  | maps                     |
| ----------- | --------- | ---- | ---- | ------------------------ |
| G1 Raw      | 1314      | 108  | 5936 | albedo, normal           |
| G2 Lustrous | 1935      | 432  | 7084 | albedo, normal           |
| G3 Crystal  | 2164      | 572  | 7204 | albedo, normal, emissive |
| G4 Lumen    | 3237      | 1300 | 8756 | albedo, normal, emissive |
| G5 Aether   | 2369      | 1212 | 6256 | albedo, normal, emissive |

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

| family      | G1 body / cell / rock | G2                 | G3                 | G4                 | G5                 | body order | cell order |
| ----------- | --------------------- | ------------------ | ------------------ | ------------------ | ------------------ | ---------- | ---------- |
| alien       | 0.11 / 0.14 / 0.15    | 0.28 / 0.22 / 0.12 | 0.38 / 0.28 / 0.10 | 0.47 / 0.28 / 0.10 | 0.57 / 0.29 / 0.07 | rises      | not strict |
| ancient     | 0.10 / 0.13 / 0.15    | 0.21 / 0.15 / 0.13 | 0.24 / 0.13 / 0.11 | 0.32 / 0.19 / 0.10 | 0.45 / 0.22 / 0.07 | rises      | not strict |
| cryo        | 0.11 / 0.13 / 0.15    | 0.31 / 0.26 / 0.13 | 0.33 / 0.26 / 0.12 | 0.44 / 0.29 / 0.10 | 0.52 / 0.31 / 0.07 | rises      | not strict |
| crystal     | 0.10 / 0.13 / 0.15    | 0.32 / 0.27 / 0.13 | 0.42 / 0.33 / 0.14 | 0.49 / 0.35 / 0.13 | 0.61 / 0.36 / 0.11 | rises      | not strict |
| energy      | 0.12 / 0.14 / 0.15    | 0.16 / 0.14 / 0.12 | 0.20 / 0.13 / 0.10 | 0.27 / 0.20 / 0.09 | 0.36 / 0.22 / 0.07 | rises      | not strict |
| exotic      | 0.07 / 0.11 / 0.14    | 0.19 / 0.17 / 0.13 | 0.23 / 0.17 / 0.11 | 0.32 / 0.22 / 0.09 | 0.46 / 0.27 / 0.07 | rises      | not strict |
| fossil      | 0.12 / 0.14 / 0.15    | 0.24 / 0.21 / 0.14 | 0.34 / 0.34 / 0.10 | 0.51 / 0.43 / 0.12 | 0.63 / 0.41 / 0.08 | rises      | not strict |
| metal       | 0.07 / 0.09 / 0.13    | 0.18 / 0.17 / 0.12 | 0.24 / 0.21 / 0.10 | 0.35 / 0.30 / 0.10 | 0.52 / 0.32 / 0.07 | rises      | rises      |
| organic     | 0.12 / 0.14 / 0.15    | 0.16 / 0.14 / 0.12 | 0.19 / 0.13 / 0.10 | 0.28 / 0.18 / 0.09 | 0.37 / 0.20 / 0.07 | rises      | not strict |
| radioactive | 0.13 / 0.14 / 0.15    | 0.29 / 0.28 / 0.12 | 0.34 / 0.28 / 0.10 | 0.41 / 0.30 / 0.10 | 0.50 / 0.31 / 0.07 | rises      | not strict |
| relic       | 0.08 / 0.12 / 0.15    | 0.17 / 0.14 / 0.12 | 0.21 / 0.18 / 0.09 | 0.34 / 0.26 / 0.10 | 0.53 / 0.28 / 0.07 | rises      | rises      |
| volcanic    | 0.08 / 0.13 / 0.15    | 0.09 / 0.10 / 0.12 | 0.14 / 0.12 / 0.09 | 0.25 / 0.18 / 0.09 | 0.38 / 0.24 / 0.07 | rises      | not strict |

<!-- /luma -->

The ladder sheets put all 12 families (variant 0) on each planet palette's rock; the grayscale
copy is the blind-order test and the deuteranopia copy the family check:

<!-- ladder -->

| palette  | body luma rises along every family row | cells |
| -------- | -------------------------------------- | ----- |
| heat     | rises                                  | 60    |
| planet_1 | rises                                  | 60    |
| planet_2 | rises                                  | 60    |

<!-- /ladder -->

## Deferred to kernel tickets

The slice ticket (#144) could not land these without kernel edits (feature-slices.md rule 7); they
are listed in the resolution comment on #144:

- the ore atlas renderer (`src/systems/render/ore/`: the loader of the shipped
  `ground-ore-atlas` sidecar and maps, the ore shader reading a cell's rect, the 24-slot light
  buffer, the particle pool hook) and an `OreLook` that names the atlas cell; the slice's
  `oreLookOfCell` is built and tested but not registered: the kernel's chunk-batch spec
  (`chunkTileBatch.test.ts`, "draws ore with its family silhouette and a glow") expects planet-1
  ore to glow and sparkle, which the Game Director's G1 grade does not
- the in-game composite (a G1-G5 ladder on the live terrain shader) and the gate-marker
  readability checks, which need that renderer, the #148 markers and the #147 planet tints
- the Game Director's sign-off on the sheets (#151 section 4, last line)
