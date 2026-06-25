const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path    = require('path');
const fs      = require('fs');
const https   = require('https');
const http    = require('http');
const Crawler = require('./crawler');
const { autoUpdater } = require('electron-updater');

/**
 * Parse a PDF date string into a MySQL-compatible "YYYY-MM-DD HH:mm:ss" string.
 * PDF date format: D:YYYYMMDDHHmmSS[+/-HH'mm'] (e.g. "D:20231015120000+00'00'")
 * Falls back to ISO/natural date strings if the D: prefix is absent.
 * Returns null when the input cannot be parsed.
 */
function parsePdfDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // PDF date format: D:YYYYMMDDHHmmSS[+/-/Z][HH'mm']
  const pdfMatch = s.match(
    /^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?([+\-Z])?(\d{2})?'?(\d{2})?/i
  );
  if (pdfMatch) {
    const [, yr, mo, dy, hh = '00', mm = '00', ss = '00', tzSign, tzH = '00', tzM = '00'] = pdfMatch;
    let iso = `${yr}-${mo}-${dy}T${hh}:${mm}:${ss}`;
    if (tzSign === 'Z' || !tzSign) {
      iso += 'Z';
    } else {
      iso += `${tzSign}${String(tzH).padStart(2,'0')}:${String(tzM).padStart(2,'0')}`;
    }
    const d = new Date(iso);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 19).replace('T', ' ');
    }
    // Timezone parsing failed — fall back to naive local datetime string
    return `${yr}-${mo}-${dy} ${hh}:${mm}:${ss}`;
  }

  // Try as a natural date string (ISO 8601, RFC 2822, etc.)
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 19).replace('T', ' ');
  }

  return null;
}

let mainWindow;

function _send(action) {
  if (mainWindow) mainWindow.webContents.send('menu-action', action);
}

function _buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    // ── macOS app menu ──────────────────────────────────────────────────────
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        {
          label: 'Check for Updates…',
          click() {
            if (!app.isPackaged) {
              _send('toast:No updates in development mode');
              return;
            }
            autoUpdater.checkForUpdates().then(result => {
              if (!result || !result.updateInfo) {
                _send('toast:You are on the latest version');
              }
            }).catch(() => _send('toast:Could not check for updates'));
          },
        },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click() { _send('nav:settings'); } },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),

    // ── File ────────────────────────────────────────────────────────────────
    {
      label: 'File',
      submenu: [
        { label: 'New Health Check', accelerator: 'CmdOrCtrl+Shift+H', click() { _send('nav:new-healthcheck'); } },
        { label: 'New Customer',     accelerator: 'CmdOrCtrl+Shift+C', click() { _send('nav:new-customer'); } },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },

    // ── Go ──────────────────────────────────────────────────────────────────
    {
      label: 'Go',
      submenu: [
        { label: 'Dashboard',     accelerator: 'CmdOrCtrl+1', click() { _send('nav:dashboard'); } },
        { label: 'Customers',     accelerator: 'CmdOrCtrl+2', click() { _send('nav:customers'); } },
        { label: 'Health Checks', accelerator: 'CmdOrCtrl+3', click() { _send('nav:healthchecks'); } },
        { label: 'Reports',       accelerator: 'CmdOrCtrl+4', click() { _send('nav:reports'); } },
        { label: 'Executive',       accelerator: 'CmdOrCtrl+5', click() { _send('nav:executive'); } },
        { label: 'Report Builder',  accelerator: 'CmdOrCtrl+6', click() { _send('nav:report-builder'); } },
        { type: 'separator' },
        { label: 'AI Chat',       accelerator: 'CmdOrCtrl+Shift+A', click() { _send('nav:ai-chat'); } },
        { type: 'separator' },
        { label: 'Search',        accelerator: 'CmdOrCtrl+K', click() { _send('nav:search'); } },
        { label: 'Toggle Sidebar',accelerator: 'Backslash',   click() { _send('nav:toggle-sidebar'); } },
      ],
    },

    // ── Window ──────────────────────────────────────────────────────────────
    {
      label: 'Window',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }]),
      ],
    },

    // ── Developer (dev builds only) ─────────────────────────────────────────
    ...(!app.isPackaged ? [{
      label: 'Developer',
      submenu: [
        {
          label:       'Toggle Developer Tools',
          accelerator: 'CmdOrCtrl+Alt+I',
          click(_, win) { win?.webContents.toggleDevTools(); },
        },
        {
          label:       'Inspect Element',
          accelerator: 'CmdOrCtrl+Shift+I',
          click(_, win) {
            if (win) {
              win.webContents.toggleDevTools();
              win.webContents.once('devtools-opened', () => {
                win.webContents.devToolsWebContents?.focus();
              });
            }
          },
        },
        { type: 'separator' },
        {
          label:       'Force Reload',
          accelerator: 'CmdOrCtrl+Shift+R',
          click(_, win) { win?.webContents.reloadIgnoringCache(); },
        },
      ],
    }] : []),

    // ── Help ────────────────────────────────────────────────────────────────
    {
      label: 'Help',
      submenu: [
        { label: 'Keyboard Shortcuts', accelerator: 'Shift+/', click() { _send('nav:shortcuts'); } },
        { type: 'separator' },
        { label: 'Technical Guide',    click() { _send('nav:guide'); } },
        { label: "What's New",         click() { _send('nav:whats-new'); } },
        { type: 'separator' },
        { label: 'Send Feedback',      click() { _send('nav:feedback'); } },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: process.platform !== 'darwin',
    backgroundColor: '#F5F5F5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    icon: path.join(__dirname, '../assets/icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, '../src/index.html'));

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(_buildMenu());
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  _initAutoUpdater();
});

