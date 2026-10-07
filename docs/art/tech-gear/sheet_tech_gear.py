"""
The review sheets cut from render_tech_gear.py's renders and the effect clips drawn from the
power-up fx rule (#166): each render flattened on the review background, the loaded rig in
grayscale and at a 1080p screen's 90 px/m (the default 12 m zoom, #39), the folded silhouette
measured against the bare rig (G&V: within 110%), one GIF per extractor from its unfold frames,
and one GIF per effect from the frames `docs/art/tech-gear/dumpFxFrames.ts` printed. Needs Pillow:

    npx vite-node docs/art/tech-gear/dumpFxFrames.ts > docs/art/tech-gear/fx-frames.json
    python3 docs/art/tech-gear/sheet_tech_gear.py
"""

import glob
import json
import math
import os

from PIL import Image, ImageDraw, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
BACKGROUND = (18, 14, 13)
RIG_PX_PER_M = 512
INGAME_PX_PER_M = 90
GIF_WIDTH = 320
GIF_COLOURS = 128
FX_CANVAS = (360, 240)
FX_FRAME_MS = 70
HULL = (10, 10)
# A silhouette pixel: the render's alpha above this.
OPAQUE = 32


def main():
    flatten_renders()
    write_rig_sheets()
    report_silhouette()
    write_unfold_clips()
    write_fx_clips()


# --- renders ---------------------------------------------------------------------------------------


def flatten_renders():
    for raw in sorted(glob.glob(os.path.join(HERE, '*.raw.png'))):
        name = os.path.basename(raw)[:-len('.raw.png')]
        image = Image.open(raw).convert('RGBA')
        flatten(image).save(output_path(name + '.png'))
        if name.startswith('rig.'):
            image.save(output_path(name + '.alpha.png'))
        os.remove(raw)


def write_rig_sheets():
    for look in ('folded', 'deployed'):
        image = Image.open(output_path('rig.%s.alpha.png' % look)).convert('RGBA')
        ImageOps.grayscale(flatten(image)).save(output_path('rig.%s-gray.png' % look))
        scale = INGAME_PX_PER_M / RIG_PX_PER_M
        small = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
        flatten(small).save(output_path('rig.%s.ingame.png' % look))
        ImageOps.grayscale(flatten(small)).save(output_path('rig.%s.ingame-gray.png' % look))


def report_silhouette():
    """Opaque pixels over the bare rig: the five folded extractors alone (the G&V 110% rule), then the whole loadout."""
    looks = ('bare', 'extractors', 'folded', 'deployed')
    areas = {look: silhouette_area(output_path('rig.%s.alpha.png' % look)) for look in looks}
    report = {look: area for look, area in areas.items()}
    report['extractorsOverBare'] = round(areas['extractors'] / areas['bare'], 4)
    report['foldedOverBare'] = round(areas['folded'] / areas['bare'], 4)
    report['deployedOverBare'] = round(areas['deployed'] / areas['bare'], 4)
    with open(output_path('silhouette.json'), 'w', encoding='utf8') as file:
        file.write(json.dumps(report, indent=2) + '\n')
    for look in looks:
        os.remove(output_path('rig.%s.alpha.png' % look))
    print('silhouette', report)


def silhouette_area(path):
    alpha = Image.open(path).convert('RGBA').getchannel('A')
    return sum(1 for value in alpha.get_flattened_data() if value > OPAQUE)


# --- clips -----------------------------------------------------------------------------------------


def write_unfold_clips():
    for folder in sorted(glob.glob(os.path.join(HERE, 'clips', '*'))):
        frames = [Image.open(path).convert('RGBA') for path in sorted(glob.glob(os.path.join(folder, 'frame-*.png')))]
        if not frames:
            continue
        gif_frames = [gif_frame_of(flatten(frame)) for frame in frames]
        durations = [90] * (len(gif_frames) - 1) + [900]
        gif_frames[0].save(output_path('unfold-%s.gif' % os.path.basename(folder)), save_all=True,
                           append_images=gif_frames[1:], duration=durations, loop=0, optimize=True)


def gif_frame_of(frame):
    scale = GIF_WIDTH / frame.width
    small = frame.resize((GIF_WIDTH, round(frame.height * scale)), Image.LANCZOS)
    return small.quantize(GIF_COLOURS, method=Image.Quantize.MEDIANCUT)


def write_fx_clips():
    path = output_path('fx-frames.json')
    if not os.path.exists(path):
        print('no fx-frames.json; run docs/art/tech-gear/dumpFxFrames.ts first')
        return
    with open(path, encoding='utf8') as file:
        clips = json.load(file)
    for clip in clips:
        frames = [draw_fx_frame(clip, frame) for frame in clip['frames']]
        durations = [FX_FRAME_MS] * len(frames) if len(frames) > 1 else [1000]
        frames[0].save(output_path('fx-%s.gif' % clip['id']), save_all=True, append_images=frames[1:],
                       duration=durations, loop=0, optimize=True)


