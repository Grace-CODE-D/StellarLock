#!/usr/bin/env node
import { readdir, stat, readFile } from "node:fs/promises"
import { gzip } from "node:zlib"
import { promisify } from "node:util"
import path from "node:path"

const gzipAsync = promisify(gzip)
const assetsDir = path.resolve("dist/assets")
const ENTRY_BUDGET = 350 * 1024
const TOTAL_JS_BUDGET = 900 * 1024

const entries = await readdir(assetsDir, { withFileTypes: true })
const jsFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".js")).map((entry) => entry.name)
if (jsFiles.length === 0) {
  console.error(`Bundle budget check failed: no JavaScript assets found in ${assetsDir}`)
  process.exit(1)
}

const measurements = await Promise.all(jsFiles.map(async (name) => {
  const filename = path.join(assetsDir, name)
  const source = await stat(filename)
  const compressed = await gzipAsync(await readFile(filename), { level: 9 })
  return { name, bytes: source.size, gzipBytes: compressed.length }
}))

const entry = measurements.find(({ name }) => /^index(?:-[^/]+)?\.js$/.test(name)) ?? measurements.slice().sort((a, b) => b.gzipBytes - a.gzipBytes)[0]
const totalGzipBytes = measurements.reduce((sum, asset) => sum + asset.gzipBytes, 0)
const format = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`

console.log("Bundle budget report (gzip):")
for (const asset of measurements.slice().sort((a, b) => b.gzipBytes - a.gzipBytes)) {
  console.log(`- ${asset.name}: ${format(asset.gzipBytes)} gzip (${format(asset.bytes)} raw)`)
}
console.log(`Entry: ${entry.name} = ${format(entry.gzipBytes)} / ${format(ENTRY_BUDGET)}`)
console.log(`All JavaScript: ${format(totalGzipBytes)} / ${format(TOTAL_JS_BUDGET)}`)

const failures = []
if (entry.gzipBytes > ENTRY_BUDGET) failures.push(`entry ${entry.name} exceeds ${format(ENTRY_BUDGET)}`)
if (totalGzipBytes > TOTAL_JS_BUDGET) failures.push(`all JavaScript assets exceed ${format(TOTAL_JS_BUDGET)}`)
if (failures.length > 0) {
  for (const failure of failures) console.error(`::error::Bundle budget exceeded: ${failure}`)
  process.exit(1)
}
