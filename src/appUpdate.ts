/**
 * Picks up a new version of the app without anyone having to close it.
 *
 * The app installs a copy of itself so it works with no signal. The cost is that
 * a running copy keeps running: shipping a new version doesn't reach a phone
 * that already has the old one until it is fully closed and reopened, which
 * nobody thinks to do. Every friend hitting a bug that was fixed days ago is
 * this.
 *
 * Two halves, and both are needed:
 *
 * - **Look.** The browser only checks for a new worker when a page loads. An
 *   installed app that is opened and closed rather than reloaded may never look
 *   again, so this asks explicitly — on return to the app, and on a timer.
 * - **Take it.** A new worker claims the page as soon as it activates, but the
 *   old code carries on running until a reload. That reload is what this does.
 *
 * It reloads without asking, which was the choice made: always current, at the
 * price of a reload possibly landing mid-move. The game itself survives — it is
 * saved, and screenMemory brings the same screen back — but a piece being held
 * at that instant is dropped and has to be picked up again.
 */

/** How often a running app asks whether a new version exists. */
const CHECK_INTERVAL_MS = 15 * 60 * 1000

export function watchForNewVersion(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  /*
   * A page that has no controller yet is on its first ever visit — the worker
   * installing for the first time also fires controllerchange, and reloading
   * there would reload every new visitor once for nothing.
   */
  const hadController = navigator.serviceWorker.controller !== null
  let reloading = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return
    reloading = true
    window.location.reload()
  })

  void navigator.serviceWorker.ready
    .then((registration) => {
      const check = () => {
        // Offline, or the check simply fails: nothing to do but try again later.
        void registration.update().catch(() => {})
      }

      check()
      window.setInterval(check, CHECK_INTERVAL_MS)

      // Coming back to the app is the best moment to look: it is both when an
      // update is most likely to be waiting and when a reload costs least,
      // since nobody is mid-gesture at the instant they return.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    })
    .catch(() => {
      // No worker registered — a plain browser tab, or registration failed.
      // The app works either way; it just won't update itself.
    })
}
