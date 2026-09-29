import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const productionApiFallback = 'https://rsexclusive.onrender.com/api'

function envValue(key, clientEnv, rootEnv) {
  return process.env[key] || clientEnv[key] || rootEnv[key] || ''
}

function clientApiBaseUrl(mode, clientEnv, rootEnv) {
  const value = envValue('VITE_API_BASE_URL', clientEnv, rootEnv)
  if (mode === 'production' && (!value || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api\/?$/i.test(value))) {
    return productionApiFallback
  }
  return value || 'http://localhost:4000/api'
}

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, '..'), 'VITE_')
  const clientEnv = loadEnv(mode, __dirname, 'VITE_')

  return {
    plugins: [react()],
    envDir: path.resolve(__dirname, '..'),
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(clientApiBaseUrl(mode, clientEnv, rootEnv)),
      'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify(envValue('VITE_FIREBASE_API_KEY', clientEnv, rootEnv)),
      'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify(
        envValue('VITE_FIREBASE_AUTH_DOMAIN', clientEnv, rootEnv),
      ),
      'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(
        envValue('VITE_FIREBASE_PROJECT_ID', clientEnv, rootEnv),
      ),
      'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify(envValue('VITE_FIREBASE_APP_ID', clientEnv, rootEnv)),
      'import.meta.env.VITE_PRIMARY_DOMAIN': JSON.stringify(envValue('VITE_PRIMARY_DOMAIN', clientEnv, rootEnv)),
    },
    server: {
      port: 5173,
      strictPort: false,
    },
  }
})
