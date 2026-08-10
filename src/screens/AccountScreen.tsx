import { useState } from 'react'
import type { FormEvent } from 'react'
import { USERNAME_MAX } from '../account'
import type { Account } from '../account'
import { isOnline } from '../backend'
import { checkUsername, claim } from '../signIn'
import type { PlayerProfile } from '../backend'
import './AccountScreen.css'

interface AccountScreenProps {
  /** The person already signed in on this device, if any. */
  account: Account | null
  onSignedIn: (account: Account) => void
  onSignOut: () => void
  /**
   * Leaving without a name. On the first-visit prompt this is "Not now"; once
   * signed in it is the back arrow.
   */
  onClose: () => void
}

/**
 * Two jobs in one screen, because they are the same form: claiming a name the
 * first time, and changing it later.
 *
 * The interesting case is a name that already exists. There are no passwords,
 * so an existing name is not an error to be refused — it is almost always you,
 * arriving on a second device. The screen asks, and taking it brings your games
 * with you. Renaming is the one case where a taken name is a refusal: you are
 * already someone, and quietly merging you into a different person would lose
 * the games filed under the one you were.
 */
export function AccountScreen({ account, onSignedIn, onSignOut, onClose }: AccountScreenProps) {
  const [name, setName] = useState(account?.username ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<PlayerProfile | null>(null)

  const renaming = account !== null
  const shared = isOnline()

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError(null)

    const result = await checkUsername(name, account?.playerId)

    if (result.status === 'invalid' || result.status === 'error') {
      setError(result.reason)
      setBusy(false)
      return
    }

    // Already your own name — nothing to do but leave.
    if (result.status === 'yours') {
      setBusy(false)
      onClose()
      return
    }

    if (result.status === 'taken') {
      setBusy(false)
      if (renaming) setError(`@${result.profile.username} is taken. Pick another.`)
      else setConfirming(result.profile)
      return
    }

    await finish({})
  }

  async function finish(options: { adoptPlayerId?: string }) {
    setBusy(true)
    setError(null)
    try {
      onSignedIn(await claim(name, { ...options, existing: account ?? undefined }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setBusy(false)
      setConfirming(null)
    }
  }

  if (confirming) {
    return (
      <div className="screen inner account">
        <header className="screen-header">
          <button
            type="button"
            className="icon-btn"
            onClick={() => setConfirming(null)}
            aria-label="Back"
          >
            ‹
          </button>
          <h1>Is this you?</h1>
        </header>

        <p className="account-lede">
          Somebody already goes by <strong>@{confirming.username}</strong>. If that's you, take it —
          your games will follow you to this device. If it isn't, pick a different name.
        </p>

        <div className="stack">
          <button
            type="button"
            className="btn primary tall"
            disabled={busy}
            onClick={() => finish({ adoptPlayerId: confirming.playerId })}
          >
            <span>{busy ? 'Signing in…' : `Yes, I'm @${confirming.username}`}</span>
            <span className="sub">Sign in and bring my games here</span>
          </button>
          <button type="button" className="btn tall" disabled={busy} onClick={() => setConfirming(null)}>
            <span>No, pick another name</span>
          </button>
        </div>

        {error && <p className="account-error">{error}</p>}
      </div>
    )
  }

  return (
    <div className="screen inner account">
      <header className="screen-header">
        {/* No back arrow on the first visit: this is the first screen there is,
            so an arrow would point at nothing. Declining is the "Not now"
            button under the form instead. */}
        {renaming && (
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Back">
            ‹
          </button>
        )}
        <h1>{renaming ? 'Your name' : 'Pick a name'}</h1>
      </header>

      <p className="account-lede">
        {renaming
          ? 'Change what your friends see. Your games stay with you.'
          : 'This is how your friends will find you. No password — typing this name on another device signs you back in.'}
      </p>

      <form className="stack" onSubmit={submit}>
        <div className="name-field">
          <span className="at" aria-hidden="true">
            @
          </span>
          <input
            className="name-input"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            placeholder="eric"
            maxLength={USERNAME_MAX}
            // An iPhone will otherwise capitalise and autocorrect the first
            // word, which quietly turns "eric" into "Eric" or something else.
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
            aria-label="Username"
            // The only field on the screen, and on the first visit the only
            // thing to do on it — so the keyboard may as well already be up.
            autoFocus
          />
        </div>

        <button type="submit" className="btn primary tall" disabled={busy || name.trim().length === 0}>
          <span>{busy ? 'Checking…' : renaming ? 'Save' : 'Continue'}</span>
        </button>

        {!renaming && (
          <button type="button" className="btn quiet" onClick={onClose} disabled={busy}>
            Not now
          </button>
        )}
      </form>

      {error && <p className="account-error">{error}</p>}

      {!shared && (
        // Said plainly rather than hidden. Without a server this name lives on
        // this phone only, and a friend who "can't find you" deserves a reason.
        <p className="account-note">
          No server is set up yet, so this name is saved on this device only — nobody else can see
          it, and it won't follow you to another phone.
        </p>
      )}

      {renaming && (
        <div className="account-footer">
          <button type="button" className="btn danger" onClick={onSignOut} disabled={busy}>
            Sign out
          </button>
          <p className="account-note">
            Signing out leaves your games on this device. Type your name again to pick them back up.
          </p>
        </div>
      )}
    </div>
  )
}
