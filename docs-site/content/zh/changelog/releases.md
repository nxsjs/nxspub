---
title: 最新 Changelog
---

## [0.10.0](https://github.com/nxsjs/nxspub/compare/0.9.1...0.10.0) (2026-04-21)

### Features

* add mcp and skills ([7b696da](https://github.com/nxsjs/nxspub/commit/7b696da57a97b8c119fa2b3b7305735179ed85f7))

### Contributors

<div><a href="https://github.com/nyxsola"><img src="https://unavatar.io/github/16678506+nyxsola@users.noreply.github.com?fallback=https%3A%2F%2Fwww.gravatar.com%2Favatar%2Fd8efd9dde99e5c03ce528af9c9c7c6e2%3Fd%3Didenticon" width="32" title="nyxsola"></a>&nbsp;&nbsp;</div>

nyxsola

## [0.9.1](https://github.com/nxsjs/nxspub/compare/0.9.0...0.9.1) (2026-04-21)

### Bug Fixes

* format changelog bodies as bullet lists ([862c262](https://github.com/nxsjs/nxspub/commit/862c262d61872f604efd5494b4abd188f8335ece))
* **console:** provide fallback for project logo in web dashboard ([0c5266f](https://github.com/nxsjs/nxspub/commit/0c5266f22adebbb055552d8b15793c9eed84aa22))

### Contributors

<div><a href="https://github.com/nyxsola"><img src="https://unavatar.io/github/16678506+nyxsola@users.noreply.github.com?fallback=https%3A%2F%2Fwww.gravatar.com%2Favatar%2Fd8efd9dde99e5c03ce528af9c9c7c6e2%3Fd%3Didenticon" width="32" title="nyxsola"></a>&nbsp;&nbsp;</div>

nyxsola

## [0.9.0](https://github.com/nxsjs/nxspub/compare/0.8.1...0.9.0) (2026-04-21)

### Features

* nxspub deploy ([53c09eb](https://github.com/nxsjs/nxspub/commit/53c09eb790f2a2f21f31474435f76791ac499fcd))
* **console:** implement strict pre-flight validation logic ([3768a27](https://github.com/nxsjs/nxspub/commit/3768a2754a38fc8ecc5e3a99b0df00f251645eb5))

### Contributors

<div><a href="https://github.com/nyxsola"><img src="https://unavatar.io/github/16678506+nyxsola@users.noreply.github.com?fallback=https%3A%2F%2Fwww.gravatar.com%2Favatar%2Fd8efd9dde99e5c03ce528af9c9c7c6e2%3Fd%3Didenticon" width="32" title="nyxsola"></a>&nbsp;&nbsp;</div>

nyxsola

## [0.8.1](https://github.com/nxsjs/nxspub/compare/0.8.0...0.8.1) (2026-04-20)

### Refactors

* transition `preview` command to `console` ([ccac790](https://github.com/nxsjs/nxspub/commit/ccac790ec7e2265e9eb5f19bf2e50f4801b05162))
  - [WARNING] 'preview' is deprecated and will be removed in future versions. Please use 'console' instead.
* rename `preview` command to `console` ([142e7c0](https://github.com/nxsjs/nxspub/commit/142e7c0c8a6d539562265946beff87147db72d72))

### Contributors

<div><a href="https://github.com/nyxsola"><img src="https://unavatar.io/github/16678506+nyxsola@users.noreply.github.com?fallback=https%3A%2F%2Fwww.gravatar.com%2Favatar%2Fd8efd9dde99e5c03ce528af9c9c7c6e2%3Fd%3Didenticon" width="32" title="nyxsola"></a>&nbsp;&nbsp;</div>

nyxsola

## [0.8.0](https://github.com/nxsjs/nxspub/compare/0.7.0...0.8.0) (2026-04-20)

### Features

* **preview:** complete web mvp and hardening ([242c5bb](https://github.com/nxsjs/nxspub/commit/242c5bbea0386f5d2a00a9a239c39d66c3398099))
  - add snapshot delete endpoint and UI flow
  - enforce readonly-strict on all write endpoints
  - add preview-web feature flag rollback switch
  - add web tsconfig + css side-effect type declaration
  - extend integration tests for prune/snapshot/port fallback
  - update README and preview-web-design docs

### Contributors

<div><a href="https://github.com/nyxsola"><img src="https://unavatar.io/github/16678506+nyxsola@users.noreply.github.com?fallback=https%3A%2F%2Fwww.gravatar.com%2Favatar%2Fd8efd9dde99e5c03ce528af9c9c7c6e2%3Fd%3Didenticon" width="32" title="nyxsola"></a>&nbsp;&nbsp;</div>

nyxsola

## [0.7.0](https://github.com/nxsjs/nxspub/compare/0.6.4...0.7.0) (2026-04-19)

### Features

* implement `nxspub preview` base functionality ([44341e4](https://github.com/nxsjs/nxspub/commit/44341e401801a093ec56bc2f820a99da8cf617eb))
* **release:** implement branch-specific release strategies ([8f0a584](https://github.com/nxsjs/nxspub/commit/8f0a584c629889fea1cc4944025ac7714610144f))
* **draft:** implement auto-cleanup for stale changelog drafts ([4b909c7](https://github.com/nxsjs/nxspub/commit/4b909c77f148634a8f0a9f3f0775eabc4eed665a))

### Bug Fixes

* **release:** fix package manager detection and optimize workspace release flow ([13fb508](https://github.com/nxsjs/nxspub/commit/13fb50808c55e8c3343d3bf6789003728c1757ae))
* **lock:** mitigate lock stale check risk due to PID reuse ([7d65a70](https://github.com/nxsjs/nxspub/commit/7d65a7094418d7854b31d52f6be5da949e77a4c0))

### Contributors

<div><a href="https://github.com/nyxsola"><img src="https://unavatar.io/github/16678506+nyxsola@users.noreply.github.com?fallback=https%3A%2F%2Fwww.gravatar.com%2Favatar%2Fd8efd9dde99e5c03ce528af9c9c7c6e2%3Fd%3Didenticon" width="32" title="nyxsola"></a>&nbsp;&nbsp;</div>

nyxsola

## [0.6.4](https://github.com/nxsjs/nxspub/compare/0.6.3...0.6.4) (2026-04-19)

### Bug Fixes

* **release:** prevent mis-prerelease & auto-rollback tags ([a8ecb2b](https://github.com/nxsjs/nxspub/commit/a8ecb2bfa5f3c7aa02b61928d100c2b6acb50aec))
* target atomic version pushes to current branch ([0832b22](https://github.com/nxsjs/nxspub/commit/0832b22398a36c0e04e6992c02a576e1c1c36f62))
* harden prerelease channel handling and atomic pushes ([c0c051a](https://github.com/nxsjs/nxspub/commit/c0c051a64370b07cad413f590ad3036d3cf5413a))
* harden multi-branch release tag and lock handling ([dc5eec4](https://github.com/nxsjs/nxspub/commit/dc5eec4ed4865152e8cfeabe833a447605701f98))
* harden draft locking and unreadable draft reporting ([b5fefaa](https://github.com/nxsjs/nxspub/commit/b5fefaafbbba41d8f8677639414a2afe2921d0b4))
* store release state per branch ([db1bee1](https://github.com/nxsjs/nxspub/commit/db1bee1ec85411a85580d209ed7af93875bf6532))

### Refactors

* harden multi-branch release flow ([3d3bb51](https://github.com/nxsjs/nxspub/commit/3d3bb512dc1b0a9d8a26f2a4c2d582ab05dffa5b))
* persist changelog drafts across branch releases ([7990bdb](https://github.com/nxsjs/nxspub/commit/7990bdbd65115af07433d405916dd85c4634e365))

### Contributors

<div><a href="https://github.com/nyxsola"><img src="https://unavatar.io/github/16678506+nyxsola@users.noreply.github.com?fallback=https%3A%2F%2Fwww.gravatar.com%2Favatar%2Fd8efd9dde99e5c03ce528af9c9c7c6e2%3Fd%3Didenticon" width="32" title="nyxsola"></a>&nbsp;&nbsp;</div>

nyxsola

## [0.6.3](https://github.com/nxsjs/nxspub/compare/0.6.2...0.6.3) (2026-04-19)

### Bug Fixes

* typing and debug logging ([af7c127](https://github.com/nxsjs/nxspub/commit/af7c12719975aa774fd79dddd9a2679922ebf1d1))

### Refactors

* refine naming in release workflow ([b7b145b](https://github.com/nxsjs/nxspub/commit/b7b145b66dfe1b020c7bb072fcf39e4eeb1a5f7f))
* remove deprecated logger and git aliases ([dda0980](https://github.com/nxsjs/nxspub/commit/dda09800b07ca21e3829a2cdc06967cbf482b6e8))
* rename branch policy resolver ([a1e8870](https://github.com/nxsjs/nxspub/commit/a1e88708a73b4729549ac69f64469d82c2aac09e))
* rename branch contract terminology to policy ([a1d91b8](https://github.com/nxsjs/nxspub/commit/a1d91b82d4c646131b4cb2fd0a8e8a8b62dd02e2))
* unify logger and branch naming ([a4d7ade](https://github.com/nxsjs/nxspub/commit/a4d7aded65804e7c68a2838e4e5aeaf9b7355f0c))
* cli error handling and command types ([8745efd](https://github.com/nxsjs/nxspub/commit/8745efdcd3286953efd47c0076e5d1817e5752d1))
* **changelog:** upgrade commit parsing logic ([65c337f](https://github.com/nxsjs/nxspub/commit/65c337fa22b7e74ca8e0e7c6583835d3e1584111))

### Contributors

<div><a href="https://github.com/nyxsola"><img src="https://unavatar.io/github/16678506+nyxsola@users.noreply.github.com?fallback=https%3A%2F%2Fwww.gravatar.com%2Favatar%2Fd8efd9dde99e5c03ce528af9c9c7c6e2%3Fd%3Didenticon" width="32" title="nyxsola"></a>&nbsp;&nbsp;</div>

nyxsola

## [0.6.2](https://github.com/nxsjs/nxspub/compare/0.6.1...0.6.2) (2026-04-18)

### Bug Fixes

* remove separators from workspace root changelog ([33de16f](https://github.com/nxsjs/nxspub/commit/33de16ffe8c72f245a954c61fde888afc42c49cb))
* adjust changelog blockquote spacing for body and breaking notes ([dec9e9a](https://github.com/nxsjs/nxspub/commit/dec9e9a2df1966713572ef0ccbf14f82a05e9e31))
* format workspace changelog package headings with version suffix ([1d861bc](https://github.com/nxsjs/nxspub/commit/1d861bc8e3ea38b5e352d7ae63397a8227a6b1e4))

### Contributors

<div><a href="https://github.com/nyxsola"><img src="https://unavatar.io/github/16678506+nyxsola@users.noreply.github.com?fallback=https%3A%2F%2Fwww.gravatar.com%2Favatar%2Fd8efd9dde99e5c03ce528af9c9c7c6e2%3Fd%3Didenticon" width="32" title="nyxsola"></a>&nbsp;&nbsp;</div>

nyxsola

## [0.6.1](https://github.com/nxsjs/nxspub/compare/0.6.0...0.6.1) (2026-04-18)

### Bug Fixes

* user profile links for hosted git providers ([a62720b](https://github.com/nxsjs/nxspub/commit/a62720b3b1f8cba1ed86223f0c05b24b07b4e762))

### Contributors

<div><a href="https://github.com/nyxsola"><img src="https://unavatar.io/github/16678506+nyxsola@users.noreply.github.com?fallback=https%3A%2F%2Fwww.gravatar.com%2Favatar%2Fd8efd9dde99e5c03ce528af9c9c7c6e2%3Fd%3Didenticon" width="32" title="nyxsola"></a>&nbsp;&nbsp;</div>

nyxsola

## [0.6.0](https://github.com/nxsjs/nxspub/compare/0.5.1...0.6.0) (2026-04-18)

### Features

* add npm and yarn package manager support ([0ebe721](https://github.com/nxsjs/nxspub/commit/0ebe7217f730265771a4e52a5edeb2f244022d07))

### Contributors

<div><a href="https://github.com/nxsjs/nxspub/nyxsola"><img src="https://unavatar.io/github/16678506+nyxsola@users.noreply.github.com?fallback=https%3A%2F%2Fwww.gravatar.com%2Favatar%2Fd8efd9dde99e5c03ce528af9c9c7c6e2%3Fd%3Didenticon" width="32" title="nyxsola"></a>&nbsp;&nbsp;</div>

nyxsola

## [0.5.1](https://github.com/nxsjs/nxspub/compare/0.5.0...0.5.1) (2026-04-18)

### Bug Fixes

* cwd-aware git lookups and commit parsing ([5c1b5ff](https://github.com/nxsjs/nxspub/commit/5c1b5ff102e2d66833f27e4021d2479fdadb5e87))
* Potential fix for code scanning alert no. 8: Incomplete URL substring sanitization ([#10](https://github.com/nxsjs/nxspub/pull/10)) ([43f3f82](https://github.com/nxsjs/nxspub/commit/43f3f82d7e5d3760e37a3a9deaf498899e3dead4))
  - Co-authored-by: Copilot Autofix powered by AI <62310815+github-advanced-security[bot]@users.noreply.github.com>

### Contributors

<div><a href="https://github.com/nxsjs/nxspub/nyxsola"><img src="https://unavatar.io/github/16678506+nyxsola@users.noreply.github.com?fallback=https%3A%2F%2Fwww.gravatar.com%2Favatar%2Fd8efd9dde99e5c03ce528af9c9c7c6e2%3Fd%3Didenticon" width="32" title="nyxsola"></a>&nbsp;&nbsp;</div>

nyxsola

## [0.5.0](https://github.com/nxsjs/nxspub/compare/0.4.1...0.5.0) (2026-04-18)

### Features

* **provider:** integrate version comparison and user profile linking ([1fac5b9](https://github.com/nxsjs/nxspub/commit/1fac5b9831219759710f0e1fe88615af7c61ed90))
* **changelog:** enhance commit parsing for multiple PRs and issues ([fd89d02](https://github.com/nxsjs/nxspub/commit/fd89d02e0b61cb8d926bea61c4eedf1d103cc359))
* **changelog:** support rendering commit body as blockquotes in entries ([a50aaea](https://github.com/nxsjs/nxspub/commit/a50aaea0e264b1071d92d5c803bb27dc05c11ba3))
* **workspace:** identify pre-release promotion during package scan ([53724f7](https://github.com/nxsjs/nxspub/commit/53724f79a890a4a08d372231f262e392aea0143b))
* **git:** add history segmentation and tag mapping for legacy projects ([deae434](https://github.com/nxsjs/nxspub/commit/deae434bd03a5f60e0421c052c1950dea6098f52))
* **lint:** support functional callbacks for commit-msg validation ([43e7816](https://github.com/nxsjs/nxspub/commit/43e781694149ee3a7e2da1685b9c5f9a1d3ac191))

### Bug Fixes

* **version:** allow promoting pre-release to stable when no new commits found ([40fe7fa](https://github.com/nxsjs/nxspub/commit/40fe7fa40feac5ae05ba8cdaf916403a8b402783))

### Refactors

* **changelog:** integrate parseCommit and LinkProvider for package updates ([5b8acea](https://github.com/nxsjs/nxspub/commit/5b8acea18a6116c74cc4fd3196ec94a9aea556a9))

### Contributors

<div><a href="https://github.com/nxsjs/nxspub/nyxsola"><img src="https://unavatar.io/github/16678506+nyxsola@users.noreply.github.com?fallback=https%3A%2F%2Fwww.gravatar.com%2Favatar%2Fd8efd9dde99e5c03ce528af9c9c7c6e2%3Fd%3Didenticon" width="32" title="nyxsola"></a>&nbsp;&nbsp;</div>

nyxsola

## [0.4.1](https://github.com/nxsjs/nxspub/compare/v0.4.0...v0.4.1) (2026-04-17)

### Bug Fixes

* **git:** skip remote sync check in CI environments ([3bfd6ca](https://github.com/nxsjs/nxspub/commit/3bfd6ca))

### Contributors

<div><a href="https://github.com/nyxsola"><img src="https://unavatar.io/github/16678506+nyxsola@users.noreply.github.com?fallback=https%3A%2F%2Fwww.gravatar.com%2Favatar%2Fd8efd9dde99e5c03ce528af9c9c7c6e2%3Fd%3Didenticon" width="32" title="nyxsola"></a>&nbsp;&nbsp;</div>

nyxsola

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
