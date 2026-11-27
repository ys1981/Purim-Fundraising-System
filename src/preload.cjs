const{contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('purim',Object.freeze({
 listUsers:()=>ipcRenderer.invoke('auth:list'),login:x=>ipcRenderer.invoke('auth:login',x),logout:()=>ipcRenderer.invoke('auth:logout'),
 bootstrap:()=>ipcRenderer.invoke('app:bootstrap'),listDonors:q=>ipcRenderer.invoke('donor:list',q),saveDonor:x=>ipcRenderer.invoke('donor:save',x),addDonation:x=>ipcRenderer.invoke('donor:donation',x),donorHistory:id=>ipcRenderer.invoke('donor:history',id),
 listStudents:()=>ipcRenderer.invoke('student:list'),saveStudent:x=>ipcRenderer.invoke('student:save',x),createYear:y=>ipcRenderer.invoke('year:create',y),listRoutes:y=>ipcRenderer.invoke('route:list',y),saveRoute:x=>ipcRenderer.invoke('route:save',x),
 backup:()=>ipcRenderer.invoke('backup:create'),exportData:()=>ipcRenderer.invoke('data:export'),importData:()=>ipcRenderer.invoke('data:import'),audit:()=>ipcRenderer.invoke('audit:list'),diagnostics:()=>ipcRenderer.invoke('diagnostics:run'),printDonors:ids=>ipcRenderer.invoke('print:donors',ids),
 onLocked:cb=>ipcRenderer.on('auth:locked',cb)
}));