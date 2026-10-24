"""
The post step of the SS2 look tiles (ticket 778, spec #774; the palette lock's acceptance 3: "a
contact sheet of all looks at 360 px and 1280+ shows each pair as distinct (hue + motif)"). Reads
each look's baked albedo (art/build/ground-look-<look>/, written by `npm run art:export`), and:

- writes `look-reads.json`: per look, the SHA-256 of the shipped albedo map and its measures at
  the two contact-sheet screens (a 4 m tile is 120 px on 360x640 and 268 px on 1280x800, at the
  default 12 m zoom: 30 and 67 px a metre, hero_reads.SCREEN_TILE_PX): the mean colour, luma, hue
  and saturation (the hue read), and the motif read, on luma alone so no hue leaks into it: the
  share of pixels on a luma edge (a step of EDGE_STEP across EDGE_STEP_M, a phone pixel, so the
  same mark on the ground is one edge at either screen), the anisotropy of the edges across
  against along the tile and across the two diagonals (stripes against cells, and which way they
  run), the luma spread and the shares of pixels a spread above and below the mean (bright
  needles against dark cracks).
  The slice's contact-sheet spec (`lookContactSheet.test.ts`) judges every pair from these and
  refuses a read that no longer matches the map on disk;
- writes the review sheets under `sheets/`: the eight tiles at each screen's size, labelled, and
  the full bakes at 512 px, so a reviewer sees what the numbers say;
- rewrites the reads table of `README.md` between its `<!-- reads -->` markers;
- prints each tile's mean colour against its look's surface rock (`lookArt.json`), the colour the
  tile is authored at.

    python3 docs/art/ss2-looks/look_post.py

Pure measurement over the bakes: it draws nothing in the game, and the game never reads it.
"""

import hashlib
import itertools
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'docs', 'art', 'ores'))
from atlas_layout import json_text_of  # noqa: E402

SHEET_DIR = os.path.join(HERE, 'sheets')
READS_PATH = os.path.join(HERE, 'look-reads.json')
README_PATH = os.path.join(HERE, 'README.md')
README_MARKERS = ('<!-- reads -->', '<!-- /reads -->')
LOOK_ART_PATH = os.path.join(REPO_ROOT, 'src', 'features', 'solar-systems', 'lookArt.json')
PALETTE_PATH = os.path.join(REPO_ROOT, 'src', 'features', 'solar-systems', 'palette.json')
TILE_M = 4
# The two screens of the contact-sheet test: a metre at the default 12 m zoom (hero_reads.py).
SCREEN_METRE_PX = {'360x640': 30, '1280x800': 67}
REVIEW_TILE_PX = 512
EDGE_STEP = 0.08
# An edge is a luma step across one phone pixel of ground, whatever the screen draws it at.
EDGE_STEP_M = 1 / SCREEN_METRE_PX['360x640']
REC601 = np.array([0.299, 0.587, 0.114], dtype=np.float32)
LABEL_PX = 14


def main():
    looks = look_ids()
    bakes = {look_id: read_rgb(bake_path_of(look_id)) for look_id in looks if os.path.exists(bake_path_of(look_id))}
    missing = [look_id for look_id in looks if look_id not in bakes]
    if missing:
        print('look post: no bake yet for %s (run npm run art:export -- ground-look-<look>)' % ', '.join(missing))
    reads = write_reads(bakes)
    write_sheets(bakes)
    write_readme_table(reads)
    print_means(bakes)
    print_closest_pairs(reads)


def look_ids():
    with open(PALETTE_PATH, encoding='utf-8') as file:
        return [look['id'] for look in json.load(file)['looks']]


def asset_id_of(look_id):
    return 'ground-look-' + look_id


def bake_path_of(look_id):
    return os.path.join(REPO_ROOT, 'art', 'build', asset_id_of(look_id), asset_id_of(look_id) + '.albedo.png')


def shipped_albedo_path_of(look_id):
    return os.path.join(REPO_ROOT, 'public', 'assets', 'ground', asset_id_of(look_id), asset_id_of(look_id) + '.albedo.ktx2')


# --- reads ------------------------------------------------------------------------------------------