// ── Auto-updater ──────────────────────────────────────────────────────────────
function _initAutoUpdater() {
  // Don't check for updates in development
  if (!app.isPackaged) return;

  autoUpdater.autoDownload    = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes || '',
      releaseDate:  info.releaseDate  || '',
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-downloaded', {
      version: info.version,
      releaseNotes: info.releaseNotes || '',
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[updater] Error:', err.message);
  });

  // Check on launch, then every 4 hours
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
}

ipcMain.handle('update-install-now', () => {
  autoUpdater.quitAndInstall(false, true);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// File dialog for PDF selection
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
  });
  if (result.canceled) return [];
  return result.filePaths;
});

// Read file as base64 for sending to backend
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const data = fs.readFileSync(filePath);
    const stats = fs.statSync(filePath);
    return {
      data: data.toString('base64'),
      name: path.basename(filePath),
      size: stats.size,
      path: filePath
    };
  } catch (err) {
    return { error: err.message };
  }
});

// Open external links in browser
ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
});

// Reveal the bundled Chrome extension folder in Finder / Explorer.
// shell.openPath() returns '' on success or an error description string on failure.
ipcMain.handle('reveal-extension', async () => {
  const extPath = path.join(__dirname, '..', 'chrome-extension');
  const errorMsg = await shell.openPath(extPath);
  return errorMsg;  // '' = success, non-empty = failure message
});

// Store/retrieve settings locally
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

ipcMain.handle('get-settings', () => {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
  } catch {}
  return {};
});

