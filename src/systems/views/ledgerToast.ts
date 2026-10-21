/**
 * The one-time v1 migration toast (ticket 705, the #672(c) follow-up): `Old ledger restored.`
 * once after a save written before the slot layout (format 1, #401) is brought up to this build,
 * and never again for the same profile, which keeps a seen-flag in its preferences file. A fresh
 * game or a save already in the slot layout never shows it. The copy is `ui.saveMenu` data and
 * keeps to the #678 toast budget (6 words, 2 s).
 */
import SAVE_MENU_TEXT from '../../data/saveMenu/saveMenu.json'
import type { SaveMigration } from '../save/saveMigrations'

export const LEDGER_TOAST_TEXT: string = SAVE_MENU_TEXT.ledgerToast

/** The format a single-slot save was written in, before the slot layout (#401). */
const V1_SAVE_FORMAT = 1

export function isLedgerToastDue(
  migrations: readonly SaveMigration[],
  hasSeenLedgerToast: boolean,
): boolean {
  return !hasSeenLedgerToast && migrations.some(isFromV1SaveFormat)
}

function isFromV1SaveFormat(migration: SaveMigration): boolean {
  return (
    'version' in migration &&
    migration.version === 'formatVersion' &&
    migration.from === V1_SAVE_FORMAT
  )
}
