import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const disableHmr = process.env.VITE_DISABLE_HMR === '1'

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    define: {
        __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
        __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
    },
    // Security: Logs enabled for debugging (Temporary)
    // esbuild: {
    //    drop: ['console', 'debugger'],
    // },
    build: {
        outDir: 'dist',
        sourcemap: false
    },
    server: {
        host: '127.0.0.1',
        port: 5176,
        strictPort: true,
        open: true,
        hmr: disableHmr
            ? false
            : {
                host: '127.0.0.1',
                port: 5176,
                protocol: 'ws'
            }
    }
})
