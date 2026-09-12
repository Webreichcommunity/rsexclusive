import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'

export function StayDateRangePicker({
  checkIn,
  checkOut,
  onCheckInChange,
  onCheckOutChange,
  onRangeChange,
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const [activeField, setActiveField] = useState('checkIn')
  const selectedCheckIn = parseDateValue(checkIn)
  const selectedCheckOut = parseDateValue(checkOut)
  const current = selectedCheckIn || new Date()
  const [viewDate, setViewDate] = useState(new Date(current.getFullYear(), current.getMonth(), 1))
  const months = useMemo(() => [viewDate, addMonths(viewDate, 1), addMonths(viewDate, 2)], [viewDate])
  const minCheckIn = startOfDay(new Date())
  const minCheckOut = selectedCheckIn ? addDaysToDate(selectedCheckIn, 1) : addDaysToDate(new Date(), 1)
  const todayValue = toDateValue(new Date())
  const nights = selectedCheckIn && selectedCheckOut ? Math.max(0, Math.round((startOfDay(selectedCheckOut) - startOfDay(selectedCheckIn)) / 86_400_000)) : 0

  function openPicker(field) {
    setActiveField(field)
    setOpen(true)
  }

  function selectDay(day) {
    if (!day) return
    if (activeField === 'checkIn') {
      if (startOfDay(day) < minCheckIn) return
      const nextCheckIn = toDateValue(day)
      const nextCheckOut = selectedCheckOut && startOfDay(selectedCheckOut) > startOfDay(day)
        ? checkOut
        : toDateValue(addDaysToDate(day, 1))
      if (onRangeChange) onRangeChange(nextCheckIn, nextCheckOut)
      else {
        onCheckInChange(nextCheckIn)
        if (nextCheckOut !== checkOut) onCheckOutChange(nextCheckOut)
      }
      setActiveField('checkOut')
      return
    }

    if (startOfDay(day) < startOfDay(minCheckOut)) return
    const nextCheckOut = toDateValue(day)
    if (onRangeChange) onRangeChange(checkIn, nextCheckOut)
    else onCheckOutChange(nextCheckOut)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

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
            const dayValue = day ? toDateValue(day) : ''
            const disabled = !day || (activeField === 'checkIn' ? startOfDay(day) < minCheckIn : startOfDay(day) < startOfDay(minCheckOut))
            const isCheckIn = dayValue === checkIn
            const isCheckOut = dayValue === checkOut
            const inRange = day && selectedCheckIn && selectedCheckOut && startOfDay(day) > startOfDay(selectedCheckIn) && startOfDay(day) < startOfDay(selectedCheckOut)
            const today = dayValue === todayValue
            const dateLabel = isCheckIn ? 'Check-in' : isCheckOut ? 'Check-out' : ''
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

  return (
    <div className={`relative min-w-0 ${className}`}>
      <div className="grid grid-cols-2 gap-3">
        <DateButton label="Check-in" value={checkIn} active={open && activeField === 'checkIn'} onClick={() => openPicker('checkIn')} />
        <DateButton label="Check-out" value={checkOut} active={open && activeField === 'checkOut'} onClick={() => openPicker('checkOut')} />
      </div>
      {open ? (
        <>
          <button type="button" className="booking-calendar-scrim" onClick={() => setOpen(false)} aria-label="Close calendar" />
          <motion.div
            className="booking-calendar-panel z-[80] border border-mist bg-white text-charcoal shadow-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Select stay dates"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18 }}
          >
            <div className="sticky top-0 z-10 border-b border-mist bg-white/96 p-3 backdrop-blur-xl sm:static sm:rounded-t-lg">
            <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3">
              <button type="button" className="calendar-nav" onClick={() => setViewDate(addMonths(viewDate, -1))} aria-label="Previous month"><ChevronLeft size={17} /></button>
              <div className="grid min-w-0 grid-cols-2 gap-2 text-center">
                <button type="button" className={`rounded-md px-2 py-2 ${activeField === 'checkIn' ? 'bg-amber-50 text-amberline ring-1 ring-amberline/20' : 'bg-bone text-charcoal'}`} onClick={() => setActiveField('checkIn')}>
                  <span className="block text-[0.62rem] font-black uppercase tracking-[0.12em]">Check-in</span>
                  <span className="mt-1 block truncate text-sm font-black">{formatDateLabel(checkIn)}</span>
                </button>
                <button type="button" className={`rounded-md px-2 py-2 ${activeField === 'checkOut' ? 'bg-amber-50 text-amberline ring-1 ring-amberline/20' : 'bg-bone text-charcoal'}`} onClick={() => setActiveField('checkOut')}>
                  <span className="block text-[0.62rem] font-black uppercase tracking-[0.12em]">Check-out</span>
                  <span className="mt-1 block truncate text-sm font-black">{formatDateLabel(checkOut)}</span>
                </button>
              </div>
              <button type="button" className="calendar-nav" onClick={() => setViewDate(addMonths(viewDate, 1))} aria-label="Next month"><ChevronRight size={17} /></button>
              <button type="button" className="calendar-nav" onClick={() => setOpen(false)} aria-label="Close calendar"><X size={17} /></button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-stone-500">
              <span>{activeField === 'checkIn' ? 'Select your arrival date.' : 'Select your checkout date.'}</span>
              {nights ? <span className="rounded-md bg-charcoal px-2 py-1 text-white">{nights} night{nights === 1 ? '' : 's'}</span> : null}
            </div>
            </div>
            <div className="grid gap-5 p-4 sm:grid-cols-2 sm:p-5">
              {months.map((month, index) => <div key={month.toISOString()}>{renderMonth(month, index)}</div>)}
            </div>
          </motion.div>
        </>
      ) : null}
    </div>
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
