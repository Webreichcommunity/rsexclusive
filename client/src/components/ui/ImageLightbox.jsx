import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect } from 'react'

export function ImageLightbox({ images, index, title, fallbackImage, onIndex, onClose }) {
  const canUseDocument = typeof document !== 'undefined'
  const safeImages = images?.length ? images : [{ url: fallbackImage, alt: title }]
  const safeIndex = Math.min(Math.max(0, Number(index || 0)), safeImages.length - 1)
  const current = safeImages[safeIndex] || safeImages[0]

  useEffect(() => {
    if (!canUseDocument) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [canUseDocument, onClose])

  if (!canUseDocument) return null

  return createPortal(
    <div className="fixed inset-0 z-[999] grid min-h-[100svh] place-items-center bg-black/92 p-3 backdrop-blur-sm sm:p-5" onMouseDown={onClose}>
      <div className="relative flex h-[calc(100svh-1.5rem)] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-white/15 bg-black shadow-2xl sm:h-[calc(100svh-2.5rem)]" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-white/10 bg-white/8 px-3 text-white backdrop-blur-xl sm:px-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold">{title}</p>
            <p className="text-xs font-semibold text-white/60">{safeIndex + 1} of {safeImages.length}</p>
          </div>
          <button type="button" className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/15 bg-white/10 text-white transition hover:bg-white/20" onClick={onClose} aria-label="Close image">
            <X size={20} />
          </button>
        </div>
        <div className="relative min-h-0 flex-1">
          <img src={current?.url || fallbackImage} alt={current?.alt || title} className="absolute inset-0 h-full w-full object-contain" />
          {safeImages.length > 1 ? (
            <>
              <button type="button" className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-md border border-white/15 bg-black/45 text-white backdrop-blur-xl transition hover:bg-black/65 sm:left-4" onClick={() => onIndex((safeIndex - 1 + safeImages.length) % safeImages.length)} aria-label="Previous image">
                <ChevronLeft size={24} />
              </button>
              <button type="button" className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-md border border-white/15 bg-black/45 text-white backdrop-blur-xl transition hover:bg-black/65 sm:right-4" onClick={() => onIndex((safeIndex + 1) % safeImages.length)} aria-label="Next image">
                <ChevronRight size={24} />
              </button>
            </>
          ) : null}
        </div>
        {safeImages.length > 1 ? (
          <div className="flex min-h-16 gap-2 overflow-x-auto border-t border-white/10 bg-white/8 p-2">
            {safeImages.map((image, imageIndex) => (
              <button key={`${image.url}-${imageIndex}`} type="button" className={`h-12 w-16 shrink-0 overflow-hidden rounded-md border ${imageIndex === safeIndex ? 'border-amberline ring-2 ring-amberline/25' : 'border-white/15'}`} onClick={() => onIndex(imageIndex)} aria-label={`Open image ${imageIndex + 1}`}>
                <img src={image.url || fallbackImage} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
