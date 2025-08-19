const { app, BrowserWindow, Tray, Menu, nativeImage, shell, screen, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Check if we're in development mode
const isDev = process.env.NODE_ENV === 'development';

// Configure app behavior for macOS
if (process.platform === 'darwin') {
  // Register custom protocol
  app.setAsDefaultProtocolClient('autofx');
  // Hide from the dock for overlay-style UX
  try { app.dock.hide(); } catch (e) {}
}

let mainWindow;
let tray;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: screen.getPrimaryDisplay().workAreaSize.width - 100,
    height: screen.getPrimaryDisplay().workAreaSize.height - 100,
    minWidth: screen.getPrimaryDisplay().workAreaSize.width - 100,
    minHeight: screen.getPrimaryDisplay().workAreaSize.height - 100,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'icon.png'),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000080',
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: true,
    skipTaskbar: true,
    autoHideMenuBar: true,
    // macOS visual effect for a Raycast-like overlay
    vibrancy: 'popover',
    visualEffectState: 'active'
  });

  // Load the app
  console.log('isDev:', isDev);
  console.log('NODE_ENV:', process.env.NODE_ENV);
  
  if (isDev) {
    console.log('Loading from development server: http://localhost:3000');
    mainWindow.loadURL('http://localhost:3000');
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    const buildPath = path.join(__dirname, '../build/index.html');
    console.log('Loading from build path:', buildPath);
    mainWindow.loadFile(buildPath);
  }

  // Don't automatically show the window - let user click dock icon
  mainWindow.once('ready-to-show', () => {
    console.log('Window ready-to-show event fired');
    // Keep window hidden by default - user must click dock icon to show it
    // mainWindow.show(); // Commented out to keep window hidden
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // On macOS, handle window close to hide instead of close
  if (process.platform === 'darwin') {
    mainWindow.on('close', (event) => {
      console.log('Window close event triggered, isQuiting:', app.isQuiting);
      if (!app.isQuiting) {
        event.preventDefault();
        console.log('Preventing close, hiding window instead');
        mainWindow.hide();
      }
    });
  }

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Add debugging for window events
  mainWindow.on('show', () => {
    console.log('Window show event fired');
  });

  mainWindow.on('hide', () => {
    console.log('Window hide event fired');
  });

  mainWindow.on('focus', () => {
    console.log('Window focus event fired');
  });

  mainWindow.on('blur', () => {
    console.log('Window blur event fired');
    // Hide overlay when it loses focus (Raycast-like behavior)
    if (mainWindow && mainWindow.isVisible()) {
      mainWindow.hide();
    }
  });
}

// Show the overlay near the top-center of the active display
function showOverlay() {
  if (mainWindow === null) {
    createWindow();
  }

  // Ensure overlay window has the right z-ordering
  try {
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch (_) {}
  try {
    mainWindow.setFullScreenable(false);
  } catch (_) {}
  try {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  } catch (_) {}

  // Size and position
  const desiredWidth = screen.getPrimaryDisplay().workAreaSize.width - 100;
  const desiredHeight = screen.getPrimaryDisplay().workAreaSize.height - 100;
  try {
    mainWindow.setSize(desiredWidth, desiredHeight, false);
  } catch (_) {}

  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const work = display.workArea;
  const x = Math.round(work.x + (work.width - desiredWidth) / 2);
  const y = Math.round(work.y + (work.height - desiredHeight) / 2);
  mainWindow.setPosition(x, y, false);

  if (!mainWindow.isVisible()) {
    // If the web contents aren't ready, wait before showing
    if (mainWindow.webContents.isLoading()) {
      mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.focus();
      });
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

// IPC: close overlay from renderer (ESC)
ipcMain.on('overlay:close', () => {
  if (mainWindow && mainWindow.isVisible()) {
    mainWindow.hide();
  }
});

// IPC: open file with default application
ipcMain.handle('open-file', async (event, filePath) => {
  try {
    console.log('📂 Opening file:', filePath);
    await shell.openPath(filePath);
    return { success: true };
  } catch (error) {
    console.error('❌ Error opening file:', error);
    return { success: false, error: error.message };
  }
});

// IPC: save file and open with default application
ipcMain.handle('save-and-open-file', async (event, fileName, fileData, mimeType) => {
  try {
    console.log('💾 Saving and opening file:', fileName);
    console.log('📊 Received data info:', {
      dataType: Array.isArray(fileData) ? 'Array' : typeof fileData,
      dataLength: fileData ? fileData.length : 'undefined',
      mimeType: mimeType,
      isString: typeof fileData === 'string',
      sampleStart: typeof fileData === 'string' ? fileData.substring(0, 50) + '...' : 'not string'
    });
    
    // Create a temporary file path in the Downloads folder
    const downloadsPath = path.join(os.homedir(), 'Downloads');
    const filePath = path.join(downloadsPath, fileName);
    
    // Convert Base64 back to Buffer
    let buffer;
    if (typeof fileData === 'string') {
      // Assume it's Base64 encoded
      buffer = Buffer.from(fileData, 'base64');
      console.log('🔄 Converted base64 to buffer, size:', buffer.length);
    } else if (Array.isArray(fileData)) {
      buffer = Buffer.from(fileData);
      console.log('🔄 Converted array to buffer, size:', buffer.length);
    } else if (fileData instanceof Uint8Array) {
      buffer = Buffer.from(fileData);
      console.log('🔄 Converted Uint8Array to buffer, size:', buffer.length);
    } else {
      buffer = Buffer.from(fileData);
      console.log('🔄 Direct conversion to buffer, size:', buffer.length);
    }
    
    // Write file to Downloads folder
    fs.writeFileSync(filePath, buffer);
    console.log('✅ File saved to:', filePath);
    
    // Check file size after writing
    const stats = fs.statSync(filePath);
    console.log('📋 File stats:', {
      size: stats.size,
      path: filePath
    });
    
    if (stats.size === 0) {
      throw new Error('File saved with 0 bytes - data conversion failed');
    }
    
    // Open the file with default application
    await shell.openPath(filePath);
    console.log('✅ File opened with default application');
    
    return { success: true, filePath };
  } catch (error) {
    console.error('❌ Error saving/opening file:', error);
    return { success: false, error: error.message };
  }
});

function createTray() {
  console.log('Creating tray icon...');
  
  // Create tray icon - use a default icon if custom icon doesn't exist
  let icon;
  try {
    const iconPath = path.join(__dirname, 'icon.png');
    icon = nativeImage.createFromPath(iconPath);
    console.log('Custom icon loaded successfully');
  } catch (error) {
    console.log('Custom icon not found, using default icon');
    // Create a more visible default icon for macOS
    if (process.platform === 'darwin') {
      // Create a simple blue circle icon that's more visible on macOS
      const canvas = require('canvas');
      const ctx = canvas.createCanvas(32, 32).getContext('2d');
      ctx.fillStyle = '#007bff';
      ctx.beginPath();
      ctx.arc(16, 16, 14, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('A', 16, 22);
      
      const buffer = canvas.toBuffer('image/png');
      icon = nativeImage.createFromBuffer(buffer);
    } else {
      // Use data URL for other platforms
      icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
    }
  }
  
  // Resize icon for tray (macOS prefers 16x16, Windows prefers 32x32)
  const trayIcon = process.platform === 'darwin' ? icon.resize({ width: 16, height: 16 }) : icon.resize({ width: 32, height: 32 });
  
  try {
    tray = new Tray(trayIcon);
    tray.setToolTip('AutoFX - AI Media Processing');
    console.log('Tray icon created successfully');
    
    // On macOS, make sure the tray icon is visible
    if (process.platform === 'darwin') {
      console.log('macOS detected, ensuring tray icon visibility');
      // Force the tray icon to be visible
      tray.setIgnoreDoubleClickEvents(false);
    }
  } catch (error) {
    console.error('Failed to create tray icon:', error);
    return;
  }

  // Create tray menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open AutoFX',
      click: () => {
        showOverlay();
      }
    },
    {
      label: 'Hide Window',
      click: () => {
        if (mainWindow) {
          mainWindow.hide();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);

  // Don't set context menu by default - only show on right-click
  // tray.setContextMenu(contextMenu);

  // Handle tray click (toggle overlay show/hide)
  let lastClickTime = 0;
  const CLICK_DELAY = 300; // 300ms delay to prevent rapid successive clicks

  tray.on('click', () => {
    const now = Date.now();
    if (now - lastClickTime < CLICK_DELAY) {
      console.log('Click too soon, ignoring...');
      return;
    }
    lastClickTime = now;

    console.log('Tray clicked, mainWindow:', mainWindow ? 'exists' : 'null', 'visible:', mainWindow ? mainWindow.isVisible() : 'N/A');

    if (mainWindow && mainWindow.isVisible()) {
      console.log('Overlay visible, hiding...');
      mainWindow.hide();
    } else {
      console.log('Showing overlay...');
      showOverlay();
    }
  });

  // Show context menu only on right-click
  tray.on('right-click', () => {
    tray.popUpContextMenu(contextMenu);
  });
}

function createDockMenu() {
  if (process.platform === 'darwin') {
    const dockMenu = Menu.buildFromTemplate([
      {
        label: 'Open AutoFX',
        click: () => {
          showOverlay();
        }
      },
      {
        label: 'Hide Window',
        click: () => {
          if (mainWindow) {
            mainWindow.hide();
          }
        }
      }
    ]);
    
    app.dock.setMenu(dockMenu);
  }
}

// App event handlers
app.whenReady().then(() => {
  console.log('App is ready, creating tray and hidden window...');
  
  // Create window but don't show it
  createWindow();
  
  // Create dock menu for macOS
  createDockMenu();
  
  // Create tray icon after a small delay (macOS sometimes needs this)
  setTimeout(() => {
    createTray();
  }, 1000);

  app.on('activate', () => {
    // On macOS, when dock icon is clicked, show overlay
    showOverlay();
  });
});

app.on('window-all-closed', (e) => {
  // On macOS, keep the app running even when all windows are closed
  // Don't quit the app, just hide the window
  if (process.platform !== 'darwin') {
    app.quit();
  }
  // On macOS, the app stays running in the dock
});

app.on('before-quit', () => {
  // Set flag to indicate app is quitting
  app.isQuiting = true;
  // Clean up tray when quitting
  if (tray) {
    tray.destroy();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });
});

// Handle app quit
app.on('quit', () => {
  app.isQuiting = true;
  if (tray) {
    tray.destroy();
  }
});
