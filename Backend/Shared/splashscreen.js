/**
 * Loaded into the main window renderer via a <script> tag in index.html.
 * With contextIsolation enabled the renderer cannot `require("electron")`
 * directly, so we call the closeSplashscreen bridge exposed by
 * src-electron/preload.js. The old `ipcRenderer.invoke("close_splashscreen")`
 * call is preserved as a fallback for safety in case this file gets loaded
 * in an environment where the preload has not run yet.
 */
function close_splashscreen() {
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      var api = window.electronAPI;
      if (api && api.app && typeof api.app.closeSplashscreen === "function") {
        api.app.closeSplashscreen();
      }
    }, 2500);
  });
}

close_splashscreen();
