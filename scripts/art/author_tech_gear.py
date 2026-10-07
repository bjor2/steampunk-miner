"""
Authors the first version of the tech-unlocked gear's Blender sources (#166, spec #162 section 5):
the five extractors, the drill heads, collar and flank gear, the signature power-ups, the periscope,
the cab gauge cluster, a module housing per slot-drawn power-up and the consumable crates on the
charge rack's shelves. It also writes each asset's placeholder sidecar and manifest entry, so the
export can run straight after.

    blender -b --factory-startup --python-exit-code 1 -P scripts/art/author_tech_gear.py [-- <id> ...]

It writes art/blender/<id>/<id>.blend for every asset of src/features/tech-tree/techGear.json
(the one table the slice's rules, the review renders and this script share), or only the ids given
after `--`. From then on those files are the sources (#52): change the art in Blender and re-export,
rather than editing this script. Nothing here is rigged (#51 acceptance 2); the code poses the
moving parts by the table's folded and deployed poses.

Conventions are author_platform.py's, whose piece builders and materials this reuses: 1 unit =
1 m, game right is +X, up is +Z, details stand out towards -Y. Each asset is authored in its own
frame with its attach point at the origin (TD on #162: the pivot of each part is its own origin,
placed at the point's `atM`, nothing baked in the vehicle frame). A part that moves has its origin
at its hinge or slide, where the code turns or shifts it. An extractor's folded pose keeps a brass
edge and its family-coloured cap in view (GD, 6 Oct); its cap material is the one that glows.
"""

import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import asset_layout  # noqa: E402
from author_platform import (  # noqa: E402
    PALETTE,
    box,
    build_part,
    cylinder,
    finish_piece,
    reset_scene,
    save_as,
    sphere,
    torus,
)

REPO_ROOT = asset_layout.REPO_ROOT
GEAR_TABLE = os.path.join(REPO_ROOT, 'src', 'features', 'tech-tree', 'techGear.json')

# Base colour, roughness, emission strength. Family caps glow faintly so they read at gameplay zoom.
PALETTE.update({
    'gunmetal': ((0.30, 0.31, 0.33), 0.4, 0.0),
    'ceramic': ((0.86, 0.84, 0.78), 0.45, 0.0),
    'canvas': ((0.62, 0.56, 0.42), 0.9, 0.0),
    'lead': ((0.28, 0.29, 0.32), 0.5, 0.0),
    'crate-wood': ((0.40, 0.26, 0.13), 0.85, 0.0),
    'charge-red': ((0.62, 0.11, 0.07), 0.55, 0.0),
    'dial': ((0.86, 0.80, 0.66), 0.5, 0.0),
    'needle': ((0.55, 0.08, 0.06), 0.4, 0.0),
    'lamp-glow': ((1.0, 0.62, 0.22), 0.2, 1.5),
    'heat-glow': ((1.0, 0.36, 0.10), 0.3, 1.0),
    'cap-resonance': ((0.37, 0.83, 0.78), 0.2, 0.6),
    'cap-containment': ((0.62, 0.84, 0.95), 0.2, 0.6),
    'cap-etcher': ((0.66, 0.85, 0.29), 0.2, 0.6),
    'cap-induction': ((0.50, 0.55, 0.95), 0.2, 0.6),
    'cap-tether': ((0.83, 0.71, 0.94), 0.2, 0.6),
    'ice-glass': ((0.62, 0.84, 0.95), 0.15, 0.0),
    'acid-glass': ((0.66, 0.85, 0.29), 0.15, 0.0),
    'violet-glass': ((0.50, 0.55, 0.95), 0.15, 0.0),
})

# The placeholder colour of each material family, for the manifest entries (#51 placeholders).
PLACEHOLDER_COLOURS = {
    'brass': '#c9a24b', 'steel': '#7a7f86', 'iron': '#3b3631', 'copper': '#b87333',
    'ceramic': '#dcd8c8', 'glass': '#5fd3c8', 'wood': '#66421f', 'red': '#9e1c12',
}

SMALL_RIVET_RADIUS = 0.006

ATTACH_Z = {
    'drill.head': 9, 'drill.flank': 7, 'drill.collar': 7, 'drill.hood': 9, 'drill.fork': 7,
    'hull.front': 6, 'hull.arm.left': 6, 'hull.arm.right': 6, 'hull.roof.fore': 6,
    'hull.roof.mid': 6, 'hull.roof.aft': 6, 'hull.rear': 2, 'cab.gauge': 5, 'slot': 6,
}


def main():
    table = read_table()
    wanted = requested_asset_ids(table)
    for asset_id in wanted:
        author(asset_id, table)


def read_table():
    with open(GEAR_TABLE, encoding='utf8') as file:
        return json.load(file)


def requested_asset_ids(table):
    all_ids = sorted({item['assetId'] for item in table['items']})
    arguments = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    unknown = [asset_id for asset_id in arguments if asset_id not in all_ids]
    if unknown:
        raise SystemExit('not gear assets: ' + ', '.join(unknown))
    return arguments or all_ids


def author(asset_id, table):
    items = [item for item in table['items'] if item['assetId'] == asset_id]
    reset_scene()
    built = BUILDERS[asset_id](table, items)
    check_parts_match_table(asset_id, items, built)
    save_as(asset_id)
    write_placeholder(asset_id, built)
    write_manifest_entry(asset_id, built)


