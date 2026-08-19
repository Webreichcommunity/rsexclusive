import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { env } from '../config/env.js'

let firebaseApp

function assertFirebaseAdminConfig() {
  if (env.firebase.serviceAccountJson) return

  const missing = []
  if (!env.firebase.projectId) missing.push('FIREBASE_PROJECT_ID')
  if (!env.firebase.clientEmail) missing.push('FIREBASE_CLIENT_EMAIL')
  if (!env.firebase.privateKey) missing.push('FIREBASE_PRIVATE_KEY')

  if (missing.length) {
    throw new Error(`Firebase Admin is not configured. Missing: ${missing.join(', ')}`)
  }

  if (!env.firebase.privateKey.includes('-----BEGIN PRIVATE KEY-----') || !env.firebase.privateKey.includes('-----END PRIVATE KEY-----')) {
    throw new Error('FIREBASE_PRIVATE_KEY is malformed. Copy private_key from the Firebase service account JSON and keep \\n line breaks.')
  }
}

function getFirebaseCredential() {
  if (env.firebase.serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(env.firebase.serviceAccountJson)
      if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
        throw new Error('Service account JSON must include project_id, client_email, and private_key.')
      }
      return cert(serviceAccount)
    } catch (error) {
      console.error('FIREBASE_SERVICE_ACCOUNT_JSON could not be parsed. Keep it on one line or use FIREBASE_PRIVATE_KEY fields.')
      throw error
    }
  }

  assertFirebaseAdminConfig()

  if (env.firebase.projectId && env.firebase.clientEmail && env.firebase.privateKey) {
    return cert({
      projectId: env.firebase.projectId,
      clientEmail: env.firebase.clientEmail,
      privateKey: env.firebase.privateKey,
    })
  }

  return null
}

export function getFirebaseApp() {
  if (firebaseApp) return firebaseApp

  const apps = getApps()
  if (apps.length) {
    firebaseApp = apps[0]
    return firebaseApp
  }

  const credential = getFirebaseCredential()
  firebaseApp = initializeApp({
    credential,
    projectId: env.firebase.projectId,
  })
  return firebaseApp
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp())
}

export async function createOrUpdateFirebaseUser({ email, password, fullName, phone, disabled = false }) {
  const auth = getFirebaseAuth()
  const phoneNumber = phone?.startsWith('+') ? phone : undefined
  try {
    return await auth.createUser({
      email,
      password,
      displayName: fullName,
      phoneNumber,
      disabled,
      emailVerified: false,
    })
  } catch (error) {
    if (error.code !== 'auth/email-already-exists') throw error
    const existing = await auth.getUserByEmail(email)
    await auth.updateUser(existing.uid, {
      displayName: fullName,
      phoneNumber,
      disabled,
      ...(password ? { password } : {}),
    })
    return auth.getUser(existing.uid)
  }
}

export async function deleteFirebaseUser(firebaseUid) {
  if (!firebaseUid) return
  try {
    await getFirebaseAuth().deleteUser(firebaseUid)
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error
  }
}
