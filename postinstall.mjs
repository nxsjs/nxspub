#!/usr/bin/env node

import { execSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = __dirname

const isDevelopment = await fs
  .access(path.resolve(rootDir, 'src/cli.ts'))
  .then(() => true)
  .catch(() => false)

const hasDist = await fs
  .access(path.resolve(rootDir, 'dist/cli.mjs'))
  .then(() => true)
  .catch(() => false)

try {
  if (isDevelopment) {
    execSync('tsx ./src/cli.ts git-hooks', {
      stdio: 'inherit',
      cwd: rootDir,
    })
  } else if (hasDist) {
    execSync('node ./dist/cli.mjs git-hooks', {
      stdio: 'inherit',
      cwd: rootDir,
    })
  }
} catch {
  console.warn(
    'nxspub: Failed to setup git-hooks. You can run "nxspub git-hooks" manually.',
  )
}
