const tones = {
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  payment_pending: 'bg-rose-50 text-amberline border-rose-100',
  cancelled: 'bg-stone-100 text-stone-600 border-stone-200',
  failed: 'bg-red-50 text-red-700 border-red-100',
  active: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  inactive: 'bg-stone-100 text-stone-600 border-stone-200',
}

export function StatusPill({ status }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${tones[status] || 'bg-bone text-stone-700 border-mist'}`}>
      {String(status || 'unknown').replace('_', ' ')}
    </span>
  )
}
