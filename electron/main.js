const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

const isDev = !app.isPackaged;
let backendProcess = null;

function startBackend() {
  const backendDir = isDev
    ? path.join(__dirname, "..", "backend")
    : path.join(process.resourcesPath, "backend");

  backendProcess = spawn("uvicorn", ["main:app", "--host", "0.0.0.0", "--port", "8000"], {
    cwd: backendDir,
    shell: true,
  });

  backendProcess.stdout.on("data", (d) => console.log("[backend]", d.toString()));
  backendProcess.stderr.on("data", (d) => console.error("[backend]", d.toString()));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#0f0f0f",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  if (isDev) {
    win.loadURL("https://localhost:5173");
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "dist", "index.html"));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// Allow self-signed cert from local Vite dev server
app.on("certificate-error", (event, _wc, _url, _err, _cert, callback) => {
  event.preventDefault();
  callback(true);
});

app.whenReady().then(async () => {
  // Clear renderer cache so stale JS bundles (e.g. removed npm packages) don't persist
  const { session } = require("electron");
  await session.defaultSession.clearCache();
  startBackend();
  setTimeout(createWindow, 1500);
});

app.on("window-all-closed", () => {
  if (backendProcess) backendProcess.kill();
  if (process.platform !== "darwin") app.quit();
});
