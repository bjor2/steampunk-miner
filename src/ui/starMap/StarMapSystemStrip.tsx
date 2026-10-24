/**
 * The star map's system strip (ticket 796, ticket 795's art): the solar system's backdrop (the sun
 * and its five orbits) in the orrery frame, every planet's dot on its socket, the here ring on the
 * planet the session is on and the selected marker on the one the carousel shows. The backdrop is
 * panned so the shown planet's socket sits in the middle of the window, held at the strip's ends,
 * easing at most `panMaxMs` with the brief's curve and cutting under reduced motion (`prefs.shake`
 * off). The pan is CSS: the window is a size container, so its width never needs measuring. A tap
 * or click on a dot shows that planet; a drag along it swipes the carousel. Markup only.
 */
import type { CSSProperties, MouseEvent } from 'react'
import { useGameStore } from '../../store/gameStore'
import { STAR_MAP_CAROUSEL_MOTION, STAR_MAP_SYSTEM } from '../../systems/art/starMapCarouselArt'
import {
  previewImagesAt,
  type StarMapCarouselImages,
} from '../../systems/art/starMapCarouselImages'
import type { UiPartImage } from '../../systems/art/uiArt'
import type { StarMapDot, StarMapStrip } from '../../systems/views/starMapCarousel'
import { starMapDotIdOf, STAR_MAP_UI_IDS } from './starMapIds'
import type { SwipeHandlers } from './useCarouselSwipe'
import styles from './StarMapSystemStrip.module.css'

const MOTION_STYLE = {
  '--pan-ms': `${STAR_MAP_CAROUSEL_MOTION.panMaxMs}ms`,
  '--pan-easing': STAR_MAP_CAROUSEL_MOTION.panEasing,
} as CSSProperties

export function StarMapSystemStrip({
  strip,
  images,
  isMotionReduced,
  swipe,
}: {
  strip: StarMapStrip
  images: StarMapCarouselImages
  isMotionReduced: boolean
  swipe: SwipeHandlers
}) {
  return (
    <div
      className={styles.frame}
      style={frameStyleOf(images.frame)}
      data-testid={STAR_MAP_UI_IDS.starMapSystem}
      {...swipe}
    >
      <div
        className={styles.window}
        style={windowStyleOf(strip)}
        data-motion={isMotionReduced ? 'cut' : 'ease'}
      >
        <div
          className={styles.track}
          style={trackStyleOf(strip, images.backdrop)}
          data-testid={STAR_MAP_UI_IDS.starMapSystemTrack}
          data-pan-target-px={strip.panTargetPx}
        >
          {strip.dots.map((dot) => (
            <SystemDot key={dot.place} dot={dot} images={images} />
          ))}
        </div>
      </div>
    </div>
  )
}

/** A planet on its socket: its orbit dot, ringed where the session is, marked where shown. */
function SystemDot({ dot, images }: { dot: StarMapDot; images: StarMapCarouselImages }) {
  const showStarMapPlanet = useGameStore((state) => state.showStarMapPlanet)
  return (
    <button
      type="button"
      className={styles.dot}
      style={dotStyleOf(dot, previewImagesAt(images, dot.previewAssetId).dot)}
      data-testid={starMapDotIdOf(dot.place)}
      data-here={dot.isHere || undefined}
      data-selected={dot.isSelected || undefined}
      data-dimmed={dot.isDimmed || undefined}
      aria-label={dot.name}
      aria-pressed={dot.isSelected}
      onMouseDown={keepFocusOnGame}
      onClick={() => showStarMapPlanet(dot.place)}
    >
      <span className={styles.disc} />
      {dot.isHere && (
        <span
          className={styles.here}
          style={markerStyleOf(images.here)}
          data-testid={STAR_MAP_UI_IDS.starMapHereRing}
        />
      )}
      {dot.isSelected && (
        <span
          className={styles.selected}
          style={markerStyleOf(images.selected)}
          data-testid={STAR_MAP_UI_IDS.starMapSelectedMarker}
        />
      )}
    </button>
  )
}

/** A click never leaves the dot focused, so Space and Enter go back to the game (as kit/Button). */
function keepFocusOnGame(event: MouseEvent): void {
  event.preventDefault()
}

function frameStyleOf(frame: UiPartImage | null): CSSProperties {
  if (frame === null) return MOTION_STYLE
  const inset = `${(STAR_MAP_SYSTEM.frame.insetPx / STAR_MAP_SYSTEM.frame.sizePx) * 100}%`
  return {
    ...MOTION_STYLE,
    '--strip-frame': frame.imageSet,
    '--strip-frame-slice': inset,
  } as CSSProperties
}

function windowStyleOf(strip: StarMapStrip): CSSProperties {
  return { '--strip-window': `${strip.windowHeightPx}px` } as CSSProperties
}

function trackStyleOf(strip: StarMapStrip, backdrop: UiPartImage | null): CSSProperties {
  const [width, height] = strip.sizePx
  return {
    '--strip-width': `${width}px`,
    '--strip-height': `${height}px`,
    '--strip-lift': `${strip.liftPx}px`,
    '--pan-target': `${strip.panTargetPx}px`,
    ...(backdrop === null ? {} : { '--strip-backdrop': backdrop.imageSet }),
  } as CSSProperties
}

function dotStyleOf(dot: StarMapDot, image: UiPartImage | null): CSSProperties {
  const [x, y] = dot.centrePx
  return {
    '--dot-x': `${x}px`,
    '--dot-y': `${y}px`,
    '--planet-colour': dot.colour,
    ...(image === null ? {} : { '--dot-sprite': image.imageSet }),
  } as CSSProperties
}

function markerStyleOf(image: UiPartImage | null): CSSProperties {
  return (image === null ? {} : { '--marker-sprite': image.imageSet }) as CSSProperties
}
