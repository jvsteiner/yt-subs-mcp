import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const videoId = 'dQw4w9WgXcQ';

async function withServer(run) {
  const root = await mkdtemp(join(tmpdir(), 'yt-subs-security-'));
  const bin = join(root, 'bin');
  await mkdir(bin);
  // Replace only external downloads/conversion; the MCP server, process launch,
  // filesystem operations, and transcript processing remain real.
  const executable = `#!${process.execPath}\n`;
  await writeFile(join(bin, 'yt-dlp'), executable + `
    const fs = require('node:fs');
    const args = process.argv.slice(2);
    if (args.includes('--version')) {
      fs.writeFileSync(process.env.DEPENDENCY_LOG, JSON.stringify(args));
      if (process.env.DEPENDENCY_DELAY_MS) setTimeout(() => process.exit(0), Number(process.env.DEPENDENCY_DELAY_MS));
      else process.exit(0);
    } else {
    fs.writeFileSync(process.env.ARGUMENT_LOG, JSON.stringify(args));
    setTimeout(() => {
    const output = require('node:path').join(args[args.indexOf('--paths') + 1], args[args.indexOf('-o') + 1]);
    if (process.env.PARTIAL_DOWNLOAD_FAIL === '1') {
      fs.writeFileSync(output.replace('%(ext)s', 'en.vtt'), 'partial download');
      process.exit(1);
    }
    if (process.env.DOWNLOAD_FAIL === '1') process.exit(1);
    if (process.env.NO_SUBTITLES === '1') process.exit(0);
    fs.writeFileSync(output.replace('%(ext)s', 'en.vtt'), process.env.VTT_BYTES ? Buffer.alloc(Number(process.env.VTT_BYTES), 32) : process.env.LARGE_VTT === '1' ? Buffer.alloc(10 * 1024 * 1024 + 1) : 'WEBVTT');
    fs.writeFileSync(output.replace('%(ext)s', 'en-orig.vtt'), 'WEBVTT');
    }, Number(process.env.DOWNLOAD_DELAY_MS || 0));
    }
  `, { mode: 0o755 });
  await writeFile(join(bin, 'ffmpeg'), executable + `
    const fs = require('node:fs');
    const args = process.argv.slice(2);
    if (args.includes('-version') || args.includes('--version')) process.exit(0);
    if (process.env.CONCURRENT_FIXTURE === '1') {
      const input = args[args.indexOf('-i') + 1];
      fs.appendFileSync(process.env.CONVERSION_LOG, input + '\\n');
      const start = Date.now();
      const timer = setInterval(() => {
        if (fs.readFileSync(process.env.CONVERSION_LOG, 'utf8').trim().split('\\n').length >= 2) {
          clearInterval(timer);
          fs.writeFileSync(args.at(-1), 'Transcript from ' + require('node:path').dirname(input));
        } else if (Date.now() - start > 2000) {
          clearInterval(timer);
          process.exit(1);
        }
      }, 10);
    } else {
    setTimeout(() => {
    if (process.env.CONVERT_FAIL === '1') process.exit(1);
    fs.writeFileSync(args[args.length - 1],
      process.env.SRT_BYTES ? Buffer.alloc(Number(process.env.SRT_BYTES), 32) :
      process.env.LARGE_SRT === '1' ? Buffer.alloc(10 * 1024 * 1024 + 1) :
      process.env.SRT_CONTENT ?? '1\\n00:00:00,000 --> 00:00:01,000\\n  Hello world  \\n\\n2\\n00:00:01,000 --> 00:00:02,000\\nHello world\\nAnother line\\n');
    }, Number(process.env.CONVERT_DELAY_MS || 0));
    }
  `, { mode: 0o755 });
  const clients = [];
  async function openSession(extraEnv = {}, downloadsDir = join(root, 'downloads')) {
    const client = new Client({ name: 'security-test', version: '1.0.0' });
    clients.push(client);
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [resolve('index.js')],
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        YT_SUBS_DOWNLOAD_DIR: downloadsDir,
        YT_SUBS_USE_BROWSER_COOKIES: 'false',
        YT_SUBS_DOWNLOAD_TIMEOUT_MS: '300000',
        YT_SUBS_CONVERSION_TIMEOUT_MS: '60000',
        YT_SUBS_DEPENDENCY_TIMEOUT_MS: '10000',
        ARGUMENT_LOG: join(root, 'arguments.json'),
        DEPENDENCY_LOG: join(root, 'dependency-arguments.json'),
        CONVERSION_LOG: join(root, 'conversions.log'),
        ...extraEnv,
      },
      stderr: 'pipe',
    }));
    return client;
  }
  async function request(url, downloadsDir = join(root, 'downloads'), extraEnv = {}, saveToFile = true, rawArgs, client) {
    client ??= await openSession(extraEnv, downloadsDir);
    const result = await client.callTool({
      name: 'get_youtube_transcript',
      arguments: rawArgs ?? { url, save_to_file: saveToFile },
    });
    return { result, data: JSON.parse(result.content[0].text), downloadsDir };
  }
  try {
    await run({ root, bin, request, openSession });
  } finally {
    await Promise.all(clients.map(client => client.close()));
    await rm(root, { recursive: true, force: true });
  }
}

