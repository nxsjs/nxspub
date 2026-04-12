#!/usr/bin/env node

import { execSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const isSelfDev = await fs
  .access(path.resolve(process.cwd(), 'bin/nxspub.mjs'))
  .then(() => true)
  .catch(() => false)

if (isSelfDev) {
  execSync('tsx ./src/cli.ts git-hooks', { stdio: 'inherit' })
} else {
  execSync('node ./dist/cli.mjs git-hooks', { stdio: 'inherit' })
}
