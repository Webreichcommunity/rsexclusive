import { useEffect, useMemo, useState } from 'react'
import { AuthContext } from './authContext.js'
import { observeAuth } from './firebaseClient.js'

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    let cleanup = () => {}

    observeAuth((user) => {
      if (!active) return
      setFirebaseUser(user)
      setLoading(false)
    })
      .then((unsubscribe) => {
        if (active) cleanup = unsubscribe
        else unsubscribe()
      })
      .catch(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      cleanup()
    }
  }, [])

  const value = useMemo(() => ({ firebaseUser, loading, isAuthenticated: Boolean(firebaseUser) }), [firebaseUser, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
