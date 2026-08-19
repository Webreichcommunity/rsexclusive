const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const configured = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId)
let currentUser = null
let appInstance = null
let authInstance = null

async function loadFirebase() {
  if (!configured) return null
  if (authInstance) return authInstance

  const [{ initializeApp }, authModule] = await Promise.all([import('firebase/app'), import('firebase/auth')])
  appInstance = appInstance || initializeApp(firebaseConfig)
  authInstance = authModule.getAuth(appInstance)
  await authModule.setPersistence(authInstance, authModule.browserLocalPersistence)
  return authInstance
}

export async function getFirebaseToken() {
  const auth = await loadFirebase()
  const user = currentUser || auth?.currentUser
  if (!auth || !user) return null
  return user.getIdToken()
}

export async function observeAuth(callback) {
  const auth = await loadFirebase()
  if (!auth) {
    callback(null)
    return () => {}
  }
  const { onAuthStateChanged } = await import('firebase/auth')
  return onAuthStateChanged(auth, (user) => {
    currentUser = user
    callback(user)
  })
}

export async function loginWithEmail(email, password) {
  const auth = await loadFirebase()
  if (!auth) throw new Error('Firebase web config is not set')
  const { signInWithEmailAndPassword } = await import('firebase/auth')
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password)
    currentUser = credential.user
    return credential
  } catch (error) {
    throw new Error(toFirebaseLoginMessage(error))
  }
}

function authActionSettings() {
  return {
    url: `${window.location.origin}/login`,
    handleCodeInApp: false,
  }
}

export async function loginWithGoogle() {
  const auth = await loadFirebase()
  if (!auth) throw new Error('Firebase web config is not set')
  const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth')
  try {
    const credential = await signInWithPopup(auth, new GoogleAuthProvider())
    currentUser = credential.user
    return credential
  } catch (error) {
    throw new Error(toFirebaseLoginMessage(error))
  }
}

export async function registerWithEmail({ email, password, fullName }) {
  const auth = await loadFirebase()
  if (!auth) throw new Error('Firebase web config is not set')
  const { createUserWithEmailAndPassword, sendEmailVerification, updateProfile } = await import('firebase/auth')
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password)
    if (fullName) await updateProfile(credential.user, { displayName: fullName })
    await sendEmailVerification(credential.user, authActionSettings()).catch(() => {})
    currentUser = credential.user
    return credential
  } catch (error) {
    throw new Error(toFirebaseLoginMessage(error))
  }
}

export async function resendEmailVerification() {
  const auth = await loadFirebase()
  const user = currentUser || auth?.currentUser
  if (!auth || !user) throw new Error('Sign in again to resend verification email.')
  const { sendEmailVerification } = await import('firebase/auth')
  try {
    await sendEmailVerification(user, authActionSettings())
  } catch (error) {
    throw new Error(toFirebaseLoginMessage(error))
  }
}

export async function refreshFirebaseUser() {
  const auth = await loadFirebase()
  const user = currentUser || auth?.currentUser
  if (!auth || !user) return null
  await user.reload()
  currentUser = auth.currentUser
  return currentUser
}

export async function sendPasswordReset(email) {
  const auth = await loadFirebase()
  if (!auth) throw new Error('Firebase web config is not set')
  const { sendPasswordResetEmail } = await import('firebase/auth')
  try {
    await sendPasswordResetEmail(auth, email, authActionSettings())
  } catch (error) {
    throw new Error(toFirebaseLoginMessage(error))
  }
}

export async function logout() {
  const auth = await loadFirebase()
  const { signOut } = await import('firebase/auth')
  if (auth) await signOut(auth)
}

function toFirebaseLoginMessage(error) {
  const code = error?.code || ''
  const messages = {
    'auth/invalid-credential': 'Firebase rejected this email or password. Check the Firebase user exists in the same project and the password is correct.',
    'auth/user-not-found': 'No Firebase user exists for this email in the configured Firebase project.',
    'auth/wrong-password': 'The password is incorrect for this Firebase user.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/user-disabled': 'This Firebase user is disabled.',
    'auth/operation-not-allowed': 'Email/password sign-in is not enabled in Firebase Authentication.',
    'auth/api-key-not-valid': 'The Firebase API key in VITE_FIREBASE_API_KEY is not valid for this project.',
    'auth/network-request-failed': 'Firebase could not be reached. Check your internet connection and browser network settings.',
    'auth/popup-closed-by-user': 'Google sign-in was closed before completion.',
    'auth/email-already-in-use': 'An account already exists for this email. Sign in instead.',
    'auth/weak-password': 'Use a stronger password with at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes, then try again.',
  }
  return messages[code] || error?.message || 'Firebase login failed.'
}
