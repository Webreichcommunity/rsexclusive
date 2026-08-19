import { useEffect, useRef, useState } from 'react'

export function useAsync(factory, dependencyKey = 'default') {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const factoryRef = useRef(factory)
  factoryRef.current = factory

  useEffect(() => {
    let active = true
    setState((current) => ({ ...current, loading: true, error: null }))
    factoryRef.current()
      .then((data) => {
        if (active) setState({ loading: false, data, error: null })
      })
      .catch((error) => {
        if (active) setState({ loading: false, data: null, error })
      })
    return () => {
      active = false
    }
  }, [dependencyKey])

  return state
}