test('extracts, deduplicates, saves, and cleans up subtitles', async () => {
  await withServer(async ({ request }) => {
    const { data, downloadsDir } = await request(`https://www.youtube.com/watch?v=${videoId}`);
    assert.equal(data.success, true);
    assert.equal(data.transcript, 'Hello world\nAnother line');
    assert.equal(await readFile(data.saved_to, 'utf8'), data.transcript);
    assert.deepEqual(await readdir(downloadsDir), [`${videoId}.txt`]);
  });
});

for (const syntax of ['substitution', 'backticks', 'quotes']) {
  test(`removes URL ${syntax} without executing commands`, async () => {
    await withServer(async ({ root, request }) => {
      const marker = join(root, 'pwned');
      const payload = syntax === 'substitution' ? `$(touch ${marker})`
        : syntax === 'backticks' ? `\`touch ${marker}\``
        : `"; touch ${marker}; #`;
      const url = `https://www.youtube.com/watch?v=${videoId}&x=${payload}`;
      const { data } = await request(url);
      assert.equal(existsSync(marker), false, 'URL executed a shell command');
      assert.equal(data.success, true);
      const args = JSON.parse(await readFile(join(root, 'arguments.json'), 'utf8'));
      assert.equal(args.at(-1), `https://www.youtube.com/watch?v=${videoId}`);
    });
  });
}

test('treats shell syntax in the download directory literally', async () => {
  await withServer(async ({ root, request }) => {
    const marker = join(root, 'pwned');
    const downloadsDir = join(root, `downloads $(touch ${marker}) "quoted"`);
    const { data } = await request(`https://youtu.be/${videoId}`, downloadsDir);
    assert.equal(existsSync(marker), false, 'directory executed a shell command');
    assert.equal(data.success, true);
    assert.equal(await readFile(data.saved_to, 'utf8'), 'Hello world\nAnother line');
    assert.deepEqual(await readdir(downloadsDir), [`${videoId}.txt`]);
  });
});

test('returns a tool error when the downloader fails', async () => {
  await withServer(async ({ request }) => {
    const { result, data } = await request(`https://youtu.be/${videoId}`, undefined, { DOWNLOAD_FAIL: '1' });
    assert.equal(result.isError, true);
    assert.equal(data.success, false);
    assert.match(data.error, /Failed to download subtitles/);
  });
});

test('returns the transcript without saving when requested', async () => {
  await withServer(async ({ request }) => {
    const { data, downloadsDir } = await request(`https://youtu.be/${videoId}`, undefined, {}, false);
    assert.equal(data.success, true);
    assert.equal(data.saved_to, null);
    assert.equal(data.transcript, 'Hello world\nAnother line');
    assert.deepEqual(await readdir(downloadsDir), []);
  });
});

test('reports absent English subtitles as a tool error', async () => {
  await withServer(async ({ request }) => {
    const { result, data } = await request(`https://youtu.be/${videoId}`, undefined, { NO_SUBTITLES: '1' });
    assert.equal(result.isError, true);
    assert.equal(data.success, false);
    assert.match(data.error, /English subtitles/);
  });
});

