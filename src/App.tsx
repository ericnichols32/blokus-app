import { useCallback, useEffect, useState } from 'react'
import { GameScreen } from './screens/GameScreen'
import { HomeScreen } from './screens/HomeScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { SoloSetupScreen } from './screens/SoloSetupScreen'
import { clearSession, createPassAndPlay, createSolo, loadSession, saveSession } from './session'
import type { Session } from './session'
import { loadSettings, saveSettings } from './settings'
import type { Settings } from './settings'
import { loadHistory, recordFinishedGame } from './history'
import type { Color, Difficulty, GameState } from './game'
import './App.css'

type Screen = 'home' | 'solo-setup' | 'settings' | 'game'

/**
 * Which screen you were on, remembered across reloads. The service worker is
 * registered with autoUpdate, so shipping a new version reloads the page under
 * whoever is mid-game — without this they'd land back on the menu.
 */
const SCREEN_KEY = 'blokus:screen'

function loadScreen(): Screen {
  try {
    const saved = sessionStorage.getItem(SCREEN_KEY)
    return saved === 'game' || saved === 'solo-setup' || saved === 'settings' ? saved : 'home'
  } catch {
    return 'home'
  }
}

function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [screen, setScreen] = useState<Screen>(() => (loadSession() ? loadScreen() : 'home'))
  const [gamesRecorded, setGamesRecorded] = useState(() => loadHistory().length)
  const [settings, setSettings] = useState<Settings>(loadSettings)

  useEffect(() => {
    if (session) saveSession(session)
    else clearSession()
  }, [session])

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  // Write a finished game to the history. recordFinishedGame ignores a game it
  // has already seen, so re-running this on reload or re-render is harmless —
  // which matters, since a finished game stays loaded until you start another.
  useEffect(() => {
    if (!session) return
    if (recordFinishedGame(session)) setGamesRecorded((n) => n + 1)
  }, [session])

  useEffect(() => {
    try {
      sessionStorage.setItem(SCREEN_KEY, screen)
    } catch {
      // Storage unavailable; the screen just won't survive a reload.
    }
  }, [screen])

  const handleStateChange = useCallback((state: GameState) => {
    setSession((current) => (current ? { ...current, state } : current))
  }, [])

  function startSolo(color: Color) {
    setSession(createSolo(color, settings.difficulty))
    setScreen('game')
  }

  function startPassAndPlay() {
    setSession(createPassAndPlay())
    setScreen('game')
  }

  function playAgain() {
    if (!session) return
    // Same opponents, fresh board. Difficulty comes from the seats rather than
    // from settings, so changing the setting mid-rematch doesn't move the
    // goalposts on a run of games you're already playing.
    const seats = session.seats
    const humanColor = (Object.keys(seats) as Color[]).find((c) => seats[c].kind === 'human')
    const difficulty = (Object.values(seats).find((s) => s.kind === 'computer')?.difficulty ??
      settings.difficulty) as Difficulty

    if (session.mode === 'solo' && humanColor) setSession(createSolo(humanColor, difficulty))
    else setSession(createPassAndPlay())
  }

  if (screen === 'game' && session) {
    return (
      <GameScreen
        session={session}
        settings={settings}
        onStateChange={handleStateChange}
        onExit={() => setScreen('home')}
        onPlayAgain={playAgain}
      />
    )
  }

  if (screen === 'solo-setup') {
    return <SoloSetupScreen onStart={startSolo} onCancel={() => setScreen('home')} />
  }

  if (screen === 'settings') {
    return (
      <SettingsScreen
        settings={settings}
        onChange={setSettings}
        onClose={() => setScreen('home')}
      />
    )
  }

  return (
    <HomeScreen
      saved={session}
      gamesRecorded={gamesRecorded}
      onResume={() => setScreen('game')}
      onPlaySolo={() => setScreen('solo-setup')}
      onPassAndPlay={startPassAndPlay}
      onSettings={() => setScreen('settings')}
    />
  )
}

export default App
