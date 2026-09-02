import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Avatar } from '../components/Avatar'
import { PhotoError, photoFromFile } from '../photo'
import { USERNAME_MAX } from '../account'
import type { Account } from '../account'
import { getBackend, isOnline } from '../backend'
import { checkUsername, claim, setPin, unlocks } from '../signIn'
import { hasPin, PIN_LENGTH } from '../pin'
import type { PlayerProfile } from '../backend'
import './AccountScreen.css'

interface AccountScreenProps {
  /** The person already signed in on this device, if any. */
  account: Account | null
  /** Their photo, if they have set one. */
  photo?: string
  /** Saves a new photo, or clears it when given null. */
  onPhotoChange: (photo: string | null) => Promise<void>
  /**
   * Signed in, but staying on this screen.
   *
   * The photo step needs an account that already exists — there is nothing to
   * save a picture onto until the name is claimed — so a brand new player is
   * signed in here and only leaves when `onSignedIn` is called at the end.
   */
  onClaimed: (account: Account) => void
  onSignedIn: (account: Account) => void
  onSignOut: () => void
  /**
   * Leaving without a name. On the first-visit prompt this is "Not now"; once
   * signed in it is the back arrow.
   */
  onClose: () => void
}

/**
 * Claiming a name, changing it, and the PIN that guards it.
 *
 * The interesting case is still a name that already exists: it is almost always
 * you, arriving on a second device, so the screen asks rather than refusing.
 * What has changed is that it now asks for the PIN too — that is the whole point
 * of having one. Names claimed before PINs existed have none and still open to
 * anyone who types them, which is why this screen nags their owners to set one.
 *
 * Renaming is the one case where a taken name is a refusal: you are already
 * someone, and merging you into a different person would lose your games.
 */
type Step = 'name' | 'choose-pin' | 'photo' | 'confirm-identity'

