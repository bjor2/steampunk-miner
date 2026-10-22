/**
 * The brass gauge cluster on the strip (spec #678, ticket 716; design-system.md sections 3, 9
 * and 10): the dials `gaugeClusterOf` lays out from the cluster's table, in the baked brass and
 * glass frame, then the overflow count. Each dial is the baked face with its needle turned over
 * it, the depth dial's band and core marks, the reading's glyph in the face's open foot and the
 * cargo chain's badge; never a number until a hover or a tap reveals it (`useDialReveal`). Its name
 * is the shared element's title, out of sight, so assistive tech reads it. A pip on the rim, and
 * one under the "+N" for the dials it folds, steps one notch per upgrade bought (ticket 727), with
 * no ease, so it moves on the render the buy reaches. Markup only.
 */
import type { CSSProperties } from 'react'
import { readoutTextOf } from '../../systems/views/hudCallouts'
import {
  dialNumberCharsMaxOf,
  dialTurnDegreesOf,
  type DialArt,
  type DialFace,
  type GaugeClusterView,
} from '../../systems/views/gaugeCluster'
import type { DialReadingKind } from '../../systems/views/gaugeClusterTable'
import type { DepthMarker } from '../../systems/views/depthDial'
import type { BuyCueMark } from '../../systems/views/dialBuyCue'
import { UI_ID_TEMPLATES, UI_IDS } from '../ids'
import { TitleOneLine } from '../kit/TitleOneLine'
import { VectorIcon } from '../VectorIcon'
import { useDialReveal } from './useDialReveal'
import styles from './DialCluster.module.css'

const DIAL_TEXTS: Readonly<Record<DialReadingKind, ReturnType<typeof readoutTextOf>>> = {
  hull: readoutTextOf('hud.strip.hull', 'Hull'),
  fuel: readoutTextOf('hud.strip.fuel', 'Fuel'),
  'cargo-chain': readoutTextOf('hud.strip.cargo', 'Cargo'),
  heat: readoutTextOf('hud.strip.heat', 'Heat'),
  depth: readoutTextOf('hud.strip.depth-dial', 'Depth'),
}

const OVERFLOW_TEXT = readoutTextOf('hud.strip.more-dials', 'More gauges')

const PERMILLE = 1000

const NUMBER_STYLE = { '--dial-number-chars': dialNumberCharsMaxOf() } as CSSProperties

export function DialCluster({
  cluster,
  isFlashing,
}: {
  cluster: GaugeClusterView
  isFlashing: boolean
}) {
  return (
    <div
      className={styles.cluster}
      style={frameStyleOf(cluster.frameArt)}
      data-testid={UI_IDS.hudDials}
    >
      {cluster.dials.map((face) => (
        <StripDial key={face.id} face={face} isPulsing={isFlashing} />
      ))}
      {cluster.overflowText !== null && (
        <OverflowCount text={cluster.overflowText} cue={cluster.overflowCue} />
      )}
    </div>
  )
}

function StripDial({ face, isPulsing }: { face: DialFace; isPulsing: boolean }) {
  const { isRevealed, handlers } = useDialReveal()
  return (
    <div
      className={styles.cell}
      data-dial={face.id}
      data-zone={face.zone}
      data-tier={face.tier}
      data-held={face.isHeld || undefined}
      data-pulsing={isPulsing || undefined}
      {...handlers}
    >
      <TitleOneLine text={DIAL_TEXTS[face.reads]} level="span" layout="row" titlePlace="card">
        <DialMeter face={face} />
        {isRevealed && <DialNumber face={face} />}
      </TitleOneLine>
    </div>
  )
}

function DialMeter({ face }: { face: DialFace }) {
  return (
    <span
      className={styles.dial}
      style={dialStyleOf(face.art, face.needlePermille)}
      data-testid={UI_ID_TEMPLATES.hudDial(face.id)}
      data-permille={face.needlePermille}
      data-zone={face.zone}
      data-tier={face.tier}
      data-cue={face.cue?.notch}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={PERMILLE}
      aria-valuenow={face.needlePermille}
    >
      {face.markers.map((marker) => (
        <DepthMark key={`${marker.kind}:${marker.permille}`} marker={marker} />
      ))}
      {face.cue !== null && <BuyCuePip cue={face.cue} />}
      <span className={styles.needle} />
      <span className={styles.glyph}>
        <VectorIcon iconId={face.iconId} size="menu" />
      </span>
      {face.badge !== null && <span className={styles.badge}>{face.badge}</span>}
    </span>
  )
}

/** A band head or the core's top tile on the depth dial's rim, from the planet's data. */
function DepthMark({ marker }: { marker: DepthMarker }) {
  return (
    <span className={styles.mark} data-mark={marker.kind} style={turnStyleOf(marker.permille)} />
  )
}

/** The number a hover or a tap reveals, in a tag as wide as the widest it can be. */
function DialNumber({ face }: { face: DialFace }) {
  return (
    <span
      className={styles.number}
      style={NUMBER_STYLE}
      data-testid={UI_ID_TEMPLATES.hudDialNumber(face.id)}
      data-exact={face.exact}
    >
      {face.text}
    </span>
  )
}

/** The per-buy cue on the rim, turned like a mark (ticket 727). */
function BuyCuePip({ cue }: { cue: BuyCueMark }) {
  return <span className={styles.cue} style={turnStyleOf(cue.permille)} />
}

function OverflowCount({ text, cue }: { text: string; cue: BuyCueMark | null }) {
  return (
    <span className={styles.overflow}>
      <TitleOneLine text={OVERFLOW_TEXT} level="span" layout="row" titlePlace="card">
        <span
          className={styles.overflowCount}
          data-testid={UI_IDS.hudDialOverflow}
          data-cue={cue?.notch}
        >
          {text}
        </span>
      </TitleOneLine>
      {cue !== null && <span className={styles.overflowCue} style={slideStyleOf(cue.permille)} />}
    </span>
  )
}

/** The skin's baked face and needle through their art variables; the CSS frame stays behind. */
function dialStyleOf(art: DialArt, needlePermille: number): CSSProperties {
  return {
    ...turnStyleOf(needlePermille),
    ...(art.face === null ? {} : faceArtStyleOf(art.face)),
    ...(art.needle === null ? {} : { '--dial-needle-art': `var(${art.needle})` }),
  } as CSSProperties
}

/** The face sprite and, where the part is tintable, its mask, which a planet skin colours. */
function faceArtStyleOf(face: string): Record<string, string> {
  return { '--dial-face-art': `var(${face})`, '--dial-face-tint': `var(${face}-tint)` }
}

function frameStyleOf(frameArt: string | null): CSSProperties {
  if (frameArt === null) return {}
  return {
    '--cluster-frame-art': `var(${frameArt})`,
    '--cluster-frame-slice': `var(${frameArt}-slice)`,
    '--cluster-frame-width': `var(${frameArt}-width)`,
  } as CSSProperties
}

/** The overflow cue's place along its rail, left to right. */
function slideStyleOf(permille: number): CSSProperties {
  return { '--cue-at': `${(permille * 100) / PERMILLE}%` } as CSSProperties
}

function turnStyleOf(permille: number): CSSProperties {
  return { '--turn': `${dialTurnDegreesOf(permille)}deg` } as CSSProperties
}
