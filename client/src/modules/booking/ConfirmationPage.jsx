import { Link, useLocation, useParams } from 'react-router-dom'
import { CheckCircle2, Download, ReceiptText } from 'lucide-react'
import { FadeIn, Stagger, StaggerItem } from '../../components/ui/Motion.jsx'
import { LoadingState } from '../../components/ui/LoadingState.jsx'
import { useAsync } from '../../hooks/useAsync.js'
import { apiFetch } from '../../services/apiClient.js'

export function ConfirmationPage() {
  const { bookingReference } = useParams()
  const { state } = useLocation()
  const fallback = useAsync(
    () => apiFetch(`/me/bookings/${bookingReference}`).catch((error) => {
      if (state?.booking) return { booking: state.booking }
      throw error
    }),
    bookingReference,
  )

  if (fallback.loading) return <LoadingState label="Loading booking confirmation" />

  const booking = fallback.data?.booking || state?.booking
  const paymentPlan = booking?.metadata?.paymentPlan || {}
  const paidAmount = paymentPlan.paidAmount ?? booking?.total_amount
  const balanceDue = paymentPlan.balanceDue ?? 0

  return (
    <main className="container-page grid min-h-[76vh] place-items-center py-12">
      <FadeIn viewport={false} as="section" className="w-full max-w-4xl overflow-hidden rounded-lg border border-stone-200 bg-white text-center shadow-panel">
        <div className="bg-charcoal px-6 py-10 text-white md:py-12">
          <CheckCircle2 className="mx-auto text-orange-200" size={52} />
          <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.22em] text-stone-400">Booking Confirmed</p>
          <h1 className="mt-3 text-5xl font-semibold leading-none md:text-6xl">Booking ID {bookingReference}</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/75">
            Your payment was verified by the backend. A confirmation email and receipt workflow has started.
          </p>
        </div>

        {fallback.error ? <p className="m-5 rounded-md bg-orange-50 p-3 text-sm font-semibold text-orange-700">{fallback.error.message}</p> : null}

        {booking ? (
          <Stagger className="grid gap-3 p-5 text-left text-sm sm:grid-cols-2">
            <Line label="Hotel" value={booking.hotel_name || 'R.S. Exclusive'} />
            <Line label="Room" value={booking.room_type_name || 'Selected room'} />
            <Line label="Check-in" value={booking.check_in} />
            <Line label="Check-out" value={booking.check_out} />
            <Line label="Booking total" value={`${booking.currency} ${Number(booking.total_amount).toLocaleString('en-IN')}`} />
            <Line label="Amount paid" value={`${booking.currency} ${Number(paidAmount).toLocaleString('en-IN')}`} />
            <Line label="Balance due" value={`${booking.currency} ${Number(balanceDue).toLocaleString('en-IN')}`} />
            <Line label="Payment status" value={booking.status === 'confirmed' ? 'Captured' : booking.status} />
          </Stagger>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-mist p-5 sm:flex-row sm:justify-center">
          <Link to="/account" className="btn-primary"><ReceiptText size={18} /> View booking</Link>
          {booking?.pdf_url ? (
            <a href={booking.pdf_url} className="btn-secondary"><Download size={18} /> Download receipt</a>
          ) : (
            <span className="btn-secondary pointer-events-none opacity-70"><Download size={18} /> Receipt preparing</span>
          )}
          <Link to="/" className="btn-secondary">Back to hotel</Link>
        </div>
      </FadeIn>
    </main>
  )
}

function Line({ label, value }) {
  return (
    <StaggerItem className="rounded-md bg-ivory p-4">
      <p className="text-xs font-bold uppercase text-stone-500">{label}</p>
      <p className="mt-1 font-extrabold text-charcoal">{value || '-'}</p>
    </StaggerItem>
  )
}
