"""
The mock frames of the star map carousel (ticket 795, "Done when": phone 360x640 portrait, 844x390
landscape and 1440x900 desktop frames showing the carousel hero, the Previous and Next buttons, the
system strip with the selected planet, and ticket 793's fuel and Jump block), composed with Pillow
from the shipped sprites and the design tokens' colours and sizes, so the build ticket (#796) has
the look to build to. The frames are mocks: the chrome is drawn in flat token colours (the brass
bezel, the iron band, the parchment type), not the shipped frame sprites, and the numbers are
illustrative. Layouts follow #796's scope 5: phone portrait stacks the hero, the strip and the
controls; phone landscape and the desktop dock put the strip left and the hero and controls right.
"""

import os

from PIL import Image, ImageDraw, ImageFont

FONT_DIR = '/usr/share/fonts/truetype/dejavu'
BODY_FONT = os.path.join(FONT_DIR, 'DejaVuSerif.ttf')
BOLD_FONT = os.path.join(FONT_DIR, 'DejaVuSerif-Bold.ttf')
MONO_FONT = os.path.join(FONT_DIR, 'DejaVuSansMono.ttf')
# designTokens.json colour and materials.
BG, PANEL, TEXT, PARCHMENT = '#120d0c', '#1b1613', '#f3ead8', '#e9dcc0'
BRASS, BRASS_SHADOW, BRASS_HIGHLIGHT = '#c9a24b', '#6e5220', '#efd27a'
IRON, IRON_SHADOW, STEEL, AMBER, EMBER, DANGER = '#3a3632', '#17140f', '#8a94a0', '#e0a040', '#e0602a', '#c8382a'
SPACE = {1: 4, 2: 8, 3: 16, 4: 24, 5: 32}
CONTROL_PX = 48
STRIP_HEIGHT_PX = 36
# The frame the mocks show: the session on place 1 with place 3 selected (affordable) and place 5
# short of fuel, the three states #796's goldens pin.
HERE_PLACE, SELECTED_PLACE, DIMMED_PLACE = 1, 3, 5
FUEL_OF_PLACE = {2: 5, 3: 6, 4: 7, 5: 8}
FEE_OF_PLACE = {2: '1,250', 3: '1,500', 4: '1,750', 5: '2,000'}
TANK_HELD, TANK_CAPACITY = 7, 10


