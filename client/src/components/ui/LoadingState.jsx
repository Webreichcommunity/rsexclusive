export function LoadingState({ label = 'Loading' }) {
  return (
    <div className="container-page grid min-h-[58vh] place-items-center py-12">
      <div className="w-full max-w-3xl">
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-48 animate-pulse rounded-lg border border-stone-200 bg-white p-3 shadow-soft">
              <div className="h-28 rounded-md bg-stone-100" />
              <div className="mt-5 h-4 w-2/3 rounded bg-stone-100" />
              <div className="mt-3 h-3 w-1/2 rounded bg-stone-100" />
            </div>
          ))}
        </div>
        <p className="mt-5 text-center text-xs font-extrabold uppercase tracking-[0.18em] text-stone-500">{label}</p>
      </div>
    </div>
  )
}