def write_reads(bakes):
    reads = {
        '$comment': 'The hue and motif reads of every shipped SS2 look tile at the two contact-sheet screens '
                    '(ticket 778, look_post.py): mean colour, luma, hue and saturation; edge share, the edge '
                    'anisotropy across the tile and across its diagonals, luma spread and the high and low shares; '
                    'with the SHA-256 of the albedo map they were measured from. Written by look_post.py; look only.',
        'screens': {screen: metre_px * TILE_M for screen, metre_px in SCREEN_METRE_PX.items()},
        'looks': [look_read_of(look_id, rgb) for look_id, rgb in bakes.items()],
    }
    with open(READS_PATH, 'w', encoding='utf-8', newline='\n') as file:
        file.write(json_text_of(reads))
    return reads


def look_read_of(look_id, rgb):
    return {
        'lookId': look_id,
        'tileAssetId': asset_id_of(look_id),
        'albedoSha256': sha256_of(shipped_albedo_path_of(look_id)),
        'screens': {screen: tile_read_of(resampled(rgb, metre_px * TILE_M))
                    for screen, metre_px in SCREEN_METRE_PX.items()},
    }


def sha256_of(path):
    with open(path, 'rb') as file:
        return hashlib.sha256(file.read()).hexdigest()


def tile_read_of(rgb):
    """The measures of one tile at one screen: its hue read and its motif read."""
    luma = rgb @ REC601
    step = max(1, round(luma.shape[0] / TILE_M * EDGE_STEP_M))
    along_x = np.abs(np.roll(luma, -step, axis=1) - luma)
    along_z = np.abs(np.roll(luma, -step, axis=0) - luma)
    rising = np.abs(np.roll(np.roll(luma, -step, axis=0), -step, axis=1) - luma)
    falling = np.abs(np.roll(np.roll(luma, -step, axis=0), step, axis=1) - luma)
    edge = np.maximum(along_x, along_z)
    mean = rgb.reshape(-1, 3).mean(axis=0)
    high, low = rgb.max(axis=2), rgb.min(axis=2)
    saturation = np.where(high > 0, (high - low) / np.maximum(high, 1e-6), 0.0)
    spread = float(luma.std())
    return {
        'meanHex': hex_of(mean),
        'luma': rounded(luma.mean()),
        'hueDeg': rounded(mean_hue_of(rgb.reshape(-1, 3)), 1),
        'saturation': rounded(saturation.mean()),
        'edgeShare': rounded((edge >= EDGE_STEP).mean()),
        'anisotropy': rounded(anisotropy_of(along_x, along_z)),
        'diagonalAnisotropy': rounded(anisotropy_of(rising, falling)),
        'lumaSpread': rounded(spread),
        'highShare': rounded((luma > luma.mean() + spread).mean()),
        'lowShare': rounded((luma < luma.mean() - spread).mean()),
    }


def rounded(value, digits=3):
    """A plain number for the file: never -0.0, which JSON readers keep apart from 0."""
    result = round(float(value), digits)
    return 0.0 if result == 0 else result


def anisotropy_of(along_a, along_b):
    """-1 to 1: how much more the luma changes along `a` than along `b`; 0 for an even pattern."""
    energy_a, energy_b = float(along_a.mean()), float(along_b.mean())
    return (energy_a - energy_b) / max(energy_a + energy_b, 1e-6)


def mean_hue_of(rgb):
    """The circular mean hue of the pixels, weighted by their chroma so grey pixels do not vote."""
    high, low = rgb.max(axis=1), rgb.min(axis=1)
    chroma = high - low
    safe = np.where(chroma == 0, 1, chroma)
    r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    hue = np.where(chroma == 0, 0.0,
                   np.where(high == r, ((g - b) / safe) % 6,
                            np.where(high == g, (b - r) / safe + 2, (r - g) / safe + 4))) * 60.0
    radians = np.radians(hue)
    x, y = (np.cos(radians) * chroma).sum(), (np.sin(radians) * chroma).sum()
    return float(np.degrees(np.arctan2(y, x)) % 360.0)


# --- sheets -----------------------------------------------------------------------------------------


def write_sheets(bakes):
    os.makedirs(SHEET_DIR, exist_ok=True)
    for screen, metre_px in SCREEN_METRE_PX.items():
        write_strip(os.path.join(SHEET_DIR, 'looks.%s.png' % screen), bakes, metre_px * TILE_M)
    write_strip(os.path.join(SHEET_DIR, 'looks.review.jpg'), bakes, REVIEW_TILE_PX)


