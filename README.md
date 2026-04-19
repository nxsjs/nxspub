<div align="center">
  <a href="https://nxsjs.com">
    <img width="100" alt="nxspub logo" src="logo.svg">
  </a>

<hr/>

  <div style="display: flex; justify-content: center; gap: 8px;">
    <a href="https://nxsjs.com"><img alt="Made by NxsJs" src="https://img.shields.io/badge/MADE%20BY%20NxsJs-CCEE00.svg?logo=data:image/svg%2Bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCwgNCkiPjxwYXRoIGQ9Ik02IDI2VjZjMC0yLjIgMS44LTQgNC00aDQuNWw3IDEwVjZjMC0yLjIgMS44LTQgNC00SDMwdjIwYzAgMi4yLTEuOCA0LTQgNGgtNC41bC03LTEwdjZjMCAyLjItMS44IDQtNCA0SDZ6IiBmaWxsPSIjMDAwIi8+PC9nPjxnIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0yLCAyKSI+PHBhdGggZD0iTTYgMjZWNmMwLTIuMiAxLjgtNCA0LTRoNC41bDcgMTBWNmMwLTIuMiAxLjgtNCA0LTRIMzB2MjBjMCAyLjItMS44IDQtNCA0aC00LjVsLTctMTB2NmMwIDIuMi0xLjggNC00IDRINnoiIGZpbGw9IiNDQ0ZGMDAiIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLXdpZHRoPSIyLjUiIHN0cm9rZS1saW5lam9pbj0ibWl0ZXIiLz48L2c+PC9zdmc+&style=for-the-badge&labelColor=000000"></a>
    <a href="https://www.npmjs.com/package/nxspub"><img src="https://img.shields.io/npm/v/nxspub?style=for-the-badge&color=000000&labelColor=FF4400" alt="npm version"></a>
    <a href="LICENSE"><img src="https://img.shields.io/npm/l/nxspub?style=for-the-badge&color=000000&labelColor=00AAFF" alt="license"></a>
  </div>
</div>

## Nxspub

`nxspub` is a release automation CLI for npm packages and pnpm workspaces.

It handles:

- commit-message linting
- branch-based version policies
- changelog generation
- git tagging and pushing
- npm publishing
- monorepo release propagation

The project assumes a Conventional Commits workflow and is designed for multi-branch release lines such as `main`, `alpha`, `beta`, and `rc`.

## Installation

```bash
pnpm add -D nxspub
```

## Quick Start

### 1. Add scripts

```json
{
  "scripts": {
    "check": "tsc --incremental --noEmit",
    "postinstall": "nxspub git-hooks",
    "version": "nxspub version",
    "release": "nxspub release"
  }
}
```

### 2. Add minimal config

You can place config in `package.json`:

```json
{
  "nxspub": {
    "git-hooks": {
      "pre-commit": "pnpm lint-staged && pnpm check"
    }
  }
}
```

Or use `nxspub.config.ts`:

```ts
import { defineConfig } from 'nxspub'

export default defineConfig({
  branches: {
    main: 'latest',
    master: 'latest',
    alpha: 'preminor',
    beta: 'preminor',
    rc: 'preminor',
  },
  'git-hooks': {
    'pre-commit': 'pnpm lint-staged && pnpm check',
  },
})
```

### 3. Install hooks

```bash
pnpm exec nxspub git-hooks
```

### 4. Release flow

```bash
pnpm version
pnpm release
```

`nxspub version` updates versions, changelogs, commits the release, and creates tags.

`nxspub release` builds the package and publishes it to npm.

## Core Concepts

### Branch Policies

Each branch can define what kind of release it is allowed to produce.

Example:

```ts
branches: {
  main: 'latest',
  alpha: 'preminor',
  beta: 'preminor',
  hotfix: 'patch',
}
```

Available branch policy types:

- `major`
- `minor`
- `patch`
- `latest`
- `premajor`
- `preminor`
- `prepatch`

Practical effect:

