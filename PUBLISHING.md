# Publishing Guide

This document explains how to publish `yt-subs-mcp` to npm.

## Pre-Publishing Checklist

Before publishing, ensure:

1. ✅ All dependencies (`yt-dlp`, `ffmpeg`) are documented in README
2. ✅ Package.json has correct metadata:
   - Unique package name
   - Correct version number (follow semver)
   - Repository URLs updated
   - Author information added
3. ✅ LICENSE file exists
4. ✅ README is complete and accurate
5. ✅ .npmignore excludes unnecessary files

## Testing Before Publishing

### 1. Test the package locally

```bash
# Create a tarball
npm pack

# Install it globally to test
npm install -g ./yt-subs-mcp-1.0.0.tgz

# Test that the command works
yt-subs-mcp --help
```

### 2. Verify package contents

```bash
# Dry run to see what will be included
npm pack --dry-run
```

Should include:
- index.js
- package.json
- README.md
- LICENSE

Should NOT include:
- node_modules/
- example-script.sh
- claude-config-example.json
- .git/

## Publishing Steps

### First Time Setup

1. Create an npm account at https://www.npmjs.com/signup
2. Login via CLI:
   ```bash
   npm login
   ```

### Publishing

1. Update version number in package.json:
   ```bash
   npm version patch  # for bug fixes
   npm version minor  # for new features
   npm version major  # for breaking changes
   ```

2. Publish to npm:
   ```bash
   npm publish
   ```

### Post-Publishing

1. Verify the package on npm: https://www.npmjs.com/package/yt-subs-mcp
2. Test installation from npm:
   ```bash
   npx -y yt-subs-mcp
   ```

3. Create a git tag:
   ```bash
   git tag -a v1.0.0 -m "Release version 1.0.0"
   git push origin v1.0.0
   ```

## Updating the Package

For future updates:

1. Make your changes
2. Update version: `npm version <patch|minor|major>`
3. Publish: `npm publish`
4. Tag the release: `git tag -a vX.X.X -m "Release version X.X.X"`
5. Push tags: `git push --tags`

## Scoped Packages

If you want to publish under a scope (e.g., `@yourusername/yt-subs-mcp`):

1. Update package.json name: `"name": "@yourusername/yt-subs-mcp"`
2. Publish with public access:
   ```bash
   npm publish --access public
   ```

## Troubleshooting

### Package name already exists
Change the package name in package.json to something unique.

### Authentication errors
Run `npm login` again and verify your credentials.

### Version already published
Update the version number in package.json.
