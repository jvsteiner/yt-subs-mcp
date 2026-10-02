# Security changes and test results

2026-10-03. Security release: 1.0.8.

## Approved changes implemented

- Shell commands replaced with direct executable calls and argument arrays. Subtitle filtering uses Node instead of a shell pipeline.
- YouTube hosts, routes, schemes, IDs, and argument types are validated before launching dependencies. Downloads use a canonical HTTPS watch URL.
- MCP SDK minimum raised to `^1.32.0`; affected transitive dependencies updated in the lockfile.
- Process deadlines: five minutes for downloading, one minute for conversion, and 10 seconds per dependency check. Positive integer environment overrides are documented in README.md.
- URLs limited to 2 KB; VTT and SRT files checked against a 10 MB limit before processing. At most two requests run concurrently per server process. Playlist downloading is disabled.
- Each request uses a private temporary directory. Cleanup runs after success and failure; cleanup errors are logged.
- Saved transcripts are written privately and atomically renamed into place, without following an existing destination symlink. Disabling saving preserves prior transcripts.
- Chrome cookies are opt-in via `YT_SUBS_USE_BROWSER_COOKIES=true`.
- Local yt-dlp configuration is ignored for dependency checks and downloads.
- Tool guidance ties use to a user request instead of instructing the assistant to always call it.

Automatic `ejs:github` remote-component downloads remain enabled, as explicitly requested.

## Verification

- 68 integration tests pass on the current Node runtime and Node 18.
- No failing, skipped, or pending tests.
- `npm audit` reports zero known vulnerabilities in the installed dependency tree.
- `git diff --check` passes.

Tests cover shell payloads, URL and type validation, supported URL routes, dependency/download/conversion failures, timeout termination, subtitle-size boundaries, option separation, configuration and cookie flags, request limits, recovery after failures, overlapping requests for the same video, cleanup, existing-file preservation, atomic saves, and planted output symlinks.

## Practical limits

The integration tests run the real stdio MCP server and filesystem operations with controlled external binaries. They do not exercise live YouTube downloads, actual browser-cookie extraction, or downloaded JavaScript components. Node 18 compatibility is verified, but Windows behavior has not been tested.

The 10 MB checks happen after the downloader/converter has produced its file; they bound input to subsequent processing rather than imposing a disk quota during file generation. Process timeouts terminate the directly launched process and do not guarantee termination of every descendant it might spawn. The concurrency limit applies separately to each server process.

`npm audit` covers npm dependencies, not the separately installed yt-dlp, ffmpeg, or JavaScript runtime. Keep those tools updated. Automatic remote components remain an intentional external-code trust boundary.

This report records implementation and verification. No message to the reporter has been sent.
