const { app, BrowserWindow, Menu, shell, nativeImage } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let aboutWindow = null;

const APP_ICON_PATH = path.join(__dirname, "..", "build", "icon.png");

// Small logo embedded into the About window (read once, base64 data URI).
let aboutLogoDataUri = "";
try {
  const bytes = fs.readFileSync(path.join(__dirname, "about-logo.png"));
  aboutLogoDataUri = `data:image/png;base64,${bytes.toString("base64")}`;
} catch {
  aboutLogoDataUri = "";
}

const aboutDetails = {
  name: "Cork Board",
  developer: "Sam Wasserman",
  license: "MIT License",
  wassermanProductions: "https://wassermanproductions.com",
  wassermanAi: "https://wasserman.ai",
};

app.setName(aboutDetails.name);
app.setPath("userData", path.join(app.getPath("appData"), "cork-board"));

function escHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function configureAboutMetadata() {
  app.setAboutPanelOptions({
    applicationName: aboutDetails.name,
    applicationVersion: app.getVersion(),
    copyright: `Developed by ${aboutDetails.developer}. ${aboutDetails.license}.`,
    credits: [
      `Developed by ${aboutDetails.developer}`,
      "",
      aboutDetails.wassermanProductions,
      aboutDetails.wassermanAi,
      "",
      aboutDetails.license,
    ].join("\n"),
  });
}

function showAboutWindow(parent) {
  if (aboutWindow) {
    aboutWindow.focus();
    return;
  }

  aboutWindow = new BrowserWindow({
    parent,
    show: true,
    center: true,
    width: 460,
    height: 430,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    title: `About ${aboutDetails.name}`,
    backgroundColor: "#f6f3ec",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  aboutWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const html = `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>About ${escHtml(aboutDetails.name)}</title>
        <style>
          :root {
            color: #161510;
            background: #f6f3ec;
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          }
          body {
            box-sizing: border-box;
            display: grid;
            min-height: 100vh;
            margin: 0;
            place-items: center;
            padding: 34px;
          }
          main {
            display: grid;
            gap: 18px;
            max-width: 360px;
            text-align: center;
          }
          .mark {
            display: block;
            width: 72px;
            height: 72px;
            margin: 0 auto;
            border-radius: 16px;
          }
          h1 {
            margin: 0;
            font-size: 25px;
            letter-spacing: 0;
          }
          p {
            margin: 0;
            color: #4e4a41;
            font-size: 14px;
            line-height: 1.55;
          }
          .links {
            display: grid;
            gap: 8px;
          }
          a {
            color: #146e74;
            font-weight: 700;
            text-decoration-thickness: 1px;
            text-underline-offset: 3px;
          }
          .license {
            display: inline-block;
            margin: 0 auto;
            padding: 8px 10px;
            border: 1px solid #161510;
            background: #fffdf8;
            color: #161510;
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
          }
        </style>
      </head>
      <body>
        <main>
          ${aboutLogoDataUri ? `<img class="mark" src="${aboutLogoDataUri}" alt="${escHtml(aboutDetails.name)}" />` : `<div class="mark"></div>`}
          <h1>${escHtml(aboutDetails.name)}</h1>
          <p>Developed by <strong>${escHtml(aboutDetails.developer)}</strong>.</p>
          <div class="links">
            <a href="${escHtml(aboutDetails.wassermanProductions)}" target="_blank" rel="noreferrer">WassermanProductions.com</a>
            <a href="${escHtml(aboutDetails.wassermanAi)}" target="_blank" rel="noreferrer">Wasserman.AI</a>
          </div>
          <p class="license">${escHtml(aboutDetails.license)}</p>
          <p>The digital cork board for filmmakers. Index cards, acts, arcs, and episodes — planned the old way, powered the new way.</p>
        </main>
      </body>
    </html>`;

  aboutWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  aboutWindow.show();
  aboutWindow.focus();
  aboutWindow.moveTop();
  setTimeout(() => {
    if (aboutWindow) aboutWindow.setAlwaysOnTop(false);
  }, 1000);
  aboutWindow.on("closed", () => {
    aboutWindow = null;
  });
}

function createApplicationMenu() {
  const appMenu = [
    {
      label: app.name,
      submenu: [
        {
          label: `About ${aboutDetails.name}`,
          click: () => showAboutWindow(BrowserWindow.getFocusedWindow()),
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { type: "separator" }, { role: "front" }],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "WassermanProductions.com",
          click: () => shell.openExternal(aboutDetails.wassermanProductions),
        },
        {
          label: "Wasserman.AI",
          click: () => shell.openExternal(aboutDetails.wassermanAi),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(appMenu));
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1520,
    height: 960,
    minWidth: 1120,
    minHeight: 700,
    title: "Cork Board",
    backgroundColor: "#f6f3ec",
    icon: APP_ICON_PATH,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  // Dock icon for `npm run desktop` dev runs (packaged mac builds use build/icon.png).
  if (process.platform === "darwin" && app.dock) {
    try {
      const img = nativeImage.createFromPath(APP_ICON_PATH);
      if (!img.isEmpty()) app.dock.setIcon(img);
    } catch {}
  }
  configureAboutMetadata();
  createApplicationMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
