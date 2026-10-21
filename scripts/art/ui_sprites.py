"""
The UI chrome sprites' PNG outputs (ticket 683, docs/ui/design-system.md section 13). A `ui`
asset is authored at one Blender unit per CSS px and baked at `pxPerMetre.ui` atlas px per CSS px
(the supersample), so each part's atlas rectangle, box-filtered down to the `uiPngScales` (1x and
2x), is the sprite the DOM draws with `image-set()` and `border-image`. A part with accent areas
also ships its tint mask: white with the accent bake in alpha, which a planet skin colours in CSS.
Called from export_asset.py inside Blender (the images are bpy images); the pixel maths is numpy.
"""

import os

import bpy
import numpy

import asset_layout

# A planet skin tints the pieces of this material; the brass stays brass.
ACCENT_MATERIAL = 'accent'
TINT_MASK_NAME = 'tint'
# Below this, a sprite pixel's colour is undefined (fully transparent) and is written black.
ALPHA_FLOOR = 1e-6


def write_sprites(asset_id, sidecar, images, rules):
    """Writes every part's sprite PNGs (and tint masks) into public/assets/ui/<id>/, nothing else."""
    folder = asset_layout.export_dir_of(asset_id)
    os.makedirs(folder, exist_ok=True)
    atlas = pixel_rows_of(images['albedo'])
    tint = tint_rows_of(images[TINT_MASK_NAME], atlas)
    written = []
    for part in sidecar['parts']:
        written += write_part_sprites(folder, part, atlas, tint, sidecar['pxPerMetre'], rules['uiPngScales'])
    remove_stale_sprites(folder, written)


def write_part_sprites(folder, part, atlas, tint, supersample, scales):
    names = []
    for scale in scales:
        factor = supersample_factor_of(supersample, scale)
        names.append(write_png(folder, sprite_file_name(part['id'], '', scale), downsample(crop(atlas, part['rect']), factor)))
        if part.get('tintable'):
            names.append(write_png(folder, sprite_file_name(part['id'], '.' + TINT_MASK_NAME, scale),
                                   downsample(crop(tint, part['rect']), factor)))
    return names


def sprite_file_name(part_id, mask, scale):
    """`<part>.png` at 1x, `<part>@2x.png` at 2x; a mask goes between (`<part>.tint@2x.png`)."""
    return '%s%s%s.png' % (part_id, mask, '' if scale == 1 else '@%dx' % scale)


def supersample_factor_of(supersample, scale):
    if supersample % scale != 0:
        raise ValueError('pxPerMetre.ui %d is not a multiple of the PNG scale %d' % (supersample, scale))
    return supersample // scale


# --- pixels ---------------------------------------------------------------------------------------


def pixel_rows_of(image):
    """The image as (rows, columns, RGBA) floats, bottom row first as Blender stores it."""
    width, height = image.size
    pixels = numpy.empty(width * height * 4, dtype=numpy.float32)
    image.pixels.foreach_get(pixels)
    return pixels.reshape(height, width, 4)


def tint_rows_of(image, atlas):
    """White with the accent bake in alpha, cut to the part mask so no tint leaks past a sprite."""
    tint = pixel_rows_of(image)
    rows = numpy.ones_like(atlas)
    rows[:, :, 3] = tint[:, :, 0] * atlas[:, :, 3]
    return rows


def crop(rows, rect):
    """A rect counts from the image's top-left; the rows are stored bottom-up."""
    x, y, w, h = rect
    height = rows.shape[0]
    return rows[height - (y + h):height - y, x:x + w, :]


def downsample(rows, factor):
    """Box-filters by `factor` on premultiplied colour, so transparent texels never darken an edge."""
    height, width = rows.shape[0] // factor, rows.shape[1] // factor
    blocks = rows[:height * factor, :width * factor, :].reshape(height, factor, width, factor, 4)
    alpha = blocks[:, :, :, :, 3:4]
    premultiplied = numpy.concatenate([blocks[:, :, :, :, 0:3] * alpha, alpha], axis=4)
    mean = premultiplied.mean(axis=(1, 3))
    alpha_mean = mean[:, :, 3:4]
    colour = numpy.where(alpha_mean > ALPHA_FLOOR, mean[:, :, 0:3] / numpy.maximum(alpha_mean, ALPHA_FLOOR), 0.0)
    return numpy.concatenate([colour, alpha_mean], axis=2).astype(numpy.float32)


# --- files ----------------------------------------------------------------------------------------


def write_png(folder, name, rows):
    height, width = rows.shape[0], rows.shape[1]
    image = bpy.data.images.new('sprite.' + name, width, height, alpha=True)
    image.colorspace_settings.name = 'sRGB'
    image.pixels.foreach_set(rows.reshape(-1))
    image.filepath_raw = os.path.join(folder, name)
    image.file_format = 'PNG'
    image.save()
    bpy.data.images.remove(image)
    return name


def remove_stale_sprites(folder, written):
    """A part renamed or no longer tintable leaves no sprite behind, so a re-export is exact."""
    for name in os.listdir(folder):
        if name.endswith('.png') and name not in written:
            os.remove(os.path.join(folder, name))
