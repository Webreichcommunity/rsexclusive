export function LoadingState({ label = 'Loading', brand }) {
  const displayBrand = brand || getLoadingBrand()

  return (
    <div className="container-page grid min-h-[58vh] place-items-center py-12">
      <div className="relative w-full max-w-md overflow-hidden rounded-lg border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(250,247,241,0.9),rgba(127,29,29,0.08))] p-7 text-center shadow-panel backdrop-blur-xl">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amberline via-yellow-600/60 to-charcoal" />
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-lg bg-charcoal text-white shadow-soft">
          <span className="text-2xl font-black">R</span>
        </div>
        <div className="mt-6">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-amberline">{displayBrand}</p>
          <p className="mt-2 text-2xl font-black text-charcoal">{label}</p>
        </div>
        <div className="mx-auto mt-6 flex w-44 items-center justify-center gap-2">
          {[0, 1, 2].map((item) => (
            <span
              key={item}
              className="h-2.5 w-2.5 animate-pulse rounded-full bg-amberline"
              style={{ animationDelay: `${item * 180}ms` }}
            />
          ))}
        </div>
        <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-stone-200">
          <div className="h-full w-1/2 animate-[loading-slide_1.35s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-wine via-amberline to-charcoal" />
        </div>
      </div>
    </div>
  )
}

function getLoadingBrand() {
  if (typeof window === 'undefined') return 'R.S. Exclusive'
  const params = new URLSearchParams(window.location.search)
  const tenant = params.get('hotel') || safeLocalStorage('rs-exclusive-local-tenant')
  return tenant ? toTitle(tenant) : 'R.S. Exclusive'
}

function safeLocalStorage(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return ''
  }
}

function toTitle(value) {
  return String(value || '')
    .split(/[-_\s.]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
