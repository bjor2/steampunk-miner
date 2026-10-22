/**
 * The detail's readouts (#33 section 5; behind the strip's gear button since ticket 684): depth
 * (or ALT) and band, the casing grade badge (#41), the guns' mode and their low-steam line (#107),
 * the bore gun's auto lamp once the steam sear is researched (ticket 317), the charges carried
 * with the plant key (#109), the dock arrow with its distance, tiles to the core's edge, local
 * gravity as a multiple of planet 1's (#724), and the time per tile in front of the drill, tinted
 * while the gravity ramp holds a cut down (#724). Each line is one shared Title+OneLine row (spec #422, pass
 * #428): its name as the title, then its value beside the glyph of the icon set (#158).
 */
import type { ReactNode } from 'react'
import { hudLabelIconIdOf, type HudLabelId } from '../../systems/art/icons/iconSet'
import { calloutTextOf, readoutTextOf } from '../../systems/views/hudCallouts'
import type { HudModel } from '../../systems/views/hudModel'
import { UI_IDS } from '../ids'
import { TitleOneLine, type IconValue } from '../kit/TitleOneLine'
import { VectorIcon } from '../VectorIcon'
import { CompassArrow } from './CompassArrow'
import styles from './HudDetail.module.css'

export function DetailReadouts({ model }: { model: HudModel }) {
  const { depth, casing, guns, boreAuto, charges, dockArrow, coreDistance, localGravity } = model
  return (
    <div className={styles.readouts}>
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
          <span
            data-testid={UI_IDS.hudGuns}
            data-mode={guns.mode}
            data-idle={guns.isIdle || undefined}
          >
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
      {localGravity !== null && (
        <Line
          id="hud.gravity"
          label="Gravity"
          facts={[
            {
              ...factOf('planet', localGravity.text, UI_IDS.hudLocalGravity),
              exact: localGravity.exact,
            },
          ]}
        />
      )}
      <Line id="hud.tile" label="Tile">
        <Glyph icon="tile_time" />
        <span
          className={styles.tileTime}
          data-testid={UI_IDS.hudTileTime}
          data-state={model.tileTime.state}
        >
          {model.tileTime.text}
        </span>
      </Line>
    </div>
  )
}

const NO_FACTS: readonly IconValue[] = []

interface LineProps {
  id: string
  label: string
  facts?: readonly IconValue[]
  children?: ReactNode
}

/** One readout row: its name, then its value as a fact or, when it carries a state, as markup. */
function Line({ id, label, facts = NO_FACTS, children }: LineProps) {
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
