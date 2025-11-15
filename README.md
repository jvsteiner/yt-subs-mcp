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

### For Local Development

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Make the script executable:
   ```bash
   chmod +x index.js
   ```

### For Use with MCP Clients

The server can be run using npx. Add it to your MCP client configuration:

#### Claude Desktop Configuration

Edit your Claude Desktop config file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add the server to the `mcpServers` section:

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

Replace `/absolute/path/to/yt-subs/` with the actual path to this directory.

#### Alternative: Using npx (if published to npm)

```json
{
  "mcpServers": {
    "yt-subs": {
      "command": "npx",
      "args": ["yt-subs-mcp"]
    }
  }
}
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

### "Could not extract video ID" error
Ensure you're providing a valid YouTube URL format:
- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`

## Development

### Running Locally

```bash
npm start
```

The server will run on stdio and wait for MCP protocol messages.

### Testing

You can test the server using an MCP client or by sending JSON-RPC messages via stdio.

## License

MIT

## Credits

Based on the yt-subs bash script for extracting YouTube subtitles.
