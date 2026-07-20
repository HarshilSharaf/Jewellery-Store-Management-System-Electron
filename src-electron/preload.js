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

  oldGold: {
    saveReceipt:           (payload, options)      => ipcRenderer.invoke('oldGold:saveReceipt', payload, options),
    getReceiptsByCustomer: (customerGuid, options) => ipcRenderer.invoke('oldGold:getReceiptsByCustomer', customerGuid, options),
    getReceiptByInvoice:   (invoiceGuid, options)  => ipcRenderer.invoke('oldGold:getReceiptByInvoice', invoiceGuid, options),
  },

  savingSchemes: {
    enroll:            (payload, options)      => ipcRenderer.invoke('savingSchemes:enroll', payload, options),
    recordInstallment: (payload, options)      => ipcRenderer.invoke('savingSchemes:recordInstallment', payload, options),
    redeem:            (payload, options)      => ipcRenderer.invoke('savingSchemes:redeem', payload, options),
    forfeit:           (payload, options)      => ipcRenderer.invoke('savingSchemes:forfeit', payload, options),
    getDetails:        (schemeGuid, options)   => ipcRenderer.invoke('savingSchemes:getDetails', schemeGuid, options),
    getAll:            (args, options)         => ipcRenderer.invoke('savingSchemes:getAll', args, options),
    getByCustomer:     (customerGuid, options) => ipcRenderer.invoke('savingSchemes:getByCustomer', customerGuid, options),
  },

  karigar: {
    addKarigar:      (payload, options)   => ipcRenderer.invoke('karigar:addKarigar', payload, options),
    getAllKarigars:  (args, options)      => ipcRenderer.invoke('karigar:getAllKarigars', args, options),
    updateKarigar:   (payload, options)   => ipcRenderer.invoke('karigar:updateKarigar', payload, options),
    deleteKarigar:   (args, options)      => ipcRenderer.invoke('karigar:deleteKarigar', args, options),
    issueJob:        (payload, options)   => ipcRenderer.invoke('karigar:issueJob', payload, options),
    receiveJob:      (payload, options)   => ipcRenderer.invoke('karigar:receiveJob', payload, options),
    settleJob:       (payload, options)   => ipcRenderer.invoke('karigar:settleJob', payload, options),
    getJobDetails:   (jobGuid, options)   => ipcRenderer.invoke('karigar:getJobDetails', jobGuid, options),
    getAllJobs:      (args, options)      => ipcRenderer.invoke('karigar:getAllJobs', args, options),
    getLedger:       (args, options)      => ipcRenderer.invoke('karigar:getLedger', args, options),
  },

  reports: {
    dayBook:              (args, options) => ipcRenderer.invoke('reports:dayBook', args, options),
    salesRegister:        (args, options) => ipcRenderer.invoke('reports:salesRegister', args, options),
    stockSummaryByPurity: (args, options) => ipcRenderer.invoke('reports:stockSummaryByPurity', args, options),
    gstr1Export:          (args, options) => ipcRenderer.invoke('reports:gstr1Export', args, options),
    lowStockByCategory:   (args, options) => ipcRenderer.invoke('reports:lowStockByCategory', args, options),
  },

  backup: {
    create:  (payload) => ipcRenderer.invoke('backup:create',  payload),
    restore: (payload) => ipcRenderer.invoke('backup:restore', payload),
    list:    (payload) => ipcRenderer.invoke('backup:list',    payload),
    delete:  (payload) => ipcRenderer.invoke('backup:delete',  payload),
  },

  store: {
    get:              (key)        => ipcRenderer.invoke('store:get', key),
    set:              (key, value) => ipcRenderer.invoke('store:set', key, value),
    delete:           (key)        => ipcRenderer.invoke('store:delete', key),
    getDefaultDbInfo: ()           => ipcRenderer.invoke('store:getDefaultDbInfo'),
  },

  auth: {
    compareHash:        (plaintext, hash)   => ipcRenderer.invoke('auth:compareHash', plaintext, hash),
    generateHash:       (plaintext, rounds) => ipcRenderer.invoke('auth:generateHash', plaintext, rounds),
    getUserPermissions: (userId, options)   => ipcRenderer.invoke('auth:getUserPermissions', userId, options),
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
