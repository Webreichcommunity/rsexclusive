import { useAsync } from '../../hooks/useAsync.js'
import { apiFetch } from '../../services/apiClient.js'
import { useAuth } from './authContext.js'

export function useAppUser() {
  const { firebaseUser, isAuthenticated } = useAuth()
  return useAsync(
    () => (isAuthenticated ? apiFetch('/me') : Promise.resolve({ user: null })),
    isAuthenticated ? `app-user:${firebaseUser?.uid || 'unknown'}:${firebaseUser?.emailVerified ? 'verified' : 'unverified'}` : 'app-user-anonymous',
  )
}
