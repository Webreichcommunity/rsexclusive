import { createApp } from './app.js'
import { env } from './config/env.js'
import { assertDatabaseConfigured } from './db/pool.js'

assertDatabaseConfigured()

const app = createApp()
const server = app.listen(env.port, () => {
  console.log(`R.S. Exclusive API listening on :${env.port}`)
})

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${env.port} is already in use.`)
    console.error('Stop the existing API process, or run the server with a different PORT value.')
    process.exit(1)
  }
  throw error
})