def check_parts_match_table(asset_id, items, built):
    wanted = sorted({part['id'] for item in items for part in item['parts']})
    names = sorted(part.name for part in built)
    if names != wanted:
        raise SystemExit('%s parts %s do not match the table %s' % (asset_id, names, wanted))
    for part in built:
        if not is_origin_inside(part):
            raise SystemExit('%s: part "%s" has its origin outside its bounds' % (asset_id, part.name))


# --- generic pieces -------------------------------------------------------------------------------


def small_rivet(centre):
    return sphere('brass', SMALL_RIVET_RADIUS, centre, flatten=0.6)


def tube(material, radius, length, centre, direction):
    """A cylinder whose axis points along `direction`."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=length, location=centre,
                                        rotation=rotation_towards(direction))
    return finish_piece(material, smooth=True)


def cone(material, base_radius, tip_radius, length, centre, direction):
    """A cone (or frustum) whose tip points along `direction`."""
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=base_radius, radius2=tip_radius, depth=length,
                                    location=centre, rotation=rotation_towards(direction))
    return finish_piece(material, smooth=True)


def ring(material, major, minor, centre, direction):
    """A torus whose axis points along `direction` (the kit's torus faces the camera)."""
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=24,
                                     minor_segments=8, location=centre, rotation=rotation_towards(direction))
    return finish_piece(material, smooth=True)


def rotation_towards(direction):
    return Vector(direction).to_track_quat('Z', 'Y').to_euler()


def hub(material='brass', radius=0.016, centre=(0.0, 0.0, 0.0)):
    """A short bearing along Y at a moving part's hinge, so its origin sits inside its mesh."""
    return cylinder(material, radius, 0.04, centre, 'Y')


def housing_pieces():
    """The module housing every slot-drawn power-up shares: an iron box in a brass frame."""
    pieces = [
        box('iron-plate', (0.12, 0.05, 0.11), (0, 0, 0)),
        box('brass', (0.124, 0.012, 0.012), (0, -0.025, 0.05)),
        box('brass', (0.124, 0.012, 0.012), (0, -0.025, -0.05)),
        box('brass', (0.012, 0.012, 0.114), (-0.056, -0.025, 0)),
        box('brass', (0.012, 0.012, 0.114), (0.056, -0.025, 0)),
    ]
    pieces += [small_rivet((x, -0.03, z)) for x in (-0.045, 0.045) for z in (-0.04, 0.04)]
    return pieces


def crate_pieces(size=(0.085, 0.07, 0.065)):
    """A slatted wooden crate with brass corners, the consumables' common carrier."""
    w, d, h = size
    pieces = [box('crate-wood', size, (0, 0, 0))]
    pieces += [box('iron', (w + 0.004, 0.01, 0.008), (0, -d / 2, z)) for z in (-h / 2 + 0.01, h / 2 - 0.01)]
    pieces += [box('brass', (0.012, 0.012, h + 0.004), (x, -d / 2, 0)) for x in (-w / 2 + 0.006, w / 2 - 0.006)]
    return pieces


# --- the extractors (fold flat when idle, G&V) ---------------------------------------------------


def author_resonance(table, items):
    """The Resonance Fork on `drill.fork`: a yoke round the shaft, prongs that slide forward."""
    attach_z = ATTACH_Z['drill.fork']
    yoke = [
        cylinder('brass', 0.07, 0.035, (0, 0, 0), 'X'),
        cylinder('dark-iron', 0.05, 0.05, (0, 0, 0), 'X'),
        box('brass', (0.04, 0.03, 0.17), (0.0, -0.02, 0)),
        sphere('cap-resonance', 0.016, (0.0, -0.045, 0.085)),
        torus('brass', 0.02, 0.005, (0.0, -0.05, 0.085)),
    ]
    prongs = [box('brass', (0.03, 0.03, 0.17), (0.012, -0.01, 0))]
    for z in (-0.07, 0.07):
        prongs += [
            tube('brass', 0.011, 0.16, (0.1, -0.01, z), (1, 0, 0)),
            sphere('steel', 0.014, (0.18, -0.01, z)),
            ring('cap-resonance', 0.016, 0.004, (0.12, -0.01, z), (1, 0, 0)),
        ]
    return [
        build_part('fork-yoke', yoke, (0, 0, 0), attach_z),
        build_part('fork-prongs', prongs, (0, 0, 0), attach_z + 1),
    ]


def author_containment(table, items):
    """The Containment Hood on `drill.hood`: a rail with the canister rack, a visor that drops."""
    attach_z = ATTACH_Z['drill.hood']
    rail = [
        box('iron', (0.26, 0.04, 0.03), (0, 0, 0.06)),
        box('iron', (0.03, 0.04, 0.14), (-0.11, 0, 0.0)),
        box('brass', (0.2, 0.03, 0.01), (-0.01, -0.01, 0.08)),
    ]
    for x in (-0.07, -0.01, 0.05):
        rail += [
            cylinder('ice-glass', 0.018, 0.05, (x, -0.01, 0.11), 'Z'),
            cylinder('brass', 0.02, 0.008, (x, -0.01, 0.138), 'Z'),
            sphere('cap-containment', 0.009, (x, -0.03, 0.11)),
        ]
    visor = [
        hub(centre=(0, 0, 0)),
        box('steel', (0.22, 0.1, 0.028), (-0.11, -0.03, -0.01)),
        box('brass', (0.22, 0.1, 0.012), (-0.11, -0.03, -0.03)),
        box('ice-glass', (0.06, 0.02, 0.02), (-0.15, -0.085, -0.01)),
    ]
    visor += [small_rivet((x, -0.08, -0.01)) for x in (-0.2, -0.1, -0.03)]
    return [
        build_part('hood-rail', rail, (0, 0, 0), attach_z),
        build_part('hood-shell', visor, (0.12, 0, 0.045), attach_z + 1),
    ]


