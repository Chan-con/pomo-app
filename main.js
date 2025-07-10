const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage, globalShortcut } = require('electron');
const path = require('path');

let mainWindow;
let tray = null;

// 各モードの座標を個別に保存
let savedPositions = {
  normal: { x: null, y: null },
  compact: { x: null, y: null }
};

// 2重起動防止
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window instead.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 580,
    minWidth: 320,
    minHeight: 480,
    maxWidth: 600,
    maxHeight: 900,
    resizable: true,
    frame: false,
    transparent: true,
    alwaysOnTop: false,
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
  
  // 右クリックメニュー関連のblurイベントを削除
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  registerGlobalShortcuts();
});

function registerGlobalShortcuts() {
  // グローバルショートカットは削除（他のアプリケーションに影響するため）
  // 代わりに弧状ハンドル領域を使用
}

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
  
  tray.on('click', () => {
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
  // 現在の位置を保存
  const [currentX, currentY] = mainWindow.getPosition();
  
  if (isCompact) {
    // ノーマルモードの座標を保存
    savedPositions.normal.x = currentX;
    savedPositions.normal.y = currentY;
    
    // コンパクトモードの座標が保存されていれば復元
    if (savedPositions.compact.x !== null && savedPositions.compact.y !== null) {
      mainWindow.setPosition(savedPositions.compact.x, savedPositions.compact.y);
    }
    
    // コンパクトモード: 170x170、リサイズ無効、基本はクリックスルー、最前面表示
    mainWindow.setSize(170, 170);
    mainWindow.setResizable(false);
    // 基本状態：完全クリックスルー（背面アプリ操作可能）
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    mainWindow.setAlwaysOnTop(true);
  } else {
    // コンパクトモードの座標を保存
    savedPositions.compact.x = currentX;
    savedPositions.compact.y = currentY;
    
    // ノーマルモード: 元のサイズ、リサイズ有効、クリックスルー無効、最前面表示無効
    mainWindow.setIgnoreMouseEvents(false);
    
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    const { x: screenX, y: screenY } = primaryDisplay.workArea;
    
    // 新しいウィンドウサイズ
    const newWidth = 400;
    const newHeight = 580;
    
    // ノーマルモードの座標が保存されていれば復元、なければ現在位置を調整
    let targetX = savedPositions.normal.x !== null ? savedPositions.normal.x : currentX;
    let targetY = savedPositions.normal.y !== null ? savedPositions.normal.y : currentY;
    
    // 画面内に収まるように位置を調整
    let adjustedX = targetX;
    let adjustedY = targetY;
    
    // 右端チェック
    if (targetX + newWidth > screenX + screenWidth) {
      adjustedX = screenX + screenWidth - newWidth;
    }
    // 左端チェック
    if (adjustedX < screenX) {
      adjustedX = screenX;
    }
    
    // 下端チェック
    if (targetY + newHeight > screenY + screenHeight) {
      adjustedY = screenY + screenHeight - newHeight;
    }
    // 上端チェック
    if (adjustedY < screenY) {
      adjustedY = screenY;
    }
    
    // 位置を調整してからサイズを変更
    mainWindow.setPosition(adjustedX, adjustedY);
    mainWindow.setSize(newWidth, newHeight);
    mainWindow.setResizable(true);
    mainWindow.setAlwaysOnTop(false);
    // 確実にマウスイベントを有効にする
    setTimeout(() => {
      mainWindow.setIgnoreMouseEvents(false);
    }, 100);
  }
});

// ドラッグモード制御（コンパクトモード専用）
ipcMain.on('enable-drag-mode', () => {
  console.log('🟢 Enabling drag mode');
  mainWindow.setIgnoreMouseEvents(false);
});

ipcMain.on('disable-drag-mode', () => {
  console.log('🔴 Disabling drag mode (click-through enabled)');
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
});

// 従来のマウスイベント制御（互換性のため残しておく）
ipcMain.on('enable-mouse-events', () => {
  mainWindow.setIgnoreMouseEvents(false);
});

ipcMain.on('disable-mouse-events', () => {
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
});