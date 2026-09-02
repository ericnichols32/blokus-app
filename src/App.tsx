import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AccountScreen } from './screens/AccountScreen'
import { GameScreen } from './screens/GameScreen'
import { HomeScreen } from './screens/HomeScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { SoloSetupScreen } from './screens/SoloSetupScreen'
import { StatsScreen } from './screens/StatsScreen'
import { FriendsScreen } from './screens/FriendsScreen'
import { PastGamesScreen } from './screens/PastGamesScreen'
import { OnlineSetupScreen } from './screens/OnlineSetupScreen'
import { ColorsScreen } from './screens/ColorsScreen'
import { FriendStatsScreen } from './screens/FriendStatsScreen'
import { PaletteProvider } from './colors'
import { resolvePalette } from './palette'
import type { PaletteChoice } from './palette'
import { gamePaletteFor, rememberGamePalette } from './gamePalette'
import {
  clearSession,
  createSolo,
  drawFirstColor,
  isResumable,
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
  agreeToRematch,
  askForRematch,
  endGameNow,
  keepPlaying,
  recordIfFinished,
  refreshGame,
  sessionFor,
  summarize,
  takeTurn,
  watchGame,
} from './onlineActions'
import { opponentsOf, rematchAgreed, rematchAwaits } from './online'
import type { OnlineGame } from './online'
import { useFriends } from './useFriends'
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

  if (saved === 'friends' || saved === 'past-games') return saved
  if (saved === 'online-game') return restoredOpenGame() ? 'online-game' : 'friends'

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
  const [openFriendId, setOpenFriendId] = useState<string | null>(null)
  /**
   * Names carried into the new-game form — one from a friend's card, or
   * everybody from a game that has just been stopped by agreement.
   */
  const [invitees, setInvitees] = useState<string[]>([])
  const [colorsFrom, setColorsFrom] = useState<Screen>('solo-setup')
  const [editingColor, setEditingColor] = useState<Color | undefined>(undefined)

  // Loaded here rather than inside the friends page, because the home screen
  // asks the same question — is anything waiting on me — and walking between the
  // two shouldn't re-query the database each time.
  const friends = useFriends(account, history)

  const [onlineGame, setOnlineGame] = useState<OnlineGame | null>(null)
  const [onlineBusy, setOnlineBusy] = useState(false)
  const [onlineError, setOnlineError] = useState<string | null>(null)

  /**
   * A game's own colours, or the current ones for a game that predates them
   * being kept — a board that has always been blue should not suddenly not be.
   */
  function paletteArgs(choice: PaletteChoice | null | undefined): [string, PaletteChoice['colorOverrides']] {
    const chosen = choice ?? { paletteId: settings.paletteId, colorOverrides: settings.colorOverrides }
    return [chosen.paletteId, chosen.colorOverrides]
  }

  /** The colours currently set, as a value a game can keep a copy of. */
  const chosenPalette: PaletteChoice = {
    paletteId: settings.paletteId,
    colorOverrides: settings.colorOverrides,
  }

  /*
   * Read through a ref by the callbacks below rather than taken as a
   * dependency: they would otherwise be rebuilt every time the colours changed,
   * and the game watcher keyed on one of them would be torn down and rebuilt
   * with it — a dropped listener in the middle of somebody's game, to pick up a
   * value only read when a game is first opened.
   */
  const paletteRef = useRef(chosenPalette)
  paletteRef.current = chosenPalette

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
        // Once, on first open: from then on this game keeps the colours it was
        // first seen in, whatever gets picked afterwards for a different game.
        rememberGamePalette(gameId, paletteRef.current)
      } catch (e) {
        setOnlineGame(null)
        setOnlineError(e instanceof OnlineError ? e.message : "Couldn't open that game.")
      } finally {
        setOnlineBusy(false)
      }
    },
    [bankOnlineGame],
  )

  /*
   * Watch the open game, so a friend's move appears instead of having to be
   * gone looking for. Keyed on the game's id rather than the game itself, which
   * changes on every move and would tear the listener down and rebuild it each
   * time.
   */
  const openGameId = screen === 'online-game' ? onlineGame?.id : undefined
  useEffect(() => {
    if (!openGameId) return
    return watchGame(openGameId, (fresh) => {
      setOnlineGame((current) => {
        // Ignore anything staler than what is already on screen. Snapshots can
        // arrive out of order, and going backwards would un-play a move.
        if (current && current.id === fresh.id && fresh.moves.length < current.moves.length) {
          return current
        }
        return fresh
      })
      bankOnlineGame(fresh)
    })
  }, [openGameId, bankOnlineGame])

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

  /**
   * Runs one of the rematch writes against the open game.
   *
   * They all have the same shape — take the game on screen, write a changed
   * copy, and either show what came back or say why it was refused — so they
   * share one path rather than four near-identical ones.
   */
  const changeRematch = useCallback(
    async (change: (game: OnlineGame) => Promise<OnlineGame>) => {
      if (!onlineGame) return null
      setOnlineBusy(true)
      setOnlineError(null)
      try {
        const written = await change(onlineGame)
        setOnlineGame(written)
        return written
      } catch (e) {
        // A refusal brings the game that won with it, so the screen ends up
        // showing what actually happened rather than what was attempted.
        if (e instanceof StaleTurnError && e.latest) setOnlineGame(e.latest)
        setOnlineError(e instanceof OnlineError ? e.message : "Couldn't save that. Try again.")
        return null
      } finally {
        setOnlineBusy(false)
      }
    },
    [onlineGame],
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
    setSession(createSolo(color, settings.strength, timed, firstColor, chosenPalette))
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
    // The rematch keeps the colours of the game it follows, so a run of games
    // doesn't change colour halfway through.
    if (humanColor) {
      setSession(
        createSolo(humanColor, strength, session.timed, drawFirstColor(), session.palette),
      )
    }
  }

  /**
   * Signed in, without leaving the account screen.
   *
   * The setting-up flow needs this: a photo can only be saved onto an account
   * that already exists, so a new player is signed in one step before they are
   * finished with the screen.
   */
  function claimed(next: Account) {
    setAccount(next)
    saveAccount(next)
    markPrompted()
  }

  /**
   * Ends a game everyone has agreed to stop, and goes on to set the next one
   * up with the same people.
   *
   * The setup screen rather than an immediate rematch: the whole point of
   * stopping was usually that something about the game wasn't right, so this is
   * the moment to change it.
   */
  async function startNextGame(game: OnlineGame) {
    if (!account) return
    const written = await changeRematch(endGameNow)
    if (!written) return

    setInvitees(opponentsOf(game, account.playerId).map((o) => o.username))
    setScreen('online-setup')
  }

  function signedIn(next: Account) {
    claimed(next)
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
        photo={friends.me?.photo}
        onPhotoChange={friends.setPhoto}
        onClaimed={claimed}
        onSignedIn={signedIn}
        onSignOut={signOut}
        onClose={leaveAccountScreen}
      />
    )
  }

  if (screen === 'game' && session) {
    return (
      /* A nested provider, so the board and everything in it is painted in the
         colours this game started in while the menus keep the current ones. */
      <PaletteProvider value={resolvePalette(...paletteArgs(session.palette))}>
        <GameScreen
          session={session}
          settings={settings}
          onStateChange={handleStateChange}
          onExit={() => setScreen('home')}
          onPlayAgain={playAgain}
          onNewGame={() => setScreen('solo-setup')}
        />
      </PaletteProvider>
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

  if (screen === 'friends') {
    return (
      <FriendsScreen
        account={account}
        friends={friends}
        onOpenGame={(id) => void openOnlineGame(id)}
        onNewGameWith={(username) => {
          setInvitees([username])
          setScreen('online-setup')
        }}
        onNewGroupGame={() => {
          setInvitees([])
          setScreen('online-setup')
        }}
        onPastGames={() => setScreen('past-games')}
        onSignIn={() => setScreen('account')}
        onClose={() => setScreen('home')}
      />
    )
  }

  if (screen === 'past-games' && account) {
    return (
      <PastGamesScreen
        games={friends.view.finished}
        history={history}
        playerId={account.playerId}
        onOpenGame={(id) => void openOnlineGame(id)}
        onClose={() => setScreen('friends')}
      />
    )
  }

  if (screen === 'online-setup' && account) {
    return (
      <OnlineSetupScreen
        account={account}
        settings={settings}
        initialFriends={invitees}
        onEditColors={() => {
          // No seat yet: the colours are dealt when the game is made, so only
          // the whole-set half of that screen has anything to act on.
          setEditingColor(undefined)
          setColorsFrom('online-setup')
          setScreen('colors')
        }}
        onStarted={(id) => void openOnlineGame(id)}
        onCancel={() => setScreen('friends')}
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
              onClick={() => setScreen('friends')}
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
      /* Same as the solo board: the colours this game was first opened in,
         whatever has been picked since for a different one. */
      <PaletteProvider value={resolvePalette(...paletteArgs(gamePaletteFor(onlineGame.id)))}>
        <GameScreen
          session={sessionFor(onlineGame, account.playerId)}
          settings={settings}
          onStateChange={handleStateChange}
          onExit={() => {
            setScreen('friends')
            // A turn was almost certainly just played, so the page behind this
            // one is already out of date by the time it comes back.
            friends.refresh()
          }}
            onPlayAgain={playAgain}
          online={{
            yourTurn: view.yourTurn,
            status: view.status,
            busy: onlineBusy,
            error: onlineError,
            submit: (move) => void submitOnlineMove(move),
            rematch: {
              pending: !!onlineGame.rematch,
              awaitingYou: rematchAwaits(onlineGame, account.playerId),
              agreed: rematchAgreed(onlineGame),
              askedBy:
                onlineGame.rematch && onlineGame.rematch.proposedBy !== account.playerId
                  ? (opponentsOf(onlineGame, account.playerId).find(
                      (o) => o.playerId === onlineGame.rematch?.proposedBy,
                    )?.username ?? null)
                  : null,
              propose: () =>
                void changeRematch((game) => askForRematch(game, account.playerId)),
              accept: () =>
                void changeRematch((game) => agreeToRematch(game, account.playerId)),
              decline: () => void changeRematch(keepPlaying),
              start: () => void startNextGame(onlineGame),
            },
          }}
        />
      </PaletteProvider>
    )
  }

  if (screen === 'friend-stats' && account && openFriendId) {
    return (
      <FriendStatsScreen
        history={history}
        playerId={account.playerId}
        friendId={openFriendId}
        onClose={() => setScreen('stats')}
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
        onOpenFriend={(friendId) => {
          setOpenFriendId(friendId)
          setScreen('friend-stats')
        }}
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

  // A finished game is still loaded until another is started, and resuming one
  // of those would land on the scoreboard rather than on a game.
  const soloResumable = session !== null && session.mode !== 'online' && isResumable(session)

  return (
    <HomeScreen
      saved={session}
      account={account}
      photo={friends.me?.photo}
      waitingOnYou={friends.view.waitingOnYou}
      liveGames={friends.view.liveGames}
      // A solo game in progress is resumed rather than offered as a choice; the
      // way to a fresh one is the menu on the board itself.
      onPlaySolo={() => setScreen(soloResumable ? 'game' : 'solo-setup')}
      onPlayFriends={() => setScreen('friends')}
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