def author_acid_etcher(table, items):
    """The Acid Etcher on `hull.arm.left`: an acid tank at the shoulder, a sprayer arm."""
    attach_z = ATTACH_Z['hull.arm.left']
    shoulder = [
        box('dark-iron', (0.06, 0.05, 0.06), (0, 0, 0)),
        cylinder('steel', 0.045, 0.1, (0.06, 0, 0.06), 'Z'),
        cylinder('brass', 0.048, 0.01, (0.06, 0, 0.03), 'Z'),
        cylinder('brass', 0.048, 0.01, (0.06, 0, 0.09), 'Z'),
        cylinder('acid-glass', 0.012, 0.06, (0.06, -0.045, 0.06), 'Z'),
        sphere('cap-etcher', 0.014, (0.06, -0.05, 0.115)),
        tube('copper', 0.006, 0.06, (0.03, -0.02, 0.03), (1, 0, 1)),
    ]
    arm = [
        hub(centre=(0, 0, 0)),
        tube('brass', 0.012, 0.2, (0.1, -0.01, 0), (1, 0, 0)),
        sphere('steel', 0.018, (0.2, -0.01, 0)),
        tube('copper', 0.02, 0.05, (0.235, -0.01, 0), (1, 0, 0)),
        cone('acid-glass', 0.012, 0.004, 0.03, (0.275, -0.01, 0), (1, 0, 0)),
    ]
    return [
        build_part('etcher-shoulder', shoulder, (0, 0, 0), attach_z),
        build_part('etcher-arm', arm, (0, 0, 0), attach_z + 1),
    ]


def author_induction(table, items):
    """The Induction Coil on `hull.front`: a hinge under the nose, a copper coil that swings out."""
    attach_z = ATTACH_Z['hull.front']
    mount = [
        box('iron', (0.05, 0.06, 0.07), (-0.01, 0, 0)),
        cylinder('brass', 0.02, 0.07, (0.02, 0, 0), 'Y'),
    ]
    mount += [small_rivet((-0.025, -0.03, z)) for z in (-0.025, 0.025)]
    coil = [
        hub(centre=(0, 0, 0)),
        tube('brass', 0.012, 0.07, (0.045, 0, 0), (1, 0, 0)),
        ring('copper', 0.062, 0.014, (0.13, 0, 0), (1, 0, 0)),
        ring('copper', 0.062, 0.014, (0.1, 0, 0), (1, 0, 0)),
        cylinder('dark-iron', 0.03, 0.08, (0.115, 0, 0), 'X'),
        sphere('cap-induction', 0.018, (0.115, -0.03, 0)),
    ]
    return [
        build_part('coil-mount', mount, (0, 0, 0), attach_z),
        build_part('coil-ring', coil, (0, 0, 0), attach_z + 1),
    ]


def author_aether_tether(table, items):
    """The Aether Tether on `hull.roof.mid`: a cable reel, a harpoon launcher on its axle."""
    attach_z = ATTACH_Z['hull.roof.mid']
    reel = [
        box('iron', (0.14, 0.05, 0.03), (0, 0, -0.065)),
        box('iron', (0.02, 0.03, 0.08), (-0.05, 0.01, -0.02)),
        box('iron', (0.02, 0.03, 0.08), (0.05, 0.01, -0.02)),
        cylinder('dark-iron', 0.045, 0.05, (0, 0, 0), 'Y'),
        cylinder('brass', 0.055, 0.008, (0, -0.028, 0), 'Y'),
        cylinder('brass', 0.055, 0.008, (0, 0.028, 0), 'Y'),
        torus('steel', 0.03, 0.01, (0, -0.012, 0)),
        tube('brass', 0.005, 0.05, (-0.055, -0.04, 0), (0, 0, 1)),
        sphere('brass', 0.009, (-0.055, -0.04, 0.03)),
        sphere('cap-tether', 0.014, (0.06, -0.03, 0.045)),
        torus('brass', 0.016, 0.004, (0.06, -0.035, 0.045)),
    ]
    harpoon = [
        hub(centre=(0, 0, 0)),
        tube('brass', 0.014, 0.13, (0.065, -0.012, 0), (1, 0, 0)),
        tube('steel', 0.006, 0.07, (0.15, -0.012, 0), (1, 0, 0)),
        cone('steel', 0.014, 0.001, 0.035, (0.2, -0.012, 0), (1, 0, 0)),
        box('steel', (0.02, 0.006, 0.04), (0.175, -0.012, 0)),
    ]
    return [
        build_part('tether-reel', reel, (0, 0, 0), attach_z),
        build_part('tether-harpoon', harpoon, (0, 0, 0), attach_z + 1),
    ]


# --- the drill heads (`drill.head`, drawn over the stock bit) --------------------------------------


def head_collar(material='brass'):
    return cylinder(material, 0.1, 0.1, (0.04, 0, 0), 'X')


def author_vibratory_bit(table, items):
    pieces = [
        head_collar(),
        cone('steel', 0.09, 0.004, 0.24, (0.21, 0, 0), (1, 0, 0)),
        box('dark-iron', (0.06, 0.05, 0.05), (0.03, -0.07, 0.1)),
        cylinder('steel', 0.016, 0.04, (0.03, -0.07, 0.07), 'Z'),
    ]
    pieces += [box('iron', (0.02, 0.02, 0.03), (0.04, -0.09 * math.cos(a), 0.09 * math.sin(a)))
               for a in (0.4, 1.2, 2.0, 2.8)]
    return [build_part('vibratory-bit', pieces, (0, 0, 0), ATTACH_Z['drill.head'])]


def author_thaw_crown(table, items):
    pieces = [
        head_collar('ember-iron'),
        cone('steel', 0.085, 0.004, 0.24, (0.21, 0, 0), (1, 0, 0)),
        cylinder('heat-glow', 0.07, 0.015, (0.11, 0, 0), 'X'),
        tube('copper', 0.008, 0.08, (0.02, -0.07, 0.05), (0, 0, 1)),
    ]
    pieces += [box('heat-glow', (0.05, 0.016, 0.016), (0.14, -0.075 * math.cos(a), 0.075 * math.sin(a)))
               for a in (0.0, 1.05, 2.1, 3.14, 4.19, 5.24)]
    return [build_part('thaw-crown', pieces, (0, 0, 0), ATTACH_Z['drill.head'])]


def author_twin_bit(table, items):
    pieces = [head_collar(), cylinder('dark-iron', 0.06, 0.04, (0.1, 0, 0), 'X')]
    for z in (-0.055, 0.055):
        pieces += [
            cone('steel', 0.055, 0.003, 0.22, (0.22, 0, z), (1, 0, 0)),
            ring('gunmetal', 0.045, 0.006, (0.15, 0, z), (1, 0, 0)),
            ring('gunmetal', 0.035, 0.006, (0.2, 0, z), (1, 0, 0)),
        ]
    return [build_part('twin-bit', pieces, (0, 0, 0), ATTACH_Z['drill.head'])]


def author_dielectric_bit(table, items):
    pieces = [
        head_collar('ceramic'),
        cylinder('brass', 0.104, 0.015, (0.095, 0, 0), 'X'),
        cone('ceramic', 0.085, 0.004, 0.24, (0.22, 0, 0), (1, 0, 0)),
        ring('teal', 0.062, 0.007, (0.17, 0, 0), (1, 0, 0)),
        ring('teal', 0.042, 0.006, (0.24, 0, 0), (1, 0, 0)),
    ]
    return [build_part('dielectric-bit', pieces, (0, 0, 0), ATTACH_Z['drill.head'])]


# --- the collar gear (`drill.collar`, exclusive) ---------------------------------------------------


def collar_ring(material='iron'):
    return [cylinder(material, 0.06, 0.05, (0, 0, 0), 'X'), cylinder('brass', 0.064, 0.012, (0, 0, 0), 'X')]


def author_spoil_auger(table, items):
    attach_z = ATTACH_Z['drill.collar']
    collar = collar_ring() + [box('dark-iron', (0.05, 0.04, 0.06), (0, -0.01, -0.07))]
    screw = [
        box('dark-iron', (0.04, 0.04, 0.03), (0, -0.01, 0)),
        tube('brass', 0.012, 0.1, (-0.02, -0.01, -0.05), (-0.4, 0, -1)),
        tube('steel', 0.016, 0.34, (-0.2, -0.01, -0.1), (1, 0, 0)),
    ]
    for at in range(6):
        x = -0.07 - at * 0.05
        bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.04, depth=0.006, location=(x, -0.01, -0.1),
                                            rotation=(0, math.pi / 2 - 0.5, 0))
        screw.append(finish_piece('steel', smooth=True))
    return [
        build_part('auger-collar', collar, (0, 0, 0), attach_z),
        build_part('auger-screw', screw, (0, 0, 0), attach_z + 1),
    ]


def author_sampling_corer(table, items):
    attach_z = ATTACH_Z['drill.collar']
    collar = collar_ring() + [
        box('brass', (0.03, 0.03, 0.05), (0, -0.01, 0.06)),
        cylinder('brass', 0.022, 0.08, (0, -0.01, 0.085), 'X'),
    ]
    tube_pieces = [
        tube('steel', 0.014, 0.3, (0.06, -0.01, 0), (1, 0, 0)),
        tube('gunmetal', 0.018, 0.03, (0.2, -0.01, 0), (1, 0, 0)),
        cylinder('brass', 0.02, 0.02, (-0.08, -0.01, 0), 'X'),
    ]
    return [
        build_part('corer-collar', collar, (0, 0, 0), attach_z),
        build_part('corer-tube', tube_pieces, (0, 0, 0.085), attach_z + 1),
    ]


def author_reach_boom(table, items):
    attach_z = ATTACH_Z['drill.collar']
    collar = collar_ring() + [
        box('iron', (0.16, 0.025, 0.015), (0.03, -0.015, 0.055)),
        box('iron', (0.16, 0.025, 0.015), (0.03, -0.015, -0.055)),
    ]
    sleeve = [
        cylinder('brass', 0.046, 0.12, (0.04, 0, 0), 'X'),
        cylinder('dark-iron', 0.05, 0.015, (-0.01, 0, 0), 'X'),
        box('steel', (0.04, 0.03, 0.02), (0.02, -0.02, 0.058)),
        box('steel', (0.04, 0.03, 0.02), (0.02, -0.02, -0.058)),
    ]
    return [
        build_part('boom-collar', collar, (0, 0, 0), attach_z),
        build_part('boom-sleeve', sleeve, (0, 0, 0), attach_z + 1),
    ]


# --- the flank cutters (`drill.flank`, mirrored by the code) ----------------------------------------


