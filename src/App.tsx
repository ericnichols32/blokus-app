import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AccountScreen } from './screens/AccountScreen'
import { GameScreen } from './screens/GameScreen'
import { HomeScreen } from './screens/HomeScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { SoloSetupScreen } from './screens/SoloSetupScreen'
import { StatsScreen } from './screens/StatsScreen'
import { OnlineGamesScreen } from './screens/OnlineGamesScreen'
import { OnlineSetupScreen } from './screens/OnlineSetupScreen'
import { ColorsScreen } from './screens/ColorsScreen'
import { PaletteProvider } from './colors'
import { resolvePalette } from './palette'
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
import {
  rememberOpenGame,
  rememberScreen,
  restoredOpenGame,
  restoredScreen,
} from './screenMemory'
import type { Screen } from './screenMemory'
import type { Color, GameState, PieceId, Point } from './game'
import './App.css'

/**
 * Where a fresh load lands.
 *
 * The app reloads itself to take an update (appUpdate.ts), so this runs under
 * people who did not ask for a reload and were in the middle of something.
 *
 * An online screen restores on its own: the game lives on the server, so unlike
 * a solo game there is nothing local to check for — and refusing to restore it
 * would drop somebody mid-game onto the main menu. A remembered game id gets
 * them all the way back to the board; without one, the games list is as close as
 * it can get.
 */
function initialScreen(): Screen {
  const saved = restoredScreen()

  if (saved === 'online') return 'online'
  if (saved === 'online-game') return restoredOpenGame() ? 'online-game' : 'online'

  // A game in progress wins over the name prompt — being dropped into it
  // mid-game would be worse than asking later.
  if (loadSession()) return saved ?? 'home'
  return !loadAccount() && !hasBeenPrompted() ? 'account' : 'home'
}

interface ScreensProps {
  settings: Settings
  setSettings: (settings: Settings) => void
}

function Screens({ settings, setSettings }: ScreensProps) {
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [screen, setScreen] = useState<Screen>(initialScreen)
  // The games themselves rather than a count of them, since the stats screen
  // reads every one. Held here so a game finishing updates the stats behind you
  // without a reload.
  const [history, setHistory] = useState<GameRecord[]>(loadHistory)
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
    rememberScreen(screen)
    // Leaving the board forgets which game it was, so a later reload restores
    // the list rather than reopening something already walked away from.
    if (screen !== 'online-game') rememberOpenGame(null)
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
  /** Where the colour editor was opened from, and for which seat. */
  const [colorsFrom, setColorsFrom] = useState<Screen>('solo-setup')
  const [editingColor, setEditingColor] = useState<Color | undefined>(undefined)

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
      rememberOpenGame(gameId)
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

  /*
   * Reopen the game a reload landed back on. Runs once: initialScreen only
   * chooses 'online-game' when an id was remembered, and a ref rather than a
   * dependency keeps StrictMode's double-invoke from fetching it twice.
   */
  const reopened = useRef(false)
  useEffect(() => {
    if (reopened.current || screen !== 'online-game' || onlineGame) return
    const gameId = restoredOpenGame()
    if (!gameId) return
    reopened.current = true
    void openOnlineGame(gameId)
  }, [screen, onlineGame, openOnlineGame])

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

  if (screen === 'colors') {
    return (
      <ColorsScreen
        settings={settings}
        onChange={setSettings}
        yourColor={editingColor}
        onClose={() => setScreen(colorsFrom)}
      />
    )
  }

  if (screen === 'solo-setup') {
    return (
      <SoloSetupScreen
        turnSeconds={settings.turnSeconds}
        onEditColors={(yourColor) => {
          setEditingColor(yourColor)
          setColorsFrom('solo-setup')
          setScreen('colors')
        }}
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
        onEditColors={() => {
          // No seat yet: the colours are dealt when the game is made, so only
          // the whole-set half of that screen has anything to act on.
          setEditingColor(undefined)
          setColorsFrom('online-setup')
          setScreen('colors')
        }}
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

/**
 * The palette wraps every screen, so changing it in the colour editor repaints
 * the board behind it rather than waiting for a reload.
 */
function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const palette = useMemo(
    () => resolvePalette(settings.paletteId, settings.colorOverrides),
    [settings.paletteId, settings.colorOverrides],
  )

  return (
    <PaletteProvider value={palette}>
      <Screens settings={settings} setSettings={setSettings} />
    </PaletteProvider>
  )
}

export default App
