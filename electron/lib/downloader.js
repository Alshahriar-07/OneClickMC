'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');
const { isHttpsUrl } = require('./paths');

class DownloadError extends Error {
  constructor(message, { code = 'DOWNLOAD_FAILED', cause = null } = {}) {
    super(message);
    this.name = 'DownloadError';
    this.code = code;
    this.cause = cause;
  }
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) return;
    if (signal.aborted) {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/**
 * Downloads one file to `destination`, hashing while streaming and verifying
 * the official hash before the file is moved into place.
 */
async function downloadToFile({
  url,
  destination,
  expectedSha512 = null,
  expectedSha1 = null,
  expectedSize = null,
  signal,
  onProgress = null,
  fetchImpl = globalThis.fetch,
  maxRetries = 3,
  logger = null,
}) {
  if (!isHttpsUrl(url)) {
    throw new DownloadError('Refusing a download that is not served over HTTPS.', { code: 'INSECURE_URL' });
  }
  if (!expectedSha512 && !expectedSha1) {
    throw new DownloadError('No integrity hash is available for this file.', { code: 'NO_HASH' });
  }

  const partPath = `${destination}.part`;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    await fsp.rm(partPath, { force: true }).catch(() => {});
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      signal.addEventListener('abort', forwardAbort, { once: true });
    }

    try {
      logger?.info('Downloading file', { url, attempt, destination });
      const response = await fetchImpl(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'OneClickMC/1.0.0 (https://github.com/Alshahriar-07/OneClickMC)',
          Accept: 'application/octet-stream',
        },
      });
      if (!response.ok || !response.body) {
        throw new DownloadError(`The download server returned HTTP ${response.status}.`, {
          code: 'HTTP_ERROR',
        });
      }

      const totalHeader = Number(response.headers.get('content-length')) || expectedSize || 0;
      const sha512 = crypto.createHash('sha512');
      const sha1 = crypto.createHash('sha1');
      let received = 0;
      let lastEmit = 0;

      const meter = new Transform({
        transform(chunk, _encoding, callback) {
          sha512.update(chunk);
          sha1.update(chunk);
          received += chunk.length;
          const now = Date.now();
          if (onProgress && now - lastEmit > 120) {
            lastEmit = now;
            onProgress({ received, total: totalHeader || expectedSize || 0 });
          }
          callback(null, chunk);
        },
      });

      await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(partPath));

      const digest512 = sha512.digest('hex');
      const digest1 = sha1.digest('hex');
      if (onProgress) onProgress({ received, total: totalHeader || expectedSize || received });

      if (expectedSha512 && digest512.toLowerCase() !== String(expectedSha512).toLowerCase()) {
        throw new DownloadError('The downloaded file does not match its published SHA-512 checksum.', {
          code: 'CHECKSUM_MISMATCH',
        });
      }
      if (!expectedSha512 && expectedSha1 && digest1.toLowerCase() !== String(expectedSha1).toLowerCase()) {
        throw new DownloadError('The downloaded file does not match its published SHA-1 checksum.', {
          code: 'CHECKSUM_MISMATCH',
        });
      }
      if (expectedSize && received !== expectedSize) {
        throw new DownloadError(
          `The downloaded size (${received} bytes) does not match the published size (${expectedSize} bytes).`,
          { code: 'SIZE_MISMATCH' },
        );
      }

      await fsp.rm(destination, { force: true });
      await fsp.rename(partPath, destination);
      logger?.info('Download verified', { destination, bytes: received });
      return {
        destination,
        bytes: received,
        sha512: digest512,
        sha1: digest1,
        attempts: attempt,
      };
    } catch (error) {
      lastError = error;
      await fsp.rm(partPath, { force: true }).catch(() => {});
      if (error?.name === 'AbortError' || signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (error instanceof DownloadError && error.code === 'CHECKSUM_MISMATCH') {
        // A corrupt payload can be retried from the same trusted source once.
        logger?.warn('Checksum mismatch, retrying', { url, attempt });
      } else {
        logger?.warn('Download attempt failed', { url, attempt, message: error.message });
      }
      if (attempt < maxRetries) {
        await delay(400 * 2 ** (attempt - 1), signal);
      }
    } finally {
      if (signal) signal.removeEventListener('abort', forwardAbort);
    }
  }

  throw new DownloadError(`Download failed after ${maxRetries} attempts: ${lastError?.message || 'unknown error'}`, {
    cause: lastError,
  });
}

module.exports = { DownloadError, downloadToFile };