def author_side_cutters(table, items):
    attach_z = ATTACH_Z['drill.flank']
    bracket = [cylinder('iron', 0.05, 0.04, (0, 0, 0), 'X'), cylinder('brass', 0.02, 0.05, (0, 0, 0.04), 'Y')]
    arm = [
        hub(centre=(0, 0, 0)),
        box('steel', (0.028, 0.025, 0.18), (0, -0.005, 0.09)),
        cylinder('brass', 0.055, 0.03, (0, -0.005, 0.2), 'Y'),
        cylinder('dark-iron', 0.012, 0.045, (0, -0.005, 0.2), 'Y'),
    ]
    arm += [box('brass', (0.02, 0.025, 0.02), (0.06 * math.cos(a), -0.005, 0.2 + 0.06 * math.sin(a)))
            for a in (0, 0.78, 1.57, 2.36, 3.14, 3.93, 4.71, 5.5)]
    return [
        build_part('cutter-bracket', bracket, (0, 0, 0), attach_z),
        build_part('cutter-arm', arm, (0, 0, 0.04), attach_z + 1),
    ]


# --- the signature power-ups and passives ---------------------------------------------------------


def author_grapple_winch(table, items):
    attach_z = ATTACH_Z['hull.arm.right']
    drum = [
        box('iron', (0.1, 0.05, 0.03), (0, 0, -0.06)),
        cylinder('dark-iron', 0.045, 0.06, (0, 0, 0), 'Y'),
        cylinder('brass', 0.055, 0.008, (0, -0.032, 0), 'Y'),
        torus('steel', 0.03, 0.012, (0, -0.015, 0)),
        tube('copper', 0.006, 0.06, (-0.06, -0.02, -0.03), (0, 0, 1)),
        box('brass', (0.02, 0.02, 0.05), (0.06, -0.02, -0.03)),
    ]
    hook = [
        hub(centre=(0, 0, 0)),
        tube('brass', 0.016, 0.12, (0.06, -0.012, 0), (1, 0, 0)),
        tube('steel', 0.007, 0.05, (0.14, -0.012, 0), (1, 0, 0)),
        torus('steel', 0.022, 0.006, (0.185, -0.012, 0)),
        box('steel', (0.02, 0.006, 0.05), (0.17, -0.012, 0)),
    ]
    return [
        build_part('winch-drum', drum, (0, 0, 0), attach_z),
        build_part('winch-hook', hook, (0, 0, 0), attach_z + 1),
    ]


def author_echo_sounder(table, items):
    attach_z = ATTACH_Z['hull.roof.aft']
    hammer = [
        box('dark-iron', (0.09, 0.06, 0.06), (0, 0, 0.03)),
        cylinder('steel', 0.016, 0.07, (0.025, -0.01, 0.07), 'Z'),
        cylinder('brass', 0.022, 0.015, (0.025, -0.01, 0.1), 'Z'),
        tube('copper', 0.006, 0.06, (-0.03, -0.02, 0.07), (0, 0, 1)),
        sphere('brass', 0.012, (-0.03, -0.02, 0.1)),
    ]
    hammer += [small_rivet((x, -0.03, 0.01)) for x in (-0.035, 0.035)]
    horn = [
        hub(centre=(0, 0, 0)),
        cone('brass', 0.012, 0.05, 0.14, (-0.045, -0.01, 0.06), (-0.6, 0, 0.8)),
        ring('brass', 0.05, 0.006, (-0.085, -0.01, 0.115), (-0.6, 0, 0.8)),
    ]
    return [
        build_part('sounder-hammer', hammer, (0, 0, 0), attach_z),
        build_part('sounder-horn', horn, (0.02, 0, 0.06), attach_z + 1),
    ]


def author_threat_periscope(table, items):
    attach_z = ATTACH_Z['hull.roof.fore']
    mast = [
        cylinder('brass', 0.022, 0.01, (0, 0, 0.005), 'Z'),
        cylinder('brass', 0.012, 0.14, (0, 0, 0.07), 'Z'),
        box('dark-iron', (0.04, 0.03, 0.03), (0, -0.015, 0.06)),
        cylinder('dial', 0.012, 0.004, (0, -0.032, 0.06), 'Y'),
        box('needle', (0.014, 0.002, 0.002), (0.004, -0.035, 0.06)),
    ]
    head = [
        hub(radius=0.012, centre=(0, 0, 0)),
        box('brass', (0.07, 0.035, 0.035), (0.02, 0, 0.02)),
        sphere('glass', 0.012, (0.055, 0, 0.02)),
        box('teal-glass', (0.02, 0.02, 0.02), (0.0, -0.02, 0.02), turn_y=0.78),
    ]
    return [
        build_part('periscope-mast', mast, (0, 0, 0), attach_z),
        build_part('periscope-head', head, (0, 0, 0.14), attach_z + 1),
    ]


def author_cab_gauges(table, items):
    """The cab gauge cluster on `cab.gauge`: one plate with two bezels, a dial per owned passive."""
    attach_z = ATTACH_Z['cab.gauge']
    plate = [
        box('brass', (0.11, 0.014, 0.062), (0, 0, 0)),
        torus('dark-iron', 0.021, 0.005, (-0.028, -0.009, 0)),
        torus('dark-iron', 0.021, 0.005, (0.028, -0.009, 0)),
    ]
    plate += [small_rivet((x, -0.008, z)) for x in (-0.048, 0.048) for z in (-0.024, 0.024)]
    lens = [
        cylinder('dial', 0.019, 0.006, (0, -0.011, 0), 'Y'),
        box('teal-glass', (0.016, 0.006, 0.016), (0, -0.018, 0), turn_y=0.78),
        box('needle', (0.016, 0.002, 0.002), (0.006, -0.017, 0.008)),
    ]
    barometer = [
        cylinder('dial', 0.019, 0.006, (0, -0.011, 0), 'Y'),
        torus('brass', 0.011, 0.004, (0, -0.016, 0)),
        box('needle', (0.002, 0.002, 0.016), (0, -0.017, 0.004)),
    ]
    return [
        build_part('gauge-cluster', plate, (0, 0, 0), attach_z),
        build_part('dial-assay-lens', lens, (-0.028, 0, 0), attach_z + 1),
        build_part('dial-hazard-barometer', barometer, (0.028, 0, 0), attach_z + 1),
    ]


