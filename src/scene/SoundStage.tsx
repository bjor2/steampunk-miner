/**
 * The game's sound (#13 audio direction): one-shots for each feedback cue (the pickup chime by
 * tier, the dock and upgrade clanks, a hit's thud, the core and travel stingers) and, every frame,
 * the drill, engine and steam loops and the crossfaded music layers. What each voice plays comes
 * from the pure rules in `systems/audio`; this only gathers the moment and hands it to the shell's
 * sound output. Presentation only: it never writes the store or submits.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { SCREEN_REFRESH_MS } from '../constants/scene'
import { getSoundOut, type SoundOut } from '../shell/soundOut'
import { listenForFeedback } from '../store/feedbackBroadcast'
import { useGameStore } from '../store/gameStore'
import { readHudModel, readMusicMoment } from '../store/screenReads'
import {
  easeLayers,
  planetTuningOf,
  SILENT_LAYERS,
  writeMusicTargets,
  type MusicLayers,
} from '../systems/audio/musicLayers'
import {
  chimeFrequencyOf,
  drillFrequencyOf,
  drillGainOf,
  drillLoadOf,
  engineGainOf,
  enginePuffsOf,
  secondsPerTileOf,
  steamGainOf,
} from '../systems/audio/soundRules'
import type { FeedbackCue } from '../systems/feedback/feedbackCues'
import { drillPresence } from './drillPresence'
import { motionPresence } from './motionPresence'

/** The drill's load and the music's targets are re-read as often as the HUD re-reads. */
const LOAD_REFRESH_SECONDS = SCREEN_REFRESH_MS / 1000

interface DrillLoad {
  load: number
  sinceRead: number
}

/** The music's crossfade and its targets, kept across frames so no frame allocates. */
interface MusicMix {
  layers: MusicLayers
  targets: MusicLayers
  sinceRead: number
}

function createMusicMix(): MusicMix {
  return {
    layers: { ...SILENT_LAYERS },
    targets: { ...SILENT_LAYERS },
    sinceRead: LOAD_REFRESH_SECONDS,
  }
}

export function SoundStage() {
  const sound = useMemo(getSoundOut, [])
  const music = useMemo(createMusicMix, [])
  const drill = useMemo<DrillLoad>(() => ({ load: 0, sinceRead: LOAD_REFRESH_SECONDS }), [])
  useEffect(() => listenForFeedback((cue) => playCue(sound, cue)), [sound])
  useFrame((_, delta) => {
    refreshDrillLoad(drill, delta)
    playLoops(sound, drill.load)
    playMusic(sound, music, delta)
  })
  return null
}

type CuePlayer = (sound: SoundOut, cue: FeedbackCue, tuning: number) => void

/** What each feedback cue sounds like (#13: upgrades and docking clank, value chimes). */
const CUE_SOUNDS: Readonly<Record<FeedbackCue['kind'], CuePlayer>> = {
  pickup: (sound, cue) => sound.playChime(chimeFrequencyOf(cue.kind === 'pickup' ? cue.tier : 1)),
  dockClank: (sound) => sound.playClank('heavy'),
  upgradeClank: (sound) => sound.playClank('light'),
  hit: (sound) => sound.playThud(),
  destroyed: (sound) => sound.playThud(),
  coreStinger: (sound, _cue, tuning) => sound.playStinger('core', tuning),
  travelStinger: (sound, _cue, tuning) => sound.playStinger('travel', tuning),
}

function playCue(sound: SoundOut, cue: FeedbackCue): void {
  CUE_SOUNDS[cue.kind](sound, cue, planetTuningOf(useGameStore.getState().planetTier))
}

function refreshDrillLoad(drill: DrillLoad, dt: number): void {
  drill.sinceRead += dt
  if (drill.sinceRead < LOAD_REFRESH_SECONDS) return
  drill.sinceRead = 0
  drill.load = drillLoadOf(secondsPerTileOf(readHudModel().tileTime))
}

function playLoops(sound: SoundOut, drillLoad: number): void {
  const speed = motionPresence.speedMetresPerSecond
  sound.setDrill(drillFrequencyOf(drillLoad), drillGainOf(drillPresence.isDrilling, drillLoad))
  sound.setEngine(enginePuffsOf(speed), engineGainOf(speed))
  sound.setSteam(steamGainOf(motionPresence.isLifting))
}

function playMusic(sound: SoundOut, music: MusicMix, dt: number): void {
  refreshMusicTargets(music, dt)
  easeLayers(music.layers, music.targets, dt)
  sound.setMusic(music.layers, planetTuningOf(useGameStore.getState().planetTier))
}

/** The targets come from the authority replica (#49), which moves at most once per tick. */
function refreshMusicTargets(music: MusicMix, dt: number): void {
  music.sinceRead += dt
  if (music.sinceRead < LOAD_REFRESH_SECONDS) return
  music.sinceRead = 0
  writeMusicTargets(readMusicMoment(), music.targets)
}
