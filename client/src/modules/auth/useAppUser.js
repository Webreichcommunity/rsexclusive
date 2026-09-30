import { useEffect, useState } from 'react'
import { apiFetch } from '../../services/apiClient.js'
import { useAuth } from './authContext.js'

export function useAppUser() {
  const { firebaseUser, isAuthenticated, loading: authLoading } = useAuth()
  const [state, setState] = useState({ loading: true, data: null, error: null })

  useEffect(() => {
    let active = true

    if (authLoading) {
      setState({ loading: true, data: null, error: null })
      return () => {
        active = false
      }
    }

    if (!isAuthenticated) {
      setState({ loading: false, data: { user: null }, error: null })
      return () => {
        active = false
      }
    }

    setState({ loading: true, data: null, error: null })
    apiFetch('/me')
      .then((data) => {
        if (active) setState({ loading: false, data, error: null })
      })
      .catch((error) => {
        if (active) setState({ loading: false, data: null, error })
      })

    return () => {
      active = false
    }
  }, [authLoading, isAuthenticated, firebaseUser?.uid, firebaseUser?.emailVerified])

  return state
}
