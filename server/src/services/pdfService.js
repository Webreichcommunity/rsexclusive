import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'
import { env } from '../config/env.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const receiptDir = path.resolve(__dirname, '..', '..', 'receipts')
export const legacyReceiptDir = path.resolve(__dirname, '..', '..', 'server', 'receipts')
const webreichLogoPath = path.resolve(__dirname, '..', '..', '..', 'public', 'webreich.png')
const PAGE = { margin: 42, bottom: 760, contentWidth: 511 }
const TERMS_VERSION = '2026-09-20'

const TERMS = [
  'Unmarried couples are not permitted to check in. Guests with local city identification from the same city as the hotel may also be refused check-in, subject to hotel policy and applicable law.',
  'The primary guest must be at least 18 years of age to be able to check into the hotel.',
  'It is mandatory for guests to present valid photo identification at the time of check-in. According to government regulations, a valid Photo ID has to be carried by every person above the age of 18 staying at the hotel. The identification proofs accepted are Aadhar Card, Driving License, Voter ID Card, and Passport. Without original copy of valid ID the guest will not be allowed to check-in.',
  'Should any action by a guest be deemed inappropriate by the hotel, or if any inappropriate behaviour is brought to the attention of the hotel, the hotel reserves the right, after the allegations have been investigated, to take action against the guest.',
  'Every hotel may have different policies for specific times during the year.',
  'Guests shall be liable for any damage, except normal wear and tear to hotel assets. Guests shall keep the hotel room in good condition and maintain hygiene and cleanliness.',
  'Certain policies are booking specific and are informed to the customer while making the booking.',
  'Guests may be contacted closer to their check-in date to confirm the arrival status or arrival time through calls or messages. In case we do not receive a response from the guest after multiple attempts, the booking may be put on hold or cancelled. In case of availability, the hotel will try to reinstate your booking when you contact us back or make a payment through our payment options.',
  'As we continue to strive to improve our services, we may reach out to guests to get feedback about their experience through calls or messages.',
  'Management does not take responsibility for guests valuables. Lockers are available in rooms.',
  'I agree to abide by the terms and conditions during my/our stay in the hotel.',
  'By accessing this website and/or submitting any personal or digital information, including but not limited to name, contact details, identification documents, payment information, browsing data, and preferences, the guest expressly consents to the collection, storage, processing, and use of such Guest Data.',
  'The hotels reserve the right to use, retain, analyze, and process the Guest Data at their sole discretion, for purposes including but not limited to reservation management, guest services, marketing and promotional communications, service improvement, analytics, and any other business purpose the hotels may deem fit from time to time, whether now known or hereafter devised.',
  'The guest acknowledges and agrees that by providing such data, they authorize the hotels to use the same in the manner the hotels consider appropriate, without further notice or consent, except where applicable law requires otherwise.',
  'By submitting any personal or digital information on this website, the guest expressly consents to its collection, storage, and processing by RG Exclusive, RS Exclusive, and Ranjeet Hotel, members of the Ranjeet Group of Hotels, for purposes including reservations, guest services, marketing, and record-keeping. The guest further agrees that such data may be shared with and used by Ranjeet Hotel, as the group head entity, and any other hotel presently or hereafter forming part of the group, without requiring separate consent for each property.',
]

