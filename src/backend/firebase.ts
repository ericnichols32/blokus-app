import { normalizeUsername } from '../account'
import type { GameRecord } from '../history'
import type { FirebaseConfig } from './config'
import { StaleGameError } from './types'
import type { Backend, PlayerProfile } from './types'
import { fromStored, toStored } from './wire'
import type { StoredOnlineGame } from './wire'

/**
 * The shared store, on Firestore.
 *
 * Four collections:
 *
 * - `usernames/{lowercased}` → `{ playerId }`. The name-to-person mapping, kept
 *   separate from the person so that renaming is two small writes rather than
 *   moving every game a player has ever played.
 * - `players/{playerId}` → the profile, photo and friends list included.
 * - `players/{playerId}/games/{gameId}` → one finished game each.
 * - `onlineGames/{gameId}` → a game in progress against friends. Top level
 *   rather than under a player, because it belongs to everyone in it; each
 *   carries a flat `playerIds` array so "my games" is one array-contains query.
 *   Written through `wire.ts`, because a move's cells are an array of pairs and
 *   Firestore will not store an array inside an array.
 *
 * The whole SDK is imported dynamically. It is far larger than the rest of the
 * app, and nothing about playing the computer needs it, so it is fetched the
 * first time an account operation happens rather than on load — which also
 * keeps the game itself working offline.
 */