ipcMain.handle('save-settings', (event, settings) => {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

// ─── Adobe PDF Services API (called from main process to avoid CORS) ──────────

const ADOBE_TOKEN_URL = 'https://pdf-services-ue1.adobe.io/token';
const ADOBE_API_BASE  = 'https://pdf-services-ue1.adobe.io';

let _adobeToken  = null;
let _tokenExpiry = 0;

function nodeRequest(url, method, headers, body) {
  return new Promise((resolve, reject) => {
    const u   = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const bodyBuf = body
      ? (Buffer.isBuffer(body) ? body : Buffer.from(body))
      : null;
    const reqHeaders = Object.assign({}, headers);
    if (bodyBuf) reqHeaders['Content-Length'] = bodyBuf.length;

    const req = mod.request({
      hostname: u.hostname,
      port:     u.port || (u.protocol === 'https:' ? 443 : 80),
      path:     u.pathname + u.search,
      method:   method || 'GET',
      headers:  reqHeaders,
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status:  res.statusCode,
        headers: res.headers,
        body:    Buffer.concat(chunks),
        text:    Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

async function getAdobeToken(clientId, clientSecret) {
  if (_adobeToken && Date.now() < _tokenExpiry) return _adobeToken;
  const body = `client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`;
  const res  = await nodeRequest(ADOBE_TOKEN_URL, 'POST',
    { 'Content-Type': 'application/x-www-form-urlencoded' }, body);
  const data = JSON.parse(res.text || '{}');
  if (res.status >= 400 || !data.access_token) {
    const detail = data.error_description || data.error || res.text;
    throw new Error(`Adobe auth failed (HTTP ${res.status}): ${detail}`);
  }
  _adobeToken  = data.access_token;
  _tokenExpiry = Date.now() + ((data.expires_in || 86400) * 1000) - 60000;
  return _adobeToken;
}

function adobeHeaders(token, clientId, extra) {
  return Object.assign({
    'Authorization': `Bearer ${token}`,
    'X-API-Key':     clientId,
    'Content-Type':  'application/json',
  }, extra || {});
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function pollJob(jobUrl, token, clientId, maxPolls = 30) {
  for (let i = 0; i < maxPolls; i++) {
    await sleep(2000);
    const res  = await nodeRequest(jobUrl, 'GET', adobeHeaders(token, clientId));
    const data = JSON.parse(res.text || '{}');
    const st   = (data.status || '').toLowerCase();
    if (st === 'done' || st === 'succeeded') return data;
    if (st === 'failed' || st === 'error') {
      // Preserve raw JSON in message so callers can inspect specific error codes,
      // but also embed a human-readable version for display.
      const code   = data?.error?.code || '';
      const detail = (data?.error?.message || '').replace(/;\s*requestId=\S+/g, '').trim();
      const err    = new Error('Adobe job failed: ' + JSON.stringify(data));
      // Friendly text used by the accessibility handler's catch block
      err.adobeCode   = code;
      err.adobeDetail = detail;
      throw err;
    }
  }
  throw new Error(`Adobe job timed out after ${maxPolls * 2}s`);
}

// Scan a job result for the output assetID across the various key shapes
// different Adobe operations use (asset.assetID, resource.assetID, etc.)
function findOutputAssetId(result) {
  if (result?.asset?.assetID)    return result.asset.assetID;
  if (result?.resource?.assetID) return result.resource.assetID;
  for (const val of Object.values(result)) {
    if (val && typeof val === 'object' && !Array.isArray(val) && val.assetID) {
      return val.assetID;
    }
  }
  throw new Error('No output assetID in job result: ' + JSON.stringify(result));
}

// IPC: authenticate + upload asset, returns { assetId }
ipcMain.handle('adobe-upload-asset', async (event, { clientId, clientSecret, fileBase64, filename }) => {
  const token = await getAdobeToken(clientId, clientSecret);

  // Request upload URI
  const createRes  = await nodeRequest(ADOBE_API_BASE + '/assets', 'POST',
    adobeHeaders(token, clientId), JSON.stringify({ mediaType: 'application/pdf' }));
  const createData = JSON.parse(createRes.text || '{}');
  if (createRes.status >= 400 || !createData.assetID)
    throw new Error(`Adobe asset create failed (${createRes.status}): ${createRes.text}`);

  // PUT file bytes
  const fileBytes = Buffer.from(fileBase64, 'base64');
  const putRes    = await nodeRequest(createData.uploadUri, 'PUT',
    { 'Content-Type': 'application/pdf' }, fileBytes);
  if (putRes.status >= 400)
    throw new Error(`Adobe asset upload PUT failed (${putRes.status}): ${putRes.text}`);

  return { assetId: createData.assetID };
});

// IPC: run the full carwash pipeline for one PDF — all ops happen here in the
// main process so the server never needs to reach Adobe's network.
// Args: { clientId, clientSecret, fileBase64, filename, operations[] }
// Returns: { filename, originalSize, outputSize, operationsApplied[], outputBase64 }
ipcMain.handle('adobe-carwash-process', async (event, { clientId, clientSecret, fileBase64, filename, operations }) => {
  const crypto = require('crypto');
  const token  = await getAdobeToken(clientId, clientSecret);

  const fileBytes    = Buffer.from(fileBase64, 'base64');
  const originalSize = fileBytes.length;

  // Upload original PDF
  const createRes  = await nodeRequest(ADOBE_API_BASE + '/assets', 'POST',
    adobeHeaders(token, clientId), JSON.stringify({ mediaType: 'application/pdf' }));
  const createData = JSON.parse(createRes.text || '{}');
  if (createRes.status >= 400 || !createData.assetID)
    throw new Error(`Adobe asset create failed (${createRes.status}): ${createRes.text}`);

  const putRes = await nodeRequest(createData.uploadUri, 'PUT',
    { 'Content-Type': 'application/pdf' }, fileBytes);
  if (putRes.status >= 400)
    throw new Error(`Adobe upload PUT failed (${putRes.status})`);

  let currentAssetId  = createData.assetID;
  const appliedOps    = [];
  let protectPassword = null;   // { type: 'ownerPassword'|'userPassword', value: '...' }

  // Run each operation in order, chaining the output asset into the next
  for (const op of operations) {
    let opPath, opBody;

    if (op === 'autotag') {
      opPath = '/operation/autotag';
      opBody = { assetID: currentAssetId, generateReport: false, shiftHeadings: false };
    } else if (op === 'compress') {
      opPath = '/operation/compresspdf';
      opBody = { assetID: currentAssetId, compressionLevel: 'MEDIUM' };
    } else if (op === 'linearize') {
      opPath = '/operation/linearizepdf';
      opBody = { assetID: currentAssetId };
    } else if (op === 'protect') {
      opPath = '/operation/protectpdf';
      const _adjs  = ['red','blue','dark','swift','calm','bold','bright','cool'];
      const _nouns = ['wave','hawk','moon','stone','flame','cloud','river','star'];
      const _pw    = _adjs[Math.floor(Math.random() * _adjs.length)]
                   + '-' + _nouns[Math.floor(Math.random() * _nouns.length)]
                   + '-' + (Math.floor(Math.random() * 90) + 10);
      const _useOwner = Math.random() < 0.5;
      protectPassword = { type: _useOwner ? 'ownerPassword' : 'userPassword', value: _pw };
      opBody = {
        assetID:             currentAssetId,
        passwordProtection:  { [_useOwner ? 'ownerPassword' : 'userPassword']: _pw },
        encryptionAlgorithm: 'AES_256',
        contentToEncrypt:    'ALL_CONTENT',
        ...(_useOwner ? { permissions: ['PRINT_HIGH_QUALITY', 'COPY_CONTENT'] } : {}),
      };
    } else {
      throw new Error('Unknown carwash operation: ' + op);
    }

    console.log(`[carwash] ${op} → POST ${ADOBE_API_BASE + opPath}`);
    console.log(`[carwash] ${op} body:`, JSON.stringify(opBody, null, 2));
    const opRes = await nodeRequest(ADOBE_API_BASE + opPath, 'POST',
      adobeHeaders(token, clientId), JSON.stringify(opBody));
    console.log(`[carwash] ${op} response (${opRes.status}):`, opRes.text);
    if (opRes.status >= 400)
      throw new Error(`Adobe ${op} failed (${opRes.status}): ${opRes.text}`);

    const jobUrl = opRes.headers['location'];
    if (!jobUrl) throw new Error(`Adobe ${op}: no Location header`);

    // autotag is AI-based and can take up to 2 min — give it 60 polls (120s)
    const result       = await pollJob(jobUrl, token, clientId, op === 'autotag' ? 60 : 30);
    currentAssetId     = findOutputAssetId(result);
    appliedOps.push(op);
  }

  // Fetch download URI for the final asset and download it
  const assetRes  = await nodeRequest(
    ADOBE_API_BASE + '/assets/' + encodeURIComponent(currentAssetId),
    'GET', adobeHeaders(token, clientId));
  const assetData = JSON.parse(assetRes.text || '{}');
  if (!assetData.downloadUri)
    throw new Error('Adobe carwash: no downloadUri for final asset');

  const dlRes      = await nodeRequest(assetData.downloadUri, 'GET', {});
  const outputBase64 = dlRes.body.toString('base64');

  return {
    filename,
    originalSize,
    outputSize:        dlRes.body.length,
    operationsApplied: appliedOps,
    outputBase64,
    protectPassword,   // null unless protect was applied
  };
});

// ── Permission helpers ─────────────────────────────────────────────────────────
// Extract a boolean permission field, trying multiple possible key names.
// Returns null if the permissions object is missing (unencrypted PDF → no restrictions apply).
function _permBool(doc, ...keys) {
  const perms = doc.permissions || doc.encryption?.permissions;
  if (!perms || typeof perms !== 'object') return null;
  for (const k of keys) {
    if (perms[k] !== undefined) return perms[k] === true || perms[k] === 1 || perms[k] === 'true';
  }
  return null;
}
// Extract a string permission field (e.g. printing: 'none'|'low'|'high').
// Normalises legacy boolean AllowPrint → 'high' / 'none'.
function _permStr(doc, ...keys) {
  const perms = doc.permissions || doc.encryption?.permissions;
  if (!perms || typeof perms !== 'object') return null;
  for (const k of keys) {
    if (perms[k] !== undefined) {
      const v = perms[k];
      if (typeof v === 'string') return v.toLowerCase();
      if (v === true  || v === 1) return 'high';
      if (v === false || v === 0) return 'none';
    }
  }
  return null;
}

// IPC: run PDF Properties, returns parsed properties object
ipcMain.handle('adobe-get-properties', async (event, { clientId, clientSecret, assetId }) => {
  const token = await getAdobeToken(clientId, clientSecret);
  const res   = await nodeRequest(ADOBE_API_BASE + '/operation/pdfproperties', 'POST',
    adobeHeaders(token, clientId), JSON.stringify({ assetID: assetId }));

  if (res.status >= 400)
    throw new Error(`Adobe pdfproperties failed (${res.status}): ${res.text}`);

  const jobUrl = res.headers['location'];
  if (!jobUrl) throw new Error('Adobe pdfproperties: no Location header in response');

  // Poll until done — properties are returned inline in the job result
  const jobResult = await pollJob(jobUrl, token, clientId);

  // Adobe returns properties at jobResult.metadata.document with snake_case fields
  const doc      = jobResult.metadata?.document || jobResult.properties?.document || {};
  // info_dict may be nested or at the top-level of the job result
  const infoDict = doc.info_dict || doc.info || jobResult.info_dict || jobResult.info || {};

  return {
    pdf_version:   doc.pdf_version   || doc.pdf_spec_version || null,
    page_count:    parseInt(doc.page_count || doc.num_pages || 0) || 0,
    is_tagged:     !!(doc.is_tagged      || false),
    is_linearized: !!(doc.is_linearized  || false),
    is_encrypted:  !!(doc.is_encrypted   || false),
    has_acroform:  !!(doc.is_acroform_present || doc.has_acroform || false),
    has_xfa:       !!(doc.is_xfa_present || doc.has_xfa || false),
    content_type:  doc.content_type  || null,
    // Extended properties
    has_embedded_files: !!(doc.has_embedded_files || doc.contains_embedded_content || false),
    is_certified:  !!(doc.is_certified || false),
    is_signed:     !!(doc.is_signed || doc.has_digital_signatures || doc.contains_signatures || false),
    pdfa_compliance:  doc.standards?.pdf_a?.conformance  || doc.pdf_a_conformance  || doc.pdfa_conformance  || null,
    pdfe_compliance:  doc.standards?.pdf_e?.conformance  || doc.pdf_e_conformance  || null,
    pdfua_compliance: doc.standards?.pdf_ua?.conformance || doc.pdf_ua_conformance || doc.pdfua_conformance || null,
    pdfvt_compliance: doc.standards?.pdf_vt?.conformance || doc.pdf_vt_conformance || null,
    pdfx_compliance:  doc.standards?.pdf_x?.conformance  || doc.pdf_x_conformance  || doc.pdfx_conformance  || null,
    // Info dictionary
    info_title:         infoDict.Title    || infoDict.title    || doc.Title    || null,
    info_subject:       infoDict.Subject  || infoDict.subject  || doc.Subject  || null,
    info_keywords:      infoDict.Keywords || infoDict.keywords || doc.Keywords || null,
    info_creation_date: parsePdfDate(infoDict.CreationDate || infoDict.creation_date || infoDict.creationDate),
    // Permissions — store raw object AND individual extracted fields
    permissions: doc.permissions || doc.encryption?.permissions || null,
    permissions_assistive_tech:  _permBool(doc, 'assistive_technology', 'assistiveTechnology', 'AllowScreenReaders'),
    permissions_form_filling:    _permBool(doc, 'form_filling', 'formFilling', 'AllowFillIn', 'FillForms'),
    permissions_copying:         _permBool(doc, 'copying', 'AllowCopy', 'copy_content', 'allowCopy'),
    permissions_page_extraction: _permBool(doc, 'page_extraction', 'pageExtraction', 'AllowExtractContent'),
    permissions_doc_assembly:    _permBool(doc, 'document_assembly', 'documentAssembly', 'AllowAssembly'),
    permissions_commenting:      _permBool(doc, 'commenting', 'AllowAnnotations', 'allowAnnotations'),
    permissions_printing:        _permStr(doc, 'printing', 'AllowPrint', 'print'),
    permissions_editing:         _permBool(doc, 'editing', 'AllowModify', 'allowModify'),
    // info_dict metadata (existing)
    author:   infoDict.Author   || infoDict.author   || doc.Author  || null,
    creator:  infoDict.Creator  || infoDict.creator  || doc.Creator || null,
    producer: infoDict.Producer || infoDict.producer || doc.Producer|| null,
  };
});

// IPC: run Accessibility Checker, returns { passed_checks, failed_checks, warning_checks, checks }
//
// Adobe PDF Services returns a JSON accessibility report.  The actual format
// observed from the API is:
//
//  A1) Current Adobe PDF Services format (confirmed):
//      { Summary: { Passed, Failed, "Needs manual check", ... },
//        "Detailed Report": {           ← object key has a literal space
//          "Document":     [ { Rule, Status, Description }, ... ],
//          "Page Content": [ { Rule, Status, Description }, ... ],
//          ...
//        }
//      }
//
//  A2) Legacy / alternative DetailedReport array format:
//      { DetailedReport: [ { Category, Elements: [ { CheckName, Status } ] } ] }
//
//  B) Flat checks array (older / alternative format):
//      { checks: [ { checkName/name, status/result } ] }
//
// The code below tries A1 → A2 → B, with a Summary fallback for counts.
ipcMain.handle('adobe-get-accessibility', async (event, { clientId, clientSecret, assetId }) => {
  const token = await getAdobeToken(clientId, clientSecret);
  const res   = await nodeRequest(ADOBE_API_BASE + '/operation/accessibilitychecker', 'POST',
    adobeHeaders(token, clientId), JSON.stringify({ assetID: assetId }));

  if (res.status >= 400)
    throw new Error(`Adobe accessibility failed (${res.status}): ${res.text}`);

  const jobUrl = res.headers['location'];
  if (!jobUrl) throw new Error('Adobe accessibilitychecker: no Location header in response');

  let result;
  try {
    result = await pollJob(jobUrl, token, clientId);
  } catch (pollErr) {
    const code = pollErr.adobeCode || '';
    const msg  = pollErr.message   || '';

    // XFA forms are rejected by the accessibility checker — skip gracefully.
    if (code === 'PDF_XFA_FORM' || msg.includes('PDF_XFA_FORM')) {
      console.log('[adobe-get-accessibility] XFA form — skipping accessibility check');
      return { passed_checks: 0, failed_checks: 0, warning_checks: 0, checks: [], xfa_skipped: true };
    }

    // Restricted / encrypted / permission-locked documents cannot be processed.
    // Return a graceful skip so the document is still scored on properties alone.
    const restrictionCodes = [
      'DOCUMENT_RESTRICTED', 'PERM_ACCESSDENIED', 'ENCRYPTED_PDF',
      'SOURCE_FILE_RESTRICTED', 'UNSUPPORTED_RESTRICTIONS',
    ];
    if (restrictionCodes.includes(code) || restrictionCodes.some(c => msg.includes(c))) {
      console.log('[adobe-get-accessibility] Document restricted/encrypted — skipping accessibility check');
      return { passed_checks: 0, failed_checks: 0, warning_checks: 0, checks: [], restricted_skipped: true };
    }

    // All other errors: use the structured Adobe detail if available, otherwise
    // keep the original message (but strip the raw JSON blob from the display).
    const detail = pollErr.adobeDetail || '';
    if (detail) throw new Error(detail + (code ? ` (${code})` : ''));
    throw pollErr;
  }

  let passed = 0, failed = 0, warnings = 0;
  let rawChecks   = [];

  // Resolve the report download URL.
  //
  // Current Adobe PDF Services API (v3+):
  //   result.report.downloadUri  — direct pre-signed S3 URL, no extra lookup needed
  //
  // Older API variants (kept as fallbacks):
  //   result.resource.assetID / result.output.assetID  — requires GET /assets/:id first
  //
  // Log the full job result so we can see exactly which fields Adobe returns
  console.log('[adobe-accessibility] job result:', JSON.stringify(result));

  // Adobe PDF Services v3: result.report.downloadUri
  // Adobe PDF Services v2: result.resource.assetID or result.output.assetID
  // Some versions: result.outputs[0].downloadUri or result.content.downloadUri
  let reportDownloadUri = result.report?.downloadUri
    || result.content?.downloadUri
    || (result.outputs && result.outputs[0]?.downloadUri)
    || null;

  if (!reportDownloadUri) {
    // Fallback: fetch asset metadata to get its downloadUri
    const reportAssetId = (result.resource && result.resource.assetID)
      || (result.output  && result.output.assetID)
      || (result.report  && result.report.assetID)
      || null;
    if (reportAssetId) {
      console.log('[adobe-accessibility] fetching asset for download URI, assetID:', reportAssetId);
      const assetRes  = await nodeRequest(
        ADOBE_API_BASE + '/assets/' + encodeURIComponent(reportAssetId),
        'GET', adobeHeaders(token, clientId));
      const assetData = JSON.parse(assetRes.text || '{}');
      reportDownloadUri = assetData.downloadUri || null;
    }
  }

  console.log('[adobe-accessibility] reportDownloadUri:', reportDownloadUri);

  if (reportDownloadUri) {
    const dlRes  = await nodeRequest(reportDownloadUri, 'GET', {});
    const report = JSON.parse(dlRes.text || '{}');

    // Log the top-level keys of the report so we can diagnose unexpected formats
    console.log('[adobe-accessibility] report top-level keys:', Object.keys(report));

    // ── Format A: "Detailed Report" object (actual Adobe PDF Services format) ──
    // Adobe returns an object keyed by category name; values are arrays of
    // { Rule, Status, Description }.  The key literally contains a space.
    const detailedReportObj = report['Detailed Report'] || report['detailed report'] || null;
    const detailedReportArr = report.DetailedReport     || report.detailedReport     || null;

    if (detailedReportObj && typeof detailedReportObj === 'object' && !Array.isArray(detailedReportObj)) {
      // ── Format A1: object { categoryName: [{Rule, Status, Description}] } ──
      Object.entries(detailedReportObj).forEach(([categoryName, rules]) => {
        if (!Array.isArray(rules)) return;
        rules.forEach(rule => {
          const s = (rule.Status || rule.status || '').toLowerCase();
          if      (s.includes('pass')) passed++;
          else if (s.includes('fail')) failed++;
          else                         warnings++;
          rawChecks.push({
            checkName:   rule.Rule        || rule.rule        || rule.CheckName || rule.name || 'Check',
            status:      rule.Status      || rule.status      || '',
            description: rule.Description || rule.description || '',
            category:    categoryName,
          });
        });
      });

    } else if (Array.isArray(detailedReportArr) && detailedReportArr.length > 0) {
      // ── Format A2: legacy array [{Category, Elements:[{CheckName, Status}]}] ──
      detailedReportArr.forEach(cat => {
        const elements = cat.Elements || cat.elements || cat.Rules || cat.rules || [];
        elements.forEach(el => {
          const s = (el.Status || el.status || el.Result || el.result || '').toLowerCase();
          if      (s.includes('pass')) passed++;
          else if (s.includes('fail')) failed++;
          else                         warnings++;
          rawChecks.push({
            checkName:   el.CheckName   || el.checkName   || el.Name || el.name || el.rule || 'Check',
            status:      el.Status      || el.status      || el.Result || el.result || '',
            description: el.Description || el.description || el.Desc  || el.desc  || '',
            category:    cat.Category   || cat.category   || cat.Name  || cat.name  || '',
          });
        });
      });

    } else {
      // ── Format B: flat checks / rules array (older / alternative format) ──
      const checks = report.checks || report.checkResults || report.results
                  || report.Rules  || report.rules        || [];
      rawChecks = checks.map(c => ({
        checkName:   c.CheckName || c.checkName || c.name || c.rule || 'Check',
        status:      c.Status    || c.status    || c.Result || c.result || '',
        description: c.Description || c.description || c.Desc || c.desc || '',
        category:    c.Category  || c.category  || '',
      }));
      checks.forEach(c => {
        const s = (c.Status || c.status || c.Result || c.result || '').toLowerCase();
        if      (s.includes('pass')) passed++;
        else if (s.includes('fail')) failed++;
        else                         warnings++;
      });
    }

    // ── Format C: document.category[].rule[] (some API versions) ─────────────
    if (rawChecks.length === 0) {
      const docCategories = (report.document && (report.document.category || report.document.Category)) || [];
      docCategories.forEach(cat => {
        const rules = cat.rule || cat.Rule || cat.rules || cat.Rules || [];
        rules.forEach(r => {
          const s = (r.status || r.Status || r.result || r.Result || '').toLowerCase();
          if      (s.includes('pass')) passed++;
          else if (s.includes('fail')) failed++;
          else                         warnings++;
          rawChecks.push({
            checkName:   r.name || r.Name || r.checkName || r.CheckName || 'Check',
            status:      r.status || r.Status || r.result || r.Result || '',
            description: r.desc || r.Desc || r.description || r.Description || '',
            category:    cat.name || cat.Name || cat.category || cat.Category || '',
          });
        });
      });
    }

    // ── Summary fallback ──────────────────────────────────────────────────────
    // Use the Summary block when the check list came back empty.
    const sum = report.Summary || report.summary || {};
    if (passed === 0 && failed === 0 && warnings === 0) {
      passed   = parseInt(sum.Passed   || sum.passed   || 0);
      failed   = parseInt(sum.Failed   || sum.failed   || 0);
      warnings = parseInt(sum.Warnings || sum.warnings || sum.NeedsManual || sum.needsManual || 0);
      // If we have aggregate counts but still no named checks, log the full report
      // so the format can be identified and handled explicitly.
      if (rawChecks.length === 0 && (passed + failed + warnings) > 0) {
        console.warn('[adobe-accessibility] counts from Summary but no per-check data found. Full report:', JSON.stringify(report));
      }
    }
  }

  return { passed_checks: passed, failed_checks: failed, warning_checks: warnings, checks: rawChecks };
});

// ── IPC: Export customer report → Adobe Auto Tag → accessible PDF ─────────
//
// Flow:
//  1. Renderer sets print-mode CSS, then calls this IPC.
//  2. We sleep briefly so the layout repaints, then printToPDF().
//  3. Upload the raw PDF to Adobe PDF Services as an asset.
//  4. Run the Auto Tag operation to produce an accessible, tagged PDF.
//  5. Download the tagged PDF and show a save dialog.
//  6. Return { success, filePath } to the renderer.
//
ipcMain.handle('export-report-pdf', async (event, { customerName }) => {
  const settings = JSON.parse(
    fs.existsSync(path.join(app.getPath('userData'), 'settings.json'))
      ? fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8')
      : '{}'
  );
  const clientId     = settings.adobeClientId     || settings.clientId     || '';
  const clientSecret = settings.adobeClientSecret || settings.clientSecret || '';
  if (!clientId || !clientSecret) {
    throw new Error('Adobe credentials are not configured. Please check Settings.');
  }

  // 1. Apply print-mode CSS in the renderer, hide the export overlay so it
  //    doesn't appear in the PDF, then capture the page.  We do this here
  //    (not in the renderer) so the overlay stays visible to the user for the
  //    entire duration of the IPC call except during the actual printToPDF.
  await event.sender.executeJavaScript(`
    document.body.classList.add('report-printing');
    var _ov = document.getElementById('exportOverlay');
    if (_ov) _ov.style.setProperty('display','none','important');
  `);
  await sleep(600); // let overflow:visible / height:auto reflow complete
  await event.sender.executeJavaScript('window.scrollTo(0,0)');
  await sleep(200);

  let pdfBuffer;
  try {
    pdfBuffer = await event.sender.printToPDF({
      printBackground:     true,
      pageSize:            'A4',
      marginsType:         2,
      landscape:           false,
      displayHeaderFooter: false,
    });
  } finally {
    // Restore renderer UI whether print succeeded or not
    await event.sender.executeJavaScript(`
      document.body.classList.remove('report-printing');
      var _ov = document.getElementById('exportOverlay');
      if (_ov) _ov.style.removeProperty('display');
    `);
  }

  // 2. Authenticate with Adobe PDF Services
  const token = await getAdobeToken(clientId, clientSecret);

  // 3. Upload raw PDF as an Adobe asset
  const createRes  = await nodeRequest(
    ADOBE_API_BASE + '/assets', 'POST',
    adobeHeaders(token, clientId),
    JSON.stringify({ mediaType: 'application/pdf' })
  );
  const createData = JSON.parse(createRes.text || '{}');
  if (createRes.status >= 400 || !createData.assetID) {
    throw new Error(`Adobe asset create failed (${createRes.status}): ${createRes.text}`);
  }

  const putRes = await nodeRequest(
    createData.uploadUri, 'PUT',
    { 'Content-Type': 'application/pdf' },
    pdfBuffer
  );
  if (putRes.status >= 400) {
    throw new Error(`Adobe asset upload failed (${putRes.status})`);
  }
  const rawAssetId = createData.assetID;

  // 4. Run Auto Tag to make the PDF accessible
  const tagRes = await nodeRequest(
    ADOBE_API_BASE + '/operation/autotag', 'POST',
    adobeHeaders(token, clientId),
    JSON.stringify({
      assetID:         rawAssetId,
      generateReport:  false,
      shiftHeadings:   false,
    })
  );
  if (tagRes.status >= 400) {
    throw new Error(`Adobe Auto Tag failed (${tagRes.status}): ${tagRes.text}`);
  }

  const tagJobUrl = tagRes.headers['location'];
  if (!tagJobUrl) throw new Error('Adobe Auto Tag: no Location header returned');

  const tagResult = await pollJob(tagJobUrl, token, clientId);

  // Resolve the download URI for the tagged PDF.
  // The Auto Tag API wraps the result under various keys depending on the API
  // version — scan every top-level object value for downloadUri / assetID
  // rather than hard-coding a key name.
  function findInResult(key) {
    // Direct match on top-level
    if (tagResult[key]) return tagResult[key];
    // Search one level deep across all top-level object values
    for (const val of Object.values(tagResult)) {
      if (val && typeof val === 'object' && !Array.isArray(val) && val[key]) {
        return val[key];
      }
    }
    return null;
  }

  let taggedUri = findInResult('downloadUri');

  if (!taggedUri) {
    // Fall back: look for an assetID and fetch the download URL from /assets/:id
    const taggedAssetId = findInResult('assetID');

    if (taggedAssetId) {
      const assetRes  = await nodeRequest(
        ADOBE_API_BASE + '/assets/' + encodeURIComponent(taggedAssetId),
        'GET', adobeHeaders(token, clientId)
      );
      const assetData = JSON.parse(assetRes.text || '{}');
      taggedUri = assetData.downloadUri || null;
    }
  }

  if (!taggedUri) throw new Error('Adobe Auto Tag: no downloadUri in result. Raw: ' + JSON.stringify(tagResult));

  const taggedRes = await nodeRequest(taggedUri, 'GET', {});
  const taggedPdf = taggedRes.body; // Buffer

  // 5. Show save dialog
  const safeName = (customerName || 'Customer')
    .replace(/[^a-z0-9 _-]/gi, '')
    .trim()
    .replace(/\s+/g, '_');

  const { filePath, canceled } = await dialog.showSaveDialog({
    title:       'Save Accessible PDF Report',
    defaultPath: `${safeName}_PDF_Health_Check_Report.pdf`,
    filters:     [{ name: 'PDF Document', extensions: ['pdf'] }],
  });

  if (canceled || !filePath) return { success: false, cancelled: true };

  await fs.promises.writeFile(filePath, taggedPdf);
  return { success: true, filePath };
});

// ── IPC: PDF crawler (runs client-side — server has no outbound internet) ─────

const CRAWL_HARD_TIMEOUT_MS = 95_000; // slightly over crawler's own 90 s internal limit

ipcMain.handle('crawl-discover', async (event, crawlConfig) => {
  const crawler = new Crawler(
    crawlConfig.max_pdfs  || 20,
    crawlConfig.max_depth || 3,
    crawlConfig.timeout   || 8,
  );

  const discoverPromise = crawlConfig.search_query
    ? crawler.discoverViaSearch(crawlConfig.search_query)
    : crawler.discover(crawlConfig.domains || []);

  const timeoutPromise = new Promise((resolve) =>
    setTimeout(() => resolve({ pdfs: [], pages_crawled: 0, duration_ms: CRAWL_HARD_TIMEOUT_MS }),
               CRAWL_HARD_TIMEOUT_MS)
  );

  const result = await Promise.race([discoverPromise, timeoutPromise]);
  return result;
});

ipcMain.handle('crawl-fetch-pdf', async (event, url) => {
  const crawler = new Crawler();
  return crawler.fetchPdf(url);
});

// ── IPC: Excel export ─────────────────────────────────────────────────────────
// Accepts { filename, sheets: [{ name, headers: string[], rows: any[][] }] }
// Generates SpreadsheetML XML (opens natively in Excel) and saves to disk.

function _buildSpreadsheetML(sheets) {
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function cellType(v) {
    return typeof v === 'number' ? 'Number' : 'String';
  }
  function cell(v, styleId) {
    const t = cellType(v);
    const s = styleId ? ` ss:StyleID="${styleId}"` : '';
    return `<Cell${s}><Data ss:Type="${t}">${esc(v)}</Data></Cell>`;
  }

  const worksheets = sheets.map(sheet => {
    const headerRow = '<Row>' + sheet.headers.map(h => cell(h, 'hdr')).join('') + '</Row>';
    const dataRows  = sheet.rows.map(row =>
      '<Row>' + row.map(v => cell(v)).join('') + '</Row>'
    ).join('\n        ');
    return `  <Worksheet ss:Name="${esc(sheet.name)}">
    <Table>
      ${headerRow}
      ${dataRows}
    </Table>
  </Worksheet>`;
  }).join('\n');

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="hdr">
      <Font ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#E34850" ss:Pattern="Solid"/>
    </Style>
  </Styles>
${worksheets}
</Workbook>`;
}

ipcMain.handle('export-excel', async (event, { filename, sheets }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: filename || 'export.xls',
    filters: [
      { name: 'Excel Spreadsheet (97-2004)', extensions: ['xls'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePath) return { canceled: true };

  const xml = _buildSpreadsheetML(sheets);
  await fs.promises.writeFile(result.filePath, xml, 'utf8');
  return { success: true, filePath: result.filePath };
});