def draw_fx_frame(clip, frame):
    """One frame on the review background: the hull as a brass block, the effect in its colour."""
    image = Image.new('RGBA', FX_CANVAS, BACKGROUND + (255,))
    draw = ImageDraw.Draw(image, 'RGBA')
    px_per_tile = min(12.0, (FX_CANVAS[0] * 0.42) / max(1.0, clip['reachTiles']))
    hull = (FX_CANVAS[0] // 2, FX_CANVAS[1] // 2 + 40)
    colour = hex_colour(clip['colour'], frame['alpha'])
    DRAWERS[clip['kind']](draw, clip, frame, hull, px_per_tile, colour)
    draw.rectangle([hull[0] - 14, hull[1] - 8, hull[0] + 14, hull[1] + 8], fill=(201, 162, 75, 255))
    draw.text((6, 6), '%s  tick %d' % (clip['id'], frame['tick']), fill=(220, 210, 190, 255))
    return image.convert('RGB').quantize(GIF_COLOURS, method=Image.Quantize.MEDIANCUT)


def hex_colour(text, alpha):
    return tuple(int(text[at:at + 2], 16) for at in (1, 3, 5)) + (round(255 * alpha),)


def strand_angle(index, count, spread=math.pi):
    return -math.pi / 2 - spread / 2 + spread * (index + 0.5) / count


def draw_ring(draw, clip, frame, hull, px, colour):
    radius = frame['reachM'] * px
    draw.ellipse([hull[0] - radius, hull[1] - radius, hull[0] + radius, hull[1] + radius], outline=colour, width=3)


def draw_cone(draw, clip, frame, hull, px, colour):
    """A downward cone (Seismic Ping) or a forward cone (foam) from the hull."""
    reach = frame['reachM'] * px
    down = clip['id'] == 'seismic-cone'
    tip = hull
    if down:
        base = [(hull[0] - reach * 0.6, hull[1] + reach), (hull[0] + reach * 0.6, hull[1] + reach)]
    else:
        base = [(hull[0] + reach, hull[1] - reach * 0.5), (hull[0] + reach, hull[1] + reach * 0.5)]
    draw.polygon([tip, base[0], base[1]], outline=colour, fill=colour[:3] + (colour[3] // 4,))
    for index in range(frame['strands']):
        t = (index + 0.5) / max(1, frame['strands'])
        point = (base[0][0] + (base[1][0] - base[0][0]) * t, base[0][1] + (base[1][1] - base[0][1]) * t)
        draw.ellipse([point[0] - 3, point[1] - 3, point[0] + 3, point[1] + 3], fill=colour)


def draw_stream(draw, clip, frame, hull, px, colour):
    """Brine lines (several strands) or the siphon's one hose, crawling from the cells to the hull."""
    reach = frame['reachM'] * px
    for index in range(frame['strands']):
        angle = strand_angle(index, frame['strands'], spread=math.pi * 0.8)
        far = (hull[0] + reach * math.cos(angle), hull[1] + reach * math.sin(angle))
        mid = ((hull[0] + far[0]) / 2 + 8 * math.sin(index), (hull[1] + far[1]) / 2)
        draw.line([hull, mid, far], fill=colour, width=2)
        draw.ellipse([far[0] - 4, far[1] - 4, far[0] + 4, far[1] + 4], outline=colour, width=2)


def draw_drag(draw, clip, frame, hull, px, colour):
    """Nodules tumbling along their paths towards the hull, nearest first."""
    progress = frame['reachM'] / max(1e-6, clip['reachTiles'])
    for index in range(frame['strands']):
        angle = strand_angle(index, frame['strands'])
        start = clip['reachTiles'] * (0.4 + 0.6 * index / max(1, frame['strands'] - 1)) * px
        travelled = min(1.0, progress * (1.3 - 0.3 * index / max(1, frame['strands'] - 1)))
        distance = start * (1 - travelled)
        point = (hull[0] + distance * math.cos(angle), hull[1] + distance * math.sin(angle))
        draw.line([point, (hull[0] + start * math.cos(angle), hull[1] + start * math.sin(angle))],
                  fill=colour[:3] + (colour[3] // 3,), width=1)
        draw.ellipse([point[0] - 4, point[1] - 4, point[0] + 4, point[1] + 4], fill=colour)


def draw_gather(draw, clip, frame, hull, px, colour):
    """Many nodules drawing into one vein beside the planted beacon, the slow pulse around it."""
    beacon = (hull[0] + 40, hull[1] + 20)
    radius = frame['reachM'] * px
    draw.ellipse([beacon[0] - radius, beacon[1] - radius, beacon[0] + radius, beacon[1] + radius],
                 outline=colour[:3] + (colour[3] // 2,), width=2)
    progress = frame['reachM'] / max(1e-6, clip['reachTiles'])
    for index in range(frame['strands']):
        angle = 2 * math.pi * index / frame['strands']
        start = clip['reachTiles'] * px * (0.5 + 0.5 * ((index * 7) % 5) / 4)
        distance = start * (1 - progress) + 12 * progress
        point = (beacon[0] + distance * math.cos(angle), beacon[1] + distance * math.sin(angle))
        draw.ellipse([point[0] - 3, point[1] - 3, point[0] + 3, point[1] + 3], fill=colour)
    draw.rectangle([beacon[0] - 3, beacon[1] - 8, beacon[0] + 3, beacon[1] + 8], fill=colour)


def draw_free(draw, clip, frame, hull, px, colour):
    """One gated cell pulled clean out of the wall at range, towards the coil."""
    cell_at = (hull[0] + clip['reachTiles'] * px, hull[1])
    progress = frame['reachM'] / max(1e-6, clip['reachTiles'])
    pulled = (cell_at[0] - (cell_at[0] - hull[0] - 30) * progress, cell_at[1])
    draw.rectangle([cell_at[0] - px / 2, cell_at[1] - px / 2, cell_at[0] + px / 2, cell_at[1] + px / 2],
                   outline=colour[:3] + (colour[3] // 2,), width=1)
    draw.rectangle([pulled[0] - px / 2, pulled[1] - px / 2, pulled[0] + px / 2, pulled[1] + px / 2], fill=colour)
    draw.line([hull, pulled], fill=colour, width=2)


def draw_burn(draw, clip, frame, hull, px, colour):
    """The shell up and back from the rear, arcing to the aim side, then the flare burning where it lands."""
    px = min(px, 6.0)
    shell = frame['shell']
    landing = (hull[0] + clip['reachTiles'] * px, hull[1])
    if frame['tick'] < clip['sweepTicks']:
        point = (hull[0] + shell[0] * px, hull[1] - shell[1] * px)
        draw.ellipse([point[0] - 4, point[1] - 4, point[0] + 4, point[1] + 4], fill=colour)
        return
    radius = 6 * px
    draw.ellipse([landing[0] - radius, landing[1] - radius, landing[0] + radius, landing[1] + radius],
                 fill=colour[:3] + (colour[3] // 3,), outline=colour, width=2)


def draw_curtain(draw, clip, frame, hull, px, colour):
    """A curtain of steam standing in front of the hull, a mote per strand."""
    for index in range(frame['strands']):
        t = (index + 0.5) / frame['strands']
        x = hull[0] + 24 + 10 * math.sin(index * 1.7)
        y = hull[1] - 40 + 80 * t
        draw.ellipse([x - 7, y - 7, x + 7, y + 7], fill=colour[:3] + (colour[3] // 2,))


def draw_plume(draw, clip, frame, hull, px, colour):
    """The boost's plume blown out behind the hull, growing with its reach."""
    reach = frame['reachM'] * px
    for index in range(frame['strands']):
        t = (index + 0.5) / frame['strands']
        x = hull[0] - 16 - reach * t
        y = hull[1] + 14 * math.sin(index * 2.3) * t
        size = 4 + 8 * t
        draw.ellipse([x - size, y - size, x + size, y + size], fill=colour[:3] + (colour[3] // 2,))


def draw_line(draw, clip, frame, hull, px, colour):
    """The standing grapple line up to its anchor in the rock."""
    anchor = (hull[0] + 30, hull[1] - clip['reachTiles'] * px)
    draw.line([hull, anchor], fill=colour, width=2)
    draw.rectangle([anchor[0] - 5, anchor[1] - 5, anchor[0] + 5, anchor[1] + 5], fill=colour)


def draw_plate(draw, clip, frame, hull, px, colour):
    """The salvage plate left on the tunnel wall, nodules drawn to it instead of the hull."""
    plate = (hull[0] - clip['reachTiles'] * px, hull[1] - 30)
    draw.rectangle([plate[0] - 4, plate[1] - 12, plate[0] + 4, plate[1] + 12], fill=colour)
    for index in range(frame['strands']):
        angle = strand_angle(index, frame['strands'], spread=math.pi * 1.5)
        far = (plate[0] + 40 * math.cos(angle), plate[1] + 40 * math.sin(angle))
        draw.line([plate, far], fill=colour[:3] + (colour[3] // 3,), width=1)
        draw.ellipse([far[0] - 3, far[1] - 3, far[0] + 3, far[1] + 3], fill=colour)


DRAWERS = {
    'ring': draw_ring, 'cone': draw_cone, 'stream': draw_stream, 'drag': draw_drag,
    'gather': draw_gather, 'free': draw_free, 'burn': draw_burn, 'curtain': draw_curtain,
    'plume': draw_plume, 'line': draw_line, 'plate': draw_plate,
}


def flatten(image):
    background = Image.new('RGBA', image.size, BACKGROUND + (255,))
    background.alpha_composite(image)
    return background.convert('RGB')


def output_path(name):
    return os.path.join(HERE, name)


if __name__ == '__main__':
    main()