# --- the slot housings (`hull.powerup.n`) ----------------------------------------------------------


def slot_housing(part_id, detail):
    return [build_part(part_id, housing_pieces() + detail, (0, 0, 0), ATTACH_Z['slot'])]


def author_mineral_drain(table, items):
    return slot_housing('drain-housing', [
        cylinder('teal-glass', 0.028, 0.06, (0, -0.04, -0.01), 'Z'),
        cylinder('brass', 0.03, 0.008, (0, -0.04, 0.024), 'Z'),
        tube('copper', 0.004, 0.05, (-0.015, -0.04, 0.045), (-0.3, 0, 1)),
        tube('copper', 0.004, 0.05, (0.015, -0.04, 0.045), (0.3, 0, 1)),
    ])


def author_slurry_siphon(table, items):
    return slot_housing('siphon-housing', [
        cylinder('steel', 0.025, 0.07, (-0.02, -0.04, 0), 'Z'),
        ring('brass', 0.022, 0.006, (0.035, -0.04, -0.02), (1, 0, 0)),
        ring('brass', 0.022, 0.006, (0.035, -0.04, 0.0), (1, 0, 0)),
        ring('brass', 0.022, 0.006, (0.035, -0.04, 0.02), (1, 0, 0)),
        cone('brass', 0.014, 0.006, 0.04, (0.075, -0.03, 0.03), (1, 0, 0)),
    ])


def author_ore_shifter(table, items):
    return slot_housing('shifter-housing', [
        torus('copper', 0.036, 0.012, (0, -0.04, 0)),
        sphere('dark-iron', 0.018, (0, -0.04, 0)),
        sphere('violet-glass', 0.008, (0, -0.058, 0)),
    ])


def author_pressure_pocket(table, items):
    return slot_housing('lance-housing', [
        tube('steel', 0.012, 0.1, (0.09, -0.03, 0.02), (1, 0, 0)),
        cone('brass', 0.016, 0.008, 0.03, (0.15, -0.03, 0.02), (1, 0, 0)),
        cylinder('dial', 0.016, 0.006, (-0.025, -0.03, 0.0), 'Y'),
        torus('brass', 0.017, 0.004, (-0.025, -0.032, 0.0)),
    ])


def author_strata_press(table, items):
    return slot_housing('press-housing', [
        box('steel', (0.025, 0.08, 0.09), (0.08, -0.01, 0)),
        tube('gunmetal', 0.008, 0.04, (0.06, -0.02, 0.03), (1, 0, 0)),
        tube('gunmetal', 0.008, 0.04, (0.06, -0.02, -0.03), (1, 0, 0)),
    ])


def author_galvanic_probe(table, items):
    return slot_housing('probe-housing', [
        tube('copper', 0.005, 0.1, (0.09, -0.03, 0.025), (1, 0, 0)),
        tube('copper', 0.005, 0.1, (0.09, -0.03, -0.025), (1, 0, 0)),
        cylinder('dial', 0.02, 0.006, (-0.02, -0.03, 0), 'Y'),
        box('needle', (0.018, 0.002, 0.002), (-0.014, -0.034, 0.006), turn_y=0.5),
    ])


def author_void_sounder(table, items):
    return slot_housing('void-horn-housing', [
        cone('brass', 0.014, 0.045, 0.13, (0.11, -0.025, 0.0), (1, 0, 0)),
        ring('brass', 0.045, 0.005, (0.175, -0.025, 0.0), (1, 0, 0)),
    ])


def author_steam_boost(table, items):
    return slot_housing('boost-housing', [
        cylinder('brass', 0.022, 0.05, (0, -0.035, 0.0), 'Z'),
        cone('brass', 0.016, 0.034, 0.04, (0, -0.035, 0.065), (0, 0, 1)),
        box('steel', (0.06, 0.006, 0.006), (0.035, -0.035, 0.02), turn_y=-0.4),
        sphere('needle', 0.007, (0.062, -0.035, 0.03)),
    ])


def author_steam_shield(table, items):
    detail = [cylinder('brass', 0.03, 0.02, (0, -0.035, 0.0), 'Z')]
    detail += [cylinder('steel', 0.007, 0.04, (x, -0.035, 0.065), 'Z') for x in (-0.035, 0, 0.035)]
    detail += [torus('brass', 0.016, 0.004, (0, -0.052, 0))]
    return slot_housing('shield-housing', detail)


def author_grav_anchor(table, items):
    return slot_housing('anchor-housing', [
        sphere('dark-iron', 0.03, (0, -0.04, 0)),
        ring('brass', 0.038, 0.004, (0, -0.04, 0), (0, 1, 0)),
        ring('brass', 0.038, 0.004, (0, -0.04, 0), (1, 0, 0)),
    ])


