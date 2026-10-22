"""
The python3 post step of the mineral skins (#576), after author_skin_layers.py has rendered: each
drawn layer's cell under cells/ (base and sheen as 8-bit grey, vein as grey with its alpha), each
skin of a batch composited by the rule in README.md, and the batch's review sheets: the layer
stacks, the skins at 256 px, the skins in a patch of ground at desktop (85 px a tile) and phone
(22 px a tile, 360 px wide) sizes, the game-scale strip with its greyscale and deuteranopia
copies, and the distinctness report between every pair of the batch's skins and between each of
them and the skins of the planet's other batches. A batch with mates on its planet also writes the
planet's game-scale strip, every skin of it so far, since no two species of a planet may look
alike. Pillow and numpy; Blender's Python has neither.

  python3 docs/art/mineral-skins/skin_post.py [batch]       # p1-b1 by default
"""

import itertools
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
HEROES = os.path.normpath(os.path.join(HERE, '..', 'ore-heroes'))
for folder in (HERE, HEROES):
    if folder not in sys.path:
        sys.path.insert(0, folder)

import hero_post as post  # noqa: E402
import skin_layers as layers  # noqa: E402
from atlas_layout import json_text_of  # noqa: E402

SHEET_DIR = os.path.join(HERE, 'sheets')
ART_DIRECTION_PATH = os.path.join(layers.REPO_ROOT, 'src', 'systems', 'render', 'artDirection.json')
# A tile on screen: the default 12 m zoom on 1080p, the 20 m zoom, and a phone at that zoom.
TILE_PX = (85, 40, 22)
DESKTOP_TILE_PX = 85
PHONE_TILE_PX = 22
PHONE_WIDTH_PX = 360
STRIP_MAGNIFY = 4
GAP_PX = 6
LABEL_PX = 14
JPEG_QUALITY = 90
# The palette each planet's ground wears (planetTable.ts PLANET_ARCHETYPES: P1 archetype.base, P2
# on archetype.heavy until the heat act at P8).
ROCK_PALETTES = {'p1': 'palette.planet_1', 'p2': 'palette.planet_2', 'p3': 'palette.planet_2',
                 'p4': 'palette.planet_2', 'p5': 'palette.planet_2'}
# The planet of the batch being posted: its rock is the ground every sheet lays a skin in.
rock_planet = 'p1'
BACKGROUND = (0.07, 0.05, 0.05)
# A vein's rim: its mask grown by 3 px (about 1 cm) at a ramp coordinate near the shadow, so the
# shape reads against a base of its own palette at every zoom.
RIM_PX = 3
RIM_COORDINATE = 0.1
# The patch of ground the desktop and phone sheets lay out: 16 tiles by 6 of band rock, each skin
# a run of ore tiles in it (column, row), so a skin is seen beside the rock and beside itself.
PATCH_TILES = (16, 6)
PATCH_RUNS = (
    ((1, 1), (2, 1), (2, 2)),
    ((5, 0), (5, 1), (6, 1)),
    ((9, 2), (10, 2), (10, 3)),
    ((13, 1), (13, 2), (14, 2)),
    ((3, 4), (4, 4), (4, 5), (8, 4)),
    ((11, 4), (12, 4), (12, 5)),
)


def main():
    batch = sys.argv[1] if len(sys.argv) > 1 else 'p1-b1'
    global rock_planet
    rock_planet = layers.planet_of(batch)
    os.makedirs(SHEET_DIR, exist_ok=True)
    cells = write_cells()
    skins = layers.batch_skins(batch)
    ramps = {entry['id']: entry['ramp'] for entry in layers.load_skins()['layers']['palette']}
    mates = layers.mate_skins(batch)
    composites = {skin['species']: composite_of(skin, cells, ramps) for skin in skins + mates}
    write_layer_sheet(batch, skins, cells, ramps, composites)
    write_skin_sheet(batch, skins, composites)
    write_patch_sheet(batch, skins, composites, DESKTOP_TILE_PX, 'desktop')
    phone = write_patch_sheet(batch, skins, composites, PHONE_TILE_PX, 'phone')
    write_magnified(phone, STRIP_MAGNIFY)
    strip = write_scale_strip(batch, skins, composites)
    post.write_blind_copies(strip)
    report = write_distinctness(batch, skins, mates, composites)
    if mates:
        post.write_blind_copies(write_planet_strip(batch, mates + skins, composites))
    for name in ('layers', 'skins'):
        shrink_to_jpeg(sheet_path(batch, '%s.png' % name))
    print('post done: %d cells, %d skins, least different pair %s' % (len(cells), len(skins), report['leastDifferentPair']))


# --- cells ------------------------------------------------------------------------------------------------