def write_strip(path, bakes, tile_px):
    """The tiles in palette order, each box-filtered to `tile_px`, its look id under it."""
    columns = max(1, min(4, len(bakes)))
    rows = (len(bakes) + columns - 1) // columns
    sheet = Image.new('RGB', (columns * tile_px, rows * (tile_px + LABEL_PX)), (24, 24, 24))
    draw = ImageDraw.Draw(sheet)
    for at, (look_id, rgb) in enumerate(bakes.items()):
        x, y = (at % columns) * tile_px, (at // columns) * (tile_px + LABEL_PX)
        sheet.paste(Image.fromarray(to_bytes(resampled(rgb, tile_px)), 'RGB'), (x, y))
        draw.text((x + 2, y + tile_px + 1), look_id, fill=(220, 220, 220))
    sheet.save(path, quality=92) if path.endswith('.jpg') else sheet.save(path)
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
                look['lookId'], screen, read['meanHex'], read['luma'], read['hueDeg'], read['saturation'],
                read['edgeShare'], read['anisotropy'], read['diagonalAnisotropy'], read['lumaSpread'],
                read['highShare'], read['lowShare']))
    table += ['', 'Closest pairs: ' + closest_pairs_line(reads), '']
    with open(README_PATH, 'w', encoding='utf-8', newline='\n') as file:
        file.write(text[:start] + '\n'.join(table) + text[end:])


def closest_pairs_line(reads):
    lines = []
    for screen in SCREEN_METRE_PX:
        pairs = [(a['lookId'], b['lookId'], colour_distance(a, b, screen), motif_distance(a, b, screen))
                 for a, b in itertools.combinations(reads['looks'], 2)]
        if not pairs:
            continue
        colour = min(pairs, key=lambda pair: pair[2])
        motif = min(pairs, key=lambda pair: pair[3])
        lines.append('at %s, in colour %s vs %s (%.3f) and in motif %s vs %s (%.3f)'
                     % (screen, colour[0], colour[1], colour[2], motif[0], motif[1], motif[3]))
    return '; '.join(lines) + ' (the floor is 32/255 = 0.125 for both).'


def print_means(bakes):
    with open(LOOK_ART_PATH, encoding='utf-8') as file:
        rows = json.load(file)['looks']
    for look_id, rgb in bakes.items():
        mean = rgb.reshape(-1, 3).mean(axis=0)
        rock = rgb_of_hex(rows[look_id]['rockSurface'])
        apart = float(np.linalg.norm(mean - rock)) * 255
        print('%-18s mean %s  rock %s  %5.1f channels apart' % (look_id, hex_of(mean), rows[look_id]['rockSurface'], apart))


def print_closest_pairs(reads):
    for screen in SCREEN_METRE_PX:
        pairs = [(a['lookId'], b['lookId'], colour_distance(a, b, screen), motif_distance(a, b, screen))
                 for a, b in itertools.combinations(reads['looks'], 2)]
        if not pairs:
            continue
        closest_colour = min(pairs, key=lambda pair: pair[2])
        closest_motif = min(pairs, key=lambda pair: pair[3])
        print('%s: closest in colour %s vs %s (%.3f); closest in motif %s vs %s (%.3f)'
              % (screen, closest_colour[0], closest_colour[1], closest_colour[2],
                 closest_motif[0], closest_motif[1], closest_motif[3]))


def colour_distance(a, b, screen):
    return float(np.linalg.norm(rgb_of_hex(a['screens'][screen]['meanHex']) - rgb_of_hex(b['screens'][screen]['meanHex'])))


def motif_distance(a, b, screen):
    """The slice's rule (lookContactSheet.ts): the motif vector's Euclidean distance."""
    return float(np.linalg.norm(motif_vector(a['screens'][screen]) - motif_vector(b['screens'][screen])))


def motif_vector(read):
    return np.array([read['edgeShare'], read['anisotropy'] / 2.0, read['diagonalAnisotropy'] / 2.0,
                     read['lumaSpread'], read['highShare'], read['lowShare']])


# --- pixels -----------------------------------------------------------------------------------------


def read_rgb(path):
    return np.asarray(Image.open(path).convert('RGB'), dtype=np.float32) / 255.0


def resampled(rgb, size):
    return np.asarray(Image.fromarray(to_bytes(rgb), 'RGB').resize((size, size), Image.BOX), dtype=np.float32) / 255.0


def to_bytes(channels):
    return (np.clip(channels, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)


def hex_of(rgb):
    return '#%02x%02x%02x' % tuple(int(round(float(channel) * 255)) for channel in rgb)


def rgb_of_hex(hex_colour):
    return np.array([int(hex_colour[at:at + 2], 16) / 255.0 for at in (1, 3, 5)], dtype=np.float32)


if __name__ == '__main__':
    main()
