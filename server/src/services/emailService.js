import { Resend } from 'resend'
import { env } from '../config/env.js'

let resend

function getResend() {
  if (!env.email.resendApiKey) return null
  if (!resend) resend = new Resend(env.email.resendApiKey)
  return resend
}

export async function sendBookingConfirmation({ hotel, room, booking, invoice, pdfPath, hotelAdminEmails = [] }) {
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
  const roomName = room?.name || booking.room_type_name || 'Selected room'
  const bookingTime = formatDateTime(booking.confirmed_at || booking.created_at || invoice.issued_at || new Date())
  const checkIn = formatDate(booking.check_in)
  const checkOut = formatDate(booking.check_out)
  const detailsHtml = `
        <p><strong>Booking:</strong> ${booking.booking_reference}</p>
        <p><strong>Booking time:</strong> ${bookingTime}</p>
        <p><strong>Room:</strong> ${roomName}</p>
        <p><strong>Guest:</strong> ${booking.guest_name}<br/><strong>Email:</strong> ${booking.guest_email}<br/><strong>Phone:</strong> ${booking.guest_phone || '-'}</p>
        <p><strong>Check-in:</strong> ${checkIn}<br/><strong>Check-out:</strong> ${checkOut}<br/><strong>Nights:</strong> ${booking.nights}</p>
        <p><strong>Occupancy:</strong> ${booking.adults} adult${Number(booking.adults) === 1 ? '' : 's'}, ${booking.children || 0} child${Number(booking.children) === 1 ? '' : 'ren'} / ${booking.rooms_count} room${Number(booking.rooms_count) === 1 ? '' : 's'}</p>
        <p><strong>Total:</strong> ${booking.currency} ${Number(booking.total_amount || 0).toLocaleString('en-IN')}</p>
        <p><strong>Paid now:</strong> ${booking.currency} ${Number(paidNow).toLocaleString('en-IN')}<br/><strong>Balance due:</strong> ${booking.currency} ${Number(balanceDue).toLocaleString('en-IN')}</p>
        ${booking.metadata?.offer?.title ? `<p><strong>Offer applied:</strong> ${booking.metadata.offer.title}</p>` : ''}
        ${booking.metadata?.selectedAmenities?.length ? `<p><strong>Amenities:</strong> ${booking.metadata.selectedAmenities.map((amenity) => amenity.name).join(', ')}</p>` : ''}
        ${loyalty?.points ? `<p><strong>Group loyalty redeemed:</strong> ${loyalty.points} points (${booking.currency} ${Number(loyalty.amount || 0).toLocaleString('en-IN')})</p>` : ''}
  `
  const attachments = [
    {
      filename: `${invoice.invoice_number}.pdf`,
      content: pdf,
    },
  ]
  const recipients = [
    {
      kind: 'guest',
      to: booking.guest_email,
      subject: `${hotel.name} booking confirmed: ${booking.booking_reference}`,
      html: bookingEmailHtml({
        hotelName: hotel.name,
        title: 'Your stay is confirmed',
        intro: `Your booking was confirmed at ${bookingTime}. The billing PDF is attached for your records.`,
        detailsHtml,
        footer: 'Please keep the attached invoice PDF for check-in and billing reference.',
      }),
    },
    ...hotelEmailRecipients(hotel, booking.guest_email, hotelAdminEmails).map((email) => ({
      kind: 'hotel',
      to: email,
      subject: `${hotel.name} new booking alert: ${booking.booking_reference}`,
      html: bookingEmailHtml({
        hotelName: hotel.name,
        title: 'New booking alert',
        intro: `A guest booking was confirmed at ${bookingTime}. The same invoice PDF sent to the guest is attached.`,
        detailsHtml,
        footer: 'Please review the guest details, arrival dates, payment status, and attached invoice PDF.',
      }),
    })),
  ]

  try {
    const results = []
    for (const recipient of recipients) {
      const result = await client.emails.send({
        from: env.email.from,
        to: recipient.to,
        subject: recipient.subject,
        html: recipient.html,
        attachments,
      })
      results.push({ ...result, to: recipient.to, kind: recipient.kind })
      if (result.error) {
        console.error({
          message: 'Resend booking email failed',
          bookingReference: booking.booking_reference,
          to: recipient.to,
          kind: recipient.kind,
          from: env.email.from,
          error: result.error,
          hint: senderHint(env.email.from),
        })
      } else {
        console.info({
          message: 'Booking confirmation email sent',
          bookingReference: booking.booking_reference,
          emailId: result.data?.id,
          to: recipient.to,
          kind: recipient.kind,
        })
      }
    }
    return { data: results }
  } catch (error) {
    console.error({
      message: 'Resend booking email threw an exception',
      bookingReference: booking.booking_reference,
      to: recipients.map((recipient) => recipient.to),
      from: env.email.from,
      error: error.message,
      hint: senderHint(env.email.from),
    })
    throw error
  }
}

function bookingEmailHtml({ hotelName, title, intro, detailsHtml, footer }) {
  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#23211f;max-width:640px;margin:0 auto">
      <div style="background:#171412;color:#fff;padding:24px;border-radius:14px 14px 0 0">
        <h1 style="font-size:24px;margin:0">${hotelName}</h1>
        <p style="margin:8px 0 0;color:#f8d98c;font-weight:700">${title}</p>
        <p style="margin:8px 0 0;color:#d8d1c8">${intro}</p>
      </div>
      <div style="border:1px solid #e7dfd4;border-top:0;padding:24px;border-radius:0 0 14px 14px">
        ${detailsHtml}
        <p style="color:#706b64;font-size:13px">${footer}</p>
      </div>
    </div>
  `
}

function hotelEmailRecipients(hotel, guestEmail, hotelAdminEmails = []) {
  const contact = hotel?.contact || {}
  const candidates = [
    ...hotelAdminEmails,
    contact.email,
    contact.managerEmail,
    contact.adminEmail,
    ...(Array.isArray(contact.emails) ? contact.emails : []),
    hotel?.email,
    hotel?.admin_email,
  ]
  const guest = String(guestEmail || '').trim().toLowerCase()
  return [...new Set(
    candidates
      .map((email) => String(email || '').trim())
      .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      .filter((email) => email.toLowerCase() !== guest),
  )]
}

function formatDate(value) {
  if (!value) return 'TBA'
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(value))
}

function formatDateTime(value) {
  if (!value) return 'Not recorded'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
    timeZoneName: 'short',
  }).format(new Date(value))
}

function senderHint(from) {
  const value = String(from || '').toLowerCase()
  if (/@(gmail|yahoo|outlook|hotmail)\./.test(value)) {
    return 'Resend requires a verified sending domain. Use a verified domain sender such as bookings@yourdomain.com, not a Gmail/Yahoo/Outlook address.'
  }
  return 'Check that EMAIL_FROM belongs to a verified Resend domain and that RESEND_API_KEY is from the same Resend account.'
}
