'use strict';

const { contextBridge, ipcRenderer } = require('electron');

async function call(channel, ...args) {
  const response = await ipcRenderer.invoke(channel, ...args);
  if (!response || response.ok !== true) {
    const error = new Error(response?.error?.message || 'The application request failed.');
    error.code = response?.error?.code || 'IPC_ERROR';
    throw error;
  }
  return response.data;
}

contextBridge.exposeInMainWorld('oneclickmc', {
  appInfo: () => call('app:info'),

  settings: {
    get: () => call('settings:get'),
    update: (patch) => call('settings:update', patch),
    reset: () => call('settings:reset'),
  },

  minecraft: {
    detect: () => call('mc:detect'),
    inspect: (root) => call('mc:inspect', root),
    inspectGameDir: (gameDir) => call('mc:gameDir', gameDir),
    java: (root) => call('mc:java', root),
  },

  dialog: {
    pickDirectory: (defaultPath) => call('dialog:pickDirectory', defaultPath),
  },

  compatibility: {
    status: () => call('compat:status'),
    resolve: (payload) => call('compat:resolve', payload),
    refresh: (payload) => call('compat:resolve', { ...payload, refresh: true }),
  },

  install: {
    preview: (payload) => call('install:preview', payload),
    start: (payload) => call('install:start', payload),
    cancel: (jobId) => call('install:cancel', jobId),
    job: (jobId) => call('install:job', jobId),
    rollback: (installationId) => call('install:rollback', installationId),
    history: () => call('install:history'),
    onEvent: (callback) => {
      const listener = (_event, payload) => {
        try {
          callback(payload);
        } catch {
          /* renderer callback errors must not break IPC */
        }
      };
      ipcRenderer.on('job:event', listener);
      return () => ipcRenderer.removeListener('job:event', listener);
    },
  },

  logs: {
    recent: (limit) => call('logs:recent', limit),
    openFolder: () => call('logs:openFolder'),
  },

  diagnostics: {
    copy: () => call('diagnostics:copy'),
  },

  system: {
    openPath: (target) => call('system:openPath', target),
    showItemInFolder: (target) => call('system:showItemInFolder', target),
    openExternal: (url) => call('system:openExternal', url),
  },
});
