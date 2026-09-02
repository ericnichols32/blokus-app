import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Account } from './account'
import type { PlayerProfile } from './backend'
import {
  addFriend as addFriendToProfile,
  buildFriendsView,
  cacheProfiles,
  cachedProfiles,
  loadFriendProfiles,
  removeFriend as removeFriendFromProfile,
  savePhoto,
} from './friends'
import type { FriendsView } from './friends'
import type { GameRecord } from './history'
import type { OnlineGame } from './online'
import { OnlineError, loadOnlineGames } from './onlineActions'

/**
 * Your friends and your games with them, loaded once and shared by every screen
 * that needs them.
 *
 * It lives above the screens rather than inside the friends page for two
 * reasons: the home screen wants the same answer ("is anything waiting on
 * me?"), and walking between the two shouldn't re-query the database each time.
 */
export interface FriendsData {
  view: FriendsView
  /** Your own profile, which is where your photo lives. */
  me: PlayerProfile | null
  loading: boolean
  /** Whether a load has ever answered — an empty page means nothing until it has. */
  loaded: boolean
  error: string | null
  refresh: () => void
  addFriend: (username: string) => Promise<void>
  removeFriend: (playerId: string) => Promise<void>
  setPhoto: (photo: string | null) => Promise<void>
}

const EMPTY: FriendsView = {
  friends: [],
  groupGames: [],
  finished: [],
  waitingOnYou: 0,
  liveGames: 0,
}

export function useFriends(account: Account | null, history: GameRecord[]): FriendsData {
  const [games, setGames] = useState<OnlineGame[]>([])
  // Seeded from the cache so the grid draws faces on the first frame rather
  // than a screenful of blanks that fill in a second later.
  const [profiles, setProfiles] = useState<PlayerProfile[]>(cachedProfiles)
  const [me, setMe] = useState<PlayerProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const playerId = account?.playerId

  // Every load takes a ticket, and only the newest one is allowed to write its
  // answer in: a refresh triggered by coming back to the app can easily land
  // after one that was already in flight.
  const ticket = useRef(0)

  const load = useCallback(async () => {
    if (!account) {
      setGames([])
      setProfiles([])
      setMe(null)
      setLoaded(true)
      return
    }

    const mine = ++ticket.current
    setLoading(true)
    setError(null)
    try {
      const fetched = await loadOnlineGames(account.playerId)
      if (ticket.current !== mine) return
      setGames(fetched)

      const { me: profile, profiles: friends } = await loadFriendProfiles(account, fetched)
      if (ticket.current !== mine) return
      setProfiles(friends)
      setMe(profile)
      cacheProfiles(friends)
    } catch (e) {
      if (ticket.current !== mine) return
      setError(e instanceof OnlineError ? e.message : 'Something went wrong loading your games.')
    } finally {
      if (ticket.current === mine) {
        setLoading(false)
        setLoaded(true)
      }
    }
  }, [account])

  const refresh = useCallback(() => {
    void load()
  }, [load])

  // On open, and again whenever the app comes back to the foreground — the
  // whole point of an async game is that somebody moved while you were
  // elsewhere, and a page that only loaded once would go stale in your hand.
  useEffect(() => {
    void load()

    function onVisible() {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  const view = useMemo(
    () => (playerId ? buildFriendsView(profiles, games, history, playerId) : EMPTY),
    [profiles, games, history, playerId],
  )

  const addFriend = useCallback(
    async (username: string) => {
      if (!account) return
      const profile = await addFriendToProfile(account, username)
      // Shown straight away rather than after the round trip: they are on the
      // list now, and a card that appears a second later reads as a glitch.
      setProfiles((current) =>
        current.some((p) => p.playerId === profile.playerId) ? current : [...current, profile],
      )
      refresh()
    },
    [account, refresh],
  )

  const removeFriend = useCallback(
    async (friendId: string) => {
      if (!account) return
      await removeFriendFromProfile(account, friendId, games)
      setProfiles((current) => current.filter((p) => p.playerId !== friendId))
      refresh()
    },
    [account, games, refresh],
  )

  const setPhoto = useCallback(
    async (photo: string | null) => {
      if (!account) return
      await savePhoto(account, photo)
      setMe((current) =>
        current
          ? { ...current, photo: photo ?? undefined }
          : { playerId: account.playerId, username: account.username, createdAt: '', photo: photo ?? undefined },
      )
    },
    [account],
  )

  return { view, me, loading, loaded, error, refresh, addFriend, removeFriend, setPhoto }
}
