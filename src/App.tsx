import { useCallback, useEffect, useState } from 'react'
import { GameScreen } from './screens/GameScreen'
import { HomeScreen } from './screens/HomeScreen'
import { SoloSetupScreen } from './screens/SoloSetupScreen'
import {
  canUndo,
  clearSession,
  createPassAndPlay,
  createSolo,
  loadSession,
  saveSession,
  undo,
} from './session'
import type { Session } from './session'
import type { Color, Difficulty, GameState } from './game'
import './App.css'

type Screen = 'home' | 'solo-setup' | 'game'

/**
 * Which screen you were on, remembered across reloads. The service worker is
 * registered with autoUpdate, so shipping a new version reloads the page under
 * whoever is mid-game — without this they'd land back on the menu.
 */
const SCREEN_KEY = 'blokus:screen'

function loadScreen(): Screen {
  try {
    const saved = sessionStorage.getItem(SCREEN_KEY)
    return saved === 'game' || saved === 'solo-setup' ? saved : 'home'
  } catch {
    return 'home'
  }
}

function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [screen, setScreen] = useState<Screen>(() => (loadSession() ? loadScreen() : 'home'))

  useEffect(() => {
    if (session) saveSession(session)
    else clearSession()
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

  const handleUndo = useCallback(() => {
    setSession((current) => (current ? undo(current) : current))
  }, [])

  function startSolo(color: Color, difficulty: Difficulty) {
    setSession(createSolo(color, difficulty))
    setScreen('game')
  }

  function startPassAndPlay() {
    setSession(createPassAndPlay())
    setScreen('game')
  }

  function playAgain() {
    if (!session) return
    // Same opponents and difficulty, fresh board.
    const seats = session.seats
    const humanColor = (Object.keys(seats) as Color[]).find((c) => seats[c].kind === 'human')
    const difficulty = (Object.values(seats).find((s) => s.kind === 'computer')?.difficulty ??
      'medium') as Difficulty

    if (session.mode === 'solo' && humanColor) setSession(createSolo(humanColor, difficulty))
    else setSession(createPassAndPlay())
  }

  if (screen === 'game' && session) {
    return (
      <GameScreen
        session={session}
        onStateChange={handleStateChange}
        onUndo={handleUndo}
        canUndo={canUndo(session)}
        onExit={() => setScreen('home')}
        onPlayAgain={playAgain}
      />
    )
  }

  if (screen === 'solo-setup') {
    return <SoloSetupScreen onStart={startSolo} onCancel={() => setScreen('home')} />
  }

  return (
    <HomeScreen
      saved={session}
      onResume={() => setScreen('game')}
      onPlaySolo={() => setScreen('solo-setup')}
      onPassAndPlay={startPassAndPlay}
    />
  )
}

export default App
