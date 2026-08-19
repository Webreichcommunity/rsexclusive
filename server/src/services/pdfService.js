import fs from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import { env } from '../config/env.js'

const receiptDir = path.resolve(process.cwd(), 'server', 'receipts')

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
    doc.fontSize(12).fillColor('#23211f').text('Payment Summary')
    doc.moveDown(0.3).fillColor('#3d3a36').fontSize(10)
    doc.text(`Subtotal: ${booking.currency} ${booking.subtotal_amount}`)
    doc.text(`Tax: ${booking.currency} ${booking.tax_amount}`)
    doc.fontSize(13).fillColor('#23211f').text(`Booking Total: ${booking.currency} ${booking.total_amount}`)
    if (booking.metadata?.paymentPlan) {
      doc.fontSize(10).fillColor('#3d3a36').text(`Paid Now: ${booking.currency} ${booking.metadata.paymentPlan.paidAmount}`)
      doc.text(`Balance Due: ${booking.currency} ${booking.metadata.paymentPlan.balanceDue}`)
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
