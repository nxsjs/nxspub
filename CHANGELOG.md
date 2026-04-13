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
