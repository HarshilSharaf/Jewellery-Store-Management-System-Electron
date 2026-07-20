const ffi = require('ffi-napi');
const ref = require('ref-napi');

const user32 = ffi.Library('user32', {
  'SetWindowDisplayAffinity': ['bool', ['long', 'uint']]
});

// Convert Buffer to HWND (use readUInt64LE or readUInt32LE depending on architecture)
const hwndBuffer = mainWindow.getNativeWindowHandle();
const hwnd = hwndBuffer.readUInt32LE(0); // or readUInt64LE(0) on 64-bit

const WDA_EXCLUDEFROMCAPTURE = 0x11;

const success = user32.SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE);
console.log('Display affinity set:', success);
