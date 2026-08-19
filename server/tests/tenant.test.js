import test from 'node:test'
import assert from 'node:assert/strict'
import { forbidden } from '../src/utils/errors.js'

test('forbidden errors are explicit 403 authorization failures', () => {
  const error = forbidden('Hotel admin does not belong to this hotel')
  assert.equal(error.statusCode, 403)
  assert.equal(error.code, 'forbidden')
  assert.match(error.message, /does not belong/)
})
