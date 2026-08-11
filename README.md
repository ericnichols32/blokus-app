# Blokus

A mobile-first Blokus game, built as an installable web app (PWA) so it can be
added to an iPhone home screen and shared as a plain URL — no App Store, no
TestFlight, no developer account.

**Live:** https://ericnichols32.github.io/blokus-app/

## What this is meant to be

The full intent, so it isn't only in someone's head:

- **Home screen** — start a new game, resume one in progress, reach stats.
- **Solo vs. computer** — play the AI, in either an open (untimed) or timed
  game: a budget to pick a piece, then the same again to place it. Fifteen
  seconds each by default, and settable between 5 and 120.
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
| Computer opponent | Done — a strength slider, at the top of the scale by default |
| Solo setup (colour) | Done — who opens is drawn at random |
| Saved game that survives a refresh | Done |
| Settings screen | Done — live scores, strength, turn length |
| Live scores during play | Done — off by default |
| Recording finished games | Done — every finished game is summarised |
| Accounts and usernames | Done — live on Firebase |
| Timed mode | Done — solo games, two clocks a turn, length configurable |
| Stats screen | Done — solo games only; per-friend records need online play |
| Online play against friends | Not started |

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
  backend/       The shared store, behind one interface
    types.ts     What the app needs from a server
    local.ts     Device-only stand-in, used when Firebase isn't configured
    firebase.ts  Firestore, loaded on demand
    config.ts    Reads the project's details from the environment
  screens/       One component per screen
  components/    Board, piece tray, piece icon, score strip
  session.ts     What a game is and how it is saved
  settings.ts    Preferences that outlive a game
  history.ts     Finished games, summarised as they end
  stats.ts       Turns those summaries into the figures on the stats screen
  account.ts     Who you are on this device, and the username rules
  signIn.ts      Claiming, adopting and renaming
  sync.ts        Pushing finished games up to your account
  turnClock.ts   The two budgets a timed turn is made of
  boardView.ts   Which way up the board is drawn, and the maths both ways
