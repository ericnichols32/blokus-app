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
  Each player should be able to look at the board from their own side.
- **Accounts** — a username, claimed the first time you open the link, with no
  password, so stats are tied to a person and visible on other people's pages.

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
| Computer opponent | Done — hard by default, easy and medium in settings |
| Solo setup (colour) | Done |
| Saved game that survives a refresh | Done |
| Settings screen | Done — live scores, difficulty |
| Live scores during play | Done — off by default |
| Recording finished games | Done — banked for stats |
| Accounts and usernames | Not started |
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
  session.ts     What a game is and how it is saved
  settings.ts    Preferences that outlive a game
  history.ts     Finished games, kept for the stats screen
  boardView.ts   Which way up the board is drawn, and the maths both ways
```

The engine is deliberately free of React so it can be tested directly and later
reused by a server.

### How the computer plays

It scores every legal move, weighting: piece size (dominant, since unplayed
squares are the score), how many new corner contacts the move opens up for
itself, how many of the opponents' contact points it takes away, and a mild pull
toward the centre early on. Easy plays big pieces and little else; hard blocks
and plays for reach.

Choosing among those scores is split into two separate knobs, because the
obvious single one can't do the job. A pure "take the best move" search makes
the three computers in a solo game reach for the same piece as each other every
turn — they share a scoring function and an empty board is symmetric, so they
are all solving the same problem. Widening one combined randomness knob far
enough to separate them also lets them dump small pieces, which is exactly how
you lose at Blokus. So:

- **The size floor** fixes how many squares a move must spend, as a fraction of
  what the best move spends. Hard never settles for less. This sets strength.
- **The band** picks randomly among the moves clearing that floor. This sets
  variety, and is far wider for a player's opening move than after it.

Widening only the opening is what makes it cheap. Measured over 150 openings and
70 full games, it took the three computers from opening identically in every
single game to 3% of games, and cost under a point a game; widening the second
and third moves as well bought little further variety and cost three to four
points a game. One different opening is enough, because the positions diverge
from there. Each colour also carries a small standing tilt on the non-size
weights, so the seats disagree about what "best" means rather than being one
opponent played three times.

Move generation only considers placements touching one of your own corner
contact points, rather than scanning all 400 squares. `search-equivalence.test.ts`
checks that shortcut returns exactly what the exhaustive scan would.

### Replay, and why there is no board history

`placedPieces` is an ordered record of every move, and turn order is derived
from the board, so replaying from the start reproduces a state exactly —
including who had passed out and when. That means no stack of past boards has to
be stored, and it stays correct if the turn rules are ever adjusted.
`replay.test.ts` checks a rebuilt state equals the original at every point in a
real game.

## Running it

```sh
npm install
npm run dev      # local dev server
npm test         # unit tests
npm run lint
npm run build    # production build into dist/
```

Pushing to `main` runs the tests and, if they pass, publishes to GitHub Pages.

## Placing a piece

Drag a piece from the tray onto the board. The piece is drawn about three and a
half squares **above** where you are actually pressing, so your fingertip never
covers the thing you are aiming — the squares it would land on light up on the
board underneath, and the two read as one gesture. Aiming from the lifted point
also means you can reach the bottom row with your finger below the board.

Letting go parks the piece where it is; **Place** commits it. Because the board
is one drag surface, pressing anywhere on it picks the piece back up, so a piece
dropped somewhere illegal can always be moved rather than stranded. Letting go
away from the board returns it to the tray. Rotate and Flip work at any point.

**Turning the board** follows the turn in pass and play, so each player looks at
it from their own corner. In a solo game it is fixed to your own seat.

Settings, reached from the gear on the home screen, holds the live score counter
(off by default) and the computer's difficulty (hard by default).

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
  board, leaving the board around 257px. A taller phone gets the full width.
  Giving the board priority would mean rethinking the tray.
- There is no undo. Placing is a two-step drag-then-confirm, which is the guard
  against a misplaced piece.
- Pieces in the tray have no accessible names, only a visual shape.
- The board's size reserves a fixed height for everything stacked around it
  (`--board-chrome` in `Board.css`). Adding to that stack means re-measuring it.

## If you add online play

Game state is currently stored as a snapshot of the whole board. Before wiring
up a backend, switch to storing an append-only list of moves and deriving the
board from it. A move is a couple of dozen bytes against 400 board cells, two
clients appending can't conflict, and replay comes along for free.

Also note `applyMove` trusts that a move's cells really correspond to the piece
it claims. That is fine while moves come from this app's own UI, but it needs
validating server-side once they arrive over a network.
