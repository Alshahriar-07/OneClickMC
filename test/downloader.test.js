'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { DownloadError, downloadToFile } = require('../electron/lib/downloader');

async function makeDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'oneclickmc-download-'));
}

function hash(value) {
  return crypto.createHash('sha512').update(value).digest('hex');
}

function makeFetch(content, { status = 200 } = {}) {
  return async () =>
    new Response(Buffer.from(content), {
      status,
      headers: { 'content-length': String(Buffer.byteLength(content)) },
    });
}

test('downloadToFile verifies the checksum and moves the file into place', async (t) => {
  const dir = await makeDir();
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));

  const content = 'verified mod bytes';
  const destination = path.join(dir, 'mod.jar');
  const progress = [];
  const result = await downloadToFile({
    url: 'https://cdn.modrinth.com/data/x/versions/y/mod.jar',
    destination,
    expectedSha512: hash(content),
    expectedSize: Buffer.byteLength(content),
    fetchImpl: makeFetch(content),
    onProgress: (event) => progress.push(event),
  });

  assert.equal(result.bytes, Buffer.byteLength(content));
  assert.equal(result.sha512, hash(content));
  assert.equal(await fsp.readFile(destination, 'utf8'), content);
  assert.ok(progress.length > 0);
  const leftovers = (await fsp.readdir(dir)).filter((name) => name.endsWith('.part'));
  assert.deepEqual(leftovers, []);
});

test('downloadToFile rejects a mismatched checksum after retrying', async (t) => {
  const dir = await makeDir();
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));

  await assert.rejects(
    () =>
      downloadToFile({
        url: 'https://cdn.modrinth.com/data/x/versions/y/mod.jar',
        destination: path.join(dir, 'mod.jar'),
        expectedSha512: '0'.repeat(128),
        fetchImpl: makeFetch('tampered payload'),
        maxRetries: 2,
      }),
    (error) => {
      assert.ok(error instanceof DownloadError);
      assert.match(error.message, /checksum/i);
      return true;
    },
  );

  assert.deepEqual(await fsp.readdir(dir), []);
});

test('downloadToFile requires a hash and an https url', async (t) => {
  const dir = await makeDir();
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));

  await assert.rejects(
    () => downloadToFile({ url: 'https://cdn.modrinth.com/x.jar', destination: path.join(dir, 'x.jar') }),
    /integrity hash/i,
  );
  await assert.rejects(
    () =>
      downloadToFile({
        url: 'http://cdn.modrinth.com/x.jar',
        destination: path.join(dir, 'x.jar'),
        expectedSha512: 'a'.repeat(128),
      }),
    /HTTPS/i,
  );
});

test('downloadToFile stops when the caller cancels', async (t) => {
  const dir = await makeDir();
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));

  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    () =>
      downloadToFile({
        url: 'https://cdn.modrinth.com/x.jar',
        destination: path.join(dir, 'x.jar'),
        expectedSha512: 'a'.repeat(128),
        signal: controller.signal,
      }),
    (error) => error.name === 'AbortError',
  );
});

test('downloadToFile reports http errors with retries', async (t) => {
  const dir = await makeDir();
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));

  await assert.rejects(
    () =>
      downloadToFile({
        url: 'https://cdn.modrinth.com/x.jar',
        destination: path.join(dir, 'x.jar'),
        expectedSha512: 'a'.repeat(128),
        fetchImpl: makeFetch('nope', { status: 503 }),
        maxRetries: 2,
      }),
    /HTTP 503|failed after/i,
  );
});
