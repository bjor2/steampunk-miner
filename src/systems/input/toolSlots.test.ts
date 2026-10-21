import { describe, expect, it } from 'vitest'
import { createAuthorityState, vehicleOf, withVehicle } from '../authority/authorityState'
import { withCharges } from '../authority/charges/chargeRules'
import { WORLD_SEED } from '../authority/scriptedSession'
import { gunMountStep } from '../economy/gunStats'
import { ACTION_MAP } from './actionMap'
import {
  hotkeyOfPosition,
  KERNEL_TOOL_SLOT_RULES,
  sharedPositionProblemsOf,
  toolSlotRuleProblemsOf,
  type ToolSlotRule,
} from './toolSlots'

// The tool slot bar's rows (ticket 691): fixed positions, Digit n for the first eight, and the
// kernel's own rows, Plant charge and the guns toggle, shown only while their part is on the rig.

const PLAYER = 'p1'
const start = () =>
  createAuthorityState({ planetIndex: 1, planetSeed: WORLD_SEED, playerIds: [PLAYER] })

const kernelRule = (id: string) => KERNEL_TOOL_SLOT_RULES.find((rule) => rule.id === id)!

function probeRule(position: number, action: ToolSlotRule['touch']['action']): ToolSlotRule {
  return {
    id: 'probe.tool',
    anchor: { row: 'crawler' },
    touch: { gesture: 'tap', action },
    position,
    faceOf: () => null,
  }
}

describe('tool slot rows', () => {
  it('presses the first eight positions with Digit1 to Digit8 and none past them', () => {
    expect(hotkeyOfPosition(1)).toBe('Digit1')
    expect(hotkeyOfPosition(8)).toBe('Digit8')
    expect(hotkeyOfPosition(9)).toBeNull()
  })

  it('refuses a row at a hotkey position whose action that number key does not press', () => {
    expect(toolSlotRuleProblemsOf(probeRule(3, 'use_slot_3'), ACTION_MAP)).toEqual([])
    expect(toolSlotRuleProblemsOf(probeRule(3, 'use_slot_1'), ACTION_MAP)).toEqual([
      'tool slot "probe.tool" sits at position 3, but Digit3 does not press "use_slot_1"',
    ])
  })

  it('reaches the drill sockets and the bore gun with Digit6, Digit7 and Digit8 as second keys', () => {
    expect(toolSlotRuleProblemsOf(probeRule(6, 'use_drill_flank'), ACTION_MAP)).toEqual([])
    expect(toolSlotRuleProblemsOf(probeRule(7, 'use_drill_collar'), ACTION_MAP)).toEqual([])
    expect(toolSlotRuleProblemsOf(probeRule(8, 'fire_ground_gun'), ACTION_MAP)).toEqual([])
  })

  it('refuses a position that is not a whole number from 1, and a position two rows share', () => {
    expect(toolSlotRuleProblemsOf(probeRule(0, 'plant_charge'), ACTION_MAP)).toHaveLength(1)
    const twin = { ...probeRule(9, 'plant_charge'), id: 'probe.twin' }
    expect(sharedPositionProblemsOf([...KERNEL_TOOL_SLOT_RULES, twin])).toEqual([
      'tool slot "probe.twin" takes position 9, already taken',
    ])
  })

  it('keeps the kernel rows to their rules', () => {
    const problems = KERNEL_TOOL_SLOT_RULES.flatMap((rule) =>
      toolSlotRuleProblemsOf(rule, ACTION_MAP),
    )
    expect(problems).toEqual([])
    expect(sharedPositionProblemsOf(KERNEL_TOOL_SLOT_RULES)).toEqual([])
  })
})

describe('kernel tool slots', () => {
  it('shows Plant charge only once the charge rack is mounted', () => {
    const plant = kernelRule('kernel.tool_plant_charge')
    expect(plant.faceOf(start(), PLAYER)).toBeNull()
    const racked = withCharges(start(), PLAYER, {
      ...vehicleOf(start(), PLAYER).charges,
      isRackMounted: true,
    })
    expect(plant.faceOf(racked, PLAYER)).toMatchObject({ cooldownPercent: 0, isOn: false })
  })

  it('shows the guns toggle only once the guns are mounted, on while they fire on auto', () => {
    const guns = kernelRule('kernel.tool_toggle_guns')
    expect(guns.faceOf(start(), PLAYER)).toBeNull()
    const mounted = (mode: 'auto' | 'off') =>
      withVehicle(start(), PLAYER, {
        ...vehicleOf(start(), PLAYER),
        gun: { level: gunMountStep(), mode },
      })
    expect(guns.faceOf(mounted('auto'), PLAYER)?.isOn).toBe(true)
    expect(guns.faceOf(mounted('off'), PLAYER)?.isOn).toBe(false)
  })
})
