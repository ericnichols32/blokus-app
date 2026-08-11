import { useCallback, useEffect, useState } from 'react'
import { AccountScreen } from './screens/AccountScreen'
import { GameScreen } from './screens/GameScreen'
import { HomeScreen } from './screens/HomeScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { SoloSetupScreen } from './screens/SoloSetupScreen'
import { clearSession, createPassAndPlay, createSolo, loadSession, saveSession } from './session'
import type { Session } from './session'
import { loadSettings, saveSettings } from './settings'
import type { Settings } from './settings'
import { loadHistory, recordFinishedGame } from './history'
import { clearAccount, hasBeenPrompted, loadAccount, markPrompted, saveAccount } from './account'
import type { Account } from './account'
import { clearSyncState, syncAccount } from './sync'
import type { Color, Difficulty, GameState } from './game'
import './App.css'

type Screen = 'home' | 'solo-setup' | 'settings' | 'account' | 'game'

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

/**
 * Where a fresh load lands. A game in progress wins — being dropped into the
 * name prompt mid-game would be worse than asking later — and otherwise a
 * player who has never been asked for a name gets asked now, once.
 */
function initialScreen(): Screen {
  const session = loadSession()
  if (session) return loadScreen()
  return !loadAccount() && !hasBeenPrompted() ? 'account' : 'home'
}

function App() {
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [screen, setScreen] = useState<Screen>(initialScreen)
  const [gamesRecorded, setGamesRecorded] = useState(() => loadHistory().length)
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [account, setAccount] = useState<Account | null>(loadAccount)

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

  // Push finished games up to whoever is signed in — on sign-in, which carries
  // everything played before there was an account, and again each time a game
  // ends. Failures are left alone on purpose: the sync remembers what got
  // through, so the next run retries the rest, and there is nothing useful to
  // interrupt someone with over a game that will upload itself shortly.
  useEffect(() => {
    if (!account) return
    void syncAccount(account).catch(() => {})
  }, [account, gamesRecorded])

  const handleStateChange = useCallback((state: GameState) => {
    setSession((current) => (current ? { ...current, state } : current))
  }, [])

  function startSolo(color: Color, timed: boolean) {
    setSession(createSolo(color, settings.difficulty, timed))
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

    if (session.mode === 'solo' && humanColor) {
      setSession(createSolo(humanColor, difficulty, session.timed))
    } else setSession(createPassAndPlay())
  }

  function signedIn(next: Account) {
    setAccount(next)
    saveAccount(next)
    markPrompted()
    setScreen('home')
  }

  function signOut() {
    setAccount(null)
    clearAccount()
    // The next person on this device shouldn't inherit a record of what the
    // last one had already uploaded, or their games would never be sent.
    clearSyncState()
    setScreen('home')
  }

  function leaveAccountScreen() {
    // Declining counts as having been asked, so the prompt doesn't reappear on
    // every load. The home screen keeps a way back to it.
    markPrompted()
    setScreen('home')
  }

  if (screen === 'account') {
    return (
      <AccountScreen
        account={account}
        onSignedIn={signedIn}
        onSignOut={signOut}
        onClose={leaveAccountScreen}
      />
    )
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
      account={account}
      gamesRecorded={gamesRecorded}
      onResume={() => setScreen('game')}
      onPlaySolo={() => setScreen('solo-setup')}
      onPassAndPlay={startPassAndPlay}
      onSettings={() => setScreen('settings')}
      onAccount={() => setScreen('account')}
    />
  )
}

export default App
