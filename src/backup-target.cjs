const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');

async function copyBackupAtomically(sourceFile,targetDirectory){
 if(typeof sourceFile!=='string'||!sourceFile)throw new Error('קובץ הגיבוי המקומי לא הוגדר');
 if(typeof targetDirectory!=='string'||!targetDirectory)throw new Error('תיקיית הגיבוי ברשת לא הוגדרה');
 const info=await fs.stat(targetDirectory);
 if(!info.isDirectory())throw new Error('יעד הגיבוי אינו תיקייה');
 await fs.access(targetDirectory,fs.constants.W_OK);
 const targetFile=path.join(targetDirectory,'Purim-Live-Backup.json');
 const tempFile=targetFile+'.'+process.pid+'.'+crypto.randomUUID()+'.tmp';
 try{
  await fs.copyFile(sourceFile,tempFile);
  await fs.rename(tempFile,targetFile);
 }catch(error){
  await fs.rm(tempFile,{force:true}).catch(()=>{});
  throw error;
 }
 return targetFile;
}

module.exports={copyBackupAtomically};
