# The jump drive

The Blender source and review renders of the rig part of
[Star map S6: jump between solar systems + jump drive (#759)](https://github.com/bjor2/steampunk-miner/issues/759),
the last ticket of [the star map plan (#650)](https://github.com/bjor2/steampunk-miner/issues/650):
the GD lock gives the jump drive "a visible part on the rig". The drive is a kernel purchase
(`buyJumpDrive`, the `jump_drive` schedule row), so its part is a kernel vehicle piece,
`JumpDrivePiece`, drawn once the vehicle has the drive.

Authored in Blender 4.2.9 on the shared box: `author_jump_drive.py` wrote the first version of the
file, and `art/blender/vehicle-jump-drive/vehicle-jump-drive.blend` is the source from now on (Git
LFS).

## The part

One part, `jump-drive`, authored in its own frame with the wagon hitch, `hull.hitch`, at the
origin, as the coal tender is, so the game draws it at the hitch's `atM` with no offset. The hitch
is the kernel's own point: no rig-look part or vehicle item takes it, so the drive shares it with
the tender alone. Every tender body ends at x -0.56 on the same frame bar, so the drive's brass mast
stands just behind it on an iron shoe bolted to the frame's end, clear of all four wagons. Four
copper windings on the mast carry a pale aether globe in a brass orbit ring; a copper conduit runs
in front of the frame to a brass junction at the hitch, which keeps the origin inside the part's
bounds. Draw order `z` 1, over the wagon's 0. Nothing glows (no emissive map), so the drill nose
stays the brightest part.

## Files

| File                   | What it is                                                                    |
| ---------------------- | ----------------------------------------------------------------------------- |
| `sheet.png`            | the drive alone, then over each tender wagon at the hitch, 768 px/m           |
| `sheet.ingame.png`     | the same at 90 px/m, about what a 1080p screen shows at the default 12 m zoom |
| `author_jump_drive.py` | wrote the first version of the source (Blender)                               |
| `render_jump_drive.py` | the renders (Blender); the tender's `.blend` path may be given                |
| `sheet_jump_drive.py`  | lays the renders out into the sheets (Pillow)                                 |

```
blender -b --factory-startup --python-exit-code 1 -P docs/art/jump-drive/author_jump_drive.py
npm run art:export -- vehicle-jump-drive
FUEL_TENDER_BLEND=<vehicle-fuel-tank.blend> \
  blender -b --factory-startup --python-exit-code 1 -P docs/art/jump-drive/render_jump_drive.py
python3 docs/art/jump-drive/sheet_jump_drive.py
```

## Checks (24 Oct 2026)

- **Clear of every wagon** (`sheet.png`): the mast stands behind the coal cart, the bunker, the
  riveted tender and the guild tender alike; beside the guild tender's lantern the globe sits a
  little lower and to the left.
- **Reads at in-game size** (`sheet.ingame.png`): the globe and the copper windings stay a bright
  upright mark behind the wagon at 90 px/m. Phone-size and in-game screenshots of the running rig
  are the Tester's.
- **Collision and hitbox unchanged**: the collider is a code constant no art feeds, and
  `vehicle.blend` is untouched.
