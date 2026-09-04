import { Resend } from 'resend'
import { env } from '../config/env.js'

let resend

function getResend() {
  if (!env.email.resendApiKey) return null
  if (!resend) resend = new Resend(env.email.resendApiKey)
  return resend
}

export async function sendBookingConfirmation({ hotel, booking, invoice, pdfPath }) {
  const client = getResend()
  if (!client) {
    console.info(`Email skipped for ${booking.booking_reference}; RESEND_API_KEY not configured`)
    return { skipped: true }
  }

  const pdf = await import('node:fs/promises').then((fs) => fs.readFile(pdfPath))
  const paymentPlan = booking.metadata?.paymentPlan || {}
  const loyalty = booking.metadata?.loyaltyRedemption
  const paidNow = paymentPlan.paidAmount ?? booking.total_amount ?? 0
  const balanceDue = paymentPlan.balanceDue ?? 0
  return client.emails.send({
    from: env.email.from,
    to: booking.guest_email,
    subject: `${hotel.name} booking confirmed: ${booking.booking_reference}`,
    html: `
      <div style="font-family:Inter,Arial,sans-serif;color:#23211f">
        <h1 style="font-size:22px">${hotel.name}</h1>
        <p>Your stay is confirmed. We look forward to welcoming you.</p>
        <p><strong>Booking:</strong> ${booking.booking_reference}</p>
        <p><strong>Check-in:</strong> ${booking.check_in}<br/><strong>Check-out:</strong> ${booking.check_out}</p>
        <p><strong>Total:</strong> ${booking.currency} ${Number(booking.total_amount || 0).toLocaleString('en-IN')}</p>
        <p><strong>Paid now:</strong> ${booking.currency} ${Number(paidNow).toLocaleString('en-IN')}<br/><strong>Balance due:</strong> ${booking.currency} ${Number(balanceDue).toLocaleString('en-IN')}</p>
        ${loyalty?.points ? `<p><strong>Loyalty redeemed:</strong> ${loyalty.points} points (${booking.currency} ${Number(loyalty.amount || 0).toLocaleString('en-IN')})</p>` : ''}
        <p>Your detailed billing PDF is attached.</p>
      </div>
    `,
    attachments: [
      {
        filename: `${invoice.invoice_number}.pdf`,
        content: pdf,
      },
    ],
  })
}