export function AccountScreen({
  account,
  photo,
  onPhotoChange,
  onClaimed,
  onSignedIn,
  onSignOut,
  onClose,
}: AccountScreenProps) {
  const [name, setName] = useState(account?.username ?? '')
  const [step, setStep] = useState<Step>('name')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<PlayerProfile | null>(null)
  const [pin, setPinValue] = useState('')
  const [pinAgain, setPinAgain] = useState('')
  /** Whether the signed-in account already has a PIN; null while unknown. */
  const [protectedAlready, setProtectedAlready] = useState<boolean | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)

  const renaming = account !== null
  const shared = isOnline()

  // Whether to offer "set a PIN" or "change PIN" — and, for an account without
  // one, whether to say so plainly.
  useEffect(() => {
    if (!account) return
    let cancelled = false
    void getBackend()
      .getPlayer(account.playerId)
      .then((profile) => {
        if (!cancelled) setProtectedAlready(hasPin(profile?.pin))
      })
      .catch(() => {
        // Can't tell. Better to say nothing than to claim it's unprotected.
        if (!cancelled) setProtectedAlready(null)
      })
    return () => {
      cancelled = true
    }
  }, [account])

  function resetPins() {
    setPinValue('')
    setPinAgain('')
  }

  async function submitName(event: FormEvent) {
    event.preventDefault()
    if (busy) return

    setBusy(true)
    setError(null)
    const result = await checkUsername(name, account?.playerId)
    setBusy(false)

    if (result.status === 'invalid' || result.status === 'error') {
      setError(result.reason)
      return
    }

    // Already your own name — nothing to do but leave.
    if (result.status === 'yours') {
      onClose()
      return
    }

    if (result.status === 'taken') {
      if (renaming) {
        setError(`@${result.profile.username} is taken. Pick another.`)
        return
      }
      resetPins()
      setConfirming(result.profile)
      setStep('confirm-identity')
      return
    }

    // A free name. Renaming keeps the account it already has, PIN and all; a
    // brand new one picks a PIN before it exists.
    if (renaming) {
      await finish({})
      return
    }
    resetPins()
    setStep('choose-pin')
  }

  async function finish(options: {
    adoptPlayerId?: string
    pin?: string
    /** Whether to go on to the photo rather than straight to the menu. */
    thenPhoto?: boolean
  }) {
    setBusy(true)
    setError(null)
    try {
      const { thenPhoto, ...claimOptions } = options
      const claimed = await claim(name, { ...claimOptions, existing: account ?? undefined })

      if (thenPhoto) {
        onClaimed(claimed)
        setStep('photo')
        setBusy(false)
        return
      }
      onSignedIn(claimed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setBusy(false)
    }
  }

  /** Sets a PIN on a brand new name, or replaces one on the account you hold. */
  async function submitChosenPin(event: FormEvent) {
    event.preventDefault()
    if (busy) return

    if (pin !== pinAgain) {
      setError("Those don't match.")
      return
    }

    if (account) {
      setBusy(true)
      setError(null)
      try {
        await setPin(account, pin)
        setProtectedAlready(true)
        setStep('name')
        resetPins()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      } finally {
        setBusy(false)
      }
      return
    }

    await finish({ pin, thenPhoto: true })
  }

  async function submitIdentity(event: FormEvent) {
    event.preventDefault()
    if (busy || !confirming) return

    setBusy(true)
    setError(null)

    if (!(await unlocks(confirming, pin))) {
      setError("That PIN doesn't match. Try again, or pick a different name.")
      setBusy(false)
      return
    }

    await finish({ adoptPlayerId: confirming.playerId })
  }

  async function pickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Cleared straight away so that picking the very same photo again still
    // fires a change — otherwise a failed attempt cannot be retried.
    event.target.value = ''
    if (!file || photoBusy) return

    setPhotoBusy(true)
    setPhotoError(null)
    try {
      await onPhotoChange(await photoFromFile(file))
    } catch (err) {
      setPhotoError(
        err instanceof PhotoError || err instanceof Error
          ? err.message
          : "Couldn't save that photo.",
      )
    } finally {
      setPhotoBusy(false)
    }
  }

  async function clearPhoto() {
    setPhotoBusy(true)
    setPhotoError(null)
    try {
      await onPhotoChange(null)
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Couldn't remove that photo.")
    } finally {
      setPhotoBusy(false)
    }
  }

  function backToName() {
    setStep('name')
    setConfirming(null)
    resetPins()
    setError(null)
  }

  if (step === 'choose-pin') {
    return (
      <div className="screen inner account">
        <header className="screen-header">
          <button type="button" className="icon-btn" onClick={backToName} aria-label="Back">
            ‹
          </button>
          {/* "Change" only when there is one to change. An account that has
              never had a PIN is choosing its first. */}
          <h1>{protectedAlready ? 'Change your PIN' : 'Choose a PIN'}</h1>
        </header>

        <p className="account-lede">
          {PIN_LENGTH} digits. You'll need it to sign in as <strong>@{name}</strong> on another
          phone.
        </p>

        <form className="stack" onSubmit={submitChosenPin}>
          <PinField label="PIN" value={pin} onChange={setPinValue} autoFocus />
          {/* Asked twice on purpose: there is no way to reset a PIN, so a typo
              here would cost the name permanently. */}
          <PinField label="Type it again" value={pinAgain} onChange={setPinAgain} />

          <button
            type="submit"
            className="btn primary tall"
            disabled={busy || pin.length !== PIN_LENGTH || pinAgain.length !== PIN_LENGTH}
          >
            <span>{busy ? 'Saving…' : account ? 'Save PIN' : 'Create my name'}</span>
          </button>
        </form>

        {error && <p className="account-error">{error}</p>}

        <p className="account-warn">
          There's no way to reset this. Nothing here knows your email or your phone number, so
          there's nothing to prove it's you with. Forget the PIN and you'll have to start again
          under a new name — the games under this one stay with it.
        </p>
      </div>
    )
  }

  if (step === 'photo') {
    /*
     * The last step of setting up, and the only one that is genuinely optional.
     *
     * It comes after the name rather than before it because there has to be an
     * account to save a picture onto — and it comes at all because the friends
     * page is a grid of faces, and a friend who never sets one is a letter on
     * every one of their friends' phones.
     *
     * No back arrow: the name and PIN behind this are already claimed, so there
     * is nothing left to go back and change here.
     */
    return (
      <div className="screen inner account">
        <header className="screen-header">
          <h1>Add a photo</h1>
        </header>

        <p className="account-lede">
          Your friends see this beside your name on their friends page, so they know which
          <strong> @{account?.username ?? name}</strong> is you.
        </p>

        <section className="account-photo">
          <Avatar username={account?.username ?? name} photo={photo} size={112} />

          {photoBusy ? (
            <p className="photo-status">Saving…</p>
          ) : (
            <div className="photo-actions">
              <PhotoButton label="Take a photo" capture onPick={pickPhoto} />
              <PhotoButton label="Choose a photo" onPick={pickPhoto} />
            </div>
          )}

          {photoError && <p className="account-error">{photoError}</p>}
        </section>

        {/* Quiet until there is a photo, so that "skip" reads as the smaller
            of the two things you could do and "done" reads as finishing. */}
        <button
          type="button"
          className={photo ? 'btn primary tall' : 'btn quiet'}
          disabled={photoBusy}
          onClick={() => account && onSignedIn(account)}
        >
          {photo ? <span>Done</span> : 'Skip for now'}
        </button>

        <p className="account-note">
          You can add or change it any time from your name at the bottom of the menu. Anyone who
          has the link to this app can see it.
        </p>
      </div>
    )
  }

  if (step === 'confirm-identity' && confirming) {
    const needsPin = hasPin(confirming.pin)

    return (
      <div className="screen inner account">
        <header className="screen-header">
          <button type="button" className="icon-btn" onClick={backToName} aria-label="Back">
            ‹
          </button>
          <h1>Is this you?</h1>
        </header>

        <p className="account-lede">
          Somebody already goes by <strong>@{confirming.username}</strong>.{' '}
          {needsPin
            ? "If that's you, enter your PIN and your games will follow you to this device."
            : "If that's you, take it — your games will follow you to this device. If it isn't, pick a different name."}
        </p>

        <form className="stack" onSubmit={submitIdentity}>
          {needsPin && <PinField label="Their PIN" value={pin} onChange={setPinValue} autoFocus />}

          <button
            type="submit"
            className="btn primary tall"
            disabled={busy || (needsPin && pin.length !== PIN_LENGTH)}
          >
            <span>{busy ? 'Signing in…' : `Yes, I'm @${confirming.username}`}</span>
            <span className="sub">Sign in and bring my games here</span>
          </button>
          <button type="button" className="btn tall" disabled={busy} onClick={backToName}>
            <span>No, pick another name</span>
          </button>
        </form>

        {error && <p className="account-error">{error}</p>}

        {!needsPin && (
          // The honest reason this let them straight in, said where it is true.
          <p className="account-note">
            This name has no PIN, so anyone who types it can sign in as them. Whoever owns it can
            set one from their own account screen.
          </p>
        )}
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

      {renaming && (
        <section className="account-photo">
          <Avatar username={account.username} photo={photo} size={96} />

          {photoBusy ? (
            <p className="photo-status">Saving…</p>
          ) : (
            <div className="photo-actions">
              {/* Two controls rather than one, because left to itself the phone
                  buries the camera in an action sheet — and "take one now" and
                  "use one I already like" are genuinely different intentions. */}
              <PhotoButton label="Take a photo" capture onPick={pickPhoto} />
              <PhotoButton label="Choose a photo" onPick={pickPhoto} />
            </div>
          )}

          {photo && !photoBusy && (
            <button type="button" className="btn quiet" onClick={() => void clearPhoto()}>
              Remove photo
            </button>
          )}

          {photoError && <p className="account-error">{photoError}</p>}

          {/* The same bargain as the name and the PIN, said where somebody is
              about to upload their face. */}
          <p className="account-note">
            Your friends see this beside your name. Anyone who has the link to this app can see it
            too.
          </p>
        </section>
      )}

      <p className="account-lede">
        {renaming
          ? 'Change what your friends see. Your games stay with you.'
          : `This is how your friends will find you. Then a ${PIN_LENGTH}-digit PIN, so that typing this name on another phone signs you back in and nobody else, and a photo.`}
      </p>

      <form className="stack" onSubmit={submitName}>
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

      {renaming && protectedAlready !== null && (
        <div className="account-section">
          <h2>PIN</h2>
          {protectedAlready ? (
            <p className="account-note">
              Your name is protected. You'll need this PIN to sign in on another phone, and there's
              no way to reset it.
            </p>
          ) : (
            <p className="account-warn">
              Your name has no PIN, so anyone who types <strong>@{account.username}</strong> can
              sign in as you and pick up your games.
            </p>
          )}
          <button
            type="button"
            className={protectedAlready ? 'btn' : 'btn primary'}
            disabled={busy}
            onClick={() => {
              resetPins()
              setError(null)
              setStep('choose-pin')
            }}
          >
            {protectedAlready ? 'Change PIN' : 'Set a PIN'}
          </button>
        </div>
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

interface PhotoButtonProps {
  label: string
  /** Open the camera straight away rather than the photo library. */
  capture?: boolean
  onPick: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
}

/**
 * One of the two ways to get a picture in.
 *
 * A file input dressed as a button: it is the only thing that can open a
 * phone's camera or library, and it cannot be triggered from script. The input
 * is hidden with clipping rather than `display: none`, which would take it out
 * of the accessibility tree and leave the control unreachable by keyboard.
 *
 * `capture` is honoured by phones and ignored everywhere else, so on a laptop
 * both buttons open the same file chooser. That is the right failure: the
 * choice only exists where a camera does.
 */
function PhotoButton({ label, capture, onPick }: PhotoButtonProps) {
  return (
    <label className="btn photo-btn">
      <span>{label}</span>
      <input
        className="visually-hidden"
        type="file"
        accept="image/*"
        // The front camera: this is a picture of you, for your own name.
        capture={capture ? 'user' : undefined}
        onChange={(event) => void onPick(event)}
      />
    </label>
  )
}

interface PinFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
}

function PinField({ label, value, onChange, autoFocus }: PinFieldProps) {
  return (
    <label className="pin-field">
      <span className="pin-label">{label}</span>
      <input
        className="pin-input"
        value={value}
        // Digits only, and never more than fit — so the only thing that can be
        // wrong by the time it is submitted is the PIN itself.
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
        inputMode="numeric"
        autoComplete="off"
        // The digits are a secret from whoever is looking over your shoulder.
        type="password"
        maxLength={PIN_LENGTH}
        aria-label={label}
        autoFocus={autoFocus}
      />
    </label>
  )
}
