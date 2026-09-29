import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateBookingAmounts, calculateMilestoneOfferDiscount, calculateOfferDiscount, calculatePaymentPlan } from '../src/services/bookingService.js'

test('calculateBookingAmounts always applies the fixed 5 percent tax rate', () => {
  assert.deepEqual(calculateBookingAmounts(18000, 12), {
    subtotal: 18000,
    tax: 900,
    total: 18900,
  })
})

test('calculateBookingAmounts rounds currency values to two decimals', () => {
  assert.deepEqual(calculateBookingAmounts(999.995, 18), {
    subtotal: 1000,
    tax: 50,
    total: 1050,
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

test('calculateMilestoneOfferDiscount applies fixed milestone discounts', () => {
  assert.equal(calculateMilestoneOfferDiscount({ discountAmount: 1000 }, 5000), 1000)
})

test('calculateMilestoneOfferDiscount caps discounts while keeping a payable subtotal', () => {
  assert.equal(calculateMilestoneOfferDiscount({ discountAmount: 2000 }, 1500), 1499)
})

test('calculateMilestoneOfferDiscount keeps complimentary meal offers as non-cash redemptions', () => {
  assert.equal(calculateMilestoneOfferDiscount({ discountAmount: 0 }, 2500), 0)
})
