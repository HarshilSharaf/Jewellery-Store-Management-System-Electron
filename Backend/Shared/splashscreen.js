const { ipcRenderer } = require("electron");

function close_splashscreen() {
  // close splashscreen after app loads
  document.addEventListener("DOMContentLoaded", () => {
    // close splashscreen after 2.5 seconds
    setTimeout(() => {
      ipcRenderer.invoke("close_splashscreen");
    }, "2500");
  });
}

close_splashscreen();