def author_buoyancy_tanks(table, items):
    return slot_housing('bladder-housing', [
        tube('canvas', 0.028, 0.1, (0, -0.04, 0.01), (1, 0, 0)),
        ring('iron', 0.03, 0.004, (-0.03, -0.04, 0.01), (1, 0, 0)),
        ring('iron', 0.03, 0.004, (0.03, -0.04, 0.01), (1, 0, 0)),
        cylinder('brass', 0.008, 0.02, (0, -0.04, -0.03), 'Z'),
    ])


# --- the consumable crates on the charge rack's shelves (`hull.rear`) ------------------------------

CRATE_LOOKS = {
    'crate-flare-mortar': lambda: [cylinder('charge-red', 0.012, 0.05, (x, -0.03, 0.0), 'Z') for x in (-0.025, 0, 0.025)]
    + [cylinder('brass', 0.012, 0.01, (x, -0.03, 0.03), 'Z') for x in (-0.025, 0, 0.025)],
    'crate-stabiliser-foam': lambda: [cylinder('canvas', 0.028, 0.06, (0, -0.03, 0), 'Z'),
                                      cone('brass', 0.008, 0.004, 0.02, (0, -0.03, 0.04), (0, 0, 1))],
    'crate-seam-splitter': lambda: [cone('steel', 0.02, 0.002, 0.06, (0.0, -0.035, 0.0), (1, 0, 0))],
    'crate-cryo-binder': lambda: [cylinder('ice-glass', 0.026, 0.06, (0, -0.03, 0), 'Z'),
                                  torus('brass', 0.012, 0.004, (0, -0.056, 0.03))],
    'crate-lodestone-beacon': lambda: [sphere('dark-iron', 0.028, (0, -0.03, 0), flatten=0.8),
                                       ring('copper', 0.03, 0.005, (0, -0.03, 0), (0, 0, 1)),
                                       sphere('cap-induction', 0.008, (0, -0.058, 0.0))],
    'crate-shoring-props': lambda: [cylinder('steel', 0.008, 0.07, (x, -0.03, 0), 'Z') for x in (-0.02, 0, 0.02)]
    + [box('iron', (0.06, 0.02, 0.008), (0, -0.03, z)) for z in (-0.02, 0.02)],
    'crate-signal-buoy': lambda: [sphere('brass', 0.026, (0, -0.03, 0)), sphere('lamp-glow', 0.007, (0, -0.03, 0.03)),
                                  cylinder('iron', 0.004, 0.02, (0, -0.03, 0.03), 'Z')],
    'crate-emergency-ballast': lambda: [box('lead', (0.06, 0.03, 0.016), (0, -0.03, z)) for z in (-0.02, 0.0, 0.02)],
    'crate-heat-sink-flask': lambda: [sphere('teal-glass', 0.025, (0, -0.03, -0.01)),
                                      cylinder('brass', 0.008, 0.03, (0, -0.03, 0.025), 'Z')],
    'crate-rivet-patch': lambda: [box('steel', (0.06, 0.006, 0.05), (0, -0.038, 0))]
    + [small_rivet((x, -0.042, z)) for x in (-0.02, 0.02) for z in (-0.015, 0.015)],
    'crate-smoke-canister': lambda: [cylinder('enamel', 0.026, 0.06, (0, -0.03, 0), 'Z'),
                                     cylinder('charge-red', 0.027, 0.01, (0, -0.03, 0.015), 'Z')],
    'crate-escape-thruster': lambda: [cylinder('gunmetal', 0.02, 0.07, (0, -0.03, 0), 'X'),
                                      cone('brass', 0.02, 0.01, 0.02, (0.045, -0.03, 0), (1, 0, 0))]
    + [box('steel', (0.02, 0.004, 0.02), (-0.03, -0.03, z)) for z in (-0.025, 0.025)],
}


def author_rack_crates(table, items):
    """The crate shelves above the charge rack, a crate per consumable, the mortar tube on top."""
    rack = table['crateRack']
    attach_z = ATTACH_Z['hull.rear']
    columns, rows = rack['columns'], rack['rows']
    pitch_x, pitch_z = rack['pitchM']
    first_x, first_z = rack['firstM']
    width = columns * pitch_x
    top = first_z + (rows - 1) * pitch_z + 0.06
    shelf = [
        box('iron', (0.02, 0.03, 0.2), (0, 0.02, 0.09)),
        box('iron', (0.015, 0.045, top - first_z + 0.1), (-width / 2 - 0.01, 0, (top + first_z) / 2 - 0.02)),
        box('iron', (0.015, 0.045, top - first_z + 0.1), (width / 2 + 0.01, 0, (top + first_z) / 2 - 0.02)),
        box('brass', (width + 0.04, 0.045, 0.012), (0, 0, top + 0.01)),
    ]
    for row in range(rows):
        shelf.append(box('iron-plate', (width + 0.02, 0.09, 0.008), (0, 0, first_z + row * pitch_z - 0.037)))
    shelf += [small_rivet((x, -0.024, first_z + row * pitch_z - 0.037))
              for x in (-width / 2, width / 2) for row in range(rows)]
    parts = [build_part(rack['shelfPartId'], shelf, (0, 0, 0), attach_z)]
    crate_ids = [part['id'] for item in items for part in item['parts'] if part['id'].startswith('crate-') and part['id'] != rack['shelfPartId']]
    for index, crate_id in enumerate(crate_ids):
        column, row = index % columns, index // columns
        at = (first_x + column * pitch_x, 0, first_z + row * pitch_z)
        parts.append(build_part(crate_id, crate_pieces() + CRATE_LOOKS[crate_id](), at, attach_z + 1))
    mortar = [
        box('dark-iron', (0.06, 0.05, 0.02), (0, 0, -0.01)),
        hub(centre=(0, 0, 0)),
        tube('dark-iron', 0.022, 0.15, (-0.045, -0.01, 0.07), (-0.5, 0, 0.87)),
        ring('brass', 0.024, 0.005, (-0.08, -0.01, 0.13), (-0.5, 0, 0.87)),
    ]
    parts.append(build_part('mortar-tube', mortar, (-0.03, 0, top + 0.03), attach_z + 2))
    return parts