function money(currency, value) {
  return `${currency || 'INR'} ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(value) {
  if (!value) return 'TBA'
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

function formatDateTime(value) {
  if (!value) return 'Not recorded'
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
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

async function readImageBuffer(filePath) {
  try {
    return await fs.promises.readFile(filePath)
  } catch {
    return null
  }
}

export async function generateBookingPdf({ hotel, room, booking, invoice }) {
  await fs.promises.mkdir(receiptDir, { recursive: true })
  const fileName = `${invoice.invoice_number}.pdf`
  const filePath = path.join(receiptDir, fileName)
  const [hotelLogo, webreichLogo] = await Promise.all([
    fetchImageBuffer(hotel?.branding?.logoUrl),
    readImageBuffer(webreichLogoPath),
  ])
  const metadata = booking.metadata || {}
  const pricing = metadata.pricing || {}
  const paymentPlan = metadata.paymentPlan || {}
  const gstClaim = normalizeGstClaim(metadata.gstClaim || booking.gst_claim)
  const selectedAmenities = Array.isArray(metadata.selectedAmenities) ? metadata.selectedAmenities : []
  const address = formatAddress(hotel)
  const currency = booking.currency || hotel?.currency || 'INR'

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: PAGE.margin, size: 'A4', bufferPages: true })
    const stream = fs.createWriteStream(filePath)
    stream.on('finish', resolve)
    stream.on('error', reject)
    doc.pipe(stream)

    drawReceiptHeader(doc, { hotel, invoice, hotelLogo, address })
    let y = 150

    y = drawBookingSummary(doc, y, { hotel, invoice, booking })

    if (gstClaim.enabled) {
      y = drawInfoGrid(doc, y + 14, 'GST Claim Details', [
        ['Company name', gstClaim.companyName],
        ['GST number', gstClaim.gstNumber],
        ['Company address', gstClaim.companyAddress],
      ], 2)
    }

    y = drawInfoGrid(doc, y + 14, 'Stay Details', [
      ['Room', room?.name || booking.room_type_name],
      ['Check-in', formatDate(booking.check_in)],
      ['Check-out', formatDate(booking.check_out)],
      ['Nights', `${booking.nights} night${Number(booking.nights) === 1 ? '' : 's'}`],
      ['Rooms', `${booking.rooms_count} room${Number(booking.rooms_count) === 1 ? '' : 's'}`],
      ['Guests', `${booking.adults} adult${Number(booking.adults) === 1 ? '' : 's'}, ${booking.children || 0} child${Number(booking.children) === 1 ? '' : 'ren'}`],
    ], 3)

    y = drawInfoGrid(doc, y + 14, 'Room Details', [
      ['Room type', room?.name || booking.room_type_name],
      ['Bed type', room?.bed_type || 'Premium bedding'],
      ['Room size', room?.size_sqft ? `${room.size_sqft} sq ft` : '-'],
      ['Description', room?.description || 'Room details as selected during booking.'],
    ], 2)

    if (selectedAmenities.length) {
      y = drawAmenitiesTable(doc, y + 14, selectedAmenities, booking, currency)
    }

    y = drawBillingTable(doc, y + 14, {
      booking,
      currency,
      pricing,
      selectedAmenities,
      metadata,
      paymentPlan,
    })

    y = drawContactDetails(doc, y + 14, { hotel, address })
    drawTermsPages(doc, { hotel, booking, webreichLogo, startY: y + 18 })
    drawFooters(doc)
    doc.end()
  })

  return {
    filePath,
    publicUrl: `${env.receipts.publicBaseUrl}/${fileName}`,
  }
}

function drawReceiptHeader(doc, { hotel, invoice, hotelLogo, address }) {
  doc.rect(0, 0, doc.page.width, 126).fill('#151210')
  doc.rect(0, 120, doc.page.width, 6).fill('#c99b45')
  drawHotelLogo(doc, 42, 25, hotelLogo, hotel?.name)
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text(hotel?.name || 'Hotel', 118, 27, { width: 292, height: 42 })
  doc.fillColor('#d8d0c6').font('Helvetica').fontSize(8).text(address || 'Akola, Maharashtra, India', 118, 72, { width: 292, height: 28, lineGap: 1 })
  doc.fillColor('#f2c76d').font('Helvetica-Bold').fontSize(8.5).text('Booking Confirmation & Tax Invoice', 118, 103, { width: 260 })

  doc.roundedRect(420, 26, 132, 74, 6).fillAndStroke('#211d19', '#40372f')
  doc.fillColor('#b8afa5').font('Helvetica-Bold').fontSize(6.8).text('INVOICE', 432, 38, { width: 108, align: 'right' })
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9).text(invoice.invoice_number, 432, 50, { width: 108, align: 'right', lineGap: 1 })
  doc.fillColor('#b8afa5').font('Helvetica-Bold').fontSize(6.8).text('ISSUED', 432, 71, { width: 108, align: 'right' })
  doc.fillColor('#ffffff').font('Helvetica').fontSize(8).text(formatDate(invoice.issued_at || new Date()), 432, 83, { width: 108, align: 'right' })
}

function drawHotelLogo(doc, x, y, logo, name) {
  if (logo) {
    try {
      doc.image(logo, x, y, { fit: [62, 62], align: 'center', valign: 'center' })
      return
    } catch {
      // fall through to initials mark
    }
  }
  doc.roundedRect(x, y, 62, 62, 8).fillAndStroke('#fff8e6', '#e6c06c')
  doc.fillColor('#9f6b12').font('Helvetica-Bold').fontSize(18).text(initials(name), x, y + 21, { width: 62, align: 'center' })
}

function drawBookingSummary(doc, y, { hotel, invoice, booking }) {
  const items = [
    ['Booking reference', booking.booking_reference],
    ['Status', booking.status],
    ['Booking time', formatDateTime(booking.confirmed_at || booking.created_at || invoice.issued_at)],
    ['Guest', booking.guest_name],
    ['Contact', `${booking.guest_phone || '-'} / ${booking.guest_email || '-'}`],
    ['Hotel', hotel?.name || booking.hotel_name || '-'],
    ['Invoice', invoice.invoice_number],
    ['Issued on', formatDate(invoice.issued_at || new Date())],
  ]
  const columns = 2
  const colWidth = PAGE.contentWidth / columns
  const rows = []
  for (let index = 0; index < items.length; index += columns) rows.push(items.slice(index, index + columns))
  const rowHeights = rows.map((row) => Math.max(43, ...row.map(([, value]) => {
    doc.font('Helvetica').fontSize(8.4)
    return doc.heightOfString(String(value || '-'), { width: colWidth - 30, lineGap: 1 }) + 25
  })))
  const height = rowHeights.reduce((sum, rowHeight) => sum + rowHeight, 0)
  y = ensurePage(doc, y, height)
  doc.roundedRect(42, y, PAGE.contentWidth, height, 8).fillAndStroke('#fff8ed', '#e4d7c5')
  let cursor = y
  rows.forEach((row, rowIndex) => {
    const rowHeight = rowHeights[rowIndex]
    if (rowIndex > 0) doc.moveTo(42, cursor).lineTo(553, cursor).strokeColor('#e6dac9').lineWidth(0.6).stroke()
    doc.moveTo(42 + colWidth, cursor + 8).lineTo(42 + colWidth, cursor + rowHeight - 8).strokeColor('#e6dac9').lineWidth(0.6).stroke()
    row.forEach(([label, value], colIndex) => {
      const x = 42 + colIndex * colWidth
      doc.fillColor('#7d7267').font('Helvetica-Bold').fontSize(7).text(String(label).toUpperCase(), x + 15, cursor + 10, { width: colWidth - 30 })
      doc.fillColor('#211f1c').font('Helvetica').fontSize(8.4).text(String(value || '-'), x + 15, cursor + 23, { width: colWidth - 30, lineGap: 1 })
    })
    cursor += rowHeight
  })
  return y + height
}

function drawInfoGrid(doc, y, title, items, columns = 3) {
  y = sectionTitle(doc, y, title)
  const colWidth = PAGE.contentWidth / columns
  const rows = []
  for (let index = 0; index < items.length; index += columns) rows.push(items.slice(index, index + columns))
  const rowHeights = rows.map((row) => {
    const heights = row.map(([, value]) => {
      doc.font('Helvetica').fontSize(8.8)
      return doc.heightOfString(String(value || '-'), { width: colWidth - 24, lineGap: 1 }) + 24
    })
    return Math.max(42, ...heights)
  })
  const tableHeight = rowHeights.reduce((sum, height) => sum + height, 0)
  y = ensurePage(doc, y, tableHeight + 4)
  doc.rect(42, y, PAGE.contentWidth, tableHeight).strokeColor('#d8ccbb').lineWidth(0.7).stroke()
  let cursor = y
  rows.forEach((row, rowIndex) => {
    const height = rowHeights[rowIndex]
    if (rowIndex > 0) doc.moveTo(42, cursor).lineTo(553, cursor).strokeColor('#e5dbce').lineWidth(0.6).stroke()
    for (let col = 1; col < columns; col += 1) {
      const x = 42 + col * colWidth
      doc.moveTo(x, cursor).lineTo(x, cursor + height).strokeColor('#e5dbce').lineWidth(0.6).stroke()
    }
    row.forEach(([label, value], colIndex) => {
      const x = 42 + colIndex * colWidth
      doc.fillColor('#7b7066').font('Helvetica-Bold').fontSize(7.2).text(String(label).toUpperCase(), x + 12, cursor + 9, { width: colWidth - 24 })
      doc.fillColor('#231f1d').font('Helvetica').fontSize(8.8).text(String(value || '-'), x + 12, cursor + 22, { width: colWidth - 24, lineGap: 1 })
    })
    cursor += height
  })
  return y + tableHeight
}

function drawAmenitiesTable(doc, y, amenities, booking, currency) {
  y = sectionTitle(doc, y, 'Selected Amenities')
  const rows = amenities.map((amenity) => {
    const qty = Number(booking.rooms_count || 1)
    const unit = Number(amenity.price || 0)
    return [amenity.name || 'Amenity', qty, money(currency, unit), money(currency, unit * qty)]
  })
  const rowHeight = 24
  const tableHeight = rowHeight * (rows.length + 1)
  y = ensurePage(doc, y, tableHeight + 4)
  const cols = [42, 304, 364, 454, 553]
  doc.rect(42, y, PAGE.contentWidth, tableHeight).strokeColor('#cfc2b1').lineWidth(0.75).stroke()
  doc.rect(42, y, PAGE.contentWidth, rowHeight).fill('#f1eadf')
  for (const x of cols.slice(1, -1)) doc.moveTo(x, y).lineTo(x, y + tableHeight).strokeColor('#cfc2b1').lineWidth(0.65).stroke()
  doc.moveTo(42, y + rowHeight).lineTo(553, y + rowHeight).strokeColor('#cfc2b1').lineWidth(0.65).stroke()
  tableText(doc, 'Amenity', cols[0] + 10, y + 8, cols[1] - cols[0] - 20, true)
  tableText(doc, 'Qty', cols[1] + 10, y + 8, cols[2] - cols[1] - 20, true)
  tableText(doc, 'Unit price', cols[2] + 10, y + 8, cols[3] - cols[2] - 20, true, 'right')
  tableText(doc, 'Amount', cols[3] + 10, y + 8, cols[4] - cols[3] - 20, true, 'right')
  rows.forEach((row, index) => {
    const rowY = y + rowHeight * (index + 1)
    if (index > 0) doc.moveTo(42, rowY).lineTo(553, rowY).strokeColor('#e4dbcf').lineWidth(0.55).stroke()
    tableText(doc, row[0], cols[0] + 10, rowY + 8, cols[1] - cols[0] - 20)
    tableText(doc, row[1], cols[1] + 10, rowY + 8, cols[2] - cols[1] - 20)
    tableText(doc, row[2], cols[2] + 10, rowY + 8, cols[3] - cols[2] - 20, false, 'right')
    tableText(doc, row[3], cols[3] + 10, rowY + 8, cols[4] - cols[3] - 20, false, 'right')
  })
  return y + tableHeight
}

function drawBillingTable(doc, y, { booking, currency, pricing, selectedAmenities, metadata, paymentPlan }) {
  const halfTax = Number(booking.tax_amount || 0) / 2
  const rows = [
    ['Room subtotal', money(currency, pricing.roomSubtotal || booking.subtotal_amount)],
    ...(selectedAmenities.length ? [['Selected amenities', money(currency, pricing.amenitySubtotal || 0)]] : []),
    ...(metadata.offer?.discountAmount ? [[`Offer: ${metadata.offer.title || 'Discount'}`, `-${money(currency, metadata.offer.discountAmount)}`]] : []),
    ...(metadata.loyaltyRedemption?.amount ? [['Loyalty redemption', `-${money(currency, metadata.loyaltyRedemption.amount)}`]] : []),
    ['Taxable subtotal', money(currency, booking.subtotal_amount)],
    ['CGST (2.5%)', money(currency, halfTax)],
    ['IGST (2.5%)', money(currency, halfTax)],
    ['Paid now', money(currency, paymentPlan.paidAmount ?? booking.total_amount)],
    ['Balance due at hotel', money(currency, paymentPlan.balanceDue || 0)],
  ]
  const rowHeight = 21
  const totalHeight = rowHeight * rows.length + 34
  y = ensurePage(doc, y, totalHeight + 36)
  y = sectionTitle(doc, y, 'Billing Summary')
  y = ensurePage(doc, y, totalHeight + 4)
  doc.rect(42, y, PAGE.contentWidth, totalHeight).strokeColor('#d8ccbb').lineWidth(0.75).stroke()
  let cursor = y
  rows.forEach(([label, value], index) => {
    if (index > 0) doc.moveTo(42, cursor).lineTo(553, cursor).strokeColor('#e6ded2').lineWidth(0.55).stroke()
    tableText(doc, label, 54, cursor + 7, 330)
    tableText(doc, value, 390, cursor + 7, 150, false, 'right')
    cursor += rowHeight
  })
  doc.rect(42, cursor, PAGE.contentWidth, 34).fillAndStroke('#171412', '#171412')
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12).text('Booking Total', 54, cursor + 10, { width: 240 })
  doc.fillColor('#f2c76d').font('Helvetica-Bold').fontSize(12).text(money(currency, booking.total_amount), 356, cursor + 10, { width: 184, align: 'right' })
  return y + totalHeight
}

function drawContactDetails(doc, y, { hotel, address }) {
  const phones = [...new Set([...(hotel?.contact?.phones || []), hotel?.contact?.phone, hotel?.contact?.whatsapp].filter(Boolean))]
  return drawInfoGrid(doc, y, 'Hotel Contact Details', [
    ['Hotel', hotel?.name || '-'],
    ['Contact numbers', phones.join(', ') || '-'],
    ['Email', hotel?.contact?.email || '-'],
    ['Address', address || '-'],
  ], 2)
}

function normalizeGstClaim(value = {}) {
  if (!value?.enabled) return { enabled: false }
  return {
    enabled: true,
    companyName: value.companyName || value.company_name || '-',
    gstNumber: value.gstNumber || value.gst_number || '-',
    companyAddress: value.companyAddress || value.company_address || '-',
  }
}

function drawTermsPages(doc, { hotel, booking, webreichLogo, startY }) {
  let y = ensurePage(doc, startY, 220)
  if (y !== startY) y = PAGE.margin
  y = sectionTitle(doc, y, 'Terms and Conditions')
  doc.fillColor('#756b61').font('Helvetica').fontSize(8.5).text(`${hotel?.name || 'Hotel'} terms version ${TERMS_VERSION}`, 42, y, { width: PAGE.contentWidth })
  y += 20

  const accepted = booking.metadata?.termsAndConditions || {}
  y = drawAcceptanceBox(doc, y, booking, accepted)
  y += 10

  TERMS.forEach((term, index) => {
    doc.font('Helvetica').fontSize(8.3)
    const termHeight = Math.max(26, doc.heightOfString(term, { width: 462, lineGap: 1 }) + 6)
    y = ensurePage(doc, y, termHeight + 7)
    doc.fillColor('#8a8177').font('Helvetica-Bold').fontSize(8.5).text(`${index + 1}.`, 42, y + 1, { width: 22, align: 'right' })
    doc.fillColor('#332f2b').font('Helvetica').fontSize(8.3).text(term, 72, y, { width: 462, lineGap: 1 })
    y += termHeight + 5
  })

  y = ensurePage(doc, y + 8, 38)
  drawDevelopedBy(doc, y + 8, webreichLogo)
}

function drawAcceptanceBox(doc, y, booking, accepted) {
  y = ensurePage(doc, y, 78)
  doc.roundedRect(42, y, PAGE.contentWidth, 68, 6).fillAndStroke('#fffaf0', '#eadfcb')
  doc.fillColor('#23211f').font('Helvetica-Bold').fontSize(10.5).text('Guest Acceptance Record', 56, y + 12, { width: 460 })
  doc.fillColor('#706b64').font('Helvetica').fontSize(8.3)
  doc.text(`Accepted electronically by ${booking.guest_name || 'guest'} for booking ${booking.booking_reference}.`, 56, y + 29, { width: 460 })
  doc.text(`Accepted at: ${formatDateTime(accepted.acceptedAt)} / Version: ${accepted.version || TERMS_VERSION}`, 56, y + 43, { width: 460 })
  doc.fillColor('#23211f').font('Helvetica-Bold').fontSize(8.8).text(`Virtual signature: ${booking.guest_name || booking.guest_email || 'Guest'}`, 56, y + 55, { width: 460 })
  return y + 68
}

function drawDevelopedBy(doc, y, webreichLogo) {
  const boxWidth = PAGE.contentWidth
  const x = 42
  doc.roundedRect(x, y - 8, boxWidth, 42, 6).fillAndStroke('#fffaf0', '#eadfcb')
  const logoX = x + Math.round((boxWidth - 22 - 286) / 2)
  if (webreichLogo) {
    try {
      doc.image(webreichLogo, logoX, y + 2, { fit: [22, 22] })
    } catch {
      doc.fillColor('#e65335').font('Helvetica-Bold').fontSize(9).text('W', logoX, y + 8, { width: 22, align: 'center' })
    }
  } else {
    doc.fillColor('#e65335').font('Helvetica-Bold').fontSize(9).text('W', logoX, y + 8, { width: 22, align: 'center' })
  }
  doc.fillColor('#756b61').font('Helvetica').fontSize(8.5).text('Developed by WebReich. Generated by the WebReich platform for secure hotel booking operations.', logoX + 30, y + 8, { width: 286, align: 'center' })
}

function sectionTitle(doc, y, title) {
  y = ensurePage(doc, y, title ? 34 : 4)
  if (!title) return y
  doc.fillColor('#171412').font('Helvetica-Bold').fontSize(12.5).text(title, 42, y, { width: PAGE.contentWidth })
  doc.moveTo(42, y + 19).lineTo(553, y + 19).strokeColor('#e4d9ca').lineWidth(0.7).stroke()
  return y + 28
}

function tableText(doc, value, x, y, width, bold = false, align = 'left') {
  doc.fillColor(bold ? '#302b26' : '#3f3933').font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.6).text(String(value ?? '-'), x, y, { width, align, height: 14, ellipsis: true })
}

function ensurePage(doc, y, requiredHeight) {
  if (y + requiredHeight <= PAGE.bottom) return y
  doc.addPage()
  return PAGE.margin
}

function drawFooters(doc) {
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i)
    doc.moveTo(42, 785).lineTo(553, 785).strokeColor('#e5ded3').lineWidth(0.6).stroke()
    doc.fillColor('#8a8177').font('Helvetica').fontSize(7.5).text('Generated by WebReich platform', 42, 797, { width: 250 })
    doc.fillColor('#8a8177').font('Helvetica').fontSize(7.5).text(`Page ${i - range.start + 1} of ${range.count}`, 452, 797, { width: 100, align: 'right' })
  }
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

function formatAddress(hotel) {
  const address = hotel?.address || {}
  return [address.line1, address.city, address.state, address.country].filter(Boolean).join(', ')
}
