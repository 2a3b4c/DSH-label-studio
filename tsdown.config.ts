import { defineConfig } from 'tsdown'

/** Build the Host root and invariant companion as independent Node bundles. */
export default defineConfig([
  {
    entry: ['lib/types/index.js'], outDir: 'lib', format: ['esm'], platform: 'node',
    target: 'es2024', fixedExtension: false, dts: false, clean: false,
  },
  {
    entry: ['lib/types/invariant.js'], outDir: 'lib', format: ['esm'], platform: 'node',
    target: 'es2024', fixedExtension: false, dts: false, clean: false,
  },
])
