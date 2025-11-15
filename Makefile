.PHONY: help patch minor major publish test clean install

# Default target
help:
	@echo "YouTube Subtitles MCP - Make commands"
	@echo ""
	@echo "Version Management:"
	@echo "  make patch        - Bump patch version (1.0.0 -> 1.0.1) for bug fixes"
	@echo "  make minor        - Bump minor version (1.0.0 -> 1.1.0) for new features"
	@echo "  make major        - Bump major version (1.0.0 -> 2.0.0) for breaking changes"
	@echo ""
	@echo "Publishing:"
	@echo "  make publish      - Publish current version to npm"
	@echo "  make publish-patch - Bump patch version and publish"
	@echo "  make publish-minor - Bump minor version and publish"
	@echo "  make publish-major - Bump major version and publish"
	@echo ""
	@echo "Testing:"
	@echo "  make test         - Create and test package locally"
	@echo "  make install      - Install dependencies"
	@echo ""
	@echo "Utilities:"
	@echo "  make clean        - Remove generated files"
	@echo "  make status       - Show npm package status"

# Install dependencies
install:
	npm install

# Version bumping
patch:
	npm version patch
	git push
	git push --tags

minor:
	npm version minor
	git push
	git push --tags

major:
	npm version major
	git push
	git push --tags

# Publishing
publish:
	@echo "Publishing current version to npm..."
	npm publish

publish-patch: patch publish
	@echo "✅ Patch version published successfully!"

publish-minor: minor publish
	@echo "✅ Minor version published successfully!"

publish-major: major publish
	@echo "✅ Major version published successfully!"

# Testing
test:
	@echo "Creating test package..."
	npm pack
	@echo ""
	@echo "✅ Package created. To test installation run:"
	@echo "   npm install -g ./yt-subs-mcp-$$(node -p \"require('./package.json').version\").tgz"

# Clean up
clean:
	rm -f yt-subs-mcp-*.tgz
	@echo "✅ Cleaned up tarball files"

# Status
status:
	@echo "Local version:"
	@node -p "'  ' + require('./package.json').version"
	@echo ""
	@echo "Published version:"
	@npm view yt-subs-mcp version 2>/dev/null || echo "  Not published yet"
	@echo ""
	@echo "npm user:"
	@npm whoami 2>/dev/null || echo "  Not logged in"
