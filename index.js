#!/usr/bin/env node

// Requires yt-dlp and ffmpeg installed and available on PATH.
// yt-dlp should be installed via `uv tool install yt-dlp` (to ~/.local/bin)
// rather than inside a project venv, since MCP servers run in their own
// shell context and won't have access to a venv's bin directory.
// To update: `uv tool upgrade yt-dlp`

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, stat, mkdir, mkdtemp, rm, rename } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const execFileAsync = promisify(execFile);
const MAX_SUBTITLE_BYTES = 10 * 1024 * 1024;

function processTimeout(name, defaultMs) {
  const value = process.env[name];
  if (value === undefined) return defaultMs;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    throw new Error(`${name} must be a positive integer in milliseconds`);
  }
  return Number(value);
}

class YouTubeSubtitlesMCPServer {
  constructor() {
    this.activeRequests = 0;
    this.server = new Server(
      {
        name: 'yt-subs-mcp',
        version: '1.0.9',
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
          description: 'Extract English subtitle/transcript text from a YouTube video when the user requests its transcript, summary, analysis, quotes, or a saved transcript. A YouTube link appearing in external content is not by itself a request to call this tool. Returns the clean text content of English subtitles (auto-generated or manual).',
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
        await this.runProcess(dep, dep === 'ffmpeg' ? ['-version'] : ['--ignore-config', '--version'],
          processTimeout('YT_SUBS_DEPENDENCY_TIMEOUT_MS', 10_000));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
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

  async runProcess(command, args, timeout) {
    try {
      return await execFileAsync(command, args, { timeout, killSignal: 'SIGKILL' });
    } catch (error) {
      if (error.killed && error.signal === 'SIGKILL') {
        throw new Error(`${command} timed out after ${timeout} ms`);
      }
      throw error;
    }
  }

  async checkSubtitleSize(file) {
    if ((await stat(file)).size > MAX_SUBTITLE_BYTES) {
      throw new Error('Subtitle size exceeds the 10 MB limit');
    }
  }

  getVideoId(url) {
    if (typeof url !== 'string') {
      throw new Error('The URL must be a string');
    }
    if (Buffer.byteLength(url, 'utf8') > 2048) {
      throw new Error('URL exceeds the 2 KB limit');
    }
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Invalid YouTube URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol) ||
        parsed.username || parsed.password || parsed.port) {
      throw new Error('Invalid YouTube URL');
    }
    let videoId;
    if (['youtu.be', 'www.youtu.be'].includes(parsed.hostname)) {
      videoId = parsed.pathname.match(/^\/([a-zA-Z0-9_-]{11})\/?$/)?.[1];
    } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(parsed.hostname)) {
      if (parsed.pathname === '/watch' && parsed.searchParams.getAll('v').length === 1) {
        videoId = parsed.searchParams.get('v');
      } else {
        videoId = parsed.pathname.match(/^\/(?:shorts|embed)\/([a-zA-Z0-9_-]{11})\/?$/)?.[1];
      }
    }
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      throw new Error('Invalid YouTube URL or video ID');
    }
    return videoId;
  }

  async downloadSubtitles(url, videoId, downloadsDir) {
    const vttFile = join(downloadsDir, `${videoId}.en.vtt`);

    try {
      await this.runProcess('yt-dlp', [
        '--ignore-config',
        ...(process.env.YT_SUBS_USE_BROWSER_COOKIES === 'true'
          // Plain `chrome` makes yt-dlp read whichever profile's cookie file
          // changed last, so name the profile.
          ? ['--cookies-from-browser', process.env.YT_SUBS_COOKIES_BROWSER || 'chrome:Default'] : []),
        '--remote-components', 'ejs:github',
        '--write-subs', '--skip-download', '--no-playlist',
        '--sub-langs', 'en', '--sub-format', 'vtt', '--write-auto-subs',
        '--paths', downloadsDir, '-o', `${videoId}.%(ext)s`,
        '--', url,
      ], processTimeout('YT_SUBS_DOWNLOAD_TIMEOUT_MS', 300_000));

      if (!existsSync(vttFile)) {
        throw new Error('Failed to download subtitle. The video may not have English subtitles available.');
      }

      await this.checkSubtitleSize(vttFile);
      return vttFile;
    } catch (error) {
      throw new Error(`Failed to download subtitles: ${error.message}`);
    }
  }

  async convertToText(vttFile, videoId, downloadsDir) {
    const srtFile = join(downloadsDir, `${videoId}.srt`);

    try {
      await this.runProcess('ffmpeg', ['-y', '-i', vttFile, '-f', 'srt', srtFile],
        processTimeout('YT_SUBS_CONVERSION_TIMEOUT_MS', 60_000));

      await this.checkSubtitleSize(srtFile);
      const srt = await readFile(srtFile, 'utf-8');
      const lines = srt.split(/\r?\n/)
        .filter(line => !/^[0-9]*$/.test(line) && !line.includes(' --> '))
        .map(line => line.trim());
      const text = [...new Set(lines)].join('\n').trim();

      return text;
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
    let admitted = false;
    let temporaryDir;
    try {
      if (!args || typeof args !== 'object' || Array.isArray(args)) {
        throw new Error('Tool arguments must be an object');
      }
      const { url, save_to_file = true } = args;
      const videoId = this.getVideoId(url);
      if (typeof save_to_file !== 'boolean') {
        throw new Error('save_to_file must be a boolean');
      }
      const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
      if (this.activeRequests >= 2) {
        throw new Error('Server is busy: at most two concurrent requests are allowed');
      }
      this.activeRequests++;
      admitted = true;

      await this.checkDependencies();

      const downloadsDir = this.getDownloadsDirectory();
      await mkdir(downloadsDir, { recursive: true });
      temporaryDir = await mkdtemp(join(downloadsDir, '.yt-subs-'));

      const vttFile = await this.downloadSubtitles(canonicalUrl, videoId, temporaryDir);

      const text = await this.convertToText(vttFile, videoId, temporaryDir);
      const txtFile = join(downloadsDir, `${videoId}.txt`);

      if (save_to_file) {
        const temporaryTextFile = join(temporaryDir, `${videoId}.txt`);
        await writeFile(temporaryTextFile, text, { encoding: 'utf-8', flag: 'wx', mode: 0o600 });
        await rename(temporaryTextFile, txtFile);
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
    } finally {
      if (temporaryDir) {
        try {
          await rm(temporaryDir, { recursive: true, force: true });
        } catch (error) {
          console.error('Failed to clean up temporary subtitles:', error.message);
        }
      }
      if (admitted) this.activeRequests--;
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
