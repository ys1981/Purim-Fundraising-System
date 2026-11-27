const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {copyBackupAtomically}=require('../src/backup-target.cjs');

test('LAN backup is copied atomically and replaces the previous snapshot',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'purim-backup-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const source=path.join(root,'automatic-latest.json');
 const target=path.join(root,'shared');
 await fs.mkdir(target);
 await fs.writeFile(source,'{"revision":1}');
 const first=await copyBackupAtomically(source,target);
 assert.equal(await fs.readFile(first,'utf8'),'{"revision":1}');
 await fs.writeFile(source,'{"revision":2}');
 const second=await copyBackupAtomically(source,target);
 assert.equal(second,first);
 assert.equal(await fs.readFile(second,'utf8'),'{"revision":2}');
 const files=await fs.readdir(target);
 assert.deepEqual(files,['Purim-Live-Backup.json']);
});

test('LAN backup rejects a missing destination',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'purim-backup-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const source=path.join(root,'automatic-latest.json');
 await fs.writeFile(source,'{}');
 await assert.rejects(()=>copyBackupAtomically(source,path.join(root,'missing')));
});
