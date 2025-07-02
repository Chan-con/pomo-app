const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

let mainWindow;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 500,
    minWidth: 320,
    minHeight: 400,
    maxWidth: 600,
    maxHeight: 800,
    resizable: true,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile('index.html');
  
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

function createTray() {
  // Use the app icon for the tray (will be resized automatically)
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '表示',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    {
      label: '終了',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('ポモドーロタイマー');
  tray.setContextMenu(contextMenu);
  
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.on('show-notification', (event, title, body) => {
  new Notification({
    title: title,
    body: body
  }).show();
});

ipcMain.on('minimize-to-tray', () => {
  mainWindow.hide();
});

ipcMain.on('restore-from-tray', () => {
  mainWindow.show();
});

ipcMain.on('close-app', () => {
  app.isQuiting = true;
  app.quit();
});

ipcMain.handle('get-window-position', () => {
  return mainWindow.getPosition();
});

ipcMain.on('set-window-position', (event, x, y) => {
  mainWindow.setPosition(Math.round(x), Math.round(y));
});

ipcMain.on('set-compact-mode', (event, isCompact) => {
  if (isCompact) {
    // コンパクトモード: 170x170、リサイズ無効、透明部分をクリックスルー
    mainWindow.setSize(170, 170);
    mainWindow.setResizable(false);
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    // ノーマルモード: 元のサイズ、リサイズ有効、クリックスルー無効
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.setSize(400, 500);
    mainWindow.setResizable(true);
    // 確実にマウスイベントを有効にする
    setTimeout(() => {
      mainWindow.setIgnoreMouseEvents(false);
    }, 100);
  }
});

// コンパクトモードでの一時的なマウスイベント制御
ipcMain.on('enable-mouse-events', () => {
  mainWindow.setIgnoreMouseEvents(false);
});

ipcMain.on('disable-mouse-events', () => {
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
});