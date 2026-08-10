# Blokus

A mobile-first Blokus game, built as an installable web app (PWA) so it can be
added to an iPhone home screen and shared as a plain URL — no App Store, no
TestFlight, no developer account.

**Live:** https://ericnichols32.github.io/blokus-app/

## What this is meant to be

The full intent, so it isn't only in someone's head:

- **Home screen** — start a new game, resume one in progress, reach stats.
- **Solo vs. computer** — play the AI, in either an open (untimed) or timed game.
- **Async online play against friends** — games persist and resume across
  sessions, so two people can trade moves over days rather than sitting down
  together.
- **Stats** — wins and losses, average pieces left, perfect games, favourite
  colour and piece, and per-friend records.
- **Gameplay** — drag a piece onto the board, rotate it, flip it, lock it in.
  Rotating the board itself was also asked for, so each player can look at it
  from their own side.

> The bullets above are reconstructed from conversation, not copied from a
> written spec. If any of it drifts from what you actually want — particularly
> the stats list and the timed mode — correct it here first, since this file is
> now the reference.

## What is actually built

| Area | State |
| --- | --- |
| Rules engine | Done — placement legality, turn order, pass-out, scoring |
| Pass-and-play on one device | Done |
| Home screen and navigation | Done |
| Computer opponent | Done — easy, medium, hard |
| Solo setup (colour, difficulty) | Done |
| Saved game that survives a refresh | Done |
| Undo your last move | Done |
| Hints showing where a piece can go | Done |
| Live scores during play | Done |
| Rotating the board | Done |
| Recording finished games | Done — banked for stats |
| Timed mode | Not started |
| Online play against friends | Not started |
| Stats screen | Not started |

## Rules as implemented

Standard Blokus. Twenty-one pieces per colour, on a 20x20 board.

- Turn order runs clockwise: blue, yellow, red, green.
- A colour's first piece must cover its own corner — blue top-left, yellow
  top-right, red bottom-right, green bottom-left.
- Pieces of the same colour may touch at corners but never along an edge.
  Different colours may touch however they like.
- Every piece after the first must touch one of your own pieces at a corner.
- A player with no legal move is out for the rest of the game.
- Scoring: -1 per unplayed square, +15 for placing all 21 pieces, and a further
  +5 if the very last piece played was the single square.

## How it is put together

```
src/
  game/          Rules engine and AI. No React in here.
    types.ts     Colours, piece ids, board size, start corners
    pieces.ts    The 21 shapes, plus rotation and reflection
    board.ts     Placement legality, contact points
    engine.ts    Game state, move application, turn advancement
    scoring.ts   End-of-game scoring
    ai.ts        Computer opponent
  screens/       One component per screen
  components/    Board, piece tray, piece icon, score strip
  session.ts     What a game is, how it is saved, and undo
  history.ts     Finished games, kept for the stats screen
  boardView.ts   Which way up the board is drawn, and the maths both ways
```

The engine is deliberately free of React so it can be tested directly and later
reused by a server.

### How the computer plays

It scores every legal move and takes the best, weighting: piece size (dominant,
since unplayed squares are the score), how many new corner contacts the move
opens up for itself, how many of the opponents' contact points it takes away,
and a mild pull toward the centre early on. Easy plays big pieces and little
else; hard blocks and plays for reach. Difficulty also controls how much
randomness is allowed, so the easier levels stay varied.

Move generation only considers placements touching one of your own corner
contact points, rather than scanning all 400 squares. `search-equivalence.test.ts`
checks that shortcut returns exactly what the exhaustive scan would, and
`hints.test.ts` does the same for the squares the hints light up.

### Undo, and why there is no history

Undo replays the game from the start rather than keeping a stack of past boards.
`placedPieces` is already an ordered record of every move, and turn order is
derived from the board, so replaying reproduces a state exactly — including who
had passed out and when. That keeps the save format unchanged and stays correct
if the turn rules are ever adjusted. `replay.test.ts` checks a rebuilt state
equals the original at every point in a real game.

## Running it

```sh
npm install
npm run dev      # local dev server
npm test         # unit tests
npm run lint
npm run build    # production build into dist/
```

Pushing to `main` runs the tests and, if they pass, publishes to GitHub Pages.

## Playing aids

- **Undo** takes back your last move. In a solo game it also rewinds the
  computers' replies, so you land back on the turn you were actually deciding.
- **Hints**, on by default and switched off from the status bar, dot your open
  corners and tint the squares the piece in hand could legally cover. Picking a
  piece that fits nowhere says so.
- **Turning the board** follows the turn in pass and play, so each player looks
  at it from their own corner. The button turns it by hand.

### Finished games

Every completed game is summarised into `blokus:history:v1` when it ends. The
stats screen doesn't exist yet, but a game not written down when it finishes is
gone — nothing else keeps a finished board — so recording started early rather
than letting stats begin from zero on the day it ships. The home screen shows
the running count.

A record holds each player's score, squares left, whether it was a perfect game,
their rank, and which pieces they never placed. That last one is what makes
"favourite piece" answerable: the 21 pieces are fixed, so what is left tells you
what went down. The move list is deliberately not kept — it would be roughly
fifteen times the size and is only needed to replay a game, which nothing does.

The store is capped at 500 games, oldest dropped first.

## Known gaps

Beyond the unbuilt features above:

- On a short phone (an iPhone SE, say) the piece tray takes more height than the
  board, leaving the board small enough that dragging is fiddly. A taller phone
  is fine. Giving the board priority would mean rethinking the tray.
- Undo is not available once the game is over.
- Pieces in the tray have no accessible names, only a visual shape.

## If you add online play

Game state is currently stored as a snapshot of the whole board. Before wiring
up a backend, switch to storing an append-only list of moves and deriving the
board from it. A move is a couple of dozen bytes against 400 board cells, two
clients appending can't conflict, and undo and replay come along for free.

Also note `applyMove` trusts that a move's cells really correspond to the piece
it claims. That is fine while moves come from this app's own UI, but it needs
validating server-side once they arrive over a network.
