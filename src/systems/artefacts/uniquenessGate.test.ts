import { describe, expect, it } from 'vitest'
import SHIPPED_OPTIONS from '../../data/artefacts/artefactOptions.json'
import { ARTEFACT_IDS, ARTEFACT_OPTIONS, artefactTableProblems } from './artefactOptions'
import { uniquenessGateProblems } from './uniquenessGate'

const drillBump = {
  id: 'artefact.mock_drill_bump',
  name: 'Drill bump',
  summary: 'D *= 1.1',
  horizontal: true,
  gateClauses: ['new_rule'],
  effects: [{ kind: 'scalar', stat: 'drillPower', factor: '1.1' }],
}

describe('artefact uniqueness gate', () => {
  it('passes the three slice options, each with the gate clauses it declares', () => {
    expect(ARTEFACT_OPTIONS.flatMap(uniquenessGateProblems)).toEqual([])
    expect(ARTEFACT_OPTIONS.map((option) => [option.id, option.gateClauses])).toEqual([
      ['artefact.ore_whisper', ['new_information']],
      ['artefact.breathing_room', ['new_rule', 'new_interaction']],
      ['artefact.assay_beacon', ['new_interaction']],
    ])
  })

  it('fails a mock option whose only effect is D *= 1.1', () => {
    expect(uniquenessGateProblems(drillBump)).toEqual([
      'artefact.mock_drill_bump: declares new_rule but no rule_flag effect delivers it',
      'artefact.mock_drill_bump: only scales vertical stats, which is a vertical upgrade, not an artefact',
    ])
  })

  it('refuses the whole table when a stat bump is added to it', () => {
    const table = { options: [...SHIPPED_OPTIONS.options, drillBump] }
    expect(artefactTableProblems(table)).toContain(
      'artefact.mock_drill_bump: only scales vertical stats, which is a vertical upgrade, not an artefact',
    )
  })

  it('fails an option with no declared gate clause', () => {
    const silent = { ...SHIPPED_OPTIONS.options[0], gateClauses: [] }
    expect(uniquenessGateProblems(silent)).toEqual([
      'artefact.ore_whisper: must declare at least one gate clause of new_rule, new_information, new_interaction',
    ])
  })

  it('fails an option that is not flagged horizontal', () => {
    const unflagged = { ...SHIPPED_OPTIONS.options[2], horizontal: false }
    expect(uniquenessGateProblems(unflagged)).toEqual([
      'artefact.assay_beacon: must be flagged horizontal: true',
    ])
  })

  it('lets a scalar ride along with a real horizontal effect', () => {
    const mixed = {
      ...SHIPPED_OPTIONS.options[2],
      effects: [
        ...SHIPPED_OPTIONS.options[2].effects,
        { kind: 'scalar', stat: 'price', factor: '1' },
      ],
    }
    expect(uniquenessGateProblems(mixed)).toEqual([])
  })
})

describe('artefact table', () => {
  it('ships exactly ore_whisper, breathing_room and assay_beacon, and no powerup', () => {
    expect(ARTEFACT_IDS).toEqual([
      'artefact.ore_whisper',
      'artefact.breathing_room',
      'artefact.assay_beacon',
    ])
    expect(ARTEFACT_OPTIONS.map((option) => option.id)).toEqual(ARTEFACT_IDS)
    expect(JSON.stringify(SHIPPED_OPTIONS)).not.toMatch(/powerup/i)
  })

  it('refuses a table that adds an id no rule knows', () => {
    const extra = { ...SHIPPED_OPTIONS.options[0], id: 'artefact.powerup_haste' }
    expect(artefactTableProblems({ options: [...SHIPPED_OPTIONS.options, extra] })).toEqual([
      'unknown artefact id "artefact.powerup_haste"',
    ])
  })
})
