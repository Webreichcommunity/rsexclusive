import test from 'node:test'
import assert from 'node:assert/strict'
import { isAllowedCorsOrigin } from '../src/config/cors.js'

test('CORS allows configured localhost origins', () => {
  assert.equal(isAllowedCorsOrigin('http://localhost:5173'), true)
  assert.equal(isAllowedCorsOrigin('http://127.0.0.1:5173'), true)
})

test('CORS allows local tenant subdomains during development', () => {
  assert.equal(isAllowedCorsOrigin('http://shriyash.localhost:5173'), true)
})

test('CORS allows private LAN origins during local development', () => {
  assert.equal(isAllowedCorsOrigin('http://192.168.1.28:5173'), true)
})

test('CORS rejects unrelated public origins during local development', () => {
  assert.equal(isAllowedCorsOrigin('https://example-attacker.test'), false)
})
