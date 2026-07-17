/**
 * Loaded into the main window renderer via a <script> tag in index.html.
 * With contextIsolation enabled the renderer cannot `require("electron")`
 * directly, so we call the closeSplashscreen bridge exposed by
 * src-electron/preload.js. If the bridge is unavailable we log loudly so
 * the failure is diagnosable in DevTools rather than silently freezing on
 * the splash.
 */
function close_splashscreen() {
  document.addEventListener("DOMContentLoaded", function () {
    setTimeout(function () {
      var api = window.electronAPI;
      if (api && api.app && typeof api.app.closeSplashscreen === "function") {
        api.app.closeSplashscreen();
        return;
      }
      // Bridge is missing. The most common cause is a preload load error;
      // main.js also logs `preload-error` when that happens. Log here so
      // the renderer-side symptom is obvious in DevTools too. The main
      // process has a 15s safety timer that force-shows this window even
      // if we cannot signal it directly.
      console.error(
        "[splashscreen] window.electronAPI.app.closeSplashscreen unavailable; " +
        "the main process will force-show this window after its safety timeout. " +
        "Check main.log for a preload-error entry."
      );
    }, 2500);
  });
}

close_splashscreen();