export function createFirebaseBackend(config: FirebaseConfig): Backend {
  return {
    kind: 'firebase',

    async lookupUsername(username) {
      const { db, fs } = await connect(config)
      const snap = await fs.getDoc(fs.doc(db, 'usernames', normalizeUsername(username)))
      const playerId = snap.exists() ? (snap.data().playerId as string) : null
      if (!playerId) return null

      // The mapping is the source of truth for who owns a name, but the profile
      // is where the capitalisation lives. A mapping whose profile has gone
      // still identifies the right person, so fall back rather than fail.
      const player = await this.getPlayer(playerId)
      return player ?? { playerId, username, createdAt: new Date().toISOString() }
    },

    async claimUsername(playerId, username, previousUsername, pin) {
      const { db, fs } = await connect(config)
      const now = new Date().toISOString()
      const batch = fs.writeBatch(db)

      // Release the old name first, so a rename doesn't leave you holding two.
      if (previousUsername && normalizeUsername(previousUsername) !== normalizeUsername(username)) {
        batch.delete(fs.doc(db, 'usernames', normalizeUsername(previousUsername)))
      }

      batch.set(fs.doc(db, 'usernames', normalizeUsername(username)), { playerId, updatedAt: now })
      // merge, so adopting an existing player on a new device refreshes the
      // name and last-seen time without wiping when they were created — or,
      // just as importantly, without wiping a PIN that isn't being changed.
      batch.set(
        fs.doc(db, 'players', playerId),
        { playerId, username, createdAt: now, lastSeenAt: now, ...(pin ? { pin } : {}) },
        { merge: true },
      )

      await batch.commit()
    },

    async getPlayer(playerId) {
      const { db, fs } = await connect(config)
      const snap = await fs.getDoc(fs.doc(db, 'players', playerId))
      if (!snap.exists()) return null

      const data = snap.data()
      return {
        playerId,
        username: (data.username as string) ?? '',
        createdAt: (data.createdAt as string) ?? new Date().toISOString(),
        pin: (data.pin as PlayerProfile['pin']) ?? undefined,
        photo: (data.photo as string) || undefined,
        friendIds: Array.isArray(data.friendIds) ? (data.friendIds as string[]) : undefined,
      }
    },

    async updateProfile(playerId, patch) {
      const { db, fs } = await connect(config)
      const fields: Record<string, unknown> = {}

      // deleteField rather than null or '': a stored null would come back as a
      // photo that exists and shows nothing, and the profile is read on every
      // friend refresh.
      if (patch.photo === null) fields.photo = fs.deleteField()
      else if (patch.photo !== undefined) fields.photo = patch.photo
      if (patch.friendIds !== undefined) fields.friendIds = patch.friendIds
      if (Object.keys(fields).length === 0) return

      // merge, because this only ever owns the fields it was handed — the name,
      // the PIN and the creation date belong to claimUsername.
      await fs.setDoc(fs.doc(db, 'players', playerId), fields, { merge: true })
    },

    async saveGame(playerId, record) {
      const { db, fs } = await connect(config)
      // Keyed by the game's own id, so writing the same game twice overwrites
      // rather than duplicating — which is what makes re-syncing safe.
      await fs.setDoc(fs.doc(db, 'players', playerId, 'games', record.id), record)
    },

    async listGames(playerId) {
      const { db, fs } = await connect(config)
      const snap = await fs.getDocs(
        fs.query(fs.collection(db, 'players', playerId, 'games'), fs.orderBy('finishedAt')),
      )
      return snap.docs.map((d) => d.data() as GameRecord)
    },

    async createOnlineGame(game) {
      const { db, fs } = await connect(config)
      await fs.setDoc(fs.doc(db, 'onlineGames', game.id), toStored(game))
    },

    async getOnlineGame(gameId) {
      const { db, fs } = await connect(config)
      const snap = await fs.getDoc(fs.doc(db, 'onlineGames', gameId))
      return snap.exists() ? fromStored(snap.data() as StoredOnlineGame) : null
    },

    async listOnlineGames(playerId) {
      const { db, fs } = await connect(config)
      // array-contains is why playerIds exists as a flat array: Firestore cannot
      // query "any of these four map fields equals playerId".
      //
      // Deliberately not ordered here. An array-contains combined with an orderBy
      // needs a composite index built by hand in the console before the query
      // will run at all — and it would buy nothing, because the caller sorts by
      // whose turn it is first and only then by time. A handful of games per
      // person is not a page worth of results to trim.
      const snap = await fs.getDocs(
        fs.query(fs.collection(db, 'onlineGames'), fs.where('playerIds', 'array-contains', playerId)),
      )
      return snap.docs.map((d) => fromStored(d.data() as StoredOnlineGame))
    },

    watchOnlineGame(gameId, onChange) {
      let stop: (() => void) | null = null
      let cancelled = false

      // connect() is async, so the caller gets its unsubscribe immediately and
      // the real one is wired up behind it — a screen closed in that gap must
      // still end up with nothing listening.
      void connect(config)
        .then(({ db, fs }) => {
          if (cancelled) return
          stop = fs.onSnapshot(
            fs.doc(db, 'onlineGames', gameId),
            (snap) => {
              if (snap.exists()) onChange(fromStored(snap.data() as StoredOnlineGame))
            },
            () => {
              // Dropped connection or a rule refusal. The screen still has the
              // board it loaded, and its own refresh still works.
            },
          )
        })
        .catch(() => {})

      return () => {
        cancelled = true
        stop?.()
      }
    },

    async submitOnlineTurn(game, expectedMoveCount) {
      const { db, fs } = await connect(config)
      const ref = fs.doc(db, 'onlineGames', game.id)

      // A transaction rather than a plain write, because two friends with the app
      // open is the ordinary case: whoever commits second must be told their
      // board was stale instead of overwriting the turn that landed first.
      await fs.runTransaction(db, async (tx) => {
        const snap = await tx.get(ref)
        if (!snap.exists()) throw new StaleGameError('That game is no longer there.')

        const stored = snap.data() as StoredOnlineGame
        if ((stored.moves?.length ?? 0) !== expectedMoveCount) throw new StaleGameError()

        tx.set(ref, toStored(game))
      })
    },
  }
}

/**
 * Starts the SDK on first use and reuses it after.
 *
 * Signing in anonymously is not about identifying anyone — the account is the
 * username, and this uid changes if you clear your browser. It exists so the
 * security rules can require *some* signed-in caller, which keeps a passing
 * script from writing to the database. Friends who have the link are all
 * equally trusted once inside, which is the arrangement asked for.
 */
async function connect(config: FirebaseConfig) {
  connection ??= (async () => {
    const [{ initializeApp }, auth, fs] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/firestore'),
    ])

    const app = initializeApp(config)
    const db = fs.getFirestore(app)

    try {
      await auth.signInAnonymously(auth.getAuth(app))
    } catch (error) {
      // Anonymous sign-in not enabled on the project, or offline. Let the read
      // or write proceed and fail on its own terms; the rules will reject it if
      // that is what's wrong, and the caller reports the failure either way.
      console.warn('Anonymous sign-in failed; account features may not work.', error)
    }

    return { db, fs }
  })()

  try {
    return await connection
  } catch (error) {
    // Don't cache a failed start — a dropped connection on first use would
    // otherwise leave accounts broken for the rest of the session.
    connection = null
    throw error
  }
}

let connection: Promise<{
  db: import('firebase/firestore').Firestore
  fs: typeof import('firebase/firestore')
}> | null = null
