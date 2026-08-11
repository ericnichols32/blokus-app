import { useCallback, useEffect, useState } from 'react'
import { AccountScreen } from './screens/AccountScreen'
import { GameScreen } from './screens/GameScreen'
import { HomeScreen } from './screens/HomeScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { SoloSetupScreen } from './screens/SoloSetupScreen'
import { StatsScreen } from './screens/StatsScreen'
import { OnlineGamesScreen } from './screens/OnlineGamesScreen'
import { OnlineSetupScreen } from './screens/OnlineSetupScreen'
import {
  clearSession,
  createSolo,
  drawFirstColor,
  loadSession,
  saveSession,
} from './session'
import type { Session } from './session'
import { loadSettings, saveSettings } from './settings'
import type { Settings } from './settings'
import { loadHistory, recordFinishedGame } from './history'
import type { GameRecord } from './history'
import { clearAccount, hasBeenPrompted, loadAccount, markPrompted, saveAccount } from './account'
import type { Account } from './account'
import { clearSyncState, syncAccount } from './sync'
import {
  OnlineError,
  StaleTurnError,
  recordIfFinished,
  refreshGame,
  sessionFor,
  summarize,
  takeTurn,
} from './onlineActions'
import type { OnlineGame } from './online'
import type { Color, GameState, PieceId, Point } from './game'
import './App.css'

type Screen =
  | 'home'
  | 'solo-setup'
  | 'settings'
  | 'stats'
  | 'account'
  | 'game'
  | 'online'
  | 'online-setup'
  | 'online-game'

/**
 * Which screen you were on, remembered across reloads. The service worker is
 * registered with autoUpdate, so shipping a new version reloads the page under
 * whoever is mid-game — without this they'd land back on the menu.
 */
const SCREEN_KEY = 'blokus:screen'

