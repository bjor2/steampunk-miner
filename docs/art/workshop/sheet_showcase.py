"""
The review sheets and clips cut from render_showcase.py's output (#182): the pieces sheet labelled
by row, in colour and grayscale; the showcase front view in grayscale and at the #173 phone's
density; one GIF per upgrade row from its ten clip frames, with the landing frames held; and a
motion strip of every row's frames. Needs Pillow; run after the Blender renders:

    python3 docs/art/workshop/sheet_showcase.py
"""

import os
import shutil

from PIL import Image, ImageDraw, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
ROWS = ('drill_power', 'drill_tip', 'engine', 'boiler', 'cargo_hold', 'hull', 'gun', 'blasting_charges', 'casing')
BACKGROUND = (18, 14, 13)
LABEL = (214, 196, 160)
PIECES_PX_PER_M = 384
PIECE_PITCH_M = 0.8
# The render frames the pieces with 0.2 m to spare; the first column stands 0.11 m right of its edge.
PIECES_LEFT_EDGE_M = -0.31
SHOWCASE_PX_PER_M = 128
# The #173 reference phone shows 390 CSS px over the 12 m default zoom.
PHONE_PX_PER_M = 390 / 12
FRAME_MS = 140
HOLD_MS = 420
# Cycles grain compresses badly as GIF, so the clips are shrunk and quantized to stay small.
GIF_WIDTH = 320
GIF_COLOURS = 128
STRIP_FRAME_WIDTH = 180


def main():
    """Each sheet is cut from its render when that render is present, so a partial re-render works."""
    if os.path.exists(os.path.join(HERE, 'pieces.sheet.raw.png')):
        write_pieces_sheet()
    if os.path.exists(os.path.join(HERE, 'showcase.front.png')):
        write_showcase_variants()
    if os.path.isdir(os.path.join(HERE, 'clips')):
        write_clips()


def write_pieces_sheet():
    raw = Image.open(os.path.join(HERE, 'pieces.sheet.raw.png')).convert('RGBA')
    sheet = flatten(raw)
    labelled = Image.new('RGB', (sheet.width, sheet.height + 28), BACKGROUND)
    labelled.paste(sheet, (0, 0))
    draw = ImageDraw.Draw(labelled)
    for column, row in enumerate(ROWS):
        x = (column * PIECE_PITCH_M - PIECES_LEFT_EDGE_M) * PIECES_PX_PER_M
        draw.text((x, sheet.height + 8), row, fill=LABEL, anchor='ma')
    labelled.save(output_path('pieces.sheet.png'))
    ImageOps.grayscale(labelled).save(output_path('pieces.sheet-gray.png'))
    os.remove(os.path.join(HERE, 'pieces.sheet.raw.png'))


def write_showcase_variants():
    front = Image.open(os.path.join(HERE, 'showcase.front.png')).convert('RGBA')
    ImageOps.grayscale(flatten(front)).save(output_path('showcase.front-gray.png'))
    scale = PHONE_PX_PER_M / SHOWCASE_PX_PER_M
    phone = flatten(front.resize((round(front.width * scale), round(front.height * scale)), Image.LANCZOS))
    phone.save(output_path('showcase.phone.png'))
    ImageOps.grayscale(phone).save(output_path('showcase.phone-gray.png'))


def write_clips():
    strips = []
    for row in ROWS:
        frames = read_frames(row)
        durations = [HOLD_MS if frame in (3, 8) else FRAME_MS for frame in range(len(frames))]
        gif_frames = [gif_frame_of(frame) for frame in frames]
        gif_frames[0].save(output_path('reaction-%s.gif' % row.replace('_', '-')), save_all=True,
                           append_images=gif_frames[1:], duration=durations, loop=0, optimize=True)
        strips.append(strip_of(row, frames))
    strip = Image.new('RGB', (strips[0].width, sum(s.height for s in strips)), BACKGROUND)
    y = 0
    for part in strips:
        strip.paste(part, (0, y))
        y += part.height
    strip.save(output_path('reactions.motion.png'))
    shutil.rmtree(os.path.join(HERE, 'clips'))


def read_frames(row):
    folder = os.path.join(HERE, 'clips', row)
    names = sorted(name for name in os.listdir(folder) if name.endswith('.png'))
    return [flatten(Image.open(os.path.join(folder, name)).convert('RGBA')) for name in names]


def gif_frame_of(frame):
    scale = GIF_WIDTH / frame.width
    small = frame.resize((GIF_WIDTH, round(frame.height * scale)), Image.LANCZOS)
    return small.quantize(GIF_COLOURS, method=Image.Quantize.MEDIANCUT)


def strip_of(row, frames):
    scale = STRIP_FRAME_WIDTH / frames[0].width
    thumbs = [frame.resize((STRIP_FRAME_WIDTH, round(frame.height * scale)), Image.LANCZOS) for frame in frames]
    strip = Image.new('RGB', (STRIP_FRAME_WIDTH * len(thumbs), thumbs[0].height + 22), BACKGROUND)
    for at, thumb in enumerate(thumbs):
        strip.paste(thumb, (at * STRIP_FRAME_WIDTH, 22))
    ImageDraw.Draw(strip).text((6, 5), row, fill=LABEL)
    return strip


def flatten(image):
    background = Image.new('RGBA', image.size, BACKGROUND + (255,))
    background.alpha_composite(image)
    return background.convert('RGB')


def output_path(name):
    return os.path.join(HERE, name)


if __name__ == '__main__':
    main()
