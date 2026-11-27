const {app,BrowserWindow,ipcMain,dialog,safeStorage}=require('electron');const path=require('node:path');const fs=require('node:fs/promises');const {openDatabase}=require('./db.cjs');const {createStore}=require('./store.cjs');
let win,store,currentUser=null,lockTimer;const IDLE_MS=5*60*1000;
function resetLock(){clearTimeout(lockTimer);if(currentUser)lockTimer=setTimeout(()=>{currentUser=null;win?.webContents.send('auth:locked')},IDLE_MS)}
function createWindow(){win=new BrowserWindow({width:1500,height:950,minWidth:1100,minHeight:720,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});win.loadFile(path.join(__dirname,'index.html'));win.webContents.on('before-input-event',()=>resetLock())}
async function makeAutomaticBackup(){const dir=path.join(app.getPath('userData'),'backups');await fs.mkdir(dir,{recursive:true});const file=path.join(dir,'automatic-latest.json');const temp=file+'.tmp';await fs.writeFile(temp,JSON.stringify(store.exportData()),{mode:0o600});await fs.rename(temp,file);return file}
app.whenReady().then(async()=>{const db=openDatabase(app.getPath('userData'));store=createStore(db);await makeAutomaticBackup();createWindow();app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow()})});app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
function actor(){return currentUser?.name||'מנהל מקומי'}function requireLogin(){if(!currentUser)throw Error('יש להתחבר מחדש')}

const PERMISSION_BY_CHANNEL={
 'app:bootstrap':'dashboard:read','donor:list':'donors:read','donor:save':'donors:write','donor:donation':'donations:create','donor:history':'donors:read',
 'student:list':'students:read','student:save':'students:write','year:create':'settings:write','route:list':'routes:read','route:save':'routes:write',
 'backup:create':'backup:create','data:export':'backup:export','data:import':'backup:restore','phone:list':'phone:read','phone:add':'phone:manage','phone:update':'phone:manage','phone:restore':'donors:write',
 'users:add':'users:manage','groups:list':'groups:read','groups:create':'groups:manage','groups:add-member':'groups:manage','groups:add-donor':'groups:manage',
 'audit:list':'audit:read','diagnostics:run':'diagnostics:read','print:donors':'print:donors'
};
const registerHandle=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(channel,handler)=>registerHandle(channel,(event,...args)=>{const permission=PERMISSION_BY_CHANNEL[channel];if(permission){requireLogin();if(!currentUser.permissions?.includes('*')&&!currentUser.permissions?.includes(permission))throw Error('אין לך הרשאה לבצע פעולה זו');}return handler(event,...args)});

ipcMain.handle('auth:setup-status',()=>store.db.prepare('SELECT COUNT(*) n FROM users').get().n===0);
ipcMain.handle('auth:create-admin',async(_e,x)=>{const id=store.createFirstAdmin(x);await makeAutomaticBackup();return id});
ipcMain.handle('users:add',async(_e,x)=>{requireLogin();const r=store.addUser(x,actor());await makeAutomaticBackup();return r});
ipcMain.handle('auth:list',()=>store.db.prepare('SELECT id,display_name,role FROM users WHERE active=1 ORDER BY display_name').all());
ipcMain.handle('auth:login',(_e,x)=>{currentUser=store.login(x.id,x.code);resetLock();return currentUser});
ipcMain.handle('auth:logout',()=>{currentUser=null;clearTimeout(lockTimer);return true});
ipcMain.handle('app:bootstrap',()=>{requireLogin();return {user:currentUser,summary:store.summary(new Date().getFullYear()),donors:store.listDonors(),students:store.listStudents(),classes:store.db.prepare('SELECT * FROM classes ORDER BY sort_order').all(),years:store.db.prepare('SELECT * FROM years ORDER BY year DESC').all(),audit:store.listAudit().slice(0,30)}});
ipcMain.handle('donor:list',(_e,q)=>{requireLogin();return store.listDonors(q||'')});
ipcMain.handle('donor:save',async(_e,x)=>{requireLogin();const r=store.saveDonor(x,actor());await makeAutomaticBackup();return r});
ipcMain.handle('donor:donation',async(_e,x)=>{requireLogin();const r=store.addDonation(x,actor());await makeAutomaticBackup();return r});
ipcMain.handle('donor:history',(_e,id)=>{requireLogin();store.db.prepare('INSERT INTO access_log(actor,action,entity_id,created_at) VALUES(?,?,?,?)').run(actor(),'צפייה בהיסטוריית תרומות',String(id),new Date().toISOString());return store.db.prepare('SELECT * FROM donations WHERE donor_id=? ORDER BY year DESC,created_at DESC').all(id)});
ipcMain.handle('student:list',()=>{requireLogin();return store.listStudents()});
ipcMain.handle('student:save',async(_e,x)=>{requireLogin();const r=store.saveStudent(x,actor());await makeAutomaticBackup();return r});
ipcMain.handle('year:create',async(_e,y)=>{requireLogin();const r=store.createYear(y);await makeAutomaticBackup();return r});
ipcMain.handle('route:list',(_e,y)=>{requireLogin();return store.db.prepare('SELECT r.*,e.name event_name FROM routes r LEFT JOIN collection_events e ON e.id=r.event_id WHERE r.year_id=? ORDER BY r.route_code').all(y)});
ipcMain.handle('route:save',async(_e,x)=>{requireLogin();const t=store.db.transaction(()=>{if(x.id){store.db.prepare('UPDATE routes SET name=?,area=?,is_reserve=?,locked=? WHERE id=?').run(x.name,x.area||'',x.isReserve?1:0,x.locked?1:0,x.id);return x.id}return store.db.prepare('INSERT INTO routes(year_id,event_id,route_code,name,area,is_reserve,locked) VALUES(?,?,?,?,?,?,?)').run(x.yearId,x.eventId||null,x.routeCode,x.name,x.area||'',x.isReserve?1:0,x.locked?1:0).lastInsertRowid});const r=t();await makeAutomaticBackup();return r});
ipcMain.handle('backup:create',async()=>{requireLogin();const data=store.exportData();const dir=path.join(app.getPath('userData'),'backups');await fs.mkdir(dir,{recursive:true});const p=path.join(dir,'purim-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');await fs.writeFile(p,JSON.stringify(data),{mode:0o600});return {path:p,ok:true}});
ipcMain.handle('data:export',async()=>{requireLogin();const {filePath}=await dialog.showSaveDialog(win,{defaultPath:'purim-backup.json',filters:[{name:'גיבוי מערכת',extensions:['json']}]});if(!filePath)return false;await fs.writeFile(filePath,JSON.stringify(store.exportData(),null,2));return true});
ipcMain.handle('data:import',async()=>{requireLogin();const {filePaths}=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'גיבוי מערכת',extensions:['json']}]});if(!filePaths.length)return false;const data=JSON.parse(await fs.readFile(filePaths[0],'utf8'));const backup=store.exportData();const dir=path.join(app.getPath('userData'),'backups');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'before-restore-'+Date.now()+'.json'),JSON.stringify(backup));store.importData(data,actor());return true});

