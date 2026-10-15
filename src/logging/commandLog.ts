/**
 * `commands.ndjson` as written (ticket 342, the TD call on #123): a `reportPose` line carries
 * `drive` only when it differs from the same player's previous logged `drive`, and reading the
 * log carries the last value forward. `drive` changes on key edges only, so most 5 Hz pose lines
 * drop it and the first hour stays under #11's first-hour budget without a slower pose rate.
 *
 * This is the log's encoding only: the authority and the wire still get every `drive`, so no
 * protocol bump and no sticky state. A player's first report, and the first after a rescue
 * (respawn), always writes it, so a reader never needs a value from before that point.
 */
import type { AuthorityCommand, CommandPayloads } from '../systems/authority/authorityCommand'
import type { DriveSigns } from '../systems/vehicle/driveSigns'

type PosePayload = CommandPayloads['reportPose']

/** A pose line as logged: `drive` absent means "as this player's previous logged report". */
export type LoggedPosePayload = Omit<PosePayload, 'drive'> & { drive?: DriveSigns }

type LoggedPoseCommand = Omit<AuthorityCommand<'reportPose'>, 'payload'> & {
  payload: LoggedPosePayload
}

/** One line of `commands.ndjson`. */
export type LoggedCommand = AuthorityCommand | LoggedPoseCommand

/** The last `drive` each player logged; a rescue forgets it so the next report writes it again. */
type LastDrives = Map<string, DriveSigns>

/** Turns submitted commands into log lines in order, remembering each player's last `drive`. */
export interface CommandLogWriter {
  toLoggedCommand(command: AuthorityCommand): LoggedCommand
}

export function createCommandLogWriter(): CommandLogWriter {
  const lastDrives: LastDrives = new Map()
  return { toLoggedCommand: (command) => loggedCommandOf(command, lastDrives) }
}

/** A whole command list as `commands.ndjson` holds it. */
export function loggedCommandsOf(commands: readonly AuthorityCommand[]): LoggedCommand[] {
  const writer = createCommandLogWriter()
  return commands.map(writer.toLoggedCommand)
}

/** The commands a log holds, every `drive` carried forward: the replay input (#11 section 3). */
export function expandCommandLog(logged: readonly LoggedCommand[]): AuthorityCommand[] {
  const lastDrives: LastDrives = new Map()
  return logged.map((command) => expandedCommandOf(command, lastDrives))
}

function loggedCommandOf(command: AuthorityCommand, lastDrives: LastDrives): LoggedCommand {
  forgetDriveOnRescue(command, lastDrives)
  if (command.type !== 'reportPose') return command
  const isUnchanged = isSameDrive(lastDrives.get(command.playerId), command.payload.drive)
  lastDrives.set(command.playerId, command.payload.drive)
  return isUnchanged ? withoutDrive(command) : command
}

function expandedCommandOf(command: LoggedCommand, lastDrives: LastDrives): AuthorityCommand {
  forgetDriveOnRescue(command, lastDrives)
  if (command.type !== 'reportPose') return command
  const drive = command.payload.drive ?? carriedDriveOf(command, lastDrives)
  lastDrives.set(command.playerId, drive)
  return { ...command, payload: { ...command.payload, drive } }
}

function forgetDriveOnRescue(command: LoggedCommand, lastDrives: LastDrives): void {
  if (command.type === 'requestRescue') lastDrives.delete(command.playerId)
}

/** A line without `drive` and nothing to carry is a broken log: refused, never guessed. */
function carriedDriveOf(command: LoggedPoseCommand, lastDrives: LastDrives): DriveSigns {
  const carried = lastDrives.get(command.playerId)
  if (carried !== undefined) return carried
  throw new Error(
    `commands.ndjson: reportPose at tick ${command.tick} seq ${command.seq} of ` +
      `${command.playerId} has no drive and no earlier one to carry forward`,
  )
}

function isSameDrive(last: DriveSigns | undefined, drive: DriveSigns): boolean {
  return last !== undefined && last.x === drive.x && last.y === drive.y
}

function withoutDrive(command: AuthorityCommand<'reportPose'>): LoggedPoseCommand {
  const { drive: _carried, ...payload } = command.payload
  return { ...command, payload }
}
