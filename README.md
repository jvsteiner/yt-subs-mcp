# YouTube Subtitles MCP Server

An MCP (Model Context Protocol) server that extracts clean text transcripts from YouTube videos using their subtitles.

## Features

- Extract English subtitles (auto-generated or manual) from YouTube videos
- Convert subtitle files to clean, deduplicated plain text
- Save transcripts to local files or return them directly
- Works with any MCP-compatible client (Claude Desktop, etc.)

## Prerequisites

Before using this MCP server, you must have the following tools installed:

### Required Dependencies

1. **yt-dlp** - YouTube video downloader
   ```bash
   # Install via Homebrew (macOS)
   brew install yt-dlp
   
   # Or via pip
   pip install yt-dlp
   ```

2. **ffmpeg** - Media file converter
   ```bash
   # Install via Homebrew (macOS)
   brew install ffmpeg
   
   # Or via apt (Linux)
   sudo apt install ffmpeg
   ```

3. **Node.js** - Version 18 or higher
   ```bash
   # Check your version
   node --version
   
   # Install via Homebrew (macOS)
   brew install node
   ```

## Installation

### Quick Start (Using npx)

No installation required! Just add to your MCP client configuration:

```json
{
  "mcpServers": {
    "yt-subs": {
      "command": "npx",
      "args": ["-y", "yt-subs-mcp"]
    }
  }
}
```

**Note:** You still need to have `yt-dlp` and `ffmpeg` installed on your system (see Prerequisites above).

### Claude Desktop Configuration

Edit your Claude Desktop config file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add the server to the `mcpServers` section:

**Option 1: Using npx (recommended)**
```json
{
  "mcpServers": {
    "yt-subs": {
      "command": "npx",
      "args": ["-y", "yt-subs-mcp"],
      "env": {
        "YT_SUBS_DOWNLOAD_DIR": "/path/to/your/transcripts"
      }
    }
  }
}
```

**Option 2: Using local installation**
```json
{
  "mcpServers": {
    "yt-subs": {
      "command": "node",
      "args": ["/absolute/path/to/yt-subs/index.js"]
    }
  }
}
```

### For Local Development

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Make the script executable:
   ```bash
   chmod +x index.js
   ```

## Usage

Once configured in your MCP client, you can use the `get_youtube_transcript` tool:

### Tool: get_youtube_transcript

Extracts the subtitle/transcript text from a YouTube video URL.

**Parameters:**
- `url` (required): The YouTube video URL
- `save_to_file` (optional): Whether to save the transcript to a file (default: true)

**Examples:**

```javascript
// Get transcript and save to file
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "save_to_file": true
}

// Get transcript without saving
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "save_to_file": false
}
```

**Response:**

```json
{
  "success": true,
  "video_id": "dQw4w9WgXcQ",
  "transcript": "Never gonna give you up\nNever gonna let you down...",
  "saved_to": "/Users/yourname/Downloads/yts/dQw4w9WgXcQ.txt",
  "message": "Transcript extracted and saved to /Users/yourname/Downloads/yts/dQw4w9WgXcQ.txt"
}
```

## Configuration

### Environment Variables

- **YT_SUBS_DOWNLOAD_DIR**: Custom directory for saving transcript files
  - If not set, defaults to `~/Downloads/yts/`
  - Must be an absolute path
  - Directory will be created if it doesn't exist
- **YT_SUBS_USE_BROWSER_COOKIES**: Set to `true` to let yt-dlp read Chrome cookies for videos requiring a signed-in session. Disabled by default.
- **YT_SUBS_COOKIES_BROWSER**: Browser and profile that yt-dlp reads cookies from, in yt-dlp's `BROWSER[:PROFILE]` form, for example `chrome:Profile 2` or `firefox`. Defaults to `chrome:Default`, Chrome's first profile.
- **YT_SUBS_DOWNLOAD_TIMEOUT_MS**: Download deadline in milliseconds; defaults to `300000` (five minutes).
- **YT_SUBS_CONVERSION_TIMEOUT_MS**: Conversion deadline in milliseconds; defaults to `60000` (one minute).
- **YT_SUBS_DEPENDENCY_TIMEOUT_MS**: Deadline for each dependency check; defaults to `10000` (10 seconds).

Timeout overrides must be positive integers. Requests are limited to two at a time per server process. URLs are limited to 2 KB, and VTT and SRT files are limited to 10 MB each before processing. Playlist downloads are disabled. JavaScript components may still be downloaded automatically from GitHub by yt-dlp (`ejs:github`).

The MCP server ignores local yt-dlp configuration so that cookie access and output behavior are controlled by the server's settings. Running yt-dlp separately still uses your normal configuration.

Each request uses a private temporary directory, removed on success or failure. Saved transcripts are replaced atomically; `save_to_file: false` leaves existing transcripts untouched.

**Example:**
```bash
export YT_SUBS_DOWNLOAD_DIR="/path/to/your/transcripts"
```

### Setting Environment Variables in Claude Desktop

To use a custom download directory, add the `env` property to your server configuration:

```json
{
  "mcpServers": {
    "yt-subs": {
      "command": "node",
      "args": ["/absolute/path/to/yt-subs/index.js"],
      "env": {
        "YT_SUBS_DOWNLOAD_DIR": "/path/to/your/transcripts"
      }
    }
  }
}
```

## Output Location

By default, transcript files are saved to:
```
~/Downloads/yts/
```

Or to the directory specified by `YT_SUBS_DOWNLOAD_DIR` environment variable.

Each transcript is saved with the video ID as the filename:
```
VIDEO_ID.txt
```

## How It Works

1. Extracts the video ID from the provided YouTube URL
2. Downloads English subtitles (VTT format) using yt-dlp
3. Converts VTT to SRT format using ffmpeg
4. Extracts and deduplicates text content
5. Cleans up temporary files
6. Returns the clean transcript text

## Troubleshooting

### "Missing required dependencies" error
Make sure yt-dlp and ffmpeg are installed and available in your PATH:
```bash
which yt-dlp
which ffmpeg
```

### "Failed to download subtitle" error
The video may not have English subtitles available. Try a different video or check if subtitles exist on YouTube.

### "Invalid YouTube URL or video ID" error
Ensure you're providing a valid YouTube URL format:
- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/shorts/VIDEO_ID`
- `https://www.youtube.com/embed/VIDEO_ID`

Video IDs must contain exactly 11 letters, digits, underscores, or hyphens. Only supported YouTube hosts and HTTP/HTTPS URLs are accepted; downloads use a canonical HTTPS watch URL. URLs with credentials or nonstandard ports are rejected.

## Development

### Running Locally

```bash
npm start
```

The server will run on stdio and wait for MCP protocol messages.

### Testing

Run `npm test` for integration tests through the real stdio MCP server. The tests use controlled yt-dlp and ffmpeg replacements; they do not download live videos or read browser cookies. You can also test live downloads with an MCP client.

### Publishing to npm

If you want to publish your own version to npm:

1. Update the package name in `package.json` to something unique
2. Update the repository URLs to your GitHub repository
3. Add your author information
4. Login to npm:
   ```bash
   npm login
   ```

5. Publish:
   ```bash
   npm publish
   ```

**Before publishing, make sure to:**
- Test the package locally using `npm pack` and `npm install -g ./yt-subs-mcp-1.0.0.tgz`
- Update the version number following semver
- Ensure README is up to date
- Add appropriate tags and keywords

## License

MIT

## Credits

Based on the yt-subs bash script for extracting YouTube subtitles.
