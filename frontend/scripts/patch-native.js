/**
 * Patches native module loaders for PRoot/Termux environments where
 * native .node binaries cannot be dlopen'd due to namespace restrictions.
 *
 * Patches:
 * 1. rollup/dist/native.js → falls back to @rollup/wasm-node
 * 2. lightningcss/node/index.js → falls back to lightningcss-wasm
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const nmDir = join(__dirname, '..', 'node_modules')

// Patch rollup native.js
const rollupNative = join(nmDir, 'rollup', 'dist', 'native.js')
if (existsSync(rollupNative)) {
  let src = readFileSync(rollupNative, 'utf8')
  if (!src.includes('wasm-node')) {
    src = src.replace(
      /const \{ parse, parseAsync, xxhashBase64Url, xxhashBase36, xxhashBase16 \} = requireWithFriendlyError\(\s*existsSync\(path\.join\(__dirname, localName\)\) \? localName : `@rollup\/rollup-\$\{packageBase\}`\s*\);/,
      `let nativeBindings;
try {
  nativeBindings = requireWithFriendlyError(
    existsSync(path.join(__dirname, localName)) ? localName : \`@rollup/rollup-\${packageBase}\`
  );
} catch {
  nativeBindings = require('@rollup/wasm-node/dist/native.js');
}
const { parse, parseAsync, xxhashBase64Url, xxhashBase36, xxhashBase16 } = nativeBindings;`
    )
    writeFileSync(rollupNative, src)
    console.log('[patch-native] Patched rollup to use WASM fallback')
  }
}

// Patch lightningcss index.js
const lcssIndex = join(nmDir, 'lightningcss', 'node', 'index.js')
if (existsSync(lcssIndex)) {
  let src = readFileSync(lcssIndex, 'utf8')
  if (!src.includes('lightningcss-wasm')) {
    src = src.replace(
      /module\.exports = require\(`\.\.\/lightningcss\.\$\{parts\.join\('-'\)\}\.node`\);/,
      `try {
      module.exports = require(\`../lightningcss.\${parts.join('-')}.node\`);
    } catch (err2) {
      module.exports = require('lightningcss-wasm');
    }`
    )
    writeFileSync(lcssIndex, src)
    console.log('[patch-native] Patched lightningcss to use WASM fallback')
  }
}

console.log('[patch-native] Done')
