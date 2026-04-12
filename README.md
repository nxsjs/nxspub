<div align="center">
  <a href="https://nxsjs.com">
    <img width="100" alt="nxspub logo" src="logo.svg">
  </a>

<hr/>

  <div style="display: flex; justify-content: center; gap: 8px;">
    <a href="https://nxsjs.com"><img alt="Made by NxsJs" src="https://img.shields.io/badge/MADE%20BY%20NxsJs-CCEE00.svg?style=for-the-badge&labelColor=000000"></a>
    <a href="https://nxsjs.com"><img src="https://img.shields.io/npm/v/nxspub?style=for-the-badge&color=000000&labelColor=FF4400" alt="npm version"></a>
    <a href="https://nxsjs.com"><img src="https://img.shields.io/npm/l/nxspub?style=for-the-badge&color=000000&labelColor=00AAFF" alt="license"></a>
  </div>
</div>

## Getting Started

Automated release tool tailored for modern multi-branch workflows.

- Visit our [Learn Nxspub](https://nxsjs.com) course to get started with Nxspub.

## Quick Start

### 1. Installation

```bash
pnpm add nxspub -D
```

### 2. Configuration

**nxspub** offers flexible configuration. You can use a dedicated config file for complex setups or keep it simple within `package.json`.

### Option 1: `package.json` (Minimalist)

Ideal for small projects that prefer fewer files in the root.

```json
{
  "name": "my-awesome-app",
  "scripts": {
    "check": "tsc --incremental --noEmit",
    "preinstall": "npx only-allow pnpm",
    "postinstall": "nxspub git-hooks",
    "version": "nxspub version",
    "release": "nxspub release"
  },
  "nxspub": {
    "git-hooks": {
      "pre-commit": "pnpm lint-staged && pnpm check"
    }
  }
}
```

### Option 2: nxspub.config.ts (Full Control)

Best for Monorepos or projects requiring custom regex and complex logic.

```typescript
import { defineConfig } from 'nxspub'

export default defineConfig({
  workspace: true, // Currently under development (Coming Soon).
  'git-hooks': {
    'pre-commit': 'pnpm lint-staged && pnpm check',
  },
  branches: {
    main: 'latest', // 1.0.0 -> 1.0.1/1.1.0/2.0.0
    master: 'latest', // 1.0.0 -> 1.0.1/1.1.0/2.0.0
    alpha: 'preminor', // Pre-minor release (1.0.0 -> 1.1.0-alpha.0 -> 1.1.0-alpha.1)
    beta: 'preminor', // Pre-minor release (1.0.0 -> 1.1.0-beta.0 -> 1.1.0-beta.1)
    rc: 'preminor', // Pre-minor release (1.0.0 -> 1.1.0-rc.0 -> 1.1.0-rc.1)
  },
  versioning: {
    major: [/(\w+)\((.+)\)!:/, /(\w+)!:/, /BREAKING CHANGE:/],
    minor: [/feat\((.+)\):/, /feat:/],
    patch: [
      /fix\((.+)\):/,
      /fix:/,
      /perf\((.+)\):/,
      /perf:/,
      /refactor\((.+)\):/,
      /refactor:/,
    ],
  },
  changelog: {
    labels: {
      feat: 'Features',
      fix: 'Bug Fixes',
      perf: 'Performance Improvements',
      refactor: 'Refactors',
      revert: 'Reverts',
    },
  },
})
```

### Option 3: Install Hooks

```bash
npx nxspub git-hooks
```

## Command Palette

| Command                     | Description                                                     |
| --------------------------- | --------------------------------------------------------------- |
| `nxspub git-hooks`          | Installs and syncs hooks in `.git/hooks` based on your config.  |
| `nxspub lint --edit <path>` | Validates if the commit message follows Conventional Commits.   |
| `nxspub version`            | Calculates version bump, generates Changelog, and pushes tags.  |
| `nxspub release`            | Builds the project and publishes artifacts to the NPM registry. |

## Default Versioning Strategy

By default, `nxspub` detects version bumps using the following logic:

- **Major**: `feat(...)!:`, `BREAKING CHANGE:`
- **Minor**: `feat:`, `feat(...):`
- **Patch**: `fix:`, `perf:`, `refactor:`

## Contribution

Please make sure to read the [Contributing Guide](https://github.com/nxsjs/nxspub/blob/main/.github/CONTRIBUTING.md) before making a pull request.

Thank you to all the people who already contributed to Nxspub!

<a href="https://github.com/nxsjs/nxspub/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nxsjs/nxspub&max=20&columns=10" />
</a>

<sub>_Note: Showing the first 500 contributors only due to GitHub image size limitations_</sub>
