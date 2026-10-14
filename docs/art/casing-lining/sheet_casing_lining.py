"""
Post for the casing lining's review renders (ticket 315), in python3 with Pillow (Blender's Python
has no PIL): the phone-size render enlarged 8x with no smoothing, so each of its pixels shows, and
grey (Rec. 601 luma) copies of both, #13's readability check.

    python3 docs/art/casing-lining/sheet_casing_lining.py
"""

import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ENLARGE = 8


def grey_copy(name):
    image = Image.open(os.path.join(HERE, name)).convert('RGB')
    image.convert('L').save(os.path.join(HERE, name.replace('.png', '-gray.png')))


phone = Image.open(os.path.join(HERE, 'lining.phone-raw.png')).convert('RGB')
phone.resize((phone.width * ENLARGE, phone.height * ENLARGE), Image.NEAREST).save(
    os.path.join(HERE, 'lining.phone.png'))
for name in ('lining.review.png', 'lining.phone.png'):
    grey_copy(name)
