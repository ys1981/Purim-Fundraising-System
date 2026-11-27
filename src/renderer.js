const $ = id => document.getElementById(id);
let db;
const money = n => new Intl.NumberFormat('he-IL',{style:'currency',currency:'ILS',maximumFractionDigits:0}).format(n||0);
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600)}
function showView(id){document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===id));document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.view===id));}
document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
document.querySelectorAll('[data-goto]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.goto)));
$('goDonors').onclick=()=>showView('donors'); $('newDonor').onclick=()=>openDonor(); $('addDonor').onclick=()=>openDonor();
function total(d){return (d.donations||[]).reduce((s,x)=>s+Number(x.amount||0),0)}
function render(){
 const active=db.donors.filter(d=>d.status==='active');
 $('donorCount').textContent=active.length; $('studentCount').textContent=db.students.length;
 $('totalDonations').textContent=money(db.donors.reduce((s,d)=>s+total(d),0));
 $('donorTotal').textContent=active.length+' תורמים פעילים';
 const rows=active.filter(d=>(d.firstName+' '+d.lastName+' '+d.city+' '+d.street+' '+d.phone).includes($('donorSearch').value.trim())).sort((a,b)=>a.id-b.id);
 $('donorRows').innerHTML=rows.map(d=>'<tr><td>#'+d.id+'</td><td><b>'+esc(d.title+' '+d.firstName+' '+d.lastName)+'</b></td><td>'+esc(d.city)+'</td><td>'+esc(d.street+' '+d.building)+'</td><td>'+esc(d.phone)+'</td><td>'+money(total(d))+'</td><td><button class="row-action" data-edit="'+d.id+'">פתיחה</button></td></tr>').join('')||'<tr><td colspan="7" class="empty">לא נמצאו תורמים</td></tr>';
 document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openDonor(Number(b.dataset.edit)));
 const recent=[...active].sort((a,b)=>b.id-a.id).slice(0,5);
 $('recentDonors').innerHTML=recent.length?recent.map(d=>'<div class="recent-row">'+esc(d.firstName+' '+d.lastName)+' <span>'+esc(d.city+' · '+d.street)+'</span></div>').join(''):'עדיין לא נוספו תורמים';
 $('auditRows').innerHTML=db.audit.length?db.audit.slice(0,100).map(a=>'<div class="audit-row"><b>'+esc(a.action)+'</b> · '+esc(a.details)+' <span>'+new Date(a.at).toLocaleString('he-IL')+'</span></div>').join(''):'אין עדיין פעולות ביומן';
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function openDonor(id){
 const d=id?db.donors.find(x=>x.id===id):null; $('donorForm').reset(); $('donorId').value=d?.id||'';
 $('dialogTitle').textContent=d?'עריכת פרטי תורם':'תורם חדש'; $('formError').textContent='';
 ['title','firstName','lastName','city','street','building','phone','area','group','notes'].forEach(k=>$(k).value=d?.[k]|| (k==='title'?'הרב':''));
 $('donorDialog').showModal();
}
function closeDialog(){$('donorDialog').close()}
$('closeDialog').onclick=closeDialog; $('cancelDialog').onclick=closeDialog;
$('donorForm').onsubmit=async e=>{e.preventDefault();$('formError').textContent='';try{
 const id=$('donorId').value?Number($('donorId').value):null; const old=id?db.donors.find(x=>x.id===id):null;
 const payload={id,title:$('title').value,firstName:$('firstName').value,lastName:$('lastName').value,city:$('city').value,street:$('street').value,building:$('building').value,phone:$('phone').value,area:$('area').value,group:$('group').value,notes:$('notes').value,status:old?.status||'active',donations:old?.donations||[]};
 await window.purim.saveDonor(payload); db=await window.purim.read(); closeDialog(); render(); toast('פרטי התורם נשמרו בהצלחה');
 }catch(err){$('formError').textContent=err.message||'אירעה שגיאה בשמירה'}};
$('donorSearch').addEventListener('input',render);
$('backupBtn').onclick=async()=>{try{const p=await window.purim.backup();toast('הגיבוי נוצר בהצלחה');}catch(e){toast('שגיאה ביצירת גיבוי: '+e.message)}};
$('exportBtn').onclick=async()=>{try{if(await window.purim.exportData())toast('הנתונים יוצאו בהצלחה')}catch(e){toast('שגיאה בייצוא: '+e.message)}};
$('importBtn').onclick=async()=>{try{if(await window.purim.importData()){db=await window.purim.read();render();toast('הנתונים יובאו בהצלחה')}}catch(e){toast('שגיאה בייבוא: '+e.message)}};
(async()=>{try{db=await window.purim.read();render()}catch(e){toast('לא ניתן לטעון נתונים: '+e.message)}})();