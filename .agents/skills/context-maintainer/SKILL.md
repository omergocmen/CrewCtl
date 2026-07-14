---
name: context-maintainer
description: Maintain accurate module and page documentation under .agents/context after repository changes. Use after code, configuration, UI, API, role, test, or architecture changes; when auditing stale context; when adding a module or page; and when recording major behavioral changes in the standard context format.
---

# Context Maintainer

Keep `.agents/context` aligned with the current repository without turning it into a raw changelog.

## Workflow

1. Read `.agents/context/index.md`. Map each source changed in the current task to its owning context files.
2. Distinguish files changed in the current task from unrelated pre-existing working-tree changes. Never document an unrelated dirty file as work completed by the current task.
3. Read the changed source and its existing context. Update current-state documentation when responsibilities, behavior, inputs, outputs, contracts, dependencies, configuration, user flows, risks, or verification paths changed.
4. Correct incomplete or stale information encountered in the relevant context, but only from repository evidence. Do not infer unsupported behavior.
5. Add a new context file when a new module, page, or independently maintained feature surface has no owner. Add its source mapping to `index.md`.
6. Preserve the standard section order:

   ```text
   # <Area> Context
   Sources
   Last verified
   Purpose
   Responsibilities / Current behavior
   Contracts and invariants
   Interactions
   Verification
   Major Changes
   ```

   Omit a section only when it truly does not apply. Keep paths repository-relative and wrap them in backticks.

## Major change rule

Record a major change when it alters at least one of these:

- a public CLI command, HTTP/SSE API, persisted schema, config contract, role protocol, or module boundary;
- a page-level workflow or a user-visible capability;
- security, permissions, process execution, recovery, compatibility, or migration behavior;
- a cross-module dependency or operational requirement that future work must know.

Do not record formatting, comments, typo fixes, test-only refactors, or internal renames with no contract impact.

Insert new entries at the top of `Major Changes` using:

```markdown
### YYYY-MM-DD — <short title>

- **Change:** <what changed>
- **Reason:** <why it changed>
- **Impact:** <affected users, modules, APIs, data, or workflows>
- **Compatibility:** <migration or backward-compatibility effect; `None` if absent>
- **Verification:** <tests or checks proving the new state>
- **Files:** `<path>`, `<path>`
```

Use the repository's current local date. Merge one logical change into one entry and avoid duplicating the same entry across contexts; record it in each context only when its future maintainers need the fact.

## Completion checks

- Ensure every changed source has a context owner or a deliberate `N/A` reason.
- Ensure source paths exist and descriptions state current behavior, not planned behavior.
- Ensure new context files appear in `index.md` and overlapping contexts link to each other.
- Ensure major entries are newest first and contain evidence-based verification.
- Report which context files changed. If none changed, state which relevant contexts were checked and why no update was needed.