test('reports converter failure without saving a transcript', async () => {
  await withServer(async ({ request }) => {
    const { result, data, downloadsDir } = await request(`https://youtu.be/${videoId}`, undefined, { CONVERT_FAIL: '1' });
    assert.equal(result.isError, true);
    assert.equal(data.success, false);
    assert.match(data.error, /Failed to convert/);
    assert.equal(existsSync(join(downloadsDir, `${videoId}.txt`)), false);
  });
});

for (const dep of ['yt-dlp', 'ffmpeg']) {
  test(`reports a missing ${dep} dependency before downloading`, async () => {
    await withServer(async ({ root, bin, request }) => {
      await unlink(join(bin, dep));
      const { result, data } = await request(`https://youtu.be/${videoId}`, undefined, { PATH: bin });
      assert.equal(result.isError, true);
      assert.match(data.error, /Missing required dependencies/);
      assert.ok(data.error.includes(dep));
      assert.equal(existsSync(join(root, 'arguments.json')), false);
    });
  });
}

test('cleans the current video while preserving unrelated files', async () => {
  await withServer(async ({ root, request }) => {
    const dir = join(root, 'downloads');
    await mkdir(dir);
    await writeFile(join(dir, 'another-video.en.vtt'), 'keep');
    await writeFile(join(dir, `${videoId}.notes`), 'keep notes');
    const { data } = await request(`https://youtu.be/${videoId}`, dir);
    assert.equal(data.success, true);
    assert.equal(await readFile(join(dir, 'another-video.en.vtt'), 'utf8'), 'keep');
    assert.equal(await readFile(join(dir, `${videoId}.notes`), 'utf8'), 'keep notes');
    assert.deepEqual((await readdir(dir)).sort(), [`${videoId}.notes`, `${videoId}.txt`, 'another-video.en.vtt'].sort());
  });
});

test('handles CRLF subtitles, whitespace, and repeated lines', async () => {
  await withServer(async ({ request }) => {
    const srt = '1\r\n00:00:00,000 --> 00:00:01,000\r\n First line \r\n\r\n2\r\n00:00:01,000 --> 00:00:02,000\r\nFirst line\r\nSecond line\r\n';
    const { data } = await request(`https://youtu.be/${videoId}`, undefined, { SRT_CONTENT: srt });
    assert.equal(data.success, true);
    assert.equal(data.transcript, 'First line\nSecond line');
  });
});

test('places the URL after the downloader option terminator', async () => {
  await withServer(async ({ root, request }) => {
    await request(`https://youtu.be/${videoId}`);
    const args = JSON.parse(await readFile(join(root, 'arguments.json'), 'utf8'));
    assert.equal(args.at(-2), '--');
  });
});

const invalidUrls = [
  ['unrelated host', `https://attacker.example/watch?v=${videoId}`],
  ['localhost', `http://127.0.0.1/watch?v=${videoId}`],
  ['private network', `http://192.168.1.1/watch?v=${videoId}`],
  ['deceptive domain', `https://youtube.com.attacker.example/watch?v=${videoId}`],
  ['YouTube name in path', `https://attacker.example/youtu.be/${videoId}`],
  ['credentials', `https://user:secret@www.youtube.com/watch?v=${videoId}`],
  ['unsupported scheme', `file:///watch?v=${videoId}`],
  ['long video ID', `https://www.youtube.com/watch?v=${videoId}EXTRA`],
  ['short video ID', 'https://www.youtube.com/watch?v=short'],
  ['missing video ID', 'https://www.youtube.com/watch'],
  ['option-like input', `--exec=touch /unused?v=${videoId}`],
  ['duplicate video IDs', `https://www.youtube.com/watch?v=${videoId}&v=${videoId}`],
  ['nonstandard port', `https://www.youtube.com:8080/watch?v=${videoId}`],
  ['invalid ID characters', 'https://www.youtube.com/watch?v=dQw4w9WgXc!'],
  ['extra short-link path', `https://youtu.be/${videoId}/extra`],
  ['oversized URL', `https://www.youtube.com/watch?v=${videoId}&x=${'a'.repeat(2048)}`],
];

