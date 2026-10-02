# Security Test Expansion Implementation Plan

**Goal:** Expand meaningful integration coverage and obtain a separate user decision for each security fix.

**Architecture:** Exercise the real stdio MCP server with controlled external binaries. Add executable pending regressions for known bugs; activate them as their fixes are approved and implemented.

**Tech Stack:** Node >=18, node:test, MCP SDK, temporary filesystem fixtures.

**Spec:** SECURITY-REVIEW.md and the user's request to add useful tests and ask individually about fixes.

## Global constraints

- Preserve existing user edits and the shell-injection fix.
- Ask about one proposed fix at a time; do not implement an unapproved fix.
- Committing and publishing the release are authorized by the user. Do not contact the reporter.
- Implement in this session; no delegated work needed.

## Review focus

- Invalid URLs must not launch downloader processes.
- Missing dependencies, subtitle output, and converter failure must return tool errors.
- Failure cleanup and simultaneous requests must preserve unrelated files.
- Disabling saving must preserve prior transcripts.
- File writes must not follow planted output symlinks.

### Task 1: Expand integration fixtures and current behavior coverage

Files: test/security.test.js.

- [x] Add fixture controls for absent subtitles, converter failure, absent binaries, raw tool arguments, and SRT content.
- [x] Add tests for error responses, dependency failures, CRLF subtitle processing, literal path metacharacters, unrelated-file preservation, and option separation.
- [x] Run npm test and verify existing and new current-behavior tests pass.

### Task 2: Add pending regressions for known gaps

Files: test/security.test.js.

- [x] Add executable pending regressions for destination/type validation, canonical URLs and supported routes, preservation of existing transcripts, failure cleanup, and symlink safety.
- [x] Confirm failing pending regressions expose the intended bug, not fixture failures.
- [x] Add deterministic concurrency and resource-limit tests when the corresponding policy is approved, avoiding tests tied to invented limits.

### Task 3: Apply individually approved fixes

Files: index.js, test/security.test.js, package files where required.

- [x] Ask one question per fix, beginning with URL validation and canonicalization.
- [x] For each approved fix, activate its regression tests, observe failures, implement minimally, and rerun npm test.
- [x] For declined fixes, retain documented pending regressions as appropriate and report their status. Automatic remote components remain enabled by user decision; no pending regressions remain.
- [x] Verify git diff --check and record final passing/pending totals: 68 passing, zero failing/pending/skipped on current Node and Node 18; zero npm audit findings.
