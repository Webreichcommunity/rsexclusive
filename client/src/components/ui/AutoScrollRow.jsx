import { useEffect, useRef, useState } from 'react'

export function AutoScrollRow({ children, className = '', interval = 1000, step = 340, ariaLabel }) {
  const rowRef = useRef(null)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const row = rowRef.current
    if (!row || paused) return undefined

    const timer = window.setInterval(() => {
      if (!row.scrollWidth || row.scrollWidth <= row.clientWidth) return
      const maxScroll = row.scrollWidth - row.clientWidth - 8
      const nextLeft = row.scrollLeft >= maxScroll ? 0 : row.scrollLeft + step
      row.scrollTo({ left: nextLeft, behavior: 'smooth' })
    }, interval)

    return () => window.clearInterval(timer)
  }, [interval, paused, step])

  return (
    <div
      ref={rowRef}
      className={`auto-scroll-row flex snap-x gap-4 overflow-x-auto pb-4 ${className}`}
      aria-label={ariaLabel}
      tabIndex={0}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onPointerDown={() => setPaused(true)}
      onPointerUp={() => setPaused(false)}
    >
      {children}
    </div>
  )
}
