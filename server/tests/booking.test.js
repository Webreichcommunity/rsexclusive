import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateBookingAmounts, calculateOfferDiscount, calculatePaymentPlan } from '../src/services/bookingService.js'

test('calculateBookingAmounts treats tax rate as a percentage', () => {
  assert.deepEqual(calculateBookingAmounts(18000, 12), {
    subtotal: 18000,
    tax: 2160,
    total: 20160,
  })
})

test('calculateBookingAmounts rounds currency values to two decimals', () => {
  assert.deepEqual(calculateBookingAmounts(999.995, 18), {
    subtotal: 1000,
    tax: 180,
    total: 1180,
  })
})

test('calculateOfferDiscount applies percentage offers against the room subtotal', () => {
  assert.equal(calculateOfferDiscount({ discount_type: 'percentage', discount_value: 5 }, 12000), 600)
})

test('calculateOfferDiscount caps fixed discounts at the room subtotal', () => {
  assert.equal(calculateOfferDiscount({ discount_type: 'fixed', discount_value: 5000 }, 3200), 3200)
})

test('calculatePaymentPlan charges the full booking total by default', () => {
  assert.deepEqual(calculatePaymentPlan(20160), {
    mode: 'full',
    advancePercent: 100,
    paidAmount: 20160,
    balanceDue: 0,
  })
})

test('calculatePaymentPlan supports a 25 percent partial advance', () => {
  assert.deepEqual(calculatePaymentPlan(20160, 'partial'), {
    mode: 'partial',
    advancePercent: 25,
    paidAmount: 5040,
    balanceDue: 15120,
  })
})
