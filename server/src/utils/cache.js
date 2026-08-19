const store = new Map()

export function createCache(ttlMs) {
  return {
    get(key) {
      const entry = store.get(key)
      if (!entry || entry.expiresAt < Date.now()) {
        store.delete(key)
        return null
      }
      return entry.value
    },
    set(key, value) {
      store.set(key, { value, expiresAt: Date.now() + ttlMs })
      return value
    },
    delete(key) {
      store.delete(key)
    },
  }
}
