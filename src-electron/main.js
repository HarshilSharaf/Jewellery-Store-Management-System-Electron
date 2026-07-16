const { app, BrowserWindow, ipcMain } = require('electron')
const ElectronStore = require('electron-store');
const isDev = !app.isPackaged;

ElectronStore.initRenderer();

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // TODO: Enable contextIsolation and move Node.js operations to preload script
      // TODO: Find a safe way to load local resources instead of disabling webSecurity
      webSecurity: false
    }
  })

  mainWindow.hide();

  const splashScreen = new BrowserWindow({
    width: 800,
    height: 600,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    // skipTaskbar: true,
    center: true
  });

  if (isDev) {
    console.log("Running in development");
    splashScreen.loadURL("http://localhost:4200/assets/splashscreens/splashscreen-1/index.html");
    mainWindow.loadURL("http://localhost:4200/");
  } else {
    console.log("Running in production");
    splashScreen.loadFile("./dist/browser/assets/splashscreens/splashscreen-1/index.html");
    mainWindow.loadFile("./dist/browser/index.html");
  }

  ipcMain.handle('close_splashscreen', () => {
    console.log("Closing splashscreen");
    splashScreen.destroy();
    mainWindow.show();
  });
}

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
