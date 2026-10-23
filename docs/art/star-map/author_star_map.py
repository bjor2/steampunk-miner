"""
Authors the first version of the star map's sprites (ticket 758, the map art pass of the GD lock on
#650; the brief is docs/ui/design-system.md section 13, the `art.starMap` row): one `ui` Blender
asset, `ui-star-map`, with three flat sprites the DOM draws through `--art-star-map-*`.

    blender -b --factory-startup --python-exit-code 1 -P docs/art/star-map/author_star_map.py

It writes art/blender/ui-star-map/ui-star-map.blend from the `uiSprites` row in art/asset-rules.json
and the design tokens' colours. From then on that file is the source (#52): change the art in
Blender and re-export, rather than editing this script. Conventions and helpers are
scripts/art/author_ui_chrome.py's: one Blender unit is one CSS px at 1x, flat faces in the tokens'
material stops, the camera along +Y so a piece at a smaller Y draws over one behind it, the part's
origin at the sprite's centre, every stroke at least 1 px at 1x.

| Part                 | 1x size | Look                                                                                                     |
| -------------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| `ui-star-map-planet` | 48 x 48 | a planet: a 1 px brass rim round the planet's disc (the accent, tinted the planet's ground colour in CSS), two faint strata rings, an iron-ringed ember core, a parchment highlight |
| `ui-star-map-sun`    | 64 x 64 | the system's star: twelve brass rays round an amber disc with an ember heart                            |
| `ui-star-map-here`   | 56 x 56 | the ring round the planet the session is on: a 2 px brass ring with a tick at each compass point       |

The planet's disc wears the `accent` material, so the export writes its tint mask and the chart
colours it per planet (the view's `colour`); the rim, rings, core and highlight stay what they are.
"""

import os
import sys

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
sys.path.insert(0, os.path.join(REPO_ROOT, 'scripts', 'art'))

import author_ui_chrome as chrome  # noqa: E402
from author_ui_chrome import LAYER, build_part, disc, flat_material, ring, tick  # noqa: E402

ASSET_ID = 'ui-star-map'
# The planet's radii (px at 1x): the rim, the disc, the two strata rings, the core and its ring.
PLANET_RIM = 24
PLANET_DISC = 22
STRATA_RINGS = (16, 10)
CORE_RING = 5
CORE = 4
HIGHLIGHT = (2, -8, 8)
# The sun: the disc, its heart and the rays from the disc's edge out.
SUN_DISC = 19
SUN_HEART = 9
SUN_RAYS = 12
RAY_ROOT, RAY_TIP = 21, 32
RAY_WIDTH = 4
# The here ring: a 2 px ring with 2 x 6 px ticks at the compass points.
HERE_OUTER, HERE_INNER = 28, 26
HERE_TICK = (2, 6)


def main():
    tokens, rules = chrome.load_json(chrome.TOKENS_PATH), chrome.load_json(chrome.RULES_PATH)
    sprites = rules['uiSprites'][ASSET_ID]
    chrome.reset_scene()
    m = chrome.Materials(tokens)
    parts = author_planet(m, sprites) + author_sun(m, sprites) + author_here(m, sprites)
    check_parts_match_rules(parts, sprites)
    chrome.save_as(ASSET_ID)


def author_planet(m, sprites):
    """The planet: a brass rim, the tintable disc, two strata rings, an iron-ringed ember core."""
    x = variant_x(sprites, 'ui-star-map-planet')
    pieces = [
        ring(m.graded('brass'), PLANET_RIM, PLANET_DISC, x, 0, 0),
        disc(m.accent(m.colour('accent')), PLANET_DISC, x, 0, -LAYER),
    ]
    pieces += [ring(m.stop('iron', 'shadow'), radius + 0.5, radius - 0.5, x, 0, -2 * LAYER) for radius in STRATA_RINGS]
    pieces += [
        disc(m.stop('iron', 'shadow'), CORE_RING, x, 0, -3 * LAYER),
        disc(m.stop('iron', 'base'), CORE, x, 0, -3.5 * LAYER),
        disc(flat_material('ember', m.colour('ember')), CORE - 1.5, x, 0, -4 * LAYER),
        disc(m.stop('parchment', 'highlight'), HIGHLIGHT[0], x + HIGHLIGHT[1], HIGHLIGHT[2], -4 * LAYER),
    ]
    return [build_part('ui-star-map-planet', pieces, (x, 0), sprites)]


def author_sun(m, sprites):
    """The star: brass rays round an amber disc with an ember heart."""
    x = variant_x(sprites, 'ui-star-map-sun')
    pieces = [tick(m.graded('brass'), RAY_WIDTH, RAY_TIP - RAY_ROOT, (RAY_ROOT + RAY_TIP) / 2,
                   360.0 * ray / SUN_RAYS, x, 0, 0) for ray in range(SUN_RAYS)]
    pieces += [
        ring(m.graded('brass'), SUN_DISC + 1.5, SUN_DISC, x, 0, -LAYER),
        disc(flat_material('amber', m.colour('amber')), SUN_DISC, x, 0, -2 * LAYER),
        disc(flat_material('ember', m.colour('ember')), SUN_HEART, x, 0, -3 * LAYER),
        disc(m.stop('parchment', 'highlight'), 2.5, x - 7, 7, -4 * LAYER),
    ]
    return [build_part('ui-star-map-sun', pieces, (x, 0), sprites)]


def author_here(m, sprites):
    """The ring round the planet the session is on, with a tick at each compass point."""
    x = variant_x(sprites, 'ui-star-map-here')
    pieces = [ring(m.graded('brass'), HERE_OUTER, HERE_INNER, x, 0, 0)]
    width, length = HERE_TICK
    for angle in (0, 90, 180, 270):
        pieces.append(tick(m.graded('brass'), width, length, HERE_INNER - length / 2 + 1, angle, x, 0, -LAYER))
    return [build_part('ui-star-map-here', pieces, (x, 0), sprites)]


def variant_x(sprites, part_id):
    """Each sprite sits beside the one before it in the file, as the chrome's variants do."""
    at = sorted(sprites).index(part_id)
    return chrome.write_ui_placeholders.variant_x_of(sprites[part_id], at)


def check_parts_match_rules(parts, sprites):
    names = sorted(part.name for part in parts)
    if names != sorted(sprites):
        raise SystemExit('%s parts %s do not match the rules %s' % (ASSET_ID, names, sorted(sprites)))


if __name__ == '__main__':
    main()
