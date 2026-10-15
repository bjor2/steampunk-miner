/**
 * Top right (#33 section 5): depth (or ALT) and band, the casing grade badge (#41), the guns' mode
 * and their low-steam badge (#107), the bore gun's auto lamp once the steam sear is researched
 * (ticket 317), the charges carried with the plant key (#109), the dock arrow
 * with its distance, tiles to the core's edge, and the time per tile in front of the drill. Each
 * line is one shared Title+OneLine row (spec #422, pass #428): its name as the title, then its
 * value beside the glyph of the icon set (#158).
 */
import type { ReactNode } from 'react'
import { hudLabelIconIdOf, type HudLabelId } from '../../systems/art/icons/iconSet'
import { calloutTextOf, readoutTextOf } from '../../systems/views/hudCallouts'
import type { HudModel } from '../../systems/views/hudModel'
import { UI_IDS } from '../ids'
import { TitleOneLine, type IconValue } from '../kit/TitleOneLine'
import { VectorIcon } from '../VectorIcon'
import { CompassArrow } from './CompassArrow'
import styles from './Hud.module.css'

export function PositionPanel({ model }: { model: HudModel }) {
  const { depth, casing, guns, boreAuto, charges, dockArrow, coreDistance, tileTime } = model
  return (
    <div className={styles.position}>
      <Line id="hud.depth" label="Depth" facts={[factOf('depth', depth.text, UI_IDS.hudDepth)]} />
      <Line
        id="hud.band"
        label="Band"
        facts={[factOf('depth', `${depth.band ?? '-'}`, UI_IDS.hudBand)]}
      />
      {casing !== null && (
        <Line id="hud.casing" label="Casing">
          <Glyph icon="casing" />
          <span
            className={styles.casingBadge}
            data-testid={UI_IDS.hudCasing}
            data-state={casing.state}
          >
            {casing.text}
          </span>
        </Line>
      )}
      {guns !== null && (
        <Line id="hud.guns" label="Guns">
          <Glyph icon="guns" />
          <span data-testid={UI_IDS.hudGuns} data-mode={guns.mode}>
            {guns.text}
          </span>
        </Line>
      )}
      {guns?.isIdle === true && (
        <div className={styles.gunsIdle} data-testid={UI_IDS.hudGunsIdle}>
          <TitleOneLine text={calloutTextOf('hud.guns-idle', guns.idleText)} level="span" />
        </div>
      )}
      {boreAuto !== null && (
        <Line id="hud.bore" label="Bore">
          <Glyph icon="guns" />
          <span
            className={styles.autoLamp}
            data-testid={UI_IDS.hudBoreAuto}
            data-lamp={boreAuto.colour}
            data-hold={boreAuto.hold ?? ''}
          >
            {boreAuto.text}
          </span>
        </Line>
      )}
      {charges !== null && (
        <Line
          id="hud.charges"
          label="Charges"
          facts={[{ ...factOf('charges', charges.text, UI_IDS.hudCharges), holds: 'charges' }]}
        />
      )}
      {dockArrow !== null && (
        <Line id="hud.dock" label="Dock">
          <Glyph icon="compass" />
          <CompassArrow octant={dockArrow.octant} />
          <span
            data-testid={UI_IDS.hudCompassDock}
            data-octant={dockArrow.octant}
            data-distance={dockArrow.distance}
          >
            {dockArrow.distance}
          </span>
        </Line>
      )}
      {coreDistance !== null && (
        <Line
          id="hud.core"
          label="Core"
          facts={[factOf('core', `${coreDistance}`, UI_IDS.hudCoreDistance)]}
        />
      )}
      <Line id="hud.tile" label="Tile">
        <Glyph icon="tile_time" />
        <span data-testid={UI_IDS.hudTileTime} data-state={tileTime.state}>
          {tileTime.text}
        </span>
      </Line>
    </div>
  )
}

const NO_FACTS: readonly IconValue[] = []

/** One readout row: its name, then its value as a fact or, when it carries a state, as markup. */
function Line({
  id,
  label,
  facts = NO_FACTS,
  children,
}: {
  id: string
  label: string
  facts?: readonly IconValue[]
  children?: ReactNode
}) {
  return (
    <TitleOneLine
      text={readoutTextOf(id, label)}
      facts={facts}
      level="span"
      layout="row"
      glyphSize="hud"
    >
      {children !== undefined && <span className={styles.value}>{children}</span>}
    </TitleOneLine>
  )
}

function Glyph({ icon }: { icon: HudLabelId }) {
  return <VectorIcon iconId={hudLabelIconIdOf(icon)} size="hud" />
}

function factOf(icon: HudLabelId, text: string, testId: string): IconValue {
  return { iconId: hudLabelIconIdOf(icon), text, testId }
}
