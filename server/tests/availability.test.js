import test from 'node:test'
import assert from 'node:assert/strict'
import { searchAvailability, nightsBetween, assertValidStay } from '../src/services/availabilityService.js'

test('nightsBetween returns stayed nights, not inclusive checkout date', () => {
  assert.equal(nightsBetween(new Date('2026-08-10'), new Date('2026-08-13')), 3)
})

test('assertValidStay rejects checkout dates before checkin as a client error', () => {
  assert.throws(
    () => assertValidStay(new Date('2026-08-15'), new Date('2026-08-13')),
    (error) => {
      assert.equal(error.statusCode, 400)
      assert.equal(error.code, 'invalid_stay_dates')
      assert.equal(error.message, 'Check-out date must be after check-in date.')
      return true
    },
  )
})

test('assertValidStay rejects stays longer than 30 nights as a client error', () => {
  assert.throws(
    () => assertValidStay(new Date('2026-08-10'), new Date('2026-09-15')),
    (error) => {
      assert.equal(error.statusCode, 400)
      assert.equal(error.code, 'invalid_stay_dates')
      assert.equal(error.message, 'Stay cannot be more than 30 nights.')
      return true
    },
  )
})

test('searchAvailability filters by hotel and only returns complete date inventory', async () => {
  const calls = []
  const fakeDb = {
    async query(sql, params) {
      calls.push({ sql, params })
      return {
        rows: [
          {
            id: 'room-type-1',
            available_rooms: 2,
            subtotal: '14400.00',
            requested_rooms: 1,
            nights: 2,
          },
        ],
      }
    },
  }

  const rows = await searchAvailability(fakeDb, 'hotel-1', {
    checkIn: new Date('2026-08-10'),
    checkOut: new Date('2026-08-12'),
    roomsCount: 1,
    adults: 2,
    children: 0,
  })

  assert.equal(rows.length, 1)
  assert.equal(calls[0].params[0], 'hotel-1')
  assert.match(calls[0].sql, /rt\.hotel_id = \$1/)
  assert.match(calls[0].sql, /coalesce\(\(rt\.selected_rate->>'occupancyAdults'\)::int, rt\.occupancy_adults\) \+ 1 >= \$5/)
  assert.match(calls[0].sql, /extra_bed_recommended/)
  assert.match(calls[0].sql, /HAVING count\(ri\.id\) = 2/)
  assert.match(calls[0].sql, /min\(ri\.total_rooms - ri\.reserved_rooms\)::int AS available_rooms/)
  assert.match(calls[0].sql, /min\(ri\.total_rooms - ri\.reserved_rooms\) >= \$4/)
  assert.doesNotMatch(calls[0].sql, /least\(ri\.total_rooms - ri\.reserved_rooms/)
})
