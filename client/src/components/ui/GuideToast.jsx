import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Info } from 'lucide-react'

const toneStyles = {
  warning: {
    wrap: 'border-amber-200/80 bg-[linear-gradient(135deg,rgba(255,251,235,0.96),rgba(255,255,255,0.82),rgba(254,243,199,0.9))] text-amber-950',
    icon: 'bg-amber-100 text-amber-700',
    Icon: AlertCircle,
  },
  success: {
    wrap: 'border-emerald-200/80 bg-[linear-gradient(135deg,rgba(236,253,245,0.96),rgba(255,255,255,0.84),rgba(209,250,229,0.9))] text-emerald-950',
    icon: 'bg-emerald-100 text-emerald-700',
    Icon: CheckCircle2,
  },
  info: {
    wrap: 'border-sky-200/80 bg-[linear-gradient(135deg,rgba(240,249,255,0.96),rgba(255,255,255,0.84),rgba(224,242,254,0.9))] text-sky-950',
    icon: 'bg-sky-100 text-sky-700',
    Icon: Info,
  },
}

export function GuideToast({ toast, className = '' }) {
  const tone = toneStyles[toast?.tone] || toneStyles.warning
  const Icon = tone.Icon

  return (
    <div className={`pointer-events-none fixed inset-x-4 top-5 z-[140] flex justify-center sm:inset-x-auto sm:right-5 sm:justify-end ${className}`}>
      <AnimatePresence>
        {toast ? (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96 }}
            transition={{ duration: 0.22 }}
            className={`w-full max-w-sm rounded-lg border p-4 shadow-panel backdrop-blur-2xl ${tone.wrap}`}
            role="status"
          >
            <div className="flex items-start gap-3">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${tone.icon}`}>
                <Icon size={18} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-black leading-5">{toast.title}</span>
                {toast.message ? <span className="mt-1 block text-xs font-semibold leading-5 opacity-80">{toast.message}</span> : null}
              </span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
