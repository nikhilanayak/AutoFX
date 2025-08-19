const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Add any Electron-specific APIs here if needed in the future
  platform: process.platform,
  version: process.versions.electron,
  closeOverlay: () => ipcRenderer.send('overlay:close'),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  saveAndOpenFile: (fileName, fileData, mimeType) => ipcRenderer.invoke('save-and-open-file', fileName, fileData, mimeType)
});

// Handle any security-related features
window.addEventListener('DOMContentLoaded', () => {
  // Disable right-click context menu in production
  if (process.env.NODE_ENV === 'production') {
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }
});
