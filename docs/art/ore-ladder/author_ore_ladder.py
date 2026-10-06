"""
Authors and renders the ore visual tier ladder prototype (#150): three style directions, each a
`.blend` of five 1 m ore cells (visual grades G1 to G5 of #151) and its review renders, all in this
folder. Headless:

    blender -b --python-exit-code 1 -P docs/art/ore-ladder/author_ore_ladder.py -- [direction ...] [--no-render]

Through the Blender MCP, add this folder to `sys.path`, import the module and call
`author('assay')` (or `render_direction` on a scene already built). The `.blend` files are the
sources from then on (#52): refine a direction in Blender and re-render with `render_direction`.

Written for the direction pick on #151; nothing here is game code. Per direction it writes
`<id>.blend`, `<id>.ladder.png` (256 px/m, the ground bake density), `<id>.ladder-gray.png` (the
Game Director's grayscale blind-order test), `<id>.ladder-ingame.png` (85 px/m, about 1080p at the
default zoom), `<id>.closeup.png` (480 px/m), `<id>.motion.png` (grades 4 and 5 over the three pulse
frames), `<id>.three-quarter.png` (grades 3 to 5 in perspective) and `<id>.luma.json` (the measured
luma order and ore-to-rock contrast per cell).
"""

import importlib
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import direction_assay  # noqa: E402
import direction_stamped  # noqa: E402
import direction_voltaic  # noqa: E402
import ladder_scene as stage  # noqa: E402

DIRECTIONS = {module.ID: module for module in (direction_assay, direction_voltaic, direction_stamped)}
LAYOUT_SEED = 150


def main():
    ids, render = parse_arguments(sys.argv)
    for direction_id in ids:
        author(direction_id, render=render)


def parse_arguments(argv):
    """The ids after `--` (default: all three) and whether to render after authoring."""
    given = argv[argv.index('--') + 1:] if '--' in argv else []
    render = '--no-render' not in given
    ids = [arg for arg in given if not arg.startswith('--')]
    unknown = [arg for arg in ids if arg not in DIRECTIONS]
    if unknown:
        raise SystemExit('author_ore_ladder: no direction named %s' % ', '.join(unknown))
    return ids or list(DIRECTIONS), render


def author(direction_id, render=True):
    direction = reload_direction(direction_id)
    stage.reset_scene()
    build_ladder(direction)
    stage.save_blend(output_path(direction, '.blend'))
    if render:
        return render_direction(direction_id)
    return None


def reload_direction(direction_id):
    """Pick up edits to the modules between MCP calls without restarting Blender."""
    for module in (stage.materials, stage.shapes, stage):
        importlib.reload(module)
    return importlib.reload(DIRECTIONS[direction_id])


def build_ladder(direction):
    if direction.LIT:
        stage.add_lamp_rig()
    rng = random.Random(LAYOUT_SEED)
    for grade in stage.GRADES:
        direction.build_tile(grade, stage.tile_x_of(grade), stage.band_colour_hex(grade), rng)
    stage.frame_ladder()


def render_direction(direction_id):
    direction = DIRECTIONS[direction_id]
    ladder = stage.render_ladder_sheet(output_path(direction, '.ladder.png'))
    stage.write_grayscale(ladder, output_path(direction, '.ladder-gray.png'))
    stage.write_downsampled(ladder, output_path(direction, '.ladder-ingame.png'), stage.IN_GAME_DOWNSAMPLE)
    report = stage.report_tile_luma(ladder, output_path(direction, '.luma.json'))
    stage.render_closeup(output_path(direction, '.closeup.png'))
    stage.render_motion_strip(output_path(direction, '.motion.png'))
    stage.render_three_quarter(output_path(direction, '.three-quarter.png'))
    stage.frame_ladder()
    print('rendered %s: %s' % (direction_id, report))
    return report


def output_path(direction, suffix):
    return os.path.join(HERE, direction.ID + suffix)


if __name__ == '__main__':
    main()
