/**
 * The committed slice template's one rule (docs/standards/slice-template.md): pure, under the
 * authority lint set like every slice `systems/` folder.
 */
export interface ExampleReport {
  sliceId: 'example'
  /** The registrar methods this slice calls. */
  registers: readonly string[]
}

export function describeExample(): ExampleReport {
  return { sliceId: 'example', registers: ['debugActions'] }
}
