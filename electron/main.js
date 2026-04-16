import { app, BrowserWindow, shell, Menu, nativeImage } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';
import { fork } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let serverProcess = null;

const isDev = process.env.NODE_ENV === 'development';
const SERVER_PORT = parseInt(process.env.PORT || '5000', 10);
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'Quant Edge Labs',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: process.platform !== 'darwin',
  });

  // Show window once content is ready to avoid white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function buildMenu() {
  const template = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: 'Quant Edge Labs',
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(process.platform === 'darwin'
          ? [{ type: 'separator' }, { role: 'front' }]
          : [{ role: 'close' }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * Wait for the Express server to be ready by polling the health endpoint.
 */
async function waitForServer(maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(SERVER_URL + '/health');
      if (response.ok || response.status === 503) {
        // 503 = degraded but running, still good to load
        return true;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/**
 * Start the Express backend server as a child process.
 */
function startServer() {
  const projectRoot = path.resolve(__dirname, '..');

  if (isDev) {
    // In dev mode, use tsx to run TypeScript directly
    serverProcess = fork(
      path.join(projectRoot, 'node_modules', '.bin', 'tsx'),
      [path.join(projectRoot, 'server', 'index.ts')],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          NODE_ENV: 'development',
          PORT: String(SERVER_PORT),
          HOST: '127.0.0.1',
          ELECTRON: 'true',
        },
        stdio: 'pipe',
      }
    );
  } else {
    // In production, run the built server bundle
    serverProcess = fork(path.join(projectRoot, 'dist', 'web.js'), [], {
      cwd: projectRoot,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(SERVER_PORT),
        HOST: '127.0.0.1',
        ELECTRON: 'true',
      },
      stdio: 'pipe',
    });
  }

  serverProcess.stdout?.on('data', (data) => {
    process.stdout.write(`[server] ${data}`);
  });

  serverProcess.stderr?.on('data', (data) => {
    process.stderr.write(`[server] ${data}`);
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
  });

  serverProcess.on('exit', (code) => {
    console.log(`Server process exited with code ${code}`);
    serverProcess = null;
  });
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

// ── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  buildMenu();

  // Start backend server
  console.log('Starting QuantEdge server...');
  startServer();

  // Create the window while waiting for server
  const win = createWindow();

  // Wait for server to be ready
  const serverReady = await waitForServer();

  if (serverReady) {
    console.log('Server is ready, loading app...');
    win.loadURL(SERVER_URL);
  } else {
    console.error('Server failed to start within timeout');
    win.loadURL(
      `data:text/html,<html><body style="background:#0f172a;color:#94a3b8;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column"><h2 style="color:#ef4444">Failed to start server</h2><p>The QuantEdge backend did not start in time.</p><p style="color:#64748b;font-size:12px">Check that all dependencies are installed and your .env file is configured.</p></body></html>`
    );
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = createWindow();
      win.loadURL(SERVER_URL);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopServer();
});

app.on('will-quit', () => {
  stopServer();
});