for (const [name, url] of invalidUrls) {
  test(`rejects ${name} before launching the downloader`, async () => {
    await withServer(async ({ root, request }) => {
      const { result, data } = await request(url);
      assert.equal(result.isError, true);
      assert.equal(data.success, false);
      assert.equal(existsSync(join(root, 'arguments.json')), false);
    });
  });
}

for (const [name, args] of [
  ['missing URL', {}], ['null URL', { url: null }], ['numeric URL', { url: 42 }],
  ['array URL', { url: [`https://youtu.be/${videoId}`] }],
  ['nonboolean save flag', { url: `https://youtu.be/${videoId}`, save_to_file: 'false' }],
]) {
  test(`rejects ${name} with a useful validation error`, async () => {
    await withServer(async ({ root, request }) => {
      const { result, data } = await request(undefined, undefined, {}, true, args);
      assert.equal(result.isError, true);
      assert.equal(data.success, false);
      assert.match(data.error, /invalid|must be|required/i);
      assert.equal(existsSync(join(root, 'arguments.json')), false);
    });
  });
}

for (const [name, url] of [
  ['watch with extra parameters', `https://www.youtube.com/watch?v=${videoId}&list=playlist&t=10`],
  ['short link', `https://youtu.be/${videoId}?t=10`],
  ['shorts', `https://www.youtube.com/shorts/${videoId}`],
  ['embed', `https://www.youtube.com/embed/${videoId}`],
  ['mobile watch', `https://m.youtube.com/watch?v=${videoId}`],
  ['HTTP watch', `http://youtube.com/watch?v=${videoId}`],
]) {
  test(`canonicalizes a valid ${name} URL`, async () => {
    await withServer(async ({ root, request }) => {
      const { data } = await request(url);
      assert.equal(data.success, true);
      assert.equal(data.video_id, videoId);
      const args = JSON.parse(await readFile(join(root, 'arguments.json'), 'utf8'));
      assert.equal(args.at(-1), `https://www.youtube.com/watch?v=${videoId}`);
    });
  });
}

test('disabling saving preserves a previously saved transcript', async () => {
  await withServer(async ({ request }) => {
    const first = await request(`https://youtu.be/${videoId}`);
    const second = await request(`https://youtu.be/${videoId}`, undefined, {}, false);
    assert.equal(second.data.success, true);
    assert.equal(await readFile(first.data.saved_to, 'utf8'), first.data.transcript);
  });
});

test('conversion failure cleans intermediate files and preserves unrelated files', async () => {
  await withServer(async ({ root, request }) => {
    const dir = join(root, 'downloads');
    await mkdir(dir);
    await writeFile(join(dir, 'unrelated.en.vtt'), 'keep');
    const { result } = await request(`https://youtu.be/${videoId}`, dir, { CONVERT_FAIL: '1' });
    assert.equal(result.isError, true);
    assert.deepEqual(await readdir(dir), ['unrelated.en.vtt']);
  });
});

for (const ext of ['txt', 'srt']) {
  test(`does not overwrite a symlink target through ${ext} output`, async () => {
    await withServer(async ({ root, request }) => {
      const dir = join(root, 'downloads');
      const target = join(root, 'protected');
      await mkdir(dir);
      await writeFile(target, 'original content');
      await symlink(target, join(dir, `${videoId}.${ext}`));
      await request(`https://youtu.be/${videoId}`, dir);
      assert.equal(await readFile(target, 'utf8'), 'original content');
    });
  });
}

for (const [name, env] of [
  ['download', { DOWNLOAD_DELAY_MS: '1000', YT_SUBS_DOWNLOAD_TIMEOUT_MS: '100' }],
  ['conversion', { CONVERT_DELAY_MS: '1000', YT_SUBS_CONVERSION_TIMEOUT_MS: '100' }],
  ['dependency check', { DEPENDENCY_DELAY_MS: '1000', YT_SUBS_DEPENDENCY_TIMEOUT_MS: '100' }],
]) {
  test(`terminates a stalled ${name} with a tool error`, async () => {
    await withServer(async ({ request }) => {
      const { result, data, downloadsDir } = await request(`https://youtu.be/${videoId}`, undefined, env);
      assert.equal(result.isError, true);
      assert.equal(data.success, false);
      assert.match(data.error, /timed out/i);
      assert.equal(existsSync(join(downloadsDir, `${videoId}.txt`)), false);
      if (existsSync(downloadsDir)) assert.deepEqual(await readdir(downloadsDir), []);
    });
  });
}

