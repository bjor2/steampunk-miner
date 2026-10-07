/**
 * Prints the power-up effect looks (#166) frame by frame as JSON, so the review clips under
 * docs/art/tech-gear/ draw exactly what `powerUpFx.ts` shapes, with no second copy of the rule.
 *
 *   npx vite-node scripts/art/dumpPowerUpFx.ts > docs/art/tech-gear/fx-frames.json
 */
import {
  flareShellPointOf,
  fxFrameOf,
  isStanding,
  POWER_UP_FX,
  type PowerUpFx,
} from '../../src/features/tech-tree'

/** Frames per clip; a standing effect gets one. */
const CLIP_FRAMES = 24

function sampledTicksOf(fx: PowerUpFx): number[] {
  if (isStanding(fx)) return [0]
  return Array.from({ length: CLIP_FRAMES }, (_, at) =>
    Math.round((at * fx.ticks) / (CLIP_FRAMES - 1)),
  )
}

function clipOf(fx: PowerUpFx) {
  return {
    ...fx,
    frames: sampledTicksOf(fx).map((tick) => ({
      tick,
      ...fxFrameOf(fx, tick),
      shell: fx.kind === 'burn' ? flareShellPointOf(fx, tick) : null,
    })),
  }
}

process.stdout.write(`${JSON.stringify(POWER_UP_FX.map(clipOf), null, 2)}\n`)
