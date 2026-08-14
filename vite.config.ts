/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [preact()],
  test: {
    // zustand's default export is its React hook adapter, aliased to
    // preact/compat by @preact/preset-vite — but vitest externalizes
    // node_modules deps by default, bypassing that alias. Inline it so the
    // alias actually applies.
    server: { deps: { inline: ['zustand'] } },
  },
})