for (const [name, env] of [
  ['VTT', { LARGE_VTT: '1' }], ['SRT', { LARGE_SRT: '1' }],
]) {
  test(`rejects ${name} subtitles exceeding 10 MB`, async () => {
    await withServer(async ({ request }) => {
      const { result, data, downloadsDir } = await request(`https://youtu.be/${videoId}`, undefined, env);
      assert.equal(result.isError, true);
      assert.match(data.error, /size|large|limit/i);
      assert.equal(existsSync(join(downloadsDir, `${videoId}.txt`)), false);
      assert.deepEqual(await readdir(downloadsDir), []);
    });
  });
}

test('disables playlist downloading', async () => {
  await withServer(async ({ root, request }) => {
    await request(`https://www.youtube.com/watch?v=${videoId}&list=playlist`);
    const args = JSON.parse(await readFile(join(root, 'arguments.json'), 'utf8'));
    assert.ok(args.includes('--no-playlist'));
  });
});

test('rejects a third simultaneous request and releases capacity afterwards', async () => {
  await withServer(async ({ request, openSession }) => {
    const client = await openSession({ DOWNLOAD_DELAY_MS: '200' });
    const first = request(`https://youtu.be/${videoId}`, undefined, {}, false, undefined, client);
    const second = request('https://youtu.be/abcdefghijk', undefined, {}, false, undefined, client);
    const third = await request('https://youtu.be/ABCDEFGHIJK', undefined, {}, false, undefined, client);
    const results = await Promise.all([first, second]);
    assert.equal(third.result.isError, true);
    assert.match(third.data.error, /concurrent|busy|requests/i);
    assert.ok(results.every(({ data }) => data.success));
    const fourth = await request(`https://youtu.be/${videoId}`, undefined, {}, false, undefined, client);
    assert.equal(fourth.data.success, true);
  });
});

test('isolates overlapping requests for the same video and saves a complete transcript', async () => {
  await withServer(async ({ root, request, openSession }) => {
    const dir = join(root, 'downloads');
    await mkdir(dir);
    await writeFile(join(dir, `${videoId}.en.vtt`), 'existing subtitle');
    const client = await openSession({ CONCURRENT_FIXTURE: '1' });
    const results = await Promise.all([
      request(`https://youtu.be/${videoId}`, undefined, {}, true, undefined, client),
      request(`https://youtu.be/${videoId}`, undefined, {}, true, undefined, client),
    ]);
    assert.ok(results.every(({ data }) => data.success), JSON.stringify(results.map(r => r.data)));
    assert.equal(new Set(results.map(({ data }) => data.transcript)).size, 2);
    const saved = await readFile(join(dir, `${videoId}.txt`), 'utf8');
    assert.ok(results.some(({ data }) => data.transcript === saved));
    assert.equal(await readFile(join(dir, `${videoId}.en.vtt`), 'utf8'), 'existing subtitle');
    assert.deepEqual((await readdir(dir)).sort(), [`${videoId}.en.vtt`, `${videoId}.txt`].sort());
  });
});

test('cleans a partial failed download and permits a later request', async () => {
  await withServer(async ({ request }) => {
    const { result, downloadsDir } = await request(`https://youtu.be/${videoId}`, undefined, { PARTIAL_DOWNLOAD_FAIL: '1' });
    assert.equal(result.isError, true);
    assert.deepEqual(await readdir(downloadsDir), []);
    const next = await request(`https://youtu.be/${videoId}`);
    assert.equal(next.data.success, true);
  });
});

for (const [name, env] of [
  ['VTT', { VTT_BYTES: String(10 * 1024 * 1024) }],
  ['SRT', { SRT_BYTES: String(10 * 1024 * 1024) }],
]) {
  test(`accepts ${name} subtitles exactly at the 10 MB limit`, async () => {
    await withServer(async ({ request }) => {
      const { data } = await request(`https://youtu.be/${videoId}`, undefined, env);
      assert.equal(data.success, true);
    });
  });
}

