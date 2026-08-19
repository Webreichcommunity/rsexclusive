import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, '..'), 'VITE_')
  const clientEnv = loadEnv(mode, __dirname, 'VITE_')

  return {
    plugins: [react()],
    envDir: path.resolve(__dirname, '..'),
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(clientEnv.VITE_API_BASE_URL || rootEnv.VITE_API_BASE_URL),
      'import.meta.env.VITE_FIREBASE_API_KEY': JSON.stringify(clientEnv.VITE_FIREBASE_API_KEY || rootEnv.VITE_FIREBASE_API_KEY),
      'import.meta.env.VITE_FIREBASE_AUTH_DOMAIN': JSON.stringify(
        clientEnv.VITE_FIREBASE_AUTH_DOMAIN || rootEnv.VITE_FIREBASE_AUTH_DOMAIN,
      ),
      'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(
        clientEnv.VITE_FIREBASE_PROJECT_ID || rootEnv.VITE_FIREBASE_PROJECT_ID,
      ),
      'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify(clientEnv.VITE_FIREBASE_APP_ID || rootEnv.VITE_FIREBASE_APP_ID),
      'import.meta.env.VITE_PRIMARY_DOMAIN': JSON.stringify(clientEnv.VITE_PRIMARY_DOMAIN || rootEnv.VITE_PRIMARY_DOMAIN),
    },
    server: {
      port: 5173,
      strictPort: false,
    },
  }
})
