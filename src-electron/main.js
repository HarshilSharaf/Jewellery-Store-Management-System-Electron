const { app, BrowserWindow, ipcMain, protocol } = require('electron')
const ElectronStore = require('electron-store');
const isDev = require('electron-is-dev');

ElectronStore.initRenderer();

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      // TODO: Find a safe way to load local resources instead of disabling webSecurity
      webSecurity: false
    }
  })

  if (isDev) {
    console.log("Running in development");
    win.loadURL("http://localhost:4200/");
  } else {
    console.log("Running in production");
    win.loadFile("./dist/index.html");
  }

}

// Refer Following link for more info: https://www.electronjs.org/docs/latest/api/app#appgetpathname
const getPicturesDirectory = () => app.getPath('pictures')

app.whenReady().then(() => {
  createWindow()
  ipcMain.on('get-pictures-directory', (event) => {
    event.sender.send('pictures-directory', getPicturesDirectory())
  })

  ipcMain.handle('relaunch-app', () => {
    app.relaunch();
    app.quit();
  });
})