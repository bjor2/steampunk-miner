"""
The review sheets of the UI chrome sprites (ticket 683): every shipped sprite from
public/assets/ui/ on the review background, the 1x files at 4x nearest-neighbour and the 2x files
at 2x (so one CSS px is four image px on both sheets and the two can be compared), and the tint
masks filled with the accent colour. Needs Pillow; run after `npm run art:export`:

    python3 docs/art/ui-chrome/sheet_ui_chrome.py
"""

import glob
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
SPRITES = os.path.join(REPO_ROOT, 'public', 'assets', 'ui')
BACKGROUND = (27, 22, 19)
ACCENT = (201, 162, 75)
PAD = 16
LABEL_PX = 14


def main():
    sprites = sorted(path for path in glob.glob(os.path.join(SPRITES, '*', '*.png'))
                     if '@2x' not in path and '.tint' not in path)
    write_sheet([(path, 4) for path in sprites], 'sprites-1x.png')
    write_sheet([(path.replace('.png', '@2x.png'), 2) for path in sprites], 'sprites-2x.png')
    tints = sorted(glob.glob(os.path.join(SPRITES, '*', '*.tint.png')))
    write_sheet([(path, 4) for path in tints], 'tints.png', fill=ACCENT)


def write_sheet(entries, name, fill=None):
    tiles = [(label_of(path), scaled(path, scale, fill)) for path, scale in entries]
    width = sum(tile.width for _, tile in tiles) + PAD * (len(tiles) + 1)
    height = max(tile.height for _, tile in tiles) + 2 * PAD + LABEL_PX
    sheet = Image.new('RGBA', (width, height), BACKGROUND + (255,))
    draw = ImageDraw.Draw(sheet)
    x = PAD
    for label, tile in tiles:
        sheet.alpha_composite(tile, (x, PAD))
        draw.text((x, height - PAD - LABEL_PX + 2), label, fill=ACCENT)
        x += tile.width + PAD
    sheet.convert('RGB').save(os.path.join(HERE, name))


def scaled(path, scale, fill):
    image = Image.open(path).convert('RGBA')
    if fill is not None:
        image = Image.merge('RGBA', [Image.new('L', image.size, channel) for channel in fill] + [image.split()[3]])
    return image.resize((image.width * scale, image.height * scale), Image.NEAREST)


def label_of(path):
    return os.path.basename(path).replace('.png', '').replace('ui-', '')


if __name__ == '__main__':
    main()
