'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const SECRET_PATTERNS = [
  /(api[_-]?key|token|secret|password|authorization)(["'\s:=]+)([^\s"',}]+)/gi,
];

/** Replace anything that looks like a credential before it reaches a log sink. */
function redact(text) {
  let output = String(text);
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern, (_match, key, separator) => `${key}${separator}[redacted]`);
  }
  return output;
}

function formatMeta(meta) {
  if (meta === undefined || meta === null) return '';
  try {
    return ` ${redact(JSON.stringify(meta))}`;
  } catch {
    return ` ${redact(String(meta))}`;
  }
}

class Logger {
  constructor({ directory, fileName = 'app.log', maxBytes = 2 * 1024 * 1024, keep = 3 } = {}) {
    this.directory = directory;
    this.filePath = directory ? path.join(directory, fileName) : null;
    this.maxBytes = maxBytes;
    this.keep = keep;
    this.lines = [];
    this.maxMemoryLines = 600;
    this.stream = null;
    this.minLevel = 'info';
    if (directory) {
      try {
        fs.mkdirSync(directory, { recursive: true });
        this.#rotateIfNeeded();
        this.stream = fs.createWriteStream(this.filePath, { flags: 'a' });
        this.stream.on('error', () => {
          this.stream = null;
        });
      } catch {
        this.stream = null;
      }
    }
  }

  setLevel(level) {
    if (LEVELS[level]) this.minLevel = level;
  }

  #rotateIfNeeded() {
    try {
      const stat = fs.statSync(this.filePath);
      if (stat.size < this.maxBytes) return;
    } catch {
      return;
    }
    for (let index = this.keep - 1; index >= 1; index -= 1) {
      const from = index === 1 ? this.filePath : `${this.filePath}.${index - 1}`;
      const to = `${this.filePath}.${index}`;
      try {
        fs.renameSync(from, to);
      } catch {
        /* rotation is best effort */
      }
    }
  }

  #write(level, message, meta) {
    if (LEVELS[level] < LEVELS[this.minLevel]) return;
    const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${redact(message)}${formatMeta(meta)}`;
    this.lines.push(line);
    if (this.lines.length > this.maxMemoryLines) this.lines.shift();
    if (this.stream) {
      try {
        this.stream.write(`${line}\n`);
      } catch {
        /* logging must never break the app */
      }
    }
    if (process.env.ONECLICKMC_DEBUG) {
      process.stdout.write(`${line}\n`);
    }
  }

  debug(message, meta) {
    this.#write('debug', message, meta);
  }

  info(message, meta) {
    this.#write('info', message, meta);
  }

  warn(message, meta) {
    this.#write('warn', message, meta);
  }

  error(message, meta) {
    this.#write('error', message, meta);
  }

  recent(limit = 200) {
    return this.lines.slice(-limit);
  }

  describe() {
    return {
      filePath: this.filePath,
      directory: this.directory,
      linesInMemory: this.lines.length,
    };
  }

  close() {
    if (this.stream) {
      try {
        this.stream.end();
      } catch {
        /* ignore */
      }
      this.stream = null;
    }
  }
}

module.exports = { Logger, redact, LEVELS };
