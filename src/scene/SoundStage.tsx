/**
 * The game's sound (#13 audio direction): one-shots for each feedback cue (the pickup chime by
 * tier, the dock and upgrade clanks, a hit's thud, the core and travel stingers, casing's hiss and
 * pop, a charge's blast, its thump delayed by the blast cue with distance, #213), the music
 * stingers (#49) and, every frame, the drill, engine and steam loops and the crossfaded music
 * layers. What each voice plays comes from the pure rules in `systems/audio` and the audio view
 * model; this only hands it to the shell's sound output. Presentation only: it never writes the
 * store or submits.
 */
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { SCREEN_REFRESH_MS } from '../constants/scene'
import { getSoundOut, type SoundOut } from '../shell/soundOut'
import { listenForFeedback } from '../store/feedbackBroadcast'
import { useGameStore } from '../store/gameStore'
import { listenForStingers } from '../store/musicStingerRecord'
import { readAudioModel, readDrillVoice, readHudModel } from '../store/screenReads'
import type { DrillVoice } from '../systems/audio/drillVoice'
import {
  easeLayers,
  planetTuningOf,
  SILENT_LAYERS,
  type MusicLayers,
} from '../systems/audio/musicLayers'
import {
  chimeFrequencyOf,
  drillVoiceFrequencyOf,
  drillGainOf,
  drillLoadOf,
  engineGainOf,
  enginePuffsOf,
  secondsPerTileOf,
  steamGainOf,
} from '../systems/audio/soundRules'
import type { FeedbackCue } from '../systems/feedback/feedbackCues'
import {
  createDelayedThumps,
  delayThump,
  takeDueThumps,
  thumpDelayTicksOf,
  type DelayedThumps,
} from '../systems/audio/delayedThumps'
import { drillPresence } from './drillPresence'
import { motionPresence } from './motionPresence'

/** The drill's load and the music's targets are re-read as often as the HUD re-reads. */
const LOAD_REFRESH_SECONDS = SCREEN_REFRESH_MS / 1000

interface DrillLoad {
  load: number
  voice: DrillVoice
  sinceRead: number
}

/** The music's crossfade and its targets, kept across frames so no frame allocates. */
interface MusicMix {
  layers: MusicLayers
  targets: MusicLayers
  busGain: number
  sinceRead: number
}

function createMusicMix(): MusicMix {
  return {
    layers: { ...SILENT_LAYERS },
    targets: { ...SILENT_LAYERS },
    busGain: 0,
    sinceRead: LOAD_REFRESH_SECONDS,
  }
}

export function SoundStage() {
  const sound = useMemo(getSoundOut, [])
  const music = useMemo(createMusicMix, [])
  const drill = useMemo<DrillLoad>(
    () => ({ load: 0, voice: 'rock', sinceRead: LOAD_REFRESH_SECONDS }),
    [],
  )
  const thumps = useMemo(createDelayedThumps, [])
  useEffect(() => listenForFeedback((cue) => playOrDelayCue(sound, thumps, cue)), [sound, thumps])
  useEffect(
    () => listenForStingers((stingerId) => sound.playMusicStinger(stingerId, planetTuning())),
    [sound],
  )
  useFrame((_, delta) => {
    playDueThumps(sound, thumps, delta)
    refreshDrillLoad(drill, delta)
    playLoops(sound, drill)
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
  casingHiss: (sound) => sound.playCasingHiss(),
  casingPop: (sound) => sound.playCasingPop(),
  collapseRumble: (sound) => sound.playCollapseRumble(),
  collapseCrash: (sound) => sound.playCollapseCrash(),
  wreckerScrape: (sound) => sound.playWreckerScrape(),
  chargeBlast: (sound) => playBlastThump(sound),
  // Felt, not heard (#173 haptics): the drill's own voice already sounds while it cuts.
  drillContact: () => {},
}

/** Rock breaking all at once: the collapse's crash, until the blast has its own sound. */
function playBlastThump(sound: SoundOut): void {
  sound.playCollapseCrash()
}

/** A blast's thump may wait with the listener's distance (#213); every other cue sounds now. */
function playOrDelayCue(sound: SoundOut, thumps: DelayedThumps, cue: FeedbackCue): void {
  const delayTicks = thumpDelayTicksOf(cue)
  if (delayTicks > 0) delayThump(thumps, delayTicks)
  else playCue(sound, cue)
}

function playCue(sound: SoundOut, cue: FeedbackCue): void {
  CUE_SOUNDS[cue.kind](sound, cue, planetTuning())
}

function playDueThumps(sound: SoundOut, thumps: DelayedThumps, dt: number): void {
  for (let due = takeDueThumps(thumps, dt); due > 0; due--) playBlastThump(sound)
}

function planetTuning(): number {
  return planetTuningOf(useGameStore.getState().planetTier)
}

function refreshDrillLoad(drill: DrillLoad, dt: number): void {
  drill.sinceRead += dt
  if (drill.sinceRead < LOAD_REFRESH_SECONDS) return
  drill.sinceRead = 0
  drill.load = drillLoadOf(secondsPerTileOf(readHudModel().tileTime))
  drill.voice = readDrillVoice()
}

function playLoops(sound: SoundOut, drill: DrillLoad): void {
  const speed = motionPresence.speedMetresPerSecond
  sound.setDrill(
    drillVoiceFrequencyOf(drill.load, drill.voice),
    drillGainOf(drillPresence.isDrilling, drill.load),
  )
  sound.setEngine(enginePuffsOf(speed), engineGainOf(speed))
  sound.setSteam(steamGainOf(motionPresence.isLifting))
}

function playMusic(sound: SoundOut, music: MusicMix, dt: number): void {
  refreshMusicTargets(music, dt)
  easeLayers(music.layers, music.targets, dt)
  sound.setMusic(music.layers, planetTuning(), music.busGain)
}

/** The audio model, as the debug API reads it; its targets move at most once per tick (#49). */
function refreshMusicTargets(music: MusicMix, dt: number): void {
  music.sinceRead += dt
  if (music.sinceRead < LOAD_REFRESH_SECONDS) return
  music.sinceRead = 0
  const model = readAudioModel()
  Object.assign(music.targets, model.layers)
  music.busGain = model.busGain
}
