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
