"""
Places the vehicle's attach points (#162 "vehicle sockets", K5 #188) as `attach.<id>` empties in
the base vehicle .blend, in an `attach` collection, then saves the file. The export writes them to
the sidecar's `attach` array. Re-running replaces the empties with the table below.

    blender -b art/blender/vehicle/vehicle.blend --python-exit-code 1 \\
        -P scripts/art/place_vehicle_attach.py

The positions are first placements read off the existing parts (metres, X right, Z up, the
vehicle frame); #166 moves the empties in Blender as gear is modelled. `z` is the draw order of the
part mounted there.
"""

import bpy

COLLECTION = 'attach'

# id: (x, z, draw order), with the part or asset each point is read from.
POINTS = {
    'drill.head': (0.65, 0.0, 9),  # the t3 drill head and bit
    'drill.flank': (0.58, 0.0, 7),  # either side of the shaft, mirrored from one part
    'drill.collar': (0.5, 0.0, 7),  # behind the head
    'drill.fork': (0.42, 0.0, 7),  # prongs just behind the collar (#162 GD)
    'drill.hood': (0.56, 0.16, 9),  # over the head
    'drill.housing': (0.26, 0.04, 4),  # the motor housing (#180)
    'hull.front': (0.48, -0.08, 6),  # the front armour plate
    'hull.arm.left': (-0.36, -0.12, 6),
    'hull.arm.right': (0.36, -0.12, 6),
    'hull.roof.fore': (0.36, 0.28, 6),  # on the piston and headlamp, clear of the tether reel (#166)
    'hull.roof.mid': (0.17, 0.4, 6),  # on the second boiler, right of the turret's pillar (#166)
    'hull.roof.aft': (-0.42, 0.24, 6),
    'hull.turret': (0.04, 0.13, 10),  # the auto-guns mount (#107)
    'hull.rear': (-0.58, -0.04, 2),  # the charge rack (#109)
    'hull.hitch': (-0.52, -0.3, 1),  # wagons (P12)
    'hull.boiler': (-0.13, 0.2, 3),  # the t1 boiler (#180)
    'hull.stack': (-0.16, 0.46, 2),  # the second stack (#180)
    'hull.cargo': (0.2, 0.2, 3),  # the hopper (#180)
    'hull.plates': (0.0, 0.14, 5),  # the t3 roof plate (#180)
    'hull.liner': (-0.2, -0.08, 4),  # the liner cassette (#180)
    'hull.powerup.1': (-0.3, -0.02, 6),
    'hull.powerup.2': (-0.15, -0.02, 6),
    'hull.powerup.3': (0.0, -0.02, 6),
    'hull.powerup.4': (0.15, -0.02, 6),
    'hull.powerup.5': (0.3, -0.02, 6),
    'chassis.drive': (0.0, -0.36, 2),  # the middle wheel's hub (#180)
    'cab.gauge': (0.3, 0.08, 5),  # beside the headlamp
}


def main():
    collection = fresh_collection()
    for attach_id, (x, z, order) in POINTS.items():
        place_empty(collection, attach_id, x, z, order)
    bpy.ops.wm.save_mainfile()


def fresh_collection():
    old = bpy.data.collections.get(COLLECTION)
    if old is not None:
        for obj in list(old.objects):
            bpy.data.objects.remove(obj)
        bpy.data.collections.remove(old)
    collection = bpy.data.collections.new(COLLECTION)
    bpy.context.scene.collection.children.link(collection)
    return collection


def place_empty(collection, attach_id, x, z, order):
    empty = bpy.data.objects.new('attach.' + attach_id, None)
    empty.empty_display_type = 'ARROWS'
    empty.empty_display_size = 0.05
    empty.location = (x, 0.0, z)
    empty['z'] = order
    collection.objects.link(empty)


if __name__ == '__main__':
    main()
