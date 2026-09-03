import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { transform } from 'lightningcss'
import { defineConfig } from 'tsdown'

const PLUGIN_ID = 'dsh-label-studio-workbench'
const CSS_PREFIX = '\0dsh-label-studio-css:'
const CSS_SUFFIX = '.mjs'
const EXTERNALS = new Set([
  'react',
  'react/jsx-runtime',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
])

function matchesExternal(specifier: string): boolean {
  return [...EXTERNALS].some(name => specifier === name || specifier.startsWith(`${name}/`))
}

function cssModulePlugin() {
  return {
    name: 'label-studio-css-modules',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.module.css') || importer === undefined) return null
      return CSS_PREFIX + resolve(dirname(importer), source) + CSS_SUFFIX
    },
    async load(virtualId: string) {
      if (!virtualId.startsWith(CSS_PREFIX)) return null
      const file = virtualId.slice(CSS_PREFIX.length, -CSS_SUFFIX.length)
      this.addWatchFile(file)
      const source = await readFile(file)
      const { code, exports } = transform({
        filename: file,
        code: source,
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      const classes = Object.fromEntries(
        Object.entries(exports ?? {}).map(([local, value]) => [local, value.name]),
      )
      const tagId = `${PLUGIN_ID}/${basename(file)}`
      return [
        `const css = ${JSON.stringify(code.toString())};`,
        `const tagId = ${JSON.stringify(tagId)};`,
        'if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {',
        '  const tag = document.createElement("style");',
        `  tag.dataset.plugin = ${JSON.stringify(PLUGIN_ID)};`,
        '  tag.dataset.pluginCss = tagId;',
        '  tag.textContent = css;',
        '  document.head.appendChild(tag);',
        '}',
        `export default ${JSON.stringify(classes)};`,
      ].join('\n')
    },
  }
}

const nodeBundle = (entry: string) => ({
  entry: [entry],
  outDir: 'lib',
  format: ['esm'] as const,
  platform: 'node' as const,
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})

/** Build the package stubs and the browser module-loader factory. */
export default defineConfig([
  nodeBundle('lib/types/index.js'),
  nodeBundle('lib/types/invariant.js'),
  {
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    target: 'es2024',
    dts: false,
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: matchesExternal,
      alwaysBundle: (specifier: string) => !matchesExternal(specifier),
    },
    plugins: [cssModulePlugin()],
    outputOptions: {
      entryFileNames: 'client.js',
      sourcemapExcludeSources: false,
      banner: `window.__ModuleLoader__.load({id:${JSON.stringify(PLUGIN_ID)},factory(require){`,
      footer: 'return module.exports; }});',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
