import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'

function getPostHogDefine(mode: string) {
  const env = loadEnv(mode, '.', '')
  return {
    ...(env.POSTHOG_PROJECT_TOKEN && {
      'process.env.POSTHOG_PROJECT_TOKEN': JSON.stringify(env.POSTHOG_PROJECT_TOKEN)
    }),
    ...(env.POSTHOG_HOST && {
      'process.env.POSTHOG_HOST': JSON.stringify(env.POSTHOG_HOST)
    })
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        onstart(args) {
          args.startup()
        },
        vite: {
          define: getPostHogDefine(mode),
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'electron-updater', 'posthog-node']
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', 'electron-updater', 'posthog-node']
            }
          }
        }
      }
    ]),
    renderer()
  ],
  server: {
    port: 5173,
    strictPort: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
}))