class Mock:
    def __init__(self, size, sprites, brief, looks):
        self.image = Image.new('RGBA', size, BG)
        self.draw = ImageDraw.Draw(self.image)
        self.sprites, self.brief, self.looks = sprites, brief, looks
        self.fonts = {'title': ImageFont.truetype(BOLD_FONT, 20), 'body': ImageFont.truetype(BODY_FONT, 16),
                      'label': ImageFont.truetype(BODY_FONT, 14), 'numbers': ImageFont.truetype(MONO_FONT, 16),
                      'display': ImageFont.truetype(BOLD_FONT, 24), 'arrow': ImageFont.truetype(BOLD_FONT, 28)}

    # --- chrome ---
    def panel(self, box, hinge=None):
        """A sheet in the panel colour inside a brass bezel with an iron band, hollow inside."""
        x0, y0, x1, y1 = box
        self.draw.rectangle(box, fill=PANEL)
        self.draw.rectangle(box, outline=BRASS, width=2)
        self.draw.rectangle((x0 + 2, y0 + 2, x1 - 2, y1 - 2), outline=IRON, width=4)
        self.draw.rectangle((x0 + 6, y0 + 6, x1 - 6, y1 - 6), outline=BRASS_SHADOW, width=1)
        for rx in (x0 + 4, x1 - 4):
            for ry in (y0 + 4, y1 - 4):
                self.rivet(rx, ry)
        if hinge == 'left':
            self.draw.rectangle((x0 + 2, y0 + 8, x0 + 7, y1 - 8), fill=BRASS)

    def rivet(self, x, y, r=1.5):
        self.draw.ellipse((x - r + 0.5, y - r + 0.5, x + r + 0.5, y + r + 0.5), fill=IRON_SHADOW)
        self.draw.ellipse((x - r, y - r, x + r, y + r), fill=BRASS_HIGHLIGHT)

    def title_bar(self, box, title):
        x0, y0, x1, y1 = box
        self.draw.text((x0 + SPACE[3], y0 + SPACE[2]), title, font=self.fonts['title'], fill=PARCHMENT)
        self.button((x1 - SPACE[3] - CONTROL_PX, y0 + 2, x1 - SPACE[3], y0 + 2 + 40), 'x', 'arrow')
        self.draw.line((x0 + SPACE[3], y1, x1 - SPACE[3], y1), fill=BRASS_SHADOW, width=1)

    def button(self, box, label, font='body', armed=False, disabled=False, strike=False):
        x0, y0, x1, y1 = box
        self.draw.rectangle(box, fill=IRON if not disabled else PANEL, outline=STEEL if disabled else BRASS,
                            width=3 if armed else 2)
        colour = STEEL if disabled else PARCHMENT
        width = self.draw.textlength(label, font=self.fonts[font])
        y = (y0 + y1) / 2 - self.fonts[font].size / 2 - 2
        self.draw.text(((x0 + x1 - width) / 2, y), label, font=self.fonts[font], fill=colour)
        if strike:
            self.draw.line(((x0 + x1 - width) / 2, (y0 + y1) / 2, (x0 + x1 + width) / 2, (y0 + y1) / 2), fill=DANGER, width=2)

    def hud_strip(self, centre_x, y, width):
        """The HUD strip the sheet must not cover, with its three wells."""
        box = (centre_x - width / 2, y, centre_x + width / 2, y + STRIP_HEIGHT_PX)
        self.draw.rectangle(box, fill=PANEL, outline=BRASS, width=2)
        for at in range(3):
            x = box[0] + 12 + at * (width - 24) / 3
            self.draw.rectangle((x, y + 10, x + (width - 24) / 3 - 12, y + 26), fill=IRON_SHADOW, outline=BRASS_SHADOW)
            self.draw.rectangle((x + 2, y + 12, x + ((width - 24) / 3 - 12) * (0.7 - 0.2 * at), y + 24), fill=AMBER)

    # --- the carousel ---
    def hero(self, look, centre, size):
        hero = self.sprites['hero'][look['key']].resize((size, size), Image.LANCZOS)
        self.image.alpha_composite(hero, (int(centre[0] - size / 2), int(centre[1] - size / 2)))

    def prev_next(self, y_centre, x_prev, x_next):
        self.button((x_prev, y_centre - CONTROL_PX / 2, x_prev + CONTROL_PX, y_centre + CONTROL_PX / 2), '<', 'arrow')
        self.button((x_next, y_centre - CONTROL_PX / 2, x_next + CONTROL_PX, y_centre + CONTROL_PX / 2), '>', 'arrow')

    def planet_text(self, look, x, y, width, place):
        self.draw.text((x, y), look['name'], font=self.fonts['title'], fill=PARCHMENT)
        line = 'The planet you are on.' if place == HERE_PLACE else tank_line_of(place)
        self.draw.text((x, y + 28), wrap(line, self.fonts['label'], self.draw, width), font=self.fonts['label'], fill=STEEL)
        if place != HERE_PLACE:
            facts = 'fuel %d   price %s' % (FUEL_OF_PLACE[place], FEE_OF_PLACE[place])
            self.draw.text((x, y + 28 + 2 * 18 + 2), facts, font=self.fonts['numbers'], fill=DANGER if place == DIMMED_PLACE else PARCHMENT)

    def system_strip(self, box, selected_place):
        """The strip panned so the selected planet is centred, the dots on their orbits, framed."""
        x0, y0, x1, y1 = (int(v) for v in box)
        view_w, view_h = x1 - x0, y1 - y0
        system = self.brief['system']
        scale = view_h / system['sizePx'][1]
        strip = self.sprites['strip'].resize((int(system['sizePx'][0] * scale), view_h), Image.LANCZOS)
        sun_x, sun_y = system['sunCentrePx']
        selected_x = (sun_x + system['orbitRadiiPx'][selected_place - 1]) * scale
        pan = int(min(max(selected_x - view_w / 2, 0), strip.width - view_w))
        canvas = Image.new('RGBA', strip.size, (0, 0, 0, 0))
        canvas.alpha_composite(strip)
        for place, radius in enumerate(system['orbitRadiiPx'], start=1):
            look = self.looks[place - 1]
            cx, cy = (sun_x + radius) * scale, sun_y * scale
            dot_px = max(12, int(self.brief['dot']['sizePx'] * scale * 1.6))
            dot = self.sprites['dot'][look['key']].resize((dot_px, dot_px), Image.LANCZOS)
            if place == DIMMED_PLACE:
                dot = dimmed(dot)
            canvas.alpha_composite(dot, (int(cx - dot_px / 2), int(cy - dot_px / 2)))
            if place == HERE_PLACE:
                self.marker(canvas, 'here', (cx, cy), dot_px + 12)
            if place == selected_place:
                self.marker(canvas, 'selected', (cx, cy), dot_px + 20)
        self.image.alpha_composite(canvas.crop((pan, 0, pan + view_w, view_h)), (x0, y0))
        self.nine_slice_frame((x0 - 8, y0 - 8, x1 + 8, y1 + 8))

    def marker(self, canvas, which, centre, size):
        marker = self.sprites[which].resize((size, size), Image.LANCZOS)
        canvas.alpha_composite(marker, (int(centre[0] - size / 2), int(centre[1] - size / 2)))

    def nine_slice_frame(self, box):
        """The orrery frame round the strip's viewport: corners at 1x, edges stretched."""
        frame = self.sprites['frame']
        size, inset = frame.width, self.brief['system']['frame']['insetPx']
        x0, y0, x1, y1 = (int(v) for v in box)
        w, h = x1 - x0, y1 - y0
        out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        xs = [(0, inset, 0, inset), (inset, size - inset, inset, w - inset), (size - inset, size, w - inset, w)]
        ys = [(0, inset, 0, inset), (inset, size - inset, inset, h - inset), (size - inset, size, h - inset, h)]
        for sx0, sx1, dx0, dx1 in xs:
            for sy0, sy1, dy0, dy1 in ys:
                if sx0 == inset and sy0 == inset:
                    continue
                tile = frame.crop((sx0, sy0, sx1, sy1)).resize((max(1, dx1 - dx0), max(1, dy1 - dy0)), Image.LANCZOS)
                out.alpha_composite(tile, (dx0, dy0))
        self.image.alpha_composite(out, (x0, y0))

    def fuel_block(self, box, place, bay=True):
        """Ticket 793's tank line and bar, then Buy fuel (at the Sell bay) and Jump for the selected planet."""
        x0, y0, x1, y1 = box
        self.draw.text((x0, y0), 'Fuel tank', font=self.fonts['title'], fill=PARCHMENT)
        self.draw.text((x1 - 90, y0 + 4), '%d / %d' % (TANK_HELD, TANK_CAPACITY), font=self.fonts['numbers'], fill=PARCHMENT)
        bar = (x0, y0 + 30, x1, y0 + 46)
        self.draw.rectangle(bar, fill=IRON, outline=BRASS, width=2)
        self.draw.rectangle((x0 + 6, y0 + 36, x0 + 6 + (x1 - x0 - 12) * TANK_HELD / TANK_CAPACITY, y0 + 40), fill=AMBER)
        y = y0 + 54
        if place == HERE_PLACE:
            return
        short = FUEL_OF_PLACE[place] > TANK_HELD
        buttons = []
        if bay and short:
            buttons.append(('Buy %d fuel' % (FUEL_OF_PLACE[place] - TANK_HELD), False, False))
        buttons.append(('Jump' if not short else 'Jump, short %d fuel' % (FUEL_OF_PLACE[place] - TANK_HELD),
                        place == SELECTED_PLACE and not short, short))
        width = (x1 - x0 - SPACE[2] * (len(buttons) - 1)) / len(buttons)
        for at, (label, armed, disabled) in enumerate(buttons):
            bx = x0 + at * (width + SPACE[2])
            self.button((bx, y, bx + width, y + CONTROL_PX), label, 'body', armed=armed, disabled=disabled, strike=disabled)

    def save(self, path):
        self.image.convert('RGB').save(path)
        print('wrote ' + os.path.relpath(path, os.path.join(os.path.dirname(path), '..', '..', '..', '..')))


