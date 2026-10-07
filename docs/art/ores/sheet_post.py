"""
Image post for the ore review sheets (#144, #151 section 4), in plain python3 with Pillow and
numpy (Blender's Python has no Pillow): the grayscale blind-order copy (Rec. 709 luma in linear
light, as the ladder prototype measured), the deuteranopia simulation for the family sheet
(Machado, Oliveira and Fernandes 2009, severity 1.0), the in-game downsample (256 px/m to
85 px/m, about a 1080p screen at the default zoom), the silhouette sheet from the baked masks
(every family filled solid black at tile scale, the Game Director's identity test) and the
contact sheets that put the families side by side.

    python3 docs/art/ores/sheet_post.py

Reads docs/art/ores/sheets/*.png and art/build/ores/*.albedo.png; writes beside the sheets.
"""

import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import atlas_layout as layout  # noqa: E402

SHEET_DIR = os.path.join(HERE, 'sheets')
BUILD_DIR = os.path.join(layout.REPO_ROOT, 'art', 'build', 'ores')
IN_GAME_DOWNSAMPLE = 3
CONTACT_SCALE = 0.5
# Machado et al. 2009, deuteranopia (severity 1.0), applied in linear light.
DEUTERANOPIA = np.array([
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.011820, 0.042940, 0.968881],
], dtype=np.float32)


def main():
    looks = layout.load_looks()
    families = [family['id'] for family in looks['families']]
    names = sheet_names()
    for name in names:
        post_sheet(name)
    contact_sheet(families, 'shallow', 'families.contact.png')
    contact_sheet(families, 'deep', 'families.contact.deep.png')
    silhouette_sheet(families, looks)
    shrink_for_git()
    print('post done for %d sheets' % len(names))


def sheet_names():
    return sorted(name for name in os.listdir(SHEET_DIR)
                  if name.endswith('.png') and not any(tag in name for tag in ('-gray', '-ingame', '-deutan', 'contact', 'silhouettes')))


JPEG_QUALITY = 90


def shrink_for_git():
    """
    The full-size colour sheets (about 3.5 MB each as PNG, over 100 MB for the set) are committed
    as JPEG at quality 90; the measurements were taken from the PNGs when they were rendered. The
    85 px/m downsamples and the silhouette sheet stay PNG, being small or two-tone.
    """
    for name in sorted(os.listdir(SHEET_DIR)):
        if not name.endswith('.png') or '-ingame' in name or 'silhouettes' in name:
            continue
        path = os.path.join(SHEET_DIR, name)
        Image.open(path).convert('RGB').save(path[:-4] + '.jpg', quality=JPEG_QUALITY, optimize=True)
        os.remove(path)


def post_sheet(name):
    rgb = read_rgb(os.path.join(SHEET_DIR, name))
    stem = os.path.join(SHEET_DIR, name[:-4])
    write_rgb(stem + '-gray.png', gray_of(rgb))
    write_rgb(stem + '-ingame.png', downsampled(rgb, IN_GAME_DOWNSAMPLE))
    if name.startswith('ladder.') or name.startswith('families'):
        write_rgb(stem + '-deutan.png', deuteranopia_of(rgb))


# --- colour -----------------------------------------------------------------------------------------------


def read_rgb(path):
    return np.asarray(Image.open(path).convert('RGB'), dtype=np.float32) / 255.0


def write_rgb(path, rgb):
    Image.fromarray((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB').save(path, optimize=True)
    return path


def linear_of(rgb):
    return np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)


def display_of(linear):
    return np.where(linear <= 0.0031308, linear * 12.92, 1.055 * np.power(np.clip(linear, 0, None), 1 / 2.4) - 0.055)


def gray_of(rgb):
    luma = linear_of(rgb) @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    return np.repeat(display_of(luma)[:, :, None], 3, axis=2)


def deuteranopia_of(rgb):
    return display_of(linear_of(rgb) @ DEUTERANOPIA.T)


def downsampled(rgb, factor):
    height, width = (rgb.shape[0] // factor) * factor, (rgb.shape[1] // factor) * factor
    return rgb[:height, :width].reshape(height // factor, factor, width // factor, factor, 3).mean(axis=(1, 3))


# --- contact and silhouette sheets ----------------------------------------------------------------------------


def contact_sheet(families, ambient, name):
    """Every family's variant-0 row (five grades) stacked, one family per row, at half size."""
    rows = []
    for family_id in families:
        path = os.path.join(SHEET_DIR, '%s.%s.png' % (family_id, ambient))
        if not os.path.isfile(path):
            continue
        image = Image.open(path).convert('RGB')
        row_height = image.height // 4
        rows.append(image.crop((0, 0, image.width, row_height)).resize((int(image.width * CONTACT_SCALE), int(row_height * CONTACT_SCALE)), Image.LANCZOS))
    if not rows:
        return None
    sheet = Image.new('RGB', (rows[0].width, sum(row.height for row in rows)), (18, 13, 12))
    y = 0
    for row in rows:
        sheet.paste(row, (0, y))
        y += row.height
    path = os.path.join(SHEET_DIR, name)
    sheet.save(path, optimize=True)
    return path


def silhouette_sheet(families, looks):
    """The baked masks of variant 0, every grade, filled solid black on parchment at tile scale."""
    size = looks['atlas']['contentPx']
    pad = 8
    sheet = Image.new('L', (5 * (size + pad) + pad, len(families) * (size + pad) + pad), 235)
    found = 0
    for row, family_id in enumerate(families):
        for column, grade in enumerate(layout.GRADES):
            path = os.path.join(BUILD_DIR, '%s-v0-g%d.albedo.png' % (family_id, grade))
            if not os.path.isfile(path):
                continue
            alpha = np.asarray(Image.open(path).convert('RGBA'), dtype=np.uint8)[:, :, 3]
            ink = Image.fromarray(np.where(alpha > 127, 0, 235).astype(np.uint8), 'L')
            sheet.paste(ink, (pad + column * (size + pad), pad + row * (size + pad)))
            found += 1
    path = os.path.join(SHEET_DIR, 'silhouettes.png')
    sheet.save(path, optimize=True)
    with open(os.path.join(SHEET_DIR, 'silhouettes.json'), 'w', encoding='utf-8', newline='\n') as file:
        file.write(layout.json_text_of({'families': families, 'grades': list(layout.GRADES), 'tilesFound': found}))
    return path


if __name__ == '__main__':
    main()
