#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);

class YouTubeSubtitlesMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'yt-subs-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_youtube_transcript',
          description: 'Extract the subtitle/transcript text from a YouTube video URL. Returns the clean text content of the video\'s English subtitles (auto-generated or manual). Requires yt-dlp and ffmpeg to be installed on the system.',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'The YouTube video URL (e.g., https://www.youtube.com/watch?v=VIDEO_ID)',
              },
              save_to_file: {
                type: 'boolean',
                description: 'Whether to save the transcript to a file (default: true). Files are saved to the directory specified by YT_SUBS_DOWNLOAD_DIR environment variable, or ~/Downloads/yts/ if not set.',
                default: true,
              },
            },
            required: ['url'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === 'get_youtube_transcript') {
        return await this.handleGetYouTubeTranscript(request.params.arguments);
      }

      throw new Error(`Unknown tool: ${request.params.name}`);
    });
  }

  async checkDependencies() {
    const dependencies = ['yt-dlp', 'ffmpeg'];
    const missing = [];

    for (const dep of dependencies) {
      try {
        await execAsync(`command -v ${dep}`);
      } catch {
        missing.push(dep);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `Missing required dependencies: ${missing.join(', ')}. ` +
        `Please install them before using this tool.`
      );
    }
  }

  async getVideoId(url) {
    try {
      const { stdout } = await execAsync(
        `yt-dlp --cookies-from-browser chrome --print id "${url}" 2>/dev/null`
      );
      const videoId = stdout.trim();

      if (!videoId) {
        throw new Error('Could not extract video ID from URL');
      }

      return videoId;
    } catch (error) {
      throw new Error(`Failed to get video ID: ${error.message}`);
    }
  }

  async downloadSubtitles(url, videoId, downloadsDir) {
    const vttFile = join(downloadsDir, `${videoId}.en.vtt`);

    try {
      const command = `yt-dlp --cookies-from-browser chrome --write-subs --skip-download --sub-langs "en" --sub-format vtt --write-auto-subs -o "${downloadsDir}/${videoId}.%(ext)s" "${url}"`;

      await execAsync(command);

      if (!existsSync(vttFile)) {
        throw new Error('Failed to download subtitle. The video may not have English subtitles available.');
      }

      return vttFile;
    } catch (error) {
      throw new Error(`Failed to download subtitles: ${error.message}`);
    }
  }

  async convertToText(vttFile, videoId, downloadsDir) {
    const srtFile = join(downloadsDir, `${videoId}.srt`);
    const txtFile = join(downloadsDir, `${videoId}.txt`);

    try {
      await execAsync(`ffmpeg -y -i "${vttFile}" -f srt "${srtFile}" 2>/dev/null`);

      const { stdout } = await execAsync(
        `grep -v "^[0-9]*$" "${srtFile}" | grep -v " --> " | grep -v "^$" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | awk '!seen[$0]++'`
      );

      await unlink(srtFile);

      const allVttFiles = await execAsync(`ls "${downloadsDir}/${videoId}".*.vtt 2>/dev/null || true`);
      if (allVttFiles.stdout.trim()) {
        const files = allVttFiles.stdout.trim().split('\n');
        for (const file of files) {
          if (file) {
            await unlink(file);
          }
        }
      }

      return { text: stdout.trim(), txtFile };
    } catch (error) {
      throw new Error(`Failed to convert subtitles to text: ${error.message}`);
    }
  }

  getDownloadsDirectory() {
    const envDir = process.env.YT_SUBS_DOWNLOAD_DIR;
    if (envDir) {
      return envDir;
    }
    return join(homedir(), 'Downloads', 'yts');
  }

  async handleGetYouTubeTranscript(args) {
    const { url, save_to_file = true } = args;

    try {
      await this.checkDependencies();

      const downloadsDir = this.getDownloadsDirectory();
      await mkdir(downloadsDir, { recursive: true });

      const videoId = await this.getVideoId(url);

      const vttFile = await this.downloadSubtitles(url, videoId, downloadsDir);

      const { text, txtFile } = await this.convertToText(vttFile, videoId, downloadsDir);

      if (save_to_file) {
        const fs = await import('fs/promises');
        await fs.writeFile(txtFile, text, 'utf-8');
      } else {
        const fs = await import('fs');
        if (fs.existsSync(txtFile)) {
          await unlink(txtFile);
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              video_id: videoId,
              transcript: text,
              saved_to: save_to_file ? txtFile : null,
              message: save_to_file
                ? `Transcript extracted and saved to ${txtFile}`
                : 'Transcript extracted successfully',
            }, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: error.message,
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('YouTube Subtitles MCP server running on stdio');
  }
}

const server = new YouTubeSubtitlesMCPServer();
server.run().catch(console.error);