def tank_line_of(place):
    fuel = FUEL_OF_PLACE[place]
    if fuel <= TANK_HELD:
        return 'Tank holds %d fuel, enough for this jump.' % TANK_HELD
    return 'Tank holds %d fuel, short %d: %s to buy here.' % (TANK_HELD, fuel - TANK_HELD, FEE_OF_PLACE[place])


def wrap(text, font, draw, width):
    words, lines, line = text.split(), [], ''
    for word in words:
        trial = (line + ' ' + word).strip()
        if draw.textlength(trial, font=font) > width and line:
            lines.append(line)
            line = word
        else:
            line = trial
    return '\n'.join(lines + [line])


def dimmed(sprite):
    """A planet the player cannot afford: its colour drained, never hidden (the #650 rule)."""
    grey = sprite.convert('LA').convert('RGBA')
    out = Image.blend(sprite, grey, 0.75)
    out.putalpha(sprite.split()[3])
    return out


# --- the three frames ----------------------------------------------------------------------------------


def phone_portrait(sprites, brief, looks, path):
    mock = Mock((360, 640), sprites, brief, looks)
    mock.hud_strip(180, 4, 344)
    mock.panel((0, 44, 360, 640))
    mock.title_bar((0, 44, 360, 92), 'Star map')
    look = looks[SELECTED_PLACE - 1]
    mock.hero(look, (180, 196), 160)
    mock.prev_next(196, 16, 360 - 16 - CONTROL_PX)
    mock.planet_text(look, 16, 276, 328, SELECTED_PLACE)
    mock.system_strip((20, 392, 340, 466), SELECTED_PLACE)
    mock.fuel_block((16, 490, 344, 640), SELECTED_PLACE)
    mock.save(path)


