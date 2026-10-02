# Security review

This is the initial assessment, before the approved fixes. See [SECURITY-STATUS.md](SECURITY-STATUS.md) for the implemented changes and current verification results.

Reviewed 2026-10-03. The command-injection fix is local and unpublished.

## Do we need more tests?

Yes. The seven existing tests cover command-injection payloads, literal file paths, normal extraction and cleanup, downloader failure, and disabling transcript saving. They exercise the real MCP server with controlled replacement executables rather than live YouTube downloads. They do not establish that the whole package is secure.

Prioritize these additional behaviors alongside the corresponding fixes:

1. Reject non-YouTube hosts, localhost/private-network URLs, unsupported schemes, deceptive domains, credentials in URLs, and video IDs longer or shorter than 11 characters. Check missing arguments and wrong argument types. Verify rejected requests never launch the downloader. Cover valid watch and short URLs; explicitly decide support for shorts/embed URLs.
2. Ensure the downloader receives a canonical YouTube URL derived from a validated ID, and cannot interpret user input as command-line options.
3. Terminate stalled downloads and conversions within a configured timeout. Check missing binaries, missing subtitle output, and converter failures return useful tool errors.
4. Isolate simultaneous requests for the same video. Ensure failed operations clean up their own temporary files and never remove another request's files.
5. Ensure `save_to_file: false` preserves a transcript saved by an earlier request. Verify cleanup leaves unrelated subtitle files alone.

## Remaining concerns

| Priority | Finding | Evidence and consequence | Recommended change |
| --- | --- | --- | --- |
| High | URL validation does not restrict the destination | `getVideoId` searches strings with regexes. Direct evaluation accepted `https://attacker.example/watch?v=dQw4w9WgXcQ`, `http://127.0.0.1/watch?v=dQw4w9WgXcQ`, a deceptive YouTube domain, and a longer ID. The original URL is forwarded to yt-dlp. Requests to unintended destinations depend on yt-dlp's extractors and settings; no network exploitation was attempted. | Parse with `URL`, allow explicit YouTube hosts and supported schemes/routes, require an exact ID, and construct a canonical HTTPS YouTube watch URL for downloading. |
| Medium | No process timeouts or input/file-size limits | `execFileAsync` calls have no timeout. Subtitle files are loaded entirely into memory. Repeated or stalled requests can consume processes, disk, and memory. Node's default child-process output buffer is bounded, but it does not bound download time or file size. | Bound input length, process duration, subtitle size, and simultaneous work; disable playlist downloads explicitly. |
| Medium | Requests share predictable intermediate files | VTT, SRT, and TXT names depend only on video ID. Concurrent requests can overwrite or delete one another's files. Cleanup occurs only on the success path. | Use a private temporary directory per request, clean it in `finally`, and define how final transcript writes handle collisions. |
| Low | Disabling saving deletes an existing transcript | The `save_to_file: false` branch unlinks the video’s existing TXT file, including a file saved by an earlier request. | Return the extracted text without modifying an existing saved transcript. |
| Context-dependent | Predictable output paths can follow symlinks | ffmpeg overwrites SRT output and Node writes TXT output using predictable paths. A person or process able to modify the download directory could plant a symlink targeting another writable file. This requires local filesystem access; it is not an established remote exploit. | Use private temporary files and a final-write strategy that avoids following destination symlinks. |
| Review recommended | Browser cookies and downloaded remote components are enabled automatically | Every download requests Chrome cookies and allows yt-dlp's `ejs:github` remote components. Cookie handling and remote JavaScript execution depend on yt-dlp's behavior/version; the shell fix does not change this trust boundary. | Make cookies opt-in if public videos work without them; document remote-component behavior and prefer explicitly managed dependencies where practical. |

## Dependency audit

`npm audit --json` reported six affected dependency packages: three high and three moderate. The lockfile pins `@modelcontextprotocol/sdk` to 1.22.0. Reported fixes are available.

Affected packages: `@modelcontextprotocol/sdk`, `fast-uri`, `path-to-regexp`, `ajv`, `body-parser`, and `qs`.

SDK advisories include [ReDoS](https://github.com/advisories/GHSA-8r9q-7v3j-jr4g), [DNS rebinding](https://github.com/advisories/GHSA-w48q-cv73-mx4w), and [cross-client data leakage](https://github.com/advisories/GHSA-345p-7cg4-v4c7). This implementation uses stdio and one server/transport per process, so HTTP and shared-client advisories do not automatically apply. Reachability of the other dependency findings was not established in this review.

Update to a supported patched SDK release and refresh affected transitive dependencies, then rerun the tests and audit. The broad package range `^1.0.4` allows old SDK versions; raise its minimum to the patched version selected for release.

## Recommended order

Ship the verified shell-injection fix promptly. Address destination validation and dependencies next, then process limits and file isolation. The current fix has seven passing tests, but external yt-dlp/ffmpeg behavior and live downloads have not been validated by those tests. This review changed no production code or dependencies.
