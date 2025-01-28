import { defineConfig } from 'vite'
import solidPlugin from 'vite-plugin-solid'
import wasmPlugin from 'vite-plugin-wasm'
import tsconfigPlugin from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [solidPlugin(), wasmPlugin(), tsconfigPlugin()],
  server: {
    port: 3000,
  },
  build: {
    target: 'esnext',
  },
})
