import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'

export function StayDateRangePicker({
  checkIn,
  checkOut,
  onCheckInChange,
  onCheckOutChange,
  onRangeChange,
  onRangeComplete,
  selectionDelayMs = 2000,
  startLabel = 'Check-in',
  endLabel = 'Check-out',
  dialogLabel = 'Select stay dates',
  inclusiveRange = false,
  rangeUnit = 'night',
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const [activeField, setActiveField] = useState('checkIn')
  const selectionTimer = useRef(null)
  const selectedCheckIn = parseDateValue(checkIn)
  const selectedCheckOut = parseDateValue(checkOut)
  const current = selectedCheckIn || new Date()
  const [viewDate, setViewDate] = useState(new Date(current.getFullYear(), current.getMonth(), 1))
  const months = useMemo(() => [viewDate, addMonths(viewDate, 1), addMonths(viewDate, 2)], [viewDate])
  const minCheckIn = startOfDay(new Date())
  const minCheckOut = selectedCheckIn ? addDaysToDate(selectedCheckIn, inclusiveRange ? 0 : 1) : addDaysToDate(new Date(), inclusiveRange ? 0 : 1)
  const todayValue = toDateValue(new Date())
  const rangeCount = selectedCheckIn && selectedCheckOut
    ? Math.max(0, Math.round((startOfDay(selectedCheckOut) - startOfDay(selectedCheckIn)) / 86_400_000) + (inclusiveRange ? 1 : 0))
    : 0

  function openPicker(field) {
    window.clearTimeout(selectionTimer.current)
    setActiveField(field === 'checkOut' && !selectedCheckIn ? 'checkIn' : field)
    setOpen(true)
  }

  function selectDay(day) {
    if (!day) return
    window.clearTimeout(selectionTimer.current)
    if (activeField === 'checkIn') {
      if (startOfDay(day) < minCheckIn) return
      const nextCheckIn = toDateValue(day)
      const nextCheckOut = selectedCheckOut && startOfDay(selectedCheckOut) > startOfDay(day)
        ? checkOut
        : ''
      if (onRangeChange) onRangeChange(nextCheckIn, nextCheckOut)
      else {
        onCheckInChange(nextCheckIn)
        if (nextCheckOut !== checkOut) onCheckOutChange(nextCheckOut)
      }
      setActiveField('checkOut')
      return
    }

    if (!selectedCheckIn) {
      setActiveField('checkIn')
      return
    }
    if (startOfDay(day) < startOfDay(minCheckOut)) return
    const nextCheckOut = toDateValue(day)
    if (onRangeChange) onRangeChange(checkIn, nextCheckOut)
    else onCheckOutChange(nextCheckOut)
    window.clearTimeout(selectionTimer.current)
    selectionTimer.current = window.setTimeout(() => {
      setOpen(false)
      onRangeComplete?.(checkIn, nextCheckOut)
    }, selectionDelayMs)
  }

  function closePicker() {
    window.clearTimeout(selectionTimer.current)
    setOpen(false)
  }

  function clearDates() {
    window.clearTimeout(selectionTimer.current)
    if (onRangeChange) onRangeChange('', '')
    else {
      onCheckInChange('')
      onCheckOutChange('')
    }
    setActiveField('checkIn')
  }

  function finishSelection() {
    window.clearTimeout(selectionTimer.current)
    setOpen(false)
    if (checkIn && checkOut) onRangeComplete?.(checkIn, checkOut)
  }

  useEffect(() => {
    if (!open) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => () => window.clearTimeout(selectionTimer.current), [])

  function renderMonth(monthDate, monthIndex) {
    const days = calendarDays(monthDate)
    return (
      <section className={`min-w-0 ${monthIndex > 1 ? 'sm:hidden' : ''}`}>
        <p className="mb-3 text-center text-lg font-black text-charcoal">
          {monthDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
        </p>
        <div className="grid grid-cols-7 text-center text-[0.68rem] font-black uppercase text-stone-400">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={`${monthDate.toISOString()}-${day}`} className="py-2">{day}</span>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, index) => {
            if (!day) {
              return <span key={`empty-${monthDate.toISOString()}-${index}`} className="booking-calendar-empty" aria-hidden="true" />
            }
            const dayValue = day ? toDateValue(day) : ''
            const disabled = !day || (activeField === 'checkIn' ? startOfDay(day) < minCheckIn : startOfDay(day) < startOfDay(minCheckOut))
            const isCheckIn = Boolean(day && checkIn && dayValue === checkIn)
            const isCheckOut = Boolean(day && checkOut && dayValue === checkOut)
            const inRange = day && selectedCheckIn && selectedCheckOut && startOfDay(day) > startOfDay(selectedCheckIn) && startOfDay(day) < startOfDay(selectedCheckOut)
            const today = dayValue === todayValue
            const dateLabel = isCheckIn ? startLabel : isCheckOut ? endLabel : ''
            return (
              <button
                key={dayValue || `empty-${monthDate.toISOString()}-${index}`}
                type="button"
                disabled={disabled}
                onClick={() => selectDay(day)}
                className={`calendar-day booking-calendar-day ${isCheckIn || isCheckOut ? 'calendar-day-active booking-calendar-day-active' : ''} ${isCheckIn ? 'booking-calendar-day-start' : ''} ${isCheckOut ? 'booking-calendar-day-end' : ''} ${inRange ? 'booking-calendar-day-range' : ''} ${today && !isCheckIn && !isCheckOut ? 'booking-calendar-day-today' : ''}`}
              >
                {day ? (
                  <>
                    <span className="leading-none">{day.getDate()}</span>
                    {dateLabel ? <span className="mt-1 text-[0.48rem] font-black uppercase leading-none tracking-normal">{dateLabel}</span> : null}
                  </>
                ) : ''}
              </button>
            )
          })}
        </div>
      </section>
    )
  }

  const calendarOverlay = open && typeof document !== 'undefined'
    ? createPortal(
      <>
        <button type="button" className="booking-calendar-scrim" onClick={closePicker} aria-label="Close calendar" />
        <div className="booking-calendar-layer">
          <motion.div
            className="booking-calendar-panel border border-mist bg-white text-charcoal shadow-panel"
            role="dialog"
            aria-modal="true"
            aria-label={dialogLabel}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.18 }}
          >
            <div className="sticky top-0 z-10 border-b border-mist bg-white/96 p-3 backdrop-blur-xl sm:rounded-t-lg sm:p-4">
              <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 sm:gap-3">
                <button type="button" className="calendar-nav" onClick={() => setViewDate(addMonths(viewDate, -1))} aria-label="Previous month"><ChevronLeft size={17} /></button>
                <div className="booking-calendar-summary">
                  <CalendarSummaryButton active={activeField === 'checkIn'} label={startLabel} value={checkIn} onClick={() => setActiveField('checkIn')} />
                  <CalendarSummaryButton active={activeField === 'checkOut'} label={endLabel} value={checkOut} onClick={() => setActiveField('checkOut')} />
                </div>
                <button type="button" className="calendar-nav" onClick={() => setViewDate(addMonths(viewDate, 1))} aria-label="Next month"><ChevronRight size={17} /></button>
                <button type="button" className="calendar-nav" onClick={closePicker} aria-label="Close calendar"><X size={17} /></button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-stone-500">
                <span>{activeField === 'checkIn' ? `Select ${startLabel.toLowerCase()} date.` : selectedCheckIn ? `Select ${endLabel.toLowerCase()} date.` : `Select ${startLabel.toLowerCase()} first.`}</span>
                {rangeCount ? <span className="rounded-md bg-charcoal px-2 py-1 text-white">{rangeCount} {rangeUnit}{rangeCount === 1 ? '' : 's'}</span> : null}
              </div>
            </div>
            <div className="booking-calendar-months">
              {months.map((month, index) => <div key={month.toISOString()}>{renderMonth(month, index)}</div>)}
            </div>
            <div className="booking-calendar-footer">
              <button type="button" className="btn-secondary !min-h-10 !px-4" onClick={clearDates}>Clear</button>
              <button type="button" className="btn-primary !min-h-10 !px-5" onClick={finishSelection} disabled={!checkIn || !checkOut}>
                {checkIn && checkOut ? 'Done' : activeField === 'checkIn' ? `Select ${startLabel.toLowerCase()}` : `Select ${endLabel.toLowerCase()}`}
              </button>
            </div>
          </motion.div>
        </div>
      </>,
      document.body,
    )
    : null

  return (
    <div className={`relative min-w-0 ${className}`}>
      <div className="grid grid-cols-2 gap-3">
        <DateButton label={startLabel} value={checkIn} active={open && activeField === 'checkIn'} onClick={() => openPicker('checkIn')} />
        <DateButton label={endLabel} value={checkOut} active={open && activeField === 'checkOut'} onClick={() => openPicker('checkOut')} />
      </div>
      {calendarOverlay}
    </div>
  )
}

function CalendarSummaryButton({ active, label, value, onClick }) {
  return (
    <button type="button" className={`booking-calendar-summary-button ${active ? 'booking-calendar-summary-button-active' : ''}`} onClick={onClick}>
      <span>{label}</span>
      <strong>{formatDateLabel(value)}</strong>
    </button>
  )
}

function DateButton({ label, value, active, onClick }) {
  return (
    <label className="min-w-0">
      <span className="label">{label}</span>
      <button type="button" className={`date-button ${active ? '!border-amberline !bg-amber-50 ring-2 ring-amberline/15' : ''}`} onClick={onClick}>
        <CalendarDays size={18} className="text-amberline" />
        <span className="min-w-0 truncate">{formatDateLabel(value)}</span>
      </button>
    </label>
  )
}

function formatDateLabel(value) {
  const date = parseDateValue(value)
  if (!date) return 'Select date'
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function calendarDays(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1)
  const total = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const days = Array.from({ length: (first.getDay() + 6) % 7 }, () => null)
  for (let day = 1; day <= total; day += 1) days.push(new Date(date.getFullYear(), date.getMonth(), day))
  return days
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function addDaysToDate(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  next.setDate(next.getDate() + days)
  return next
}

function parseDateValue(value) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function toDateValue(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