def write_cells():
    """
    Every drawn layer's render as its committed cell: grey for base and sheen, grey + alpha for a
    vein. A layer with no render in art/build (a checkout that authored only its own batch) keeps
    its committed cell as it is, so a batch re-renders only its new layers.
    """
    cells = {}
    for entry in layers.cell_table_of()['layers']:
        render_path = os.path.join(layers.BUILD_DIR, '%s-%s.png' % (entry['kind'], entry['id']))
        if not os.path.exists(render_path):
            cells[(entry['kind'], entry['id'])] = committed_cell(entry)
            continue
        render = post.read_rgba(render_path)
        grey = rec601_of(render[:, :, :3])
        alpha = render[:, :, 3] if entry['kind'] == 'vein' else np.ones_like(grey)
        if entry['kind'] == 'vein':
            grey, alpha = rimmed(grey, alpha)
        path = os.path.join(HERE, entry['cell'])
        os.makedirs(os.path.dirname(path), exist_ok=True)
        write_grey(path, grey, alpha if entry['kind'] == 'vein' else None)
        cells[(entry['kind'], entry['id'])] = np.stack([grey, alpha], axis=2)
    return cells


def committed_cell(entry):
    """The cell as committed: grey, and its alpha (1 for a base or a sheen)."""
    grey_alpha = np.asarray(Image.open(os.path.join(HERE, entry['cell'])).convert('LA'), dtype=np.float32) / 255.0
    return grey_alpha if entry['kind'] == 'vein' else np.stack([grey_alpha[:, :, 0], np.ones_like(grey_alpha[:, :, 0])], axis=2)


def rimmed(grey, alpha):
    """The vein over its rim: the mask grown by a disc of RIM_PX, filled at RIM_COORDINATE."""
    grown = np.zeros_like(alpha)
    for dy in range(-RIM_PX, RIM_PX + 1):
        for dx in range(-RIM_PX, RIM_PX + 1):
            if dx * dx + dy * dy <= RIM_PX * RIM_PX:
                grown = np.maximum(grown, shifted(alpha, dy, dx))
    return grey * alpha + RIM_COORDINATE * (1.0 - alpha), grown


def shifted(image, dy, dx):
    """Moved by (dy, dx) with zeros brought in, so a mark never wraps to the cell's far edge."""
    out = np.zeros_like(image)
    height, width = image.shape
    out[max(dy, 0):height + min(dy, 0), max(dx, 0):width + min(dx, 0)] = \
        image[max(-dy, 0):height + min(-dy, 0), max(-dx, 0):width + min(-dx, 0)]
    return out


def rec601_of(rgb):
    """Display luma, the kernel's `lumaOf`: the cell's value is the ramp coordinate as drawn."""
    return rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)


def write_grey(path, grey, alpha):
    mode, channels = ('L', grey) if alpha is None else ('LA', np.stack([grey, alpha], axis=2))
    Image.fromarray(post.to_bytes(channels), mode).save(path, optimize=True)


# --- the compositing rule (README.md "Compositing") ---------------------------------------------------------


def composite_of(skin, cells, ramps):
    ramp = [np.array(post.rgb_of_hex(hex_colour), dtype=np.float32) for hex_colour in ramps[skin['palette']]]
    base = cells[('base', skin['base'])][:, :, 0]
    vein = cells[('vein', skin['vein'])]
    sheen = cells[('sheen', skin['sheen'])][:, :, 0]
    colour = ramp_at(ramp, base)
    alpha = vein[:, :, 1:2]
    colour = colour * (1.0 - alpha) + ramp_at(ramp, vein[:, :, 0]) * alpha
    return 1.0 - (1.0 - colour) * (1.0 - sheen[:, :, None] * ramp[2])


def ramp_at(ramp, t):
    """Shadow at 0, body at 0.5, light at 1, linear in display values between."""
    shadow, body, light = ramp
    low = np.clip(t / 0.5, 0.0, 1.0)[:, :, None]
    high = np.clip((t - 0.5) / 0.5, 0.0, 1.0)[:, :, None]
    return np.where(t[:, :, None] <= 0.5, shadow + (body - shadow) * low, body + (light - body) * high)


# --- sheets -----------------------------------------------------------------------------------------------


def write_layer_sheet(batch, skins, cells, ramps, composites):
    """One row a skin: base, vein (over the rock), sheen, palette, and the skin they make."""
    rock = rock_rgb()
    rows = []
    for skin in skins:
        vein = cells[('vein', skin['vein'])]
        panels = [grey_rgb(cells[('base', skin['base'])][:, :, 0]),
                  grey_rgb(vein[:, :, 0]) * vein[:, :, 1:2] + rock * (1.0 - vein[:, :, 1:2]),
                  grey_rgb(cells[('sheen', skin['sheen'])][:, :, 0]),
                  palette_panel(ramps[skin['palette']]),
                  composites[skin['species']]]
        labels = [skin['base'], skin['vein'], skin['sheen'], skin['palette'], skin['species']]
        rows.append(labelled_row(panels, labels))
    return post.write_rgb(sheet_path(batch, 'layers.png'), stacked(rows))