- `latest` allows normal stable releases.
- `pre*` branches generate prerelease versions such as `1.2.0-alpha.0`.
- restrictive branches such as `patch` prevent larger bumps from being released on that branch.

### Commit-Based Versioning

By default, `nxspub` maps commit messages to SemVer bumps:

- `major`: `feat(scope)!:`, `feat!:`, `BREAKING CHANGE:`
- `minor`: `feat:`, `feat(scope):`
- `patch`: `fix:`, `perf:`, `refactor:`

Default patterns are configurable through `versioning`.

### Changelog Generation

`nxspub` parses conventional commit messages and generates grouped changelog sections such as:

- `Features`
- `Bug Fixes`
- `Performance Improvements`
- `Refactors`
- `Reverts`

It also:

- links commits, pull requests, and issues
- extracts `BREAKING CHANGE:` details
- appends contributor sections
- archives oversized or major-version changelogs

You can restrict changelog writes to specific branches:

```ts
changelog: {
  writeOnBranches: ['main', 'master']
}
```

When running `nxspub version` on non-allowed branches, nxspub writes draft files under `.nxspub/changelog-drafts/*`.  
When you later run `nxspub version` on an allowed branch, matching drafts are auto-imported and deduplicated.
Drafts that are behind/ahead of current target version are kept and reported as warnings, so they are not silently dropped.

You can audit draft health manually:

```bash
nxspub draft-doctor --cwd . --target 1.3.0
```

`nxspub version` and `nxspub release` also use a repository lock file under Git metadata (for example `.git/nxspub/version.lock`) to prevent concurrent pipelines from mutating version/tag state at the same time.

## Configuration

### Full Example

```ts
import { defineConfig } from 'nxspub'

export default defineConfig({
  workspace: {
    mode: 'locked',
    passive: 'patch',
  },
  branches: {
    main: 'latest',
    master: 'latest',
    alpha: 'preminor',
    beta: 'preminor',
    rc: 'preminor',
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
    writeOnBranches: ['main', 'master'],
    labels: {
      feat: 'Features',
      fix: 'Bug Fixes',
      perf: 'Performance Improvements',
      refactor: 'Refactors',
      revert: 'Reverts',
      deps: 'Dependencies',
    },
  },
  lint: {
    'commit-msg': {
      pattern:
        /^(revert: )?(feat|fix|docs|dx|style|refactor|perf|test|workflow|build|ci|chore|types|wip|release)(\([^)]+\))?(!)?: .{1,50}/,
      message: 'Invalid commit message format.',
    },
  },
  'git-hooks': {
    'pre-commit': 'pnpm lint-staged && pnpm check',
    'commit-msg': 'pnpm exec nxspub lint --edit "$1"',
  },
  scripts: {
    releaseBuild: 'pnpm run build',
  },
})
```

### Config Locations

`nxspub` reads config from:

1. `nxspub.config.ts`
2. `nxspub.config.mjs`
3. `nxspub.config.js`
4. `nxspub.config.cjs`
5. `package.json#nxspub`

File-based config is merged with `package.json#nxspub` and defaults.

### Workspace Options

```ts
workspace: {
  mode: 'locked' | 'independent',
  passive: 'patch' | 'follow' | 'none'
}
```

`mode`:

- `locked`: all packages receive the same next version
- `independent`: each package is versioned individually

`passive`:

- `patch`: dependents get a patch bump when internal dependencies change
- `follow`: dependents inherit the highest bump from changed dependencies
- `none`: internal dependency changes do not trigger passive bumps

## Commands

### `nxspub git-hooks`

Install configured hooks into `.git/hooks`.

Options:

- `--cwd <cwd>`: run against a target repository instead of the current shell directory
- `--dry`: preview generated hook content without writing files

Example:

```bash
pnpm exec nxspub git-hooks --cwd ./packages/app --dry
```

### `nxspub lint --edit <path>`

Validate a commit message file, typically from the `commit-msg` hook.

Options:

- `--cwd <cwd>`: resolve relative paths and config from a target repository
- `--edit <path>`: path to the commit message file

