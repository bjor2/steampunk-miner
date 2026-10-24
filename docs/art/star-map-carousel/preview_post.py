"""
The post step of the star map carousel's art (ticket 795, spec #647): reads every shipped planet
preview (public/assets/ui/ui-star-map-planet-<key>/, written by `npm run art:export`) and

- writes `preview-reads.json`: per look, the SHA-256 of the shipped 2x hero PNG and its measures at
  the two carousel screens (the hero at 160 px on a 360x640 phone and at 256 px in the 1440x900
  desktop dock): the hue read over the whole sprite, alpha-weighted (mean colour, luma, hue,
  saturation), and the motif read over the planet's disc on luma alone (the edge share at one phone
  pixel of the disc, the edge anisotropy across the disc and its diagonals, the luma spread and the
  high and low shares). The kernel's contact-sheet spec (`systems/art/starMapCarouselSheet.test.ts`)
  judges every pair from these and refuses a read that no longer matches the file on disk;
- writes the review sheets under `sheets/`: the thirteen heroes at each screen's size with their orbit
  dots, labelled, and the heroes at 512 px, so a reviewer sees what the numbers say;
- writes the mock frames under `mocks/`: the carousel on a 360x640 phone, an 844x390 phone and a
  1440x900 desktop, drawn from the shipped sprites with the Jump and Buy fuel block of ticket 793;
- rewrites the reads table of `README.md` between its `<!-- reads -->` markers.

    python3 docs/art/star-map-carousel/preview_post.py

Pure measurement and composition over the shipped files: it draws nothing in the game.
"""

import hashlib
import itertools
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'ores'))
from atlas_layout import json_text_of  # noqa: E402
from carousel_looks import PREVIEW_LOOKS, SYSTEM_ASSET_ID, asset_id_of, load_brief  # noqa: E402
from mock_frames import write_mock_frames  # noqa: E402

SHEET_DIR = os.path.join(HERE, 'sheets')
READS_PATH = os.path.join(HERE, 'preview-reads.json')
README_PATH = os.path.join(HERE, 'README.md')
README_MARKERS = ('<!-- reads -->', '<!-- /reads -->')
UI_ASSETS = os.path.join(REPO_ROOT, 'public', 'assets', 'ui')
# The hero's CSS size at each carousel screen (the mock frames draw it so).
SCREEN_HERO_PX = {'360x640': 160, '1440x900': 256}
REVIEW_HERO_PX = 512
EDGE_STEP = 0.08
REC601 = np.array([0.299, 0.587, 0.114], dtype=np.float32)
LABEL_PX = 14
BACKGROUND = (27, 22, 19)


def main():
    brief = load_brief()
    sprites = {look['key']: read_sprites(look) for look in PREVIEW_LOOKS if has_export(look)}
    missing = [look['key'] for look in PREVIEW_LOOKS if look['key'] not in sprites]
    if missing:
        print('preview post: no export yet for %s (run npm run art:export -- ui-star-map-planet-<key>)' % ', '.join(missing))
    reads = write_reads(sprites, brief)
    write_sheets(sprites)
    write_mock_frames(HERE, UI_ASSETS, brief, PREVIEW_LOOKS, SYSTEM_ASSET_ID)
    write_readme_table(reads)
    print_closest_pairs(reads)


def has_export(look):
    return os.path.exists(hero_path_of(look, 2))


def hero_path_of(look, scale):
    asset_id = asset_id_of(look)
    return os.path.join(UI_ASSETS, asset_id, '%s%s.png' % (asset_id, '' if scale == 1 else '@%dx' % scale))


def dot_path_of(look, scale):
    asset_id = asset_id_of(look)
    return os.path.join(UI_ASSETS, asset_id, '%s-dot%s.png' % (asset_id, '' if scale == 1 else '@%dx' % scale))


def read_sprites(look):
    return {'hero': Image.open(hero_path_of(look, 2)).convert('RGBA'), 'dot': Image.open(dot_path_of(look, 2)).convert('RGBA')}


# --- reads ------------------------------------------------------------------------------------------


