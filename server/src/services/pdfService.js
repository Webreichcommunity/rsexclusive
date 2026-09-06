import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'
import { env } from '../config/env.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const receiptDir = path.resolve(__dirname, '..', '..', 'receipts')

function money(currency, value) {
  return `${currency} ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(value) {
  if (!value) return 'TBA'
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

function line(doc, label, value, x, y, width = 230) {
  doc.fillColor('#706b64').fontSize(8).text(label.toUpperCase(), x, y, { width })
  doc.fillColor('#23211f').fontSize(10).text(String(value || '-'), x, y + 12, { width })
}

async function fetchImageBuffer(url) {
  if (!url) return null
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    return Buffer.from(await response.arrayBuffer())
  } catch {
    return null
  }
}

export async function generateBookingPdf({ hotel, room, booking, invoice }) {
  await fs.promises.mkdir(receiptDir, { recursive: true })
  const fileName = `${invoice.invoice_number}.pdf`
  const filePath = path.join(receiptDir, fileName)
  const logo = await fetchImageBuffer(hotel?.branding?.logoUrl)
  const metadata = booking.metadata || {}
  const pricing = metadata.pricing || {}
  const paymentPlan = metadata.paymentPlan || {}
  const selectedAmenities = Array.isArray(metadata.selectedAmenities) ? metadata.selectedAmenities : []
  const address = [hotel?.address?.line1, hotel?.address?.city, hotel?.address?.state, hotel?.address?.country].filter(Boolean).join(', ')

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 42, size: 'A4', bufferPages: true })
    const stream = fs.createWriteStream(filePath)
    stream.on('finish', resolve)
    stream.on('error', reject)
    doc.pipe(stream)

    doc.rect(0, 0, doc.page.width, 132).fill('#171412')
    if (logo) {
      try {
        doc.image(logo, 42, 32, { fit: [68, 58], align: 'left', valign: 'center' })
      } catch {
        doc.roundedRect(42, 36, 54, 54, 8).fill('#f59e0b')
        doc.fillColor('#ffffff').fontSize(18).text(initials(hotel?.name), 42, 53, { width: 54, align: 'center' })
      }
    } else {
      doc.roundedRect(42, 36, 54, 54, 8).fill('#f59e0b')
      doc.fillColor('#ffffff').fontSize(18).text(initials(hotel?.name), 42, 53, { width: 54, align: 'center' })
    }

    doc.fillColor('#ffffff').fontSize(22).text(hotel?.name || 'Hotel', 124, 34, { width: 290 })
    doc.fillColor('#c7bfb5').fontSize(9).text(address || 'Akola, Maharashtra, India', 124, 64, { width: 300 })
    doc.fillColor('#f8d98c').fontSize(11).text('Booking Confirmation & Tax Invoice', 124, 86)
    doc.roundedRect(430, 32, 122, 58, 8).fill('#ffffff')
    doc.fillColor('#706b64').fontSize(8).text('INVOICE', 444, 44)
    doc.fillColor('#23211f').fontSize(11).text(invoice.invoice_number, 444, 58, { width: 94 })
    doc.fillColor('#706b64').fontSize(8).text(formatDate(invoice.issued_at || new Date()), 444, 75)

    doc.fillColor('#23211f')
    doc.roundedRect(42, 156, 510, 86, 8).fillAndStroke('#fffaf0', '#eadfcb')
    line(doc, 'Booking reference', booking.booking_reference, 62, 176, 150)
    line(doc, 'Guest', booking.guest_name, 228, 176, 150)
    line(doc, 'Email', booking.guest_email, 388, 176, 142)
    line(doc, 'Status', booking.status, 62, 212, 150)
    line(doc, 'Phone', booking.guest_phone || '-', 228, 212, 150)
    line(doc, 'Hotel', hotel?.name || booking.hotel_name, 388, 212, 142)

    doc.roundedRect(42, 264, 245, 132, 8).stroke('#e5ded3')
    doc.fillColor('#23211f').fontSize(13).text('Stay Details', 62, 284)
    line(doc, 'Room', room?.name || booking.room_type_name, 62, 310, 200)
    line(doc, 'Check-in', formatDate(booking.check_in), 62, 348, 92)
    line(doc, 'Check-out', formatDate(booking.check_out), 162, 348, 92)
    line(doc, 'Nights', booking.nights, 62, 382, 92)
    line(doc, 'Rooms', booking.rooms_count, 162, 382, 92)

    doc.roundedRect(307, 264, 245, 132, 8).stroke('#e5ded3')
    doc.fillColor('#23211f').fontSize(13).text('Room Information', 327, 284)
    line(doc, 'Bed type', room?.bed_type || 'Premium bedding', 327, 310, 92)
    line(doc, 'Size', room?.size_sqft ? `${room.size_sqft} sq ft` : 'Spacious', 432, 310, 92)
    line(doc, 'Occupancy', `${room?.occupancy_adults || booking.adults} adults, ${room?.occupancy_children ?? booking.children} children`, 327, 348, 197)
    doc.fillColor('#706b64').fontSize(8).text('DESCRIPTION', 327, 382)
    doc.fillColor('#23211f').fontSize(9).text(room?.description || 'Room details as selected during booking.', 327, 394, { width: 198, height: 34 })

    let y = 426
    doc.fillColor('#23211f').fontSize(15).text('Billing Summary', 42, y)
    y += 24
    y = priceRow(doc, y, 'Room subtotal', money(booking.currency, pricing.roomSubtotal || booking.subtotal_amount))
    if (selectedAmenities.length) {
      y = priceRow(doc, y, 'Selected amenities', money(booking.currency, pricing.amenitySubtotal || 0))
      for (const amenity of selectedAmenities) {
        y = priceRow(doc, y, `  ${amenity.name}`, money(booking.currency, Number(amenity.price || 0) * Number(booking.rooms_count || 1)), true)
      }
    }
    if (metadata.offer?.discountAmount) y = priceRow(doc, y, `Offer: ${metadata.offer.title}`, `-${money(booking.currency, metadata.offer.discountAmount)}`)
    if (metadata.loyaltyRedemption?.amount) y = priceRow(doc, y, `Loyalty redemption (${metadata.loyaltyRedemption.points} points)`, `-${money(booking.currency, metadata.loyaltyRedemption.amount)}`)
    y = priceRow(doc, y, 'Taxable subtotal', money(booking.currency, booking.subtotal_amount))
    y = priceRow(doc, y, `Tax (${hotel?.tax_rate || 0}%)`, money(booking.currency, booking.tax_amount))
    doc.moveTo(42, y + 4).lineTo(552, y + 4).strokeColor('#ded7cc').stroke()
    y += 18
    doc.fillColor('#171412').fontSize(15).text('Booking Total', 42, y)
    doc.fontSize(15).text(money(booking.currency, booking.total_amount), 356, y, { width: 196, align: 'right' })
    y += 32
    y = priceRow(doc, y, 'Paid now', money(booking.currency, paymentPlan.paidAmount ?? booking.total_amount))
    y = priceRow(doc, y, 'Balance due at hotel', money(booking.currency, paymentPlan.balanceDue || 0))

    const policyY = Math.max(y + 26, 700)
    doc.roundedRect(42, policyY, 510, 62, 8).fillAndStroke('#f7f7f7', '#e5e0d8')
    doc.fillColor('#23211f').fontSize(11).text('Hotel Contact & Policy', 62, policyY + 14)
    doc.fillColor('#706b64').fontSize(9).text(`${hotel?.contact?.phone || ''} ${hotel?.contact?.email ? `/ ${hotel.contact.email}` : ''}`, 62, policyY + 32, { width: 460 })
    doc.text(hotel?.policies?.cancellation || 'Hotel cancellation and check-in policies apply.', 62, policyY + 46, { width: 460 })

    doc.fillColor('#8a8177').fontSize(8).text(`Generated for ${hotel?.name || 'hotel'} booking ${booking.booking_reference}.`, 42, 804, { width: 510, align: 'center' })
    doc.end()
  })

  return {
    filePath,
    publicUrl: `${env.receipts.publicBaseUrl}/${fileName}`,
  }
}

function priceRow(doc, y, label, value, muted = false) {
  doc.fillColor(muted ? '#8a8177' : '#3d3a36').fontSize(muted ? 9 : 10).text(label, 42, y, { width: 320 })
  doc.fillColor(muted ? '#8a8177' : '#23211f').fontSize(muted ? 9 : 10).text(value, 356, y, { width: 196, align: 'right' })
  return y + (muted ? 16 : 20)
}

function initials(value) {
  return String(value || 'Hotel')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}