Example:

```bash
pnpm exec nxspub lint --edit .git/COMMIT_EDITMSG
```

### `nxspub version`

Calculate the next version, update `package.json`, generate changelog content, create a release commit, create tags, and push to remote.

Options:

- `--cwd <cwd>`: operate on a target repository
- `--dry`: preview version and changelog changes without writing files

Example:

```bash
pnpm exec nxspub version --dry
pnpm exec nxspub version --cwd /path/to/repo
```

### `nxspub release`

Build and publish a package or workspace.

Options:

- `--cwd <cwd>`: operate on a target repository
- `--dry`: run publish in preview mode
- `--provenance`: pass `--provenance` to `pnpm publish`
- `--registry [url]`: override the npm registry
- `--access [access]`: publish access, default `public`
- `--tag [tag]`: override the npm dist-tag
- `--branch <branch>`: override detected branch name
- `--skipBuild`: skip the build step
- `--skipSync`: skip remote synchronization checks

Example:

```bash
pnpm exec nxspub release --dry
pnpm exec nxspub release --registry https://registry.npmjs.org
pnpm exec nxspub release --cwd /path/to/repo --branch main
```

## Git Hook Setup

Typical hook setup:

```json
{
  "nxspub": {
    "git-hooks": {
      "pre-commit": "pnpm lint-staged && pnpm check",
      "commit-msg": "pnpm exec nxspub lint --edit \"$1\""
    }
  }
}
```

If `commit-msg` is not configured, `nxspub git-hooks` injects a default one automatically.

## Monorepo Behavior

Workspace support is implemented.

`nxspub` scans workspace packages from:

- `pnpm-workspace.yaml`
- `package.json#workspaces`

For workspace releases it will:

- detect changed packages from git history
- compute release bumps per package
- propagate dependency-driven bumps
- update internal dependency ranges
- generate per-package changelogs
- generate a root changelog summary
- create package tags and global tags

## `--cwd` Support

All commands support `--cwd`.

Use it when:

- running `nxspub` from outside the target repository
- operating on a nested package from a larger shell session
- automating releases from scripts or CI runners with a shared working directory

Example:

```bash
pnpm exec nxspub version --cwd /absolute/path/to/repo
pnpm exec nxspub release --cwd /absolute/path/to/repo
```

`--cwd` affects:

- config loading
- git branch detection
- git history lookup
- repository URL lookup
- changelog link generation
- package and workspace scanning

## Requirements and Assumptions

- Node.js `>=20`
- pnpm `>=9.12.3`
- git repository with a configured `origin`
- Conventional Commits discipline
- clean working tree before `version` and `release`

## Typical CI Usage

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm test
pnpm exec nxspub version --cwd .
pnpm exec nxspub release --cwd . --provenance
```

If your CI already guarantees branch state and fetch depth, `--skipSync` can be used deliberately, but it weakens the preflight safety checks.

## Troubleshooting

### Branch not configured

If you see an error like:

```text
Admission Denied: Branch "feature/x" not configured.
```

Add the branch pattern to `branches`, or override the branch explicitly with:

```bash
pnpm exec nxspub release --branch main
```

### No version bump detected

If `nxspub version` reports no version-triggering commits:

- check your commit messages
- ensure the commits are after the last release commit
- verify your custom `versioning` regex rules

### Publish skipped

If publish is skipped, `nxspub` has determined that the target package version is already present in the registry.

## Development

```bash
pnpm install
pnpm run check
pnpm test
pnpm run lint
```

## Resources

- [Learn Nxspub](https://nxsjs.com)
- [npm package](https://www.npmjs.com/package/nxspub)

## Contribution

Read the [Contributing Guide](https://github.com/nxsjs/nxspub/blob/main/.github/CONTRIBUTING.md) before opening a pull request.

<a href="https://github.com/nxsjs/nxspub/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nxsjs/nxspub&max=20&columns=12" />
</a>

<sub>Note: showing the first 500 contributors only due to GitHub image size limits.</sub>