def write_reads(sprites, brief):
    reads = {
        '$comment': 'The hue and motif reads of every shipped star map planet preview at the two carousel screens '
                    '(ticket 795, preview_post.py): the alpha-weighted mean colour, luma, hue and saturation of the '
                    'whole sprite; the edge share, edge anisotropy across the disc and its diagonals, luma spread and '
                    'the high and low shares of the planet disc on luma; with the SHA-256 of the 2x hero PNG they '
                    'were measured from. Written by preview_post.py; look only.',
        'screens': dict(SCREEN_HERO_PX),
        'looks': [look_read_of(look, sprites[look['key']], brief) for look in PREVIEW_LOOKS if look['key'] in sprites],
    }
    with open(READS_PATH, 'w', encoding='utf-8', newline='\n') as file:
        file.write(json_text_of(reads))
    return reads


def look_read_of(look, sprite, brief):
    disc_share = brief['hero']['discRadiusPx'] / brief['hero']['sizePx']
    return {
        'lookKey': look['key'],
        'name': look['name'],
        'motif': look['motif'],
        'previewAssetId': asset_id_of(look),
        'rockSurface': look['rockSurface'],
        'horizon': look['horizon'],
        'heroSha256': sha256_of(hero_path_of(look, 2)),
        'screens': {screen: hero_read_of(resampled(sprite['hero'], size), disc_share)
                    for screen, size in SCREEN_HERO_PX.items()},
    }


def sha256_of(path):
    with open(path, 'rb') as file:
        return hashlib.sha256(file.read()).hexdigest()


def hero_read_of(rgba, disc_share):
    """One hero at one screen: the hue read over the sprite, the motif read over the disc."""
    rgb, alpha = rgba[:, :, 0:3], rgba[:, :, 3]
    weight = alpha.sum()
    mean = (rgb * alpha[:, :, None]).reshape(-1, 3).sum(axis=0) / max(weight, 1e-6)
    high, low = rgb.max(axis=2), rgb.min(axis=2)
    saturation = np.where(high > 0, (high - low) / np.maximum(high, 1e-6), 0.0)
    disc = disc_mask_of(rgba.shape[0], disc_share * 0.92)
    luma = rgb @ REC601
    return {
        'meanHex': hex_of(mean),
        'luma': rounded((luma * alpha).sum() / max(weight, 1e-6)),
        'hueDeg': rounded(mean_hue_of(rgb.reshape(-1, 3), alpha.reshape(-1)), 1),
        'saturation': rounded((saturation * alpha).sum() / max(weight, 1e-6)),
        **motif_read_of(luma, disc),
    }


def disc_mask_of(size, radius_share):
    """The pixels inside the planet's disc, a little in from its limb so the haze never votes."""
    centre = (size - 1) / 2.0
    y, x = np.mgrid[0:size, 0:size]
    return (x - centre) ** 2 + (y - centre) ** 2 <= (radius_share * size) ** 2


def motif_read_of(lit_luma, disc):
    """
    The motif read on luma inside the disc, the sphere's own shading taken out first (the luma less
    its blur over a sixteenth of the sprite), so the read is the crust's pattern and not the light on
    it: edges at one pixel, their direction, the spread, the high and low shares.
    """
    luma = flattened_luma(lit_luma)
    along_x = np.abs(np.roll(luma, -1, axis=1) - luma)
    along_z = np.abs(np.roll(luma, -1, axis=0) - luma)
    rising = np.abs(np.roll(np.roll(luma, -1, axis=0), -1, axis=1) - luma)
    falling = np.abs(np.roll(np.roll(luma, -1, axis=0), 1, axis=1) - luma)
    edge = np.maximum(along_x, along_z)[disc]
    inside = luma[disc]
    spread = float(inside.std())
    return {
        'edgeShare': rounded((edge >= EDGE_STEP).mean()),
        'anisotropy': rounded(anisotropy_of(along_x[disc], along_z[disc])),
        'diagonalAnisotropy': rounded(anisotropy_of(rising[disc], falling[disc])),
        'lumaSpread': rounded(spread),
        'highShare': rounded((inside > inside.mean() + spread).mean()),
        'lowShare': rounded((inside < inside.mean() - spread).mean()),
    }