def write_skin_sheet(batch, skins, composites):
    """The batch's skins at 256 px a metre, side by side: one picture per new visual state."""
    row = labelled_row([composites[skin['species']] for skin in skins], [skin['species'] for skin in skins])
    return post.write_rgb(sheet_path(batch, 'skins.png'), row)


def write_patch_sheet(batch, skins, composites, tile_px, name):
    """A patch of band rock at the tile size, each skin a short run of ore tiles in it."""
    columns, rows = PATCH_TILES
    rock = rock_rgb()
    patch = np.tile(rock, (rows * tile_px, columns * tile_px, 1)).astype(np.float32)
    for skin, run in zip(skins, PATCH_RUNS):
        tile = post.resampled(composites[skin['species']], tile_px)
        for column, row in run:
            patch[row * tile_px:(row + 1) * tile_px, column * tile_px:(column + 1) * tile_px] = tile
    if name == 'phone':
        patch = framed_to_width(patch, PHONE_WIDTH_PX)
    return post.write_rgb(sheet_path(batch, '%s.png' % name), patch)


def write_scale_strip(batch, skins, composites):
    """One row per tile size, every skin as a 2 x 2 run on the rock, then magnified for the eye."""
    rows = [scale_row(skins, composites, px) for px in TILE_PX]
    strip = stacked(rows)
    post.write_rgb(sheet_path(batch, 'scale.png'), strip)
    return write_magnified(sheet_path(batch, 'scale.png'), STRIP_MAGNIFY)


def write_planet_strip(batch, skins, composites):
    """The scale strip of every skin of the planet so far, in roster-slot order."""
    path = os.path.join(SHEET_DIR, '%s.scale.png' % layers.planet_of(batch))
    post.write_rgb(path, stacked([scale_row(skins, composites, px) for px in TILE_PX]))
    return write_magnified(path, STRIP_MAGNIFY)


