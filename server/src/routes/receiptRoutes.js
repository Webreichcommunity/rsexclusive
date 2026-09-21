import fs from 'node:fs'
import path from 'node:path'
import { createAsyncRouter } from '../utils/asyncRouter.js'
import { ensureBookingReceiptByInvoice } from '../services/bookingService.js'
import { legacyReceiptDir, receiptDir } from '../services/pdfService.js'
import { notFound } from '../utils/errors.js'

export const receiptRoutes = createAsyncRouter()

receiptRoutes.get('/:fileName', async (req, res) => {
  const fileName = path.basename(req.params.fileName || '')
  if (!/^[A-Z0-9-]+\.pdf$/i.test(fileName)) throw notFound('Receipt not found')

  const currentPath = path.join(receiptDir, fileName)
  const legacyPath = path.join(legacyReceiptDir, fileName)
  let existingPath = await firstExistingFile([currentPath, legacyPath])
  if (existingPath) return sendReceipt(res, existingPath, fileName)

  const invoiceNumber = fileName.replace(/\.pdf$/i, '')
  const pdf = await ensureBookingReceiptByInvoice(invoiceNumber)
  existingPath = await firstExistingFile([pdf.filePath, currentPath, legacyPath])
  if (!existingPath) throw notFound('Receipt could not be generated. Please try again.')
  return sendReceipt(res, existingPath, fileName)
})

async function firstExistingFile(paths) {
  for (const filePath of paths) {
    try {
      const stat = await fs.promises.stat(filePath)
      if (stat.isFile()) return filePath
    } catch {
      // keep looking
    }
  }
  return null
}

async function sendReceipt(res, filePath, fileName) {
  let pdfBuffer
  try {
    pdfBuffer = await fs.promises.readFile(filePath)
  } catch {
    throw notFound('Receipt file was not found. Please try again.')
  }

  res.setHeader('content-type', 'application/pdf')
  res.setHeader('content-disposition', `attachment; filename="${fileName}"`)
  res.setHeader('content-length', String(pdfBuffer.length))
  return res.send(pdfBuffer)
}