def flattened_luma(luma):
    """The luma with its own blur taken out, about the mid grey: the texture without the shading."""
    return luma - box_blurred(box_blurred(luma, luma.shape[0] // 16), luma.shape[0] // 16) + 0.5


def box_blurred(values, radius):
    """A separable box blur of `radius`, the edges clamped, in plain numpy so the read is reproducible."""
    def along(axis, array):
        padded = np.concatenate([np.repeat(array.take([0], axis=axis), radius, axis=axis), array,
                                 np.repeat(array.take([-1], axis=axis), radius, axis=axis)], axis=axis)
        summed = np.cumsum(padded, axis=axis, dtype=np.float64)
        summed = np.concatenate([np.zeros_like(summed.take([0], axis=axis)), summed], axis=axis)
        width = 2 * radius + 1
        return ((summed.take(range(width, width + array.shape[axis]), axis=axis)
                 - summed.take(range(0, array.shape[axis]), axis=axis)) / width).astype(np.float32)
    return along(1, along(0, values))


def rounded(value, digits=3):
    """A plain number for the file: never -0.0, which JSON readers keep apart from 0."""
    result = round(float(value), digits)
    return 0.0 if result == 0 else result


def anisotropy_of(along_a, along_b):
    """-1 to 1: how much more the luma changes along `a` than along `b`; 0 for an even pattern."""
    energy_a, energy_b = float(along_a.mean()), float(along_b.mean())
    return (energy_a - energy_b) / max(energy_a + energy_b, 1e-6)


def mean_hue_of(rgb, alpha):
    """The circular mean hue of the pixels, weighted by chroma and alpha so grey and clear pixels do not vote."""
    high, low = rgb.max(axis=1), rgb.min(axis=1)
    chroma = (high - low) * alpha
    safe = np.where(high - low == 0, 1, high - low)
    r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    hue = np.where(high - low == 0, 0.0,
                   np.where(high == r, ((g - b) / safe) % 6,
                            np.where(high == g, (b - r) / safe + 2, (r - g) / safe + 4))) * 60.0
    radians = np.radians(hue)
    x, y = (np.cos(radians) * chroma).sum(), (np.sin(radians) * chroma).sum()
    return float(np.degrees(np.arctan2(y, x)) % 360.0)


# --- sheets -----------------------------------------------------------------------------------------


def write_sheets(sprites):
    os.makedirs(SHEET_DIR, exist_ok=True)
    for screen, size in SCREEN_HERO_PX.items():
        write_contact_sheet(os.path.join(SHEET_DIR, 'previews.%s.png' % screen), sprites, size, with_dots=True)
    write_contact_sheet(os.path.join(SHEET_DIR, 'previews.review.jpg'), sprites, REVIEW_HERO_PX, with_dots=False)


def write_contact_sheet(path, sprites, hero_px, with_dots):
    """The heroes in look order, each box-filtered to `hero_px`, its dot and key under it."""
    from PIL import ImageDraw
    columns = max(1, min(5, len(sprites)))
    rows = (len(sprites) + columns - 1) // columns
    cell_h = hero_px + LABEL_PX + (28 if with_dots else 0)
    sheet = Image.new('RGBA', (columns * hero_px, rows * cell_h), (*BACKGROUND, 255))
    draw = ImageDraw.Draw(sheet)
    for at, (key, sprite) in enumerate(sprites.items()):
        x, y = (at % columns) * hero_px, (at // columns) * cell_h
        sheet.alpha_composite(Image.fromarray(to_bytes(resampled(sprite['hero'], hero_px)), 'RGBA'), (x, y))
        if with_dots:
            dot = Image.fromarray(to_bytes(resampled(sprite['dot'], 24)), 'RGBA')
            sheet.alpha_composite(dot, (x + 2, y + hero_px + 2))
        draw.text((x + (30 if with_dots else 2), y + hero_px + (8 if with_dots else 1)), key, fill=(220, 220, 220))
    out = sheet.convert('RGB')
    out.save(path, quality=92) if path.endswith('.jpg') else out.save(path)
    print('wrote ' + os.path.relpath(path, REPO_ROOT))


# --- the report -------------------------------------------------------------------------------------


def write_readme_table(reads):
    """The reads per look and screen, between the README's markers, so the page says what the test judges."""
    with open(README_PATH, encoding='utf-8') as file:
        text = file.read()
    start, end = (text.index(marker) for marker in README_MARKERS)
    table = [README_MARKERS[0], '',
             '| look | screen | mean | luma | hue | sat | edge | aniso | diag | spread | high | low |',
             '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |']
    for look in reads['looks']:
        for screen, read in look['screens'].items():
            table.append('| `%s` | %s | `%s` | %.3f | %.0f | %.3f | %.3f | %+.3f | %+.3f | %.3f | %.3f | %.3f |' % (
                look['lookKey'], screen, read['meanHex'], read['luma'], read['hueDeg'], read['saturation'],
                read['edgeShare'], read['anisotropy'], read['diagonalAnisotropy'], read['lumaSpread'],
                read['highShare'], read['lowShare']))
    table += ['', 'Closest pairs: ' + closest_pairs_line(reads), '']
    with open(README_PATH, 'w', encoding='utf-8', newline='\n') as file:
        file.write(text[:start] + '\n'.join(table) + text[end:])


def pairs_of(reads, screen):
    return [(a['lookKey'], b['lookKey'], colour_distance(a, b, screen), motif_distance(a, b, screen))
            for a, b in itertools.combinations(reads['looks'], 2)]


def closest_pairs_line(reads):
    lines = []
    for screen in SCREEN_HERO_PX:
        pairs = pairs_of(reads, screen)
        if not pairs:
            continue
        colour, motif = min(pairs, key=lambda pair: pair[2]), min(pairs, key=lambda pair: pair[3])
        lines.append('at %s, in colour %s vs %s (%.3f) and in motif %s vs %s (%.3f)'
                     % (screen, colour[0], colour[1], colour[2], motif[0], motif[1], motif[3]))
    return '; '.join(lines) + ' (the floor is 32/255 = 0.125 for both).'


def print_closest_pairs(reads):
    for screen in SCREEN_HERO_PX:
        pairs = pairs_of(reads, screen)
        if not pairs:
            continue
        short = [pair for pair in pairs if pair[2] < 32 / 255 and pair[3] < 32 / 255]
        print('%s: closest in colour %s vs %s (%.3f); closest in motif %s vs %s (%.3f); %d pair(s) under the floor in both'
              % (screen, *min(pairs, key=lambda pair: pair[2])[:3], *(min(pairs, key=lambda pair: pair[3])[i] for i in (0, 1, 3)),
                 len(short)))
        for a, b, colour, motif in short:
            print('   %s vs %s: colour %.3f motif %.3f' % (a, b, colour, motif))


def colour_distance(a, b, screen):
    return float(np.linalg.norm(rgb_of_hex(a['screens'][screen]['meanHex']) - rgb_of_hex(b['screens'][screen]['meanHex'])))


def motif_distance(a, b, screen):
    """The kernel's rule (starMapCarouselSheet.ts): the motif vector's Euclidean distance."""
    return float(np.linalg.norm(motif_vector(a['screens'][screen]) - motif_vector(b['screens'][screen])))


def motif_vector(read):
    return np.array([read['edgeShare'], read['anisotropy'] / 2.0, read['diagonalAnisotropy'] / 2.0,
                     read['lumaSpread'], read['highShare'], read['lowShare']])


# --- pixels -----------------------------------------------------------------------------------------


def resampled(image, size):
    """The sprite box-filtered to `size`, as floats (rows, columns, RGBA) in 0..1."""
    return np.asarray(image.resize((size, size), Image.BOX), dtype=np.float32) / 255.0


def to_bytes(channels):
    return (np.clip(channels, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)


def hex_of(rgb):
    return '#%02x%02x%02x' % tuple(int(round(float(channel) * 255)) for channel in rgb)


def rgb_of_hex(hex_colour):
    return np.array([int(hex_colour[at:at + 2], 16) / 255.0 for at in (1, 3, 5)], dtype=np.float32)


if __name__ == '__main__':
    main()