BUILDERS = {
    'vehicle-item-rig-resonance': author_resonance,
    'vehicle-item-rig-containment': author_containment,
    'vehicle-item-rig-acid-etcher': author_acid_etcher,
    'vehicle-item-rig-induction': author_induction,
    'vehicle-item-rig-aether-tether': author_aether_tether,
    'vehicle-item-gear-vibratory-bit': author_vibratory_bit,
    'vehicle-item-gear-thaw-crown': author_thaw_crown,
    'vehicle-item-gear-twin-bit': author_twin_bit,
    'vehicle-item-gear-dielectric-bit': author_dielectric_bit,
    'vehicle-item-gear-spoil-auger': author_spoil_auger,
    'vehicle-item-gear-sampling-corer': author_sampling_corer,
    'vehicle-item-gear-reach-boom': author_reach_boom,
    'vehicle-item-gear-side-cutters': author_side_cutters,
    'vehicle-item-power-grapple-winch': author_grapple_winch,
    'vehicle-item-power-echo-sounder': author_echo_sounder,
    'vehicle-item-passive-threat-periscope': author_threat_periscope,
    'vehicle-cab-gauges': author_cab_gauges,
    'vehicle-item-power-mineral-drain': author_mineral_drain,
    'vehicle-item-power-slurry-siphon': author_slurry_siphon,
    'vehicle-item-power-ore-shifter': author_ore_shifter,
    'vehicle-item-power-pressure-pocket': author_pressure_pocket,
    'vehicle-item-power-strata-press': author_strata_press,
    'vehicle-item-power-galvanic-probe': author_galvanic_probe,
    'vehicle-item-power-void-sounder': author_void_sounder,
    'vehicle-item-power-steam-boost': author_steam_boost,
    'vehicle-item-power-steam-shield': author_steam_shield,
    'vehicle-item-power-grav-anchor': author_grav_anchor,
    'vehicle-item-power-buoyancy-tanks': author_buoyancy_tanks,
    'vehicle-rack-crates': author_rack_crates,
}


# --- the placeholder sidecar and manifest entry (#116: one file each per asset) ---------------------


def write_placeholder(asset_id, parts):
    rules = asset_layout.load_rules()
    layouts = [part_layout_of(part) for part in parts]
    source = {'blend': 'art/blender/%s/%s.blend' % (asset_id, asset_id), 'sha256': None, 'blender': None}
    sidecar = asset_layout.build_sidecar(asset_id, layouts, rules, source, has_emissive=glows(parts))
    asset_layout.write_sidecar(asset_layout.placeholder_path_of(asset_id), sidecar)


def part_layout_of(obj):
    (min_x, min_z), (max_x, max_z) = bounds_of(obj)
    origin = obj.matrix_world.translation
    size = (max_x - min_x, max_z - min_z)
    pivot = (origin.x - min_x, origin.z - min_z)
    return {
        'id': obj.name,
        'tier': 1,
        'sizeM': list(size),
        'pivotM': [min(max(value, 0.0), size[axis]) for axis, value in enumerate(pivot)],
        'atM': [origin.x, origin.z],
        'z': int(obj['z']),
    }


def bounds_of(obj):
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    points = numpy.array([tuple(evaluated.matrix_world @ vertex.co) for vertex in mesh.vertices])
    evaluated.to_mesh_clear()
    low, high = points.min(axis=0), points.max(axis=0)
    return (low[0], low[2]), (high[0], high[2])


def is_origin_inside(obj):
    (min_x, min_z), (max_x, max_z) = bounds_of(obj)
    origin = obj.matrix_world.translation
    return min_x - 1e-6 <= origin.x <= max_x + 1e-6 and min_z - 1e-6 <= origin.z <= max_z + 1e-6


def glows(parts):
    return any(PALETTE[material.name][2] > 0.0 for part in parts for material in part.data.materials)


def write_manifest_entry(asset_id, parts):
    entry = {
        'id': asset_id,
        'source': 'blender',
        'form': 'parts',
        'status': 'final',
        'color': PLACEHOLDER_COLOURS['brass'],
        'partColors': {part.name: placeholder_colour_of(part) for part in sorted(parts, key=lambda p: p.name)},
    }
    path = os.path.join(REPO_ROOT, 'art', 'assets', asset_id + '.json')
    with open(path, 'w', encoding='utf-8', newline='\n') as file:
        file.write(json.dumps(entry, indent=2) + '\n')


def placeholder_colour_of(part):
    """The colour of the part's first material family, so a flat placeholder still reads."""
    first = part.data.materials[0].name if part.data.materials else 'brass'
    for family, colour in PLACEHOLDER_COLOURS.items():
        if family in first:
            return colour
    return PLACEHOLDER_COLOURS['iron'] if first in ('dark-iron', 'iron-plate', 'enamel', 'gunmetal', 'lead') else PLACEHOLDER_COLOURS['brass']


if __name__ == '__main__':
    main()