ipcMain.handle('phone:list',(_e,y)=>{requireLogin();return store.listPhoneQueue(y)});
ipcMain.handle('phone:add',async(_e,x)=>{requireLogin();const r=store.enqueuePhone(x.donorId,x.year,actor());await makeAutomaticBackup();return r});
ipcMain.handle('phone:update',async(_e,x)=>{requireLogin();const r=store.updatePhoneQueue(x.id,x,actor());await makeAutomaticBackup();return r});
ipcMain.handle('phone:restore',async(_e,id)=>{requireLogin();const r=store.restorePhoneDonor(id,actor());await makeAutomaticBackup();return r});
ipcMain.handle('groups:list',(_e,y)=>{requireLogin();return store.listGroups(y)});
ipcMain.handle('groups:create',async(_e,x)=>{requireLogin();const r=store.createGroup(x,actor());await makeAutomaticBackup();return r});
ipcMain.handle('groups:add-member',async(_e,x)=>{requireLogin();const r=store.addGroupMember(x.groupId,x.studentId,actor());await makeAutomaticBackup();return r});
ipcMain.handle('groups:add-donor',async(_e,x)=>{requireLogin();const r=store.addGroupDonor(x.groupId,x.donorId,actor());await makeAutomaticBackup();return r});
ipcMain.handle('audit:list',()=>{requireLogin();return store.listAudit()});
ipcMain.handle('diagnostics:run',()=>{requireLogin();return {database:store.db.prepare('PRAGMA integrity_check').get().integrity_check,foreignKeys:store.db.prepare('PRAGMA foreign_key_check').all().length,donors:store.db.prepare('SELECT COUNT(*) n FROM donors').get().n,students:store.db.prepare('SELECT COUNT(*) n FROM students').get().n,backupFolder:path.join(app.getPath('userData'),'backups')}});
ipcMain.handle('print:donors',async(_e,ids)=>{requireLogin();const rows=ids?.length?store.db.prepare('SELECT * FROM donors WHERE id IN ('+ids.map(()=>'?').join(',')+')').all(...ids):store.listDonors();const html='<html lang="he" dir="rtl"><meta charset="utf-8"><style>body{font-family:Arial}table{width:100%;border-collapse:collapse}td,th{border:1px solid #999;padding:7px;text-align:right}</style><h2>רשימת תורמים</h2><table><tr><th>קוד</th><th>שם</th><th>עיר</th><th>רחוב</th><th>טלפון</th></tr>'+rows.map(d=>'<tr><td>'+d.id+'</td><td>'+d.title+' '+d.first_name+' '+d.last_name+'</td><td>'+d.city+'</td><td>'+d.street+' '+d.building+'</td><td>'+d.phone+'</td></tr>').join('')+'</table></html>';const {BrowserWindow}=require('electron');const w=new BrowserWindow({show:false});await w.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));return w.webContents.print({printBackground:true})});
