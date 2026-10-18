'use strict';

const API_BASE = 'https://api.modrinth.com/v2';
const USER_AGENT = 'OneClickMC/1.0.0 (https://github.com/Alshahriar-07/OneClickMC)';

class ModrinthError extends Error {
  constructor(message, { status = null, retryAfter = null, cause = null } = {}) {
    super(message);
    this.name = 'ModrinthError';
    this.status = status;
    this.retryAfter = retryAfter;
    this.cause = cause;
  }
}

function sleep(ms, signal) {
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

class ModrinthClient {
  constructor({ baseUrl = API_BASE, fetchImpl = globalThis.fetch, maxRetries = 2, timeoutMs = 20000, logger = null } = {}) {
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
    this.maxRetries = maxRetries;
    this.timeoutMs = timeoutMs;
    this.logger = logger;
    this.cache = new Map();
  }

  async #request(url, { signal } = {}) {
    let lastError = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      const onAbort = () => controller.abort();
      if (signal) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        signal.addEventListener('abort', onAbort, { once: true });
      }
      try {
        const response = await this.fetchImpl(url, {
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'application/json',
          },
          signal: controller.signal,
        });
        if (response.status === 404) {
          throw new ModrinthError('Project not found on Modrinth.', { status: 404 });
        }
        if (response.status === 429) {
          const retryAfter = Number(response.headers.get('retry-after')) || 2;
          throw new ModrinthError('Modrinth rate limit reached.', { status: 429, retryAfter });
        }
        if (!response.ok) {
          throw new ModrinthError(`Modrinth request failed with HTTP ${response.status}.`, {
            status: response.status,
          });
        }
        return await response.json();
      } catch (error) {
        if (error.name === 'AbortError') {
          if (signal?.aborted) throw error;
          lastError = new ModrinthError('The Modrinth request timed out.');
        } else if (error instanceof ModrinthError && error.status === 404) {
          throw error;
        } else {
          lastError = error instanceof ModrinthError
            ? error
            : new ModrinthError('Could not reach the Modrinth API.', { cause: error });
        }
        if (attempt < this.maxRetries) {
          const wait = lastError.status === 429 ? lastError.retryAfter * 1000 : 500 * 2 ** attempt;
          this.logger?.warn('Retrying Modrinth request', { url, attempt: attempt + 1, wait });
          await sleep(wait, signal);
        }
      } finally {
        clearTimeout(timeout);
        if (signal) signal.removeEventListener('abort', onAbort);
      }
    }
    throw lastError || new ModrinthError('Modrinth request failed.');
  }

  async getProject(slugOrId, options = {}) {
    const key = `project:${slugOrId}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const project = await this.#request(`${this.baseUrl}/project/${encodeURIComponent(slugOrId)}`, options);
    this.cache.set(key, project);
    return project;
  }

  async getProjects(ids, options = {}) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const unique = [...new Set(ids)].filter(Boolean);
    const key = `projects:${unique.slice().sort().join(',')}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const params = new URLSearchParams({ ids: JSON.stringify(unique) });
    const projects = await this.#request(`${this.baseUrl}/projects?${params.toString()}`, options);
    if (!Array.isArray(projects)) throw new ModrinthError('Unexpected Modrinth projects response.');
    this.cache.set(key, projects);
    for (const project of projects) {
      if (project?.slug) this.cache.set(`project:${project.slug}`, project);
      if (project?.id) this.cache.set(`project:${project.id}`, project);
    }
    return projects;
  }

  async getVersions(slugOrId, { gameVersions, loaders, signal } = {}) {
    const params = new URLSearchParams();
    if (Array.isArray(gameVersions) && gameVersions.length) {
      params.set('game_versions', JSON.stringify(gameVersions));
    }
    if (Array.isArray(loaders) && loaders.length) {
      params.set('loaders', JSON.stringify(loaders));
    }
    const key = `versions:${slugOrId}:${gameVersions?.join(',') || ''}:${loaders?.join(',') || ''}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const query = params.toString();
    const url = `${this.baseUrl}/project/${encodeURIComponent(slugOrId)}/version${query ? `?${query}` : ''}`;
    const versions = await this.#request(url, { signal });
    if (!Array.isArray(versions)) throw new ModrinthError('Unexpected Modrinth version response.');
    this.cache.set(key, versions);
    return versions;
  }
}

module.exports = { API_BASE, ModrinthClient, ModrinthError, USER_AGENT };
