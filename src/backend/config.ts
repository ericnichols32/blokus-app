/**
 * The Firebase project's connection details, read from the environment at build
 * time. Set them in `.env.local` for local work and as repository secrets for
 * the deployed build — see the Accounts section of the README.
 *
 * These are not secrets. A Firebase web config ships inside the JavaScript
 * bundle no matter where it is kept, and Google documents it as public: what
 * actually protects the data is the security rules in `firestore.rules`, not
 * the obscurity of these strings. They live in the environment so that the
 * project can be swapped without editing source, not to hide them.
 */
export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
}

export function readFirebaseConfig(): FirebaseConfig | null {
  const env = import.meta.env
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  }

  // All four or nothing. A partial config fails at connect time with an error
  // that says nothing useful, so treat it as "not set up" and stay local.
  const complete = Object.values(config).every((v) => typeof v === 'string' && v.length > 0)
  return complete ? (config as FirebaseConfig) : null
}
