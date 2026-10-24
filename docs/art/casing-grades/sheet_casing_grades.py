"""
Post for the casing grade reference strip (ticket 830), in python3 with Pillow (Blender's Python
has no PIL): the phone-size render enlarged 8x with no smoothing, so each of its pixels shows, and
grey (Rec. 601 luma) copies of both, #13's readability check.

    python3 docs/art/casing-grades/sheet_casing_grades.py
"""

import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ENLARGE = 8


def grey_copy(name):
    image = Image.open(os.path.join(HERE, name)).convert('RGB')
    image.convert('L').save(os.path.join(HERE, name.replace('.png', '-gray.png')))


phone = Image.open(os.path.join(HERE, 'strip.phone-raw.png')).convert('RGB')
phone.resize((phone.width * ENLARGE, phone.height * ENLARGE), Image.NEAREST).save(
    os.path.join(HERE, 'strip.phone.png'))
for name in ('strip.review.png', 'strip.phone.png'):
    grey_copy(name)
