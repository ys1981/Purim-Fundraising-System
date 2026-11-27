const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');

let win;
const dataDir = () => path.join(app.getPath('userData'), 'data');
const dbFile = () => path.join(dataDir(), 'database.json');
const emptyDb = () => ({ schemaVersion: 1, nextDonorId: 1, donors: [], students: [], classes: ["שיעור א", "שיעור ב", "שיעור ג", "קיבוץ", "בוגרים"], audit: [] });

async function readDb() {
  await fs.mkdir(dataDir(), { recursive: true });
  try { return JSON.parse(await fs.readFile(dbFile(), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; const db = emptyDb(); await writeDb(db); return db; }
}
async function writeDb(db) {
  await fs.mkdir(dataDir(), { recursive: true });
  const tmp = dbFile() + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  await fs.rename(tmp, dbFile());
}
async function audit(db, action, details) {
  db.audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), action, details });
  db.audit = db.audit.slice(0, 5000);
}
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1050, minHeight: 700,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}
app.whenReady().then(async () => { await readDb(); createWindow(); app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.handle('db:read', async () => readDb());
ipcMain.handle('donor:save', async (_e, input) => {
  const db = await readDb();
  const donor = {
    id: input.id || db.nextDonorId++, title: String(input.title || 'הרב').trim(),
    firstName: String(input.firstName || '').trim(), lastName: String(input.lastName || '').trim(),
    city: String(input.city || '').trim(), street: String(input.street || '').trim(),
    building: String(input.building || '').trim(), phone: String(input.phone || '').trim(),
    area: String(input.area || '').trim(), group: String(input.group || '').trim(),
    notes: String(input.notes || '').trim(), status: input.status || 'active',
    donations: Array.isArray(input.donations) ? input.donations : [], updatedAt: new Date().toISOString()
  };
  if (!donor.firstName || !donor.lastName || !donor.city || !donor.street) throw new Error('יש למלא שם פרטי, שם משפחה, עיר ורחוב.');
  if (donor.id && !db.donors.some(x => x.id === donor.id)) throw new Error('התורם לא נמצא.');
  const idx = db.donors.findIndex(x => x.id === donor.id);
  if (idx >= 0) db.donors[idx] = donor; else db.donors.push(donor);
  await audit(db, idx >= 0 ? 'עדכון תורם' : 'הוספת תורם', donor.firstName + ' ' + donor.lastName);
  await writeDb(db); return donor;
});
ipcMain.handle('donor:delete', async (_e, id) => {
  const db = await readDb(); const donor = db.donors.find(x => x.id === id);
  if (!donor) throw new Error('התורם לא נמצא.');
  const { response } = await dialog.showMessageBox(win, { type: 'warning', buttons: ['ביטול', 'מחיקה'], defaultId: 0, cancelId: 0, title: 'אישור מחיקה', message: 'למחוק את התורם?', detail: donor.firstName + ' ' + donor.lastName });
  if (response !== 1) return false;
  db.donors = db.donors.filter(x => x.id !== id); await audit(db, 'מחיקת תורם', String(id)); await writeDb(db); return true;
});
ipcMain.handle('backup:create', async () => {
  const db = await readDb(); const dir = path.join(app.getPath('userData'), 'backups');
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, 'backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
  await fs.copyFile(dbFile(), target); return target;
});
ipcMain.handle('data:export', async () => {
  const db = await readDb();
  const { filePath } = await dialog.showSaveDialog(win, { title: 'ייצוא נתוני תורמים', defaultPath: 'purim-donors.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (!filePath) return false;
  await fs.writeFile(filePath, JSON.stringify(db, null, 2), 'utf8'); return true;
});
ipcMain.handle('data:import', async () => {
  const { filePaths } = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (!filePaths?.length) return false;
  const parsed = JSON.parse(await fs.readFile(filePaths[0], 'utf8'));
  if (!parsed || !Array.isArray(parsed.donors) || !Array.isArray(parsed.students)) throw new Error('קובץ הנתונים אינו תקין.');
  const db = await readDb(); await fs.copyFile(dbFile(), dbFile() + '.before-import');
  parsed.schemaVersion = 1; await audit(parsed, 'ייבוא נתונים', path.basename(filePaths[0])); await writeDb(parsed); return true;
});
