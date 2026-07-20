/**
 * Preload script for the Electron renderer.
 *
 * With `contextIsolation: true` (see main.js) the renderer cannot call
 * `window.require(...)` or otherwise touch Node APIs. This preload uses
 * `contextBridge.exposeInMainWorld` to publish a narrow, typed-shape
 * surface (`window.electronAPI`) that the Angular services under
 * `Backend/` wrap. Every method proxies through `ipcRenderer.invoke` to a
 * matching `ipcMain.handle` in main.js.
 *
 * IMPORTANT: only expose the minimum set of channels the renderer needs.
 * Never expose `ipcRenderer` itself or any generic "run this string"
 * escape hatch -- doing so would defeat contextIsolation.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  db: {
    initialize: (config) => ipcRenderer.invoke('db:initialize', config),
    execute:    (sql, values, options) => ipcRenderer.invoke('db:execute', sql, values, options),
    query:      (sql, options) => ipcRenderer.invoke('db:query', sql, options),
  },

  metalRates: {
    getCurrent: (options)          => ipcRenderer.invoke('metalRates:getCurrent', options),
    save:       (payload, options) => ipcRenderer.invoke('metalRates:save', payload, options),
  },

  shopSettings: {
    get:  (options)          => ipcRenderer.invoke('shopSettings:get', options),
    save: (payload, options) => ipcRenderer.invoke('shopSettings:save', payload, options),
  },

  store: {
    get:              (key)        => ipcRenderer.invoke('store:get', key),
    set:              (key, value) => ipcRenderer.invoke('store:set', key, value),
    delete:           (key)        => ipcRenderer.invoke('store:delete', key),
    getDefaultDbInfo: ()           => ipcRenderer.invoke('store:getDefaultDbInfo'),
  },

  auth: {
    compareHash:  (plaintext, hash) => ipcRenderer.invoke('auth:compareHash', plaintext, hash),
    generateHash: (plaintext, rounds) => ipcRenderer.invoke('auth:generateHash', plaintext, rounds),
  },

  fs: {
    getPicturesDirectory: ()           => ipcRenderer.invoke('fs:getPicturesDirectory'),
    ensureDir:            (dirPath)    => ipcRenderer.invoke('fs:ensureDir', dirPath),
    writeImage:           (savePath, base64) => ipcRenderer.invoke('fs:writeImage', savePath, base64),
    readImageBase64:      (filePath)   => ipcRenderer.invoke('fs:readImageBase64', filePath),
    deleteImage:          (filePath)   => ipcRenderer.invoke('fs:deleteImage', filePath),
    existsSync:           (filePath)   => ipcRenderer.invoke('fs:exists', filePath),
  },

  app: {
    relaunch:          ()  => ipcRenderer.invoke('app:relaunch'),
    closeSplashscreen: ()  => ipcRenderer.invoke('close_splashscreen'),
  },

  logger: {
    info:  (msg) => ipcRenderer.invoke('logger:info', msg),
    error: (msg) => ipcRenderer.invoke('logger:error', msg),
  },
});
