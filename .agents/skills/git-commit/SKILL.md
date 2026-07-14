---
name: git-commit
description: Inspect, stage, and commit all current Git changes with a Conventional Commits message derived from the staged diff. Use when the user asks to commit the working tree, include everything shown in Git Changes, create a standard commit, or prepare a clean local commit without pushing.
---

# Git Commit

Create one safe, reviewable local commit containing all current repository changes.

## Workflow

1. Run `git rev-parse --is-inside-work-tree`, `git status --short --branch`, and `git diff --stat`. Stop if the directory is not a Git repository or there are no changes.

2. Inspect tracked diffs and the names and relevant contents of untracked files. If an obvious secret, private key, credential file, unexpectedly large artifact, or generated dependency directory would be committed, stop before staging and tell the user exactly what needs review. Respect `.gitignore`; do not force-add ignored files.

3. Treat all additions, modifications, deletions, renames, and already-staged changes as the requested scope. If the changes contain clearly unrelated concerns that should not share a commit, summarize the groups and ask whether to keep one commit or split them. Do not guess.

4. Run `git add -A` to add everything currently represented by Git Changes to the index, including deletions. Do not use path-limited staging.

5. Review the actual staged result with:

   ```text
   git diff --cached --stat
   git diff --cached --name-status
   git diff --cached
   ```

   Base the commit message only on this staged diff. If the index is empty, stop without creating a commit.

6. Write a Conventional Commits message in this form:

   ```text
   <type>(<optional-scope>): <subject>

   <optional body explaining why and notable behavior>
   ```

   Select the narrowest accurate type:

   - `feat`: user-visible capability
   - `fix`: bug correction
   - `docs`: documentation only
   - `style`: formatting only, with no behavior change
   - `refactor`: code restructuring with no feature or fix
   - `perf`: performance improvement
   - `test`: tests only
   - `build`: build system or dependency changes
   - `ci`: continuous-integration configuration
   - `chore`: maintenance not covered above
   - `revert`: reversal of an earlier commit

   Use an optional scope only when one concise component name is evident. Write the subject in lowercase imperative English, without a trailing period; keep the complete first line at 72 characters or fewer. Add a body only when it adds useful context. Add a breaking-change marker or footer only when the diff clearly proves it. Do not add AI attribution or co-author trailers unless the user requests them.

7. Commit normally with `git commit`. Pass the subject and optional body as separate message arguments; do not open an interactive editor. Never amend an existing commit. Never use `--no-verify`, force options, reset, clean, stash, or push. If a hook fails, report its output and leave the changes staged.

8. Verify with `git status --short --branch` and `git show --stat --oneline --decorate -1`. Report the commit hash, final message, included file summary, and any changes left uncommitted.