function loadScreen(): Screen {
  try {
    const saved = sessionStorage.getItem(SCREEN_KEY)
    // 'online-game' is deliberately absent: it needs a loaded game, and a reload
    // would land on the board with nothing on it. The list is the right landing.
    return saved === 'game' ||
      saved === 'solo-setup' ||
      saved === 'settings' ||
      saved === 'stats' ||
      saved === 'online'
      ? saved
      : 'home'
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
  // The games themselves rather than a count of them, since the stats screen
  // reads every one. Held here so a game finishing updates the stats behind you
  // without a reload.
  const [history, setHistory] = useState<GameRecord[]>(loadHistory)
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
    const recorded = recordFinishedGame(session)
    if (recorded) setHistory((games) => [...games, recorded])
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
  }, [account, history.length])

  /**
   * The online game currently open, held here rather than in the board so a turn
   * can be written and the board rebuilt from what the store accepted.
   */
  const [onlineGame, setOnlineGame] = useState<OnlineGame | null>(null)
  const [onlineBusy, setOnlineBusy] = useState(false)
  const [onlineError, setOnlineError] = useState<string | null>(null)

  const handleStateChange = useCallback((state: GameState) => {
    setSession((current) => (current ? { ...current, state } : current))
  }, [])

  /** Files a finished online game into this device's history, once. */
  const bankOnlineGame = useCallback(
    (game: OnlineGame) => {
      if (!account) return
      const recorded = recordIfFinished(game, account.playerId)
      if (recorded) setHistory((games) => [...games, recorded])
    },
    [account],
  )

  const openOnlineGame = useCallback(
    async (gameId: string) => {
      setOnlineError(null)
      setOnlineBusy(true)
      setScreen('online-game')
      try {
        const game = await refreshGame(gameId)
        setOnlineGame(game)
        bankOnlineGame(game)
      } catch (e) {
        setOnlineGame(null)
        setOnlineError(e instanceof OnlineError ? e.message : "Couldn't open that game.")
      } finally {
        setOnlineBusy(false)
      }
    },
    [bankOnlineGame],
  )

  const submitOnlineMove = useCallback(
    async (move: { pieceId: PieceId; cells: Point[] }) => {
      if (!onlineGame || !account) return
      setOnlineBusy(true)
      setOnlineError(null)
      try {
        const played = await takeTurn(onlineGame, account.playerId, move)
        setOnlineGame(played)
        bankOnlineGame(played)
      } catch (e) {
        // A refused turn brings the winning board back with it, so the player is
        // left looking at what actually exists rather than at their own attempt.
        if (e instanceof StaleTurnError && e.latest) setOnlineGame(e.latest)
        setOnlineError(
          e instanceof OnlineError ? e.message : "Couldn't save your move. Try again.",
        )
      } finally {
        setOnlineBusy(false)
      }
    },
    [onlineGame, account, bankOnlineGame],
  )

  function startSolo(color: Color, timed: boolean, firstColor: Color) {
    setSession(createSolo(color, settings.strength, timed, firstColor))
    setScreen('game')
  }

  function playAgain() {
    if (!session) return
    // Same opponents, fresh board. Strength comes from the seats rather than
    // from settings, so changing the setting mid-rematch doesn't move the
    // goalposts on a run of games you're already playing.
    const seats = session.seats
    const humanColor = (Object.keys(seats) as Color[]).find((c) => seats[c].kind === 'human')
    const strength =
      Object.values(seats).find((s) => s.kind === 'computer')?.strength ?? settings.strength

    // A fresh draw for who opens, the same as any other new game — carrying the
    // last one over would hand the same player the advantage every round.
    if (humanColor) setSession(createSolo(humanColor, strength, session.timed, drawFirstColor()))
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
    return (
      <SoloSetupScreen
        turnSeconds={settings.turnSeconds}
        onStart={startSolo}
        onCancel={() => setScreen('home')}
      />
    )
  }

  if (screen === 'online') {
    return (
      <OnlineGamesScreen
        account={account}
        onOpenGame={(id) => void openOnlineGame(id)}
        onNewGame={() => setScreen('online-setup')}
        onSignIn={() => setScreen('account')}
        onClose={() => setScreen('home')}
      />
    )
  }

  if (screen === 'online-setup' && account) {
    return (
      <OnlineSetupScreen
        account={account}
        settings={settings}
        onStarted={(id) => void openOnlineGame(id)}
        onCancel={() => setScreen('online')}
      />
    )
  }

  if (screen === 'online-game' && account) {
    if (!onlineGame) {
      return (
        <div className="screen inner online">
          <header className="screen-header">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setScreen('online')}
              aria-label="Back"
            >
              ‹
            </button>
            <h1>{onlineBusy ? 'Opening…' : 'Game'}</h1>
          </header>
          {onlineError && (
            <p className="note error" role="alert">
              {onlineError}
            </p>
          )}
        </div>
      )
    }

    const view = summarize(onlineGame, account.playerId)
    return (
      <GameScreen
        session={sessionFor(onlineGame, account.playerId)}
        settings={settings}
        onStateChange={handleStateChange}
        onExit={() => setScreen('online')}
        onPlayAgain={playAgain}
        online={{
          yourTurn: view.yourTurn,
          status: view.status,
          busy: onlineBusy,
          error: onlineError,
          submit: (move) => void submitOnlineMove(move),
        }}
      />
    )
  }

  if (screen === 'stats') {
    return (
      <StatsScreen
        history={history}
        account={account}
        onClose={() => setScreen('home')}
        onPlaySolo={() => setScreen('solo-setup')}
      />
    )
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
      gamesRecorded={history.length}
      onResume={() => setScreen('game')}
      onPlaySolo={() => setScreen('solo-setup')}
      onPlayOnline={() => setScreen('online')}
      onStats={() => setScreen('stats')}
      onSettings={() => setScreen('settings')}
      onAccount={() => setScreen('account')}
    />
  )
}

export default App
