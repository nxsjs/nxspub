---
name: nxspub
description: Execute nxspub version/release/deploy workflows safely with preview-first and approval gates.
---

# nxspub Release Operator

Use this skill when the user asks to run `nxspub` release workflows (`version`, `release`, `deploy`) or to diagnose release/deploy readiness.

## When to Use

- The user asks to bump versions or generate changelog entries.
- The user asks to publish packages.
- The user asks to deploy or rollback deployments.
- The user asks for release readiness checks before execution.

## Execution Contract

- Start with read/preview actions first.
- Prefer deterministic command output (use JSON options when available).
- Do not perform non-dry writes until the user explicitly approves.
- Surface blockers before execution (dirty tree, branch policy, missing env, missing registry auth).

## Workflow (Required Order)

1. Read context first.
2. Run preview/plan in dry mode.
3. Explain risks and blockers.
4. Execute non-dry only after explicit user approval.

## Standard Command Sequence

```bash
nxspub version --dry
nxspub release --dry
nxspub deploy --plan
```

Then run non-dry equivalents only when approved.

## Safety Rules

- Never run non-dry release operations without explicit confirmation.
- If branch policy blocks release, stop and report the policy conflict.
- If repository has dirty working tree for non-dry version flow, stop and ask user to resolve.
- For rollback, require a concrete deployment id.
- Never fabricate changelog content. Use git history and nxspub output as source of truth.

## Expected Output Style

- Provide a short preflight summary:
  - current branch
  - target version/tag/env
  - dry-run result
  - blocking items
- Provide an execution summary after each non-dry step:
  - changed files
  - produced tags
  - published package/version
  - deployment id (if deploy executed)

## MCP Integration

When MCP server is available, prefer:

- `nxspub_get_context`
- `nxspub_preview`
- `nxspub_deploy_plan`
- `nxspub_version`
- `nxspub_release`
- `nxspub_deploy_execute`

Use dry-run first, then require `confirm: "YES"` for non-dry operations.

## Failure Handling

- If `version` fails, do not continue to `release`.
- If `release` fails, do not continue to `deploy`.
- For deploy failure, propose rollback only when a valid deployment id is available.
- Always return actionable next steps (exact command or config field to fix).