def scale_row(skins, composites, tile_px):
    rock = rock_rgb()
    blocks = []
    for skin in skins:
        tile = post.resampled(composites[skin['species']], tile_px)
        block = np.tile(rock, (tile_px * 3, tile_px * 3, 1)).astype(np.float32)
        block[tile_px // 2:tile_px // 2 + 2 * tile_px, tile_px // 2:tile_px // 2 + 2 * tile_px] = np.tile(tile, (2, 2, 1))
        blocks.append(block)
    return side_by_side(blocks)


def write_magnified(path, factor):
    return post.write_rgb(path[:-4] + '-x%d.png' % factor, post.magnified(post.read_rgb(path), factor))


# --- distinctness -----------------------------------------------------------------------------------------


def write_distinctness(batch, skins, mates, composites):
    """
    Per skin of the batch at the phone tile (22 px): mean colour, luma and hue, and its contrast
    against the rock. Per pair, the batch's own and each of its skins against the planet's other
    batches' (`mates`): how far apart the mean colours are (display RGB, and seen with deuteranopia), the
    lumas, and the textures (mean absolute difference of the two greyscale tiles, each about its
    own mean). The least different pair is named so the README can say it.
    """
    rock_luma = float(rec601_of(rock_rgb()[None, None, :])[0, 0])
    measures = {skin['species']: skin_measures(composites[skin['species']], rock_luma) for skin in mates + skins}
    ours = [skin['species'] for skin in skins]
    pairs = [pair_measures(a, b, measures) for a, b in itertools.combinations(measures, 2) if a in ours or b in ours]
    least = min(pairs, key=lambda pair: pair['colourDistance'] + pair['textureDifference'])
    report = {'batch': batch, 'tilePx': PHONE_TILE_PX, 'rockLuma': round(rock_luma, 3),
              'skins': {species: printable(measures[species]) for species in ours},
              'pairs': pairs, 'leastDifferentPair': [least['a'], least['b']]}
    with open(sheet_path(batch, 'distinct.json'), 'w', encoding='utf-8', newline='\n') as file:
        file.write(json_text_of(report))
    return report


def skin_measures(composite, rock_luma):
    tile = post.resampled(composite, PHONE_TILE_PX)
    pixels = tile.reshape(-1, 3)
    grey = rec601_of(tile)
    luma = float(grey.mean())
    return {'meanHex': hex_of(pixels.mean(axis=0)), 'luma': round(luma, 3), 'hueDeg': round(post.mean_hue_of(pixels), 1),
            'rockContrast': round((max(luma, rock_luma) + 0.05) / (min(luma, rock_luma) + 0.05), 2),
            'texture': grey - grey.mean(), 'rgb': pixels.mean(axis=0),
            'deutanRgb': post.deuteranopia_of(pixels[None, :, :])[0].mean(axis=0)}


def pair_measures(a, b, measures):
    first, second = measures[a], measures[b]
    return {'a': a, 'b': b,
            'colourDistance': round(float(np.linalg.norm(first['rgb'] - second['rgb'])), 3),
            'deutanDistance': round(float(np.linalg.norm(first['deutanRgb'] - second['deutanRgb'])), 3),
            'lumaDifference': round(abs(first['luma'] - second['luma']), 3),
            'textureDifference': round(float(np.abs(first['texture'] - second['texture']).mean()), 3)}


def printable(measure):
    return {key: value for key, value in measure.items() if key not in ('texture', 'rgb', 'deutanRgb')}


# --- pieces -----------------------------------------------------------------------------------------------


def rock_rgb():
    """The batch planet's band 3, mixed surface to deep like bandPalette.ts: the rock a skin sits in."""
    with open(ART_DIRECTION_PATH, encoding='utf-8') as file:
        palette = json.load(file)['palettes'][ROCK_PALETTES[rock_planet]]
    surface, deep = post.rgb_of_hex(palette['surface']), post.rgb_of_hex(palette['deep'])
    return np.array([a + (b - a) * 0.5 for a, b in zip(surface, deep)], dtype=np.float32)


def grey_rgb(grey):
    return np.repeat(grey[:, :, None], 3, axis=2)


def palette_panel(ramp):
    """The ramp left to right, shadow to light, with its three colours as bands beneath."""
    side = layers.CELL_PX
    t = np.tile(np.linspace(0.0, 1.0, side, dtype=np.float32), (side * 2 // 3, 1))
    colours = [np.array(post.rgb_of_hex(hex_colour), dtype=np.float32) for hex_colour in ramp]
    gradient = ramp_at(colours, t)
    bands = np.concatenate([np.tile(colour, (side - side * 2 // 3, side // 3 + (1 if i < side % 3 else 0), 1))
                            for i, colour in enumerate(colours)], axis=1)
    return np.concatenate([gradient, bands], axis=0)


def labelled_row(panels, labels):
    labelled = [with_label(panel, label) for panel, label in zip(panels, labels)]
    return side_by_side(labelled)


def with_label(panel, label):
    strip = Image.new('RGB', (panel.shape[1], LABEL_PX), tuple(round(c * 255) for c in BACKGROUND))
    ImageDraw.Draw(strip).text((2, 1), label, fill=(230, 222, 205))
    return np.concatenate([np.asarray(strip, dtype=np.float32) / 255.0, panel], axis=0)


def side_by_side(panels):
    height = max(panel.shape[0] for panel in panels)
    gap = np.tile(np.array(BACKGROUND, dtype=np.float32), (height, GAP_PX, 1))
    padded = [np.pad(panel, ((0, height - panel.shape[0]), (0, 0), (0, 0))) for panel in panels]
    return np.concatenate(list(itertools.chain.from_iterable((panel, gap) for panel in padded))[:-1], axis=1)


def stacked(rows):
    width = max(row.shape[1] for row in rows)
    background = np.array(BACKGROUND, dtype=np.float32)
    padded = [pad_to(row, row.shape[0] + GAP_PX, width, background) for row in rows]
    return np.concatenate(padded, axis=0)[:-GAP_PX]


def framed_to_width(patch, width):
    """The patch centred in a strip of the phone's width, the way the canvas would letterbox it."""
    background = np.array(BACKGROUND, dtype=np.float32)
    framed = pad_to(patch, patch.shape[0], width, background)
    offset = (width - patch.shape[1]) // 2
    return np.roll(framed, offset, axis=1)


def pad_to(image, height, width, colour):
    out = np.tile(colour, (height, width, 1)).astype(np.float32)
    out[:image.shape[0], :image.shape[1]] = image
    return out


def hex_of(rgb):
    return '#%02x%02x%02x' % tuple(int(round(float(c) * 255)) for c in np.clip(rgb, 0, 1))


def shrink_to_jpeg(path):
    """The big colour sheets go to git as JPEG, as the hero sheets do."""
    Image.open(path).convert('RGB').save(path[:-4] + '.jpg', quality=JPEG_QUALITY, optimize=True)
    os.remove(path)


def sheet_path(batch, suffix):
    return os.path.join(SHEET_DIR, '%s.%s' % (batch, suffix))


if __name__ == '__main__':
    main()