def phone_landscape(sprites, brief, looks, path):
    mock = Mock((844, 390), sprites, brief, looks)
    mock.hud_strip(422, 4, 600)
    mock.panel((0, 44, 844, 390))
    mock.title_bar((0, 44, 844, 92), 'Star map')
    look = looks[SELECTED_PLACE - 1]
    mock.system_strip((24, 108, 404, 203), SELECTED_PLACE)
    mock.fuel_block((16, 228, 412, 390), SELECTED_PLACE)
    mock.hero(look, (640, 200), 160)
    mock.prev_next(200, 452, 844 - 16 - CONTROL_PX)
    mock.planet_text(look, 452, 292, 376, SELECTED_PLACE)
    mock.save(path)


def desktop(sprites, brief, looks, path):
    mock = Mock((1440, 900), sprites, brief, looks)
    mock.draw.rectangle((0, 0, 1040, 900), fill='#0d0c14')
    mock.draw.line((0, 420, 1040, 420), fill='#3a2a2e', width=3)
    mock.hud_strip(520, 8, 720)
    mock.panel((1040, 0, 1440, 900), hinge='left')
    mock.title_bar((1040, 0, 1440, 48), 'Star map')
    look = looks[SELECTED_PLACE - 1]
    mock.system_strip((1064, 72, 1416, 160), SELECTED_PLACE)
    mock.hero(look, (1240, 340), 256)
    mock.prev_next(340, 1056, 1440 - 16 - CONTROL_PX)
    mock.planet_text(look, 1064, 488, 352, SELECTED_PLACE)
    mock.fuel_block((1064, 600, 1416, 900), SELECTED_PLACE)
    mock.save(path)


def load_sprites(ui_assets, looks, system_asset_id):
    def png(asset_id, part):
        return Image.open(os.path.join(ui_assets, asset_id, part + '@2x.png')).convert('RGBA')
    return {
        'hero': {look['key']: png('ui-star-map-planet-' + look['key'], 'ui-star-map-planet-' + look['key']) for look in looks},
        'dot': {look['key']: png('ui-star-map-planet-' + look['key'], 'ui-star-map-planet-' + look['key'] + '-dot') for look in looks},
        'strip': png(system_asset_id, system_asset_id),
        'frame': Image.open(os.path.join(ui_assets, system_asset_id, system_asset_id + '-frame.png')).convert('RGBA'),
        'here': png(system_asset_id, system_asset_id + '-here'),
        'selected': png(system_asset_id, system_asset_id + '-selected'),
    }


def write_mock_frames(here, ui_assets, brief, looks, system_asset_id):
    """The three frames, from the first system's five previews; skipped until every file is shipped."""
    first_system = [look for look in looks if look['key'].isdigit()]
    needed = [os.path.join(ui_assets, 'ui-star-map-planet-' + look['key']) for look in first_system]
    needed.append(os.path.join(ui_assets, system_asset_id))
    if any(not os.path.isdir(folder) for folder in needed):
        print('mock frames: skipped, not every first-system preview and the strip are exported yet')
        return
    sprites = load_sprites(ui_assets, first_system, system_asset_id)
    folder = os.path.join(here, 'mocks')
    os.makedirs(folder, exist_ok=True)
    phone_portrait(sprites, brief, first_system, os.path.join(folder, 'phone-portrait-360x640.png'))
    phone_landscape(sprites, brief, first_system, os.path.join(folder, 'phone-landscape-844x390.png'))
    desktop(sprites, brief, first_system, os.path.join(folder, 'desktop-1440x900.png'))
