## [0.4.0](https://github.com/nxsjs/nxspub/compare/v0.3.1...v0.4.0) (2026-04-17)

### Features

* **git:** encapsulate pre-release safety checks into ensureGitSync ([40c81ea](https://github.com/nxsjs/nxspub/commit/40c81ea))
* **changelog:** add workspace-level contributor recognition ([cd24301](https://github.com/nxsjs/nxspub/commit/cd24301))

### Bug Fixes

* Potential fix for code scanning alert no. 5: Incomplete URL substring sanitization (#9) ([685337f](https://github.com/nxsjs/nxspub/commit/685337f))

### Contributors

<div><a href="https://github.com/nyxsola"><img src="https://unavatar.io/github/16678506+nyxsola@users.noreply.github.com?fallback=https%3A%2F%2Fwww.gravatar.com%2Favatar%2Fd8efd9dde99e5c03ce528af9c9c7c6e2%3Fd%3Didenticon" width="32" title="nyxsola"></a>&nbsp;&nbsp;</div>

nyxsola

## [0.3.1](https://github.com/nxsjs/nxspub/compare/v0.3.0...v0.3.1) (2026-04-17)

### Bug Fixes

* **changelog:** fix avatar layout to display as inline-flow ([023608d](https://github.com/nxsjs/nxspub/commit/023608d))

### Contributors

<div><a href="https://github.com/nyxsola"><img src="https://unavatar.io/github/16678506+nyxsola@users.noreply.github.com?fallback=https%3A%2F%2Fwww.gravatar.com%2Favatar%2Fd8efd9dde99e5c03ce528af9c9c7c6e2%3Fd%3Didenticon" width="32" title="nyxsola"></a>&nbsp;&nbsp;</div>

nyxsola

## [0.3.0](https://github.com/nxsjs/nxspub/compare/v0.2.3...v0.3.0) (2026-04-17)

### Features

* **changelog:** enhance contributor recognition with PR links and avatar grid ([0d7c9d7](https://github.com/nxsjs/nxspub/commit/0d7c9d7))

### Bug Fixes

* **git:** support IP-based and non-standard port GitLab instances ([ffc6ea6](https://github.com/nxsjs/nxspub/commit/ffc6ea6))
* **pkg:** support resolutions and pnpm overrides in dependency updates ([3c64dda](https://github.com/nxsjs/nxspub/commit/3c64dda))
* **git:** stop side-chain penetration at release commits to prevent duplicate logs ([246efe4](https://github.com/nxsjs/nxspub/commit/246efe4))

### Contributors

<div><a href="https://github.com/nyxsola"><img src="https://unavatar.io/github/16678506+nyxsola@users.noreply.github.com?fallback=https%3A%2F%2Fwww.gravatar.com%2Favatar%2Fd8efd9dde99e5c03ce528af9c9c7c6e2%3Fd%3Didenticon" height="32" title="nyxsola"></a>&nbsp;&nbsp;</div>

nyxsola

## [0.2.3](https://github.com/nxsjs/nxspub/compare/v0.2.2...v0.2.3) (2026-04-14)

### Bug Fixes

* **cli:** correct skipBuild option definition and improve argument tolerance ([4ccd6b0](https://github.com/nxsjs/nxspub/commit/4ccd6b0))

## [0.2.2](https://github.com/nxsjs/nxspub/compare/v0.2.1...v0.2.2) (2026-04-14)

### Refactors

* **release:** standardize release commit format and enhance parser ([327515e](https://github.com/nxsjs/nxspub/commit/327515e))
* **release:** dispatch release command based on workspace config ([44e3e1b](https://github.com/nxsjs/nxspub/commit/44e3e1b))

## [0.2.1](https://github.com/nxsjs/nxspub/compare/v0.2.0...v0.2.1) (2026-04-14)

### Refactors

* **cli:** enhance workspace versioning and industrial-grade changelog ([9d528b8](https://github.com/nxsjs/nxspub/commit/9d528b8))
* rename CLI entry point to nxspub ([336fc75](https://github.com/nxsjs/nxspub/commit/336fc75))

## [0.2.0](https://github.com/nxsjs/nxspub/compare/v0.1.1...v0.2.0) (2026-04-13)

### Features

* **workspace:** implement monorepo release system with independent/locked modes ([3e8997b](https://github.com/nxsjs/nxspub/commit/3e8997b))

### Refactors

* streamline workspace changelog architecture ([8c29c08](https://github.com/nxsjs/nxspub/commit/8c29c08))
* **version:** enhance internal dependency update logic ([b5733f6](https://github.com/nxsjs/nxspub/commit/b5733f6))
* unify changelog archiving and versioning logic ([0716b41](https://github.com/nxsjs/nxspub/commit/0716b41))

## [0.1.1](https://github.com/nxsjs/nxspub/compare/v0.1.0...v0.1.1) (2026-04-13)

### Bug Fixes

* **git:** regex pattern for release commit lookup ([cb84f5f](https://github.com/nxsjs/nxspub/commit/cb84f5f))
* **deps:** robust git-hooks setup in postinstall ([b4e83a7](https://github.com/nxsjs/nxspub/commit/b4e83a7))

## [0.1.0](https://github.com/nxsjs/nxspub/compare/v0.1.0) (2026-04-13)

### Features

* **changelog:** implement size-based rotation and numbered archiving ([807dd65](https://github.com/nxsjs/nxspub/commit/807dd65))
* **packages:** add package metadata types and load/save utilities ([495ce1c](https://github.com/nxsjs/nxspub/commit/495ce1c))
* **version:** add support for monorepo versioning with dependency graph ([a512555](https://github.com/nxsjs/nxspub/commit/a512555))
* **git:** enhance getLastReleaseCommit to support workspace multi-package format ([06ebbb3](https://github.com/nxsjs/nxspub/commit/06ebbb3))
* **cli:** add --branch option to manual override branch detection ([9567774](https://github.com/nxsjs/nxspub/commit/9567774))
* **git:** implement multi-platform CI branch detection and tag-trigger recovery ([07937d7](https://github.com/nxsjs/nxspub/commit/07937d7))

### Bug Fixes

* **git:** support scoped release messages in getLastReleaseCommit ([bf51bfd](https://github.com/nxsjs/nxspub/commit/bf51bfd))
* **git:** resolve incorrect branch detection as "HEAD" in CI environments ([a081c79](https://github.com/nxsjs/nxspub/commit/a081c79))

### Refactors

* **versions:** encapsulate determineBumpType logic ([81cff5f](https://github.com/nxsjs/nxspub/commit/81cff5f))
* extract branch contract matching logic to git utility ([67267d9](https://github.com/nxsjs/nxspub/commit/67267d9))
* centralize JSON read/write logic with indent detection ([c1fa02c](https://github.com/nxsjs/nxspub/commit/c1fa02c))
