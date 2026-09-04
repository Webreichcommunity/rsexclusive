import fs from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import { env } from '../config/env.js'

const receiptDir = path.resolve(process.cwd(), 'server', 'receipts')

function money(currency, value) {
  return `${currency} ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export async function generateBookingPdf({ hotel, booking, invoice }) {
  await fs.promises.mkdir(receiptDir, { recursive: true })
  const fileName = `${invoice.invoice_number}.pdf`
  const filePath = path.join(receiptDir, fileName)

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' })
    const stream = fs.createWriteStream(filePath)
    stream.on('finish', resolve)
    stream.on('error', reject)
    doc.pipe(stream)

    doc.fillColor('#23211f').fontSize(22).text(hotel.name)
    doc.moveDown(0.5).fillColor('#f97316').fontSize(13).text('Booking Confirmation & Receipt')
    doc.moveDown(1)
    doc.fillColor('#3d3a36').fontSize(10).text(`Invoice: ${invoice.invoice_number}`)
    doc.text(`Booking: ${booking.booking_reference}`)
    doc.text(`Guest: ${booking.guest_name}`)
    doc.text(`Email: ${booking.guest_email}`)
    doc.moveDown(1)
    doc.fontSize(12).fillColor('#23211f').text('Stay Details')
    doc.moveDown(0.3).fillColor('#3d3a36').fontSize(10)
    doc.text(`Check-in: ${booking.check_in}`)
    doc.text(`Check-out: ${booking.check_out}`)
    doc.text(`Nights: ${booking.nights}`)
    doc.text(`Rooms: ${booking.rooms_count}`)
    doc.moveDown(1)
    const metadata = booking.metadata || {}
    const pricing = metadata.pricing || {}
    const selectedAmenities = Array.isArray(metadata.selectedAmenities) ? metadata.selectedAmenities : []

    doc.fontSize(12).fillColor('#23211f').text('Payment Summary')
    doc.moveDown(0.3).fillColor('#3d3a36').fontSize(10)
    doc.text(`Room subtotal: ${money(booking.currency, pricing.roomSubtotal || booking.subtotal_amount)}`)
    if (selectedAmenities.length) {
      doc.text(`Selected amenities: ${money(booking.currency, pricing.amenitySubtotal)}`)
      selectedAmenities.forEach((amenity) => {
        doc.text(`  - ${amenity.name}: ${money(booking.currency, amenity.price * Number(booking.rooms_count || 1))}`)
      })
    }
    if (metadata.offer?.discountAmount) {
      doc.text(`Offer discount (${metadata.offer.title}): -${money(booking.currency, metadata.offer.discountAmount)}`)
    }
    if (metadata.loyaltyRedemption?.amount) {
      doc.text(`Loyalty redemption (${metadata.loyaltyRedemption.points} points): -${money(booking.currency, metadata.loyaltyRedemption.amount)}`)
    }
    doc.text(`Taxable subtotal: ${money(booking.currency, booking.subtotal_amount)}`)
    doc.text(`Tax: ${money(booking.currency, booking.tax_amount)}`)
    doc.fontSize(13).fillColor('#23211f').text(`Booking Total: ${money(booking.currency, booking.total_amount)}`)
    if (booking.metadata?.paymentPlan) {
      doc.fontSize(10).fillColor('#3d3a36').text(`Paid Now: ${money(booking.currency, booking.metadata.paymentPlan.paidAmount)}`)
      doc.text(`Balance Due: ${money(booking.currency, booking.metadata.paymentPlan.balanceDue)}`)
    }
    doc.moveDown(1.5)
    doc.fontSize(9).fillColor('#6d6760').text('Thank you for choosing R.S. Exclusive Stay & Fine Dine.')
    doc.end()
  })

  return {
    filePath,
    publicUrl: `${env.receipts.publicBaseUrl}/${fileName}`,
  }
}