test('atomically replaces an existing transcript with the new complete content', async () => {
  await withServer(async ({ request }) => {
    const first = await request(`https://youtu.be/${videoId}`);
    const next = await request(`https://youtu.be/${videoId}`, undefined, { SRT_CONTENT: 'New transcript' });
    assert.equal(next.data.success, true);
    assert.equal(await readFile(first.data.saved_to, 'utf8'), 'New transcript');
  });
});

for (const [name, env, enabled] of [
  ['default', {}, false],
  ['explicit false', { YT_SUBS_USE_BROWSER_COOKIES: 'false' }, false],
  ['explicit true', { YT_SUBS_USE_BROWSER_COOKIES: 'true' }, true],
]) {
  test(`browser cookies: ${name}`, async () => {
    await withServer(async ({ root, request }) => {
      const { data } = await request(`https://youtu.be/${videoId}`, undefined, env);
      assert.equal(data.success, true);
      const args = JSON.parse(await readFile(join(root, 'arguments.json'), 'utf8'));
      assert.equal(args.includes('--cookies-from-browser'), enabled);
      if (enabled) assert.equal(args[args.indexOf('--cookies-from-browser') + 1], 'chrome');
    });
  });
}

test('failed requests release server capacity', async () => {
  await withServer(async ({ request, openSession }) => {
    const client = await openSession({ DOWNLOAD_FAIL: '1' });
    for (let i = 0; i < 3; i++) {
      const { result, data } = await request(`https://youtu.be/${videoId}`, undefined, {}, true, undefined, client);
      assert.equal(result.isError, true);
      assert.match(data.error, /Failed to download subtitles/);
    }
  });
});

test('rejects unknown tools without launching the downloader', async () => {
  await withServer(async ({ root, openSession }) => {
    const client = await openSession();
    await assert.rejects(client.callTool({ name: 'unknown_tool', arguments: {} }), /Unknown tool/);
    assert.equal(existsSync(join(root, 'arguments.json')), false);
  });
});

test('continues allowing automatic GitHub JavaScript components', async () => {
  await withServer(async ({ root, request }) => {
    const { data } = await request(`https://youtu.be/${videoId}`);
    assert.equal(data.success, true);
    const args = JSON.parse(await readFile(join(root, 'arguments.json'), 'utf8'));
    assert.equal(args[args.indexOf('--remote-components') + 1], 'ejs:github');
  });
});

test('cleans temporary files when the saved transcript cannot replace a directory', async () => {
  await withServer(async ({ root, request }) => {
    const dir = join(root, 'downloads');
    const destination = join(dir, `${videoId}.txt`);
    await mkdir(destination, { recursive: true });
    await writeFile(join(destination, 'keep'), 'original');
    const { result } = await request(`https://youtu.be/${videoId}`, dir);
    assert.equal(result.isError, true);
    assert.equal(await readFile(join(destination, 'keep'), 'utf8'), 'original');
    assert.deepEqual(await readdir(dir), [`${videoId}.txt`]);
  });
});

for (const value of ['0', '-1', 'invalid']) {
  test(`rejects invalid process timeout ${value}`, async () => {
    await withServer(async ({ root, request }) => {
      const { result, data, downloadsDir } = await request(`https://youtu.be/${videoId}`, undefined,
        { YT_SUBS_DOWNLOAD_TIMEOUT_MS: value });
      assert.equal(result.isError, true);
      assert.match(data.error, /positive integer/);
      assert.equal(existsSync(join(root, 'arguments.json')), false);
      assert.deepEqual(await readdir(downloadsDir), []);
    });
  });
}

test('ignores local yt-dlp configuration for both checks and downloads', async () => {
  await withServer(async ({ root, request }) => {
    const { data } = await request(`https://youtu.be/${videoId}`);
    assert.equal(data.success, true);
    const args = JSON.parse(await readFile(join(root, 'arguments.json'), 'utf8'));
    const dependencyArgs = JSON.parse(await readFile(join(root, 'dependency-arguments.json'), 'utf8'));
    assert.ok(args.includes('--ignore-config'));
    assert.ok(dependencyArgs.includes('--ignore-config'));
  });
});