```

The engine is deliberately free of React so it can be tested directly and later
reused by a server.

### How the stats are worked out

Only solo games count towards a personal record. In pass-and-play all four seats
are people sharing one phone, so the record has no way to say which player was
you; those games are counted separately and stated as such rather than dropped
silently.

Two of the figures deserve their reasoning written down.

**Favourite piece** is the piece you place *more often than your opponents do in
the same games*, not the piece you place most. A plain count would name the
monomino for everybody — a single square fits anywhere, so it is the one that
reliably gets down, and the answer would say more about Blokus than about you.
Measuring against the other three seats in the very same games cancels that
baseline out, since every piece is equally easy for them too.

**Left behind most** is the opposite: a plain count, on purpose. The piece you
are stuck with is usually one everybody struggles to place, so subtracting their
struggle would hide it behind something rarer — and "most" has to mean most.

Neither is shown until three games are in. Below that, any piece you happened to
place twice ties for first, and the answer would change completely each game.

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

### The clock

A solo game can be timed, chosen when you start it. Each of your turns is two
budgets of fifteen seconds: one to get a piece in hand, one to get it down.
The computers are unaffected — they answer in half a second anyway.

Both budgets are **continuous across the whole turn**, not restarted when the
phase changes. Only the active one drains, so putting a piece back freezes the
placement clock and resumes the selection clock where it left off. This is the
point rather than an implementation detail: if picking a different piece reset
the placement clock, a turn could be held open forever by tapping between two of
them. `turnClock.ts` holds this logic on its own, with no React in it, and
`turnClock.test.ts` pins the un-gameable property directly.

Running out doesn't cost you the turn:

- **Out of time to pick** — a piece is chosen for you, and the placement clock
  then gives you the full fifteen seconds. You lost the choice, not the turn.
  Cancel is disabled from that point, since dropping back into a selection phase
  with no time left would just re-pick the same piece.
- **Out of time to place** — if the piece is already sitting somewhere legal,
  that is where it goes. You did the work and only missed the confirming tap.
  Otherwise a spot is picked for you.

`chooseTimeoutMove` makes those choices, and is deliberately mediocre rather
than random: it ranks every legal move on the middling evaluation and takes the
**median**. Random would hand you an excellent move often enough to make
ignoring the clock a viable strategy, and a terrible one often enough to feel
arbitrary. Measured over 20 games, a player who times out every single turn
finishes about 25 points behind one playing on hard — roughly the same penalty
as dropping to easy, which is a real cost without being a forfeit.

The countdown is derived from timestamps rather than counted down tick by tick,
so a phone that sleeps mid-turn comes back with the correct time elapsed instead
of a clock that paused while you were away.

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

## Accounts

A username, no password. You are asked for one the first time you open the app,
once — declining is remembered, and the chip in the top-left corner of the home
screen is the way back in.

### Why there is no password

Typing a name that already exists **signs you in as that person** rather than
being refused. That is the whole mechanism: open the link on a second phone,
type your name, confirm it's you, and your games are there. It is also the only
recovery there is, since nothing else is stored about you.

The cost is stated plainly: anyone with the link can become anyone. A friend who
types your name gets your page. That was an explicit choice — the link only goes
to people you know, and the alternative is passwords or email sign-in, which is
a great deal of machinery for a game you play with four friends. If the app ever
goes wider than that, this is the first thing that has to change.

### How it is stored

Two ids, because they do different jobs:

- **`playerId`** is the person. It never changes, and every game is filed under
  it, so renaming yourself doesn't orphan your history.
- **`username`** is the label, in a separate `usernames/{lowercased}` mapping.
  Renaming is two small writes — release the old, take the new — rather than
  moving every game you've ever played.

Names match without regard to capitals (`@Eric` and `@eric` are one person), but
the capitals you typed are what everyone sees.

Finished games are pushed up by `sync.ts`, which records what has already landed
so a dropped connection retries only the rest. The first sync after signing in
carries **everything played before there was an account**, so nothing you played
while deciding is lost.

`sync.ts` also registers a name the server has never heard of. A name claimed
while the app was device-only — before the Firebase project existed, or just
offline — was written to the phone and nowhere else, so a friend could later
claim the same name and become a *different* person under it, with both of them
believing they were `@eric`. The first sync that reaches a server closes that.
A name somebody else already holds is left alone rather than taken back;
re-asserting on every load would be a tug of war neither side could see.

### Setting up the Firebase project

Until this is done the app still works — it just keeps usernames on the device,
shares nothing, and says so on the sign-in screen. Roughly five minutes.

The console reorganises its sidebar every so often, so the names below may not
match what you see. As of August 2026 the sidebar groups things under **Product
categories**; older guides (and older versions of this list) put both Firestore
and Authentication under a **Build** section that no longer exists. Go by what
you are looking for rather than by the path.

1. At [console.firebase.google.com](https://console.firebase.google.com), create
   a project. Turn Google Analytics **off**; nothing here uses it. The free
   (Spark) plan is enough, and no card is needed.
2. **Databases & Storage → Firestore → Create database.**

   Take **Firestore**, under the *NoSQL* heading. The *Storage* entry below it
   is object storage for images and video, it is not used here, and its page
   demands a pricing upgrade — which is easy to read as "this project needs a
   paid plan". It doesn't. Firestore is free on Spark at this scale.

   The wizard has three steps:

   - **Edition** — Standard. Enterprise is a paid tier for query features
     nothing here uses.
   - **Database ID & location** — leave the ID as `(default)`. The app calls
     `getFirestore(app)`, which resolves to the default database; a custom ID
     leaves it connecting to something that isn't there, and the error you get
     is a permission failure rather than a missing-database one. The location
     **cannot be changed afterwards** — any US region is equivalent at this
     scale, but changing your mind later means deleting and recreating.
   - **Configure** — production mode. The rules get replaced in step 4 anyway,
     and test mode expires after 30 days, which would break accounts with no
     warning.
3. **Security → Authentication → Get started → Anonymous → Enable.** This does
   not identify anyone; it exists so the rules can require a caller that came
   through the app. See the comment at the top of `firestore.rules`.
4. **Firestore Database → Rules**, paste in the contents of `firestore.rules`
   from this repo, and publish.
5. **Project settings → General → Your apps → Web (`</>`)**, register the app,
   and copy the four values out of the `firebaseConfig` block it shows you.
6. `cp .env.example .env.local`, fill in those four, restart `npm run dev`.
7. For the deployed site, add the same four as repository secrets:

   ```sh
   gh secret set VITE_FIREBASE_API_KEY
   gh secret set VITE_FIREBASE_AUTH_DOMAIN
   gh secret set VITE_FIREBASE_PROJECT_ID
   gh secret set VITE_FIREBASE_APP_ID
   ```

8. Optional, and only worth doing as insurance: **Authentication → Settings →
   Authorized domains**, add `ericnichols32.github.io`.

   This list gates OAuth redirect flows — Google sign-in, email links — none of
   which this app uses. Anonymous sign-in ignores it entirely; it is a plain
   call to the Identity Toolkit endpoint with the web API key, and it succeeds
   from any origin, or from none at all. The entry costs nothing and would be
   needed the day a real sign-in method is added, but nothing here depends on
   it, and an earlier version of these instructions was wrong to say sign-in
   would fail without it.

Those four values are not secrets. A Firebase web config ships inside the
JavaScript bundle wherever you keep it, and Google documents it as public —
`firestore.rules` is what guards the data. They sit in the environment so the
project can be swapped without a commit, not to hide them.

The Firebase SDK is imported dynamically. It is the largest thing in the build
by some way — around 560 kB against 227 kB for the whole rest of the app — and
keeping it off the startup path means it is never parsed or executed unless an
account operation happens. Playing the computer doesn't touch it.

Note that this is a saving in startup work rather than in bytes downloaded: the
service worker precaches every built asset, so an installed copy fetches the SDK
in the background regardless. That is the trade for the game working offline.

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
