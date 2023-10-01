const { app, BrowserWindow } = require('electron')
const ElectronStore = require('electron-store');
ElectronStore.initRenderer();

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    }
  })

  win.loadURL('http://localhost:4200/')
  // win.loadFile('./dist/index.html')

}

app.whenReady().then(() => {
  createWindow()
})