const {hashCode,verifyCode,allowed,ROLE_PRESETS}=require('./security.cjs');
const now=()=>new Date().toISOString();
function createStore(db){
 const audit=(actor,action,entity,id,before,after)=>db.prepare('INSERT INTO audit(actor,action,entity,entity_id,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?)').run(actor,action,entity,String(id??''),before?JSON.stringify(before):null,after?JSON.stringify(after):null,now());
 const donorFields=['title','firstName','lastName','city','street','building','entrance','apartment','floor','area','groupName','printNotes','privateNotes','phone','email','collectionTime','status','archiveUntilYear','archiveReason','doNotContact'];
 const cols=['title','first_name','last_name','city','street','building','entrance','apartment','floor','area','group_name','print_notes','private_notes','phone','email','collection_time','status','archive_until_year','archive_reason','do_not_contact'];
 function donorInput(x){const o={};donorFields.forEach((k,i)=>o[cols[i]]=x[k]??(k==='title'?'הרב':k==='status'?'active':k==='collectionTime'?'day14':k==='doNotContact'?0:''));if(!o.first_name?.trim()||!o.last_name?.trim()||!o.city?.trim()||!o.street?.trim())throw Error('יש למלא שם פרטי, שם משפחה, עיר ורחוב');return o}
 function findDonorByCode(code){const value=String(code??'').trim();if(!/^\d+$/.test(value))return null;return db.prepare(`SELECT d.*,COALESCE((SELECT SUM(amount) FROM donations WHERE donor_id=d.id),0) total_donations FROM donors d WHERE d.id=? AND d.status='active' AND COALESCE(d.do_not_contact,0)=0`).get(Number(value)||-1)||null}
 function listDonors(q=''){const like='%'+q+'%';return db.prepare(`SELECT d.*,COALESCE((SELECT SUM(amount) FROM donations WHERE donor_id=d.id),0) total_donations FROM donors d WHERE d.status='active' AND COALESCE(d.do_not_contact,0)=0 AND (?='' OR d.first_name||' '||d.last_name||d.city||d.street||d.phone LIKE ?) ORDER BY d.id DESC`).all(q,like)}
 function saveDonor(x,actor='מנהל'){const input=donorInput(x),stamp=now();return db.transaction(()=>{let id=x.id,before=id?db.prepare('SELECT * FROM donors WHERE id=?').get(id):null;if(id&&!before)throw Error('התורם לא נמצא');if(id){const sets=cols.map(c=>c+'=@'+c).join(',');db.prepare('UPDATE donors SET '+sets+',updated_at=@updated_at WHERE id=@id').run({...input,updated_at:stamp,id});}else{const keys=cols.join(',');const result=db.prepare('INSERT INTO donors('+keys+',created_at,updated_at) VALUES('+cols.map(c=>'@'+c).join(',')+',@created_at,@updated_at)').run({...input,created_at:stamp,updated_at:stamp});id=result.lastInsertRowid;}const after=db.prepare('SELECT * FROM donors WHERE id=?').get(id);audit(actor,before?'עדכון תורם':'הוספת תורם','donor',id,before,after);return after;})()}
 function addDonation(x,actor='מנהל'){
  const amount=Number(x?.amount),year=Number(x?.year),donorId=Number(x?.donorId),method=String(x?.paymentMethod||'cash');
  const commitmentId=x?.commitmentId?Number(x.commitmentId):null;
  if(!Number.isFinite(amount)||amount<=0)throw Error('סכום התשלום חייב להיות גדול מאפס');
  if(!Number.isInteger(year)||year<2000||year>2200)throw Error('שנת התרומה אינה תקינה');
  if(!Number.isSafeInteger(donorId)||donorId<=0)throw Error('קוד התורם אינו תקין');
  if(!['cash','check','transfer','credit','other'].includes(method))throw Error('אמצעי התשלום אינו תקין');
  if(commitmentId!==null&&(!Number.isSafeInteger(commitmentId)||commitmentId<=0))throw Error('מספר ההתחייבות אינו תקין');
  const rounded=Math.round(amount*100)/100;
  return db.transaction(()=>{
   const donor=db.prepare('SELECT * FROM donors WHERE id=?').get(donorId);
   if(!donor)throw Error('התורם לא נמצא');
   if(donor.status!=='active')throw Error('לא ניתן לרשום תשלום לתורם שאינו פעיל');
   if(donor.do_not_contact)throw Error('התורם מוגדר ללא פנייה');
   let commitment=null;
   if(commitmentId!==null){
    commitment=db.prepare("SELECT * FROM commitments WHERE id=? AND status<>'cancelled'").get(commitmentId);
    if(!commitment||commitment.donor_id!==donorId||commitment.year!==year)throw Error('ההתחייבות אינה שייכת לתורם או לשנת הקמפיין שנבחרו');
    const paid=db.prepare('SELECT COALESCE(SUM(amount),0) amount FROM donations WHERE commitment_id=?').get(commitmentId).amount;
    if(rounded>Math.round((commitment.amount-paid)*100)/100+0.00001)throw Error('סכום התשלום גבוה מיתרת ההתחייבות');
   }
   const stamp=now();
   const result=db.prepare('INSERT INTO donations(donor_id,year,occasion,amount,notes,commitment_id,payment_method,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(donorId,year,x.occasion||'day14',rounded,String(x.notes||''),commitmentId,method,stamp,stamp);
   const id=Number(result.lastInsertRowid),receipt='PF-'+year+'-'+String(id).padStart(6,'0');
   db.prepare('UPDATE donations SET receipt_number=? WHERE id=?').run(receipt,id);
   if(commitmentId!==null){
    const paid=db.prepare('SELECT COALESCE(SUM(amount),0) amount FROM donations WHERE commitment_id=?').get(commitmentId).amount;
    if(paid>=commitment.amount-0.00001)db.prepare("UPDATE commitments SET status='paid' WHERE id=?").run(commitmentId);
   }
   audit(actor,'רישום תשלום והפקת קבלה','donation',id,null,{...x,donorId,year,amount:rounded,paymentMethod:method,commitmentId,receiptNumber:receipt});
   return {id,receiptNumber:receipt};
  })();
 }
 function addCommitment(x,actor='מנהל'){
  const donorId=Number(x?.donorId),year=Number(x?.year),amount=Number(x?.amount),dueDate=x?.dueDate?String(x.dueDate):null;
  if(!Number.isSafeInteger(donorId)||donorId<=0)throw Error('יש לבחור תורם תקין');
  if(!Number.isInteger(year)||year<2000||year>2200)throw Error('שנת ההתחייבות אינה תקינה');
  if(!Number.isFinite(amount)||amount<=0)throw Error('סכום ההתחייבות חייב להיות גדול מאפס');
  if(dueDate&&!/^\\d{4}-\\d{2}-\\d{2}$/.test(dueDate))throw Error('תאריך היעד אינו תקין');
  const donor=db.prepare("SELECT * FROM donors WHERE id=? AND status='active'").get(donorId);
  if(!donor)throw Error('ניתן להוסיף התחייבות רק לתורם פעיל');
  const stamp=now();
  const result=db.prepare("INSERT INTO commitments(donor_id,year,amount,due_date,notes,status,created_at,created_by) VALUES(?,?,?,?,?,'open',?,?)").run(donorId,year,Math.round(amount*100)/100,dueDate,String(x.notes||''),stamp,actor);
  const id=Number(result.lastInsertRowid);
  audit(actor,'רישום התחייבות לתרומה','commitment',id,null,{donorId,year,amount,dueDate,notes:x.notes||''});
  return id;
 }
 function listCommitments(year){
  return db.prepare("SELECT c.*,d.title,d.first_name,d.last_name,d.city,d.street,d.building,COALESCE((SELECT SUM(amount) FROM donations p WHERE p.commitment_id=c.id),0) paid_amount,ROUND(c.amount-COALESCE((SELECT SUM(amount) FROM donations p WHERE p.commitment_id=c.id),0),2) outstanding_amount FROM commitments c JOIN donors d ON d.id=c.donor_id WHERE c.year=? ORDER BY CASE c.status WHEN 'open' THEN 0 WHEN 'paid' THEN 1 ELSE 2 END,c.due_date,c.id").all(Number(year));
 }
 function listPayments(year){
  return db.prepare("SELECT p.*,d.title,d.first_name,d.last_name,d.city,d.street,d.building,c.amount commitment_amount FROM donations p JOIN donors d ON d.id=p.donor_id LEFT JOIN commitments c ON c.id=p.commitment_id WHERE p.year=? ORDER BY p.id DESC").all(Number(year));
 }
 function getReceipt(id){
  return db.prepare("SELECT p.*,d.title,d.first_name,d.last_name,d.city,d.street,d.building,d.phone,c.amount commitment_amount FROM donations p JOIN donors d ON d.id=p.donor_id LEFT JOIN commitments c ON c.id=p.commitment_id WHERE p.id=?").get(Number(id))||null;
 }
 function listArchivedDonors(q=''){const like='%'+q+'%';return db.prepare(`SELECT d.*,COALESCE((SELECT SUM(amount) FROM donations WHERE donor_id=d.id),0) total_donations FROM donors d WHERE d.status='archived' AND (?='' OR d.first_name||' '||d.last_name||d.city||d.street||d.phone LIKE ?) ORDER BY d.id DESC`).all(q,like)}
 function archiveDonor(id,reason,untilYear,actor='מנהל'){const before=db.prepare('SELECT * FROM donors WHERE id=?').get(id);if(!before)throw Error('התורם לא נמצא');if(before.status==='archived')throw Error('התורם כבר נמצא בארכיון');if(!String(reason||'').trim())throw Error('יש לציין סיבת העברה לארכיון');db.prepare("UPDATE donors SET status='archived',archive_reason=?,archive_until_year=?,updated_at=? WHERE id=?").run(String(reason).trim(),untilYear?Number(untilYear):null,now(),id);const after=db.prepare('SELECT * FROM donors WHERE id=?').get(id);audit(actor,'העברת תורם לארכיון','donor',id,before,after);return after}
 function restoreDonor(id,actor='מנהל'){const before=db.prepare('SELECT * FROM donors WHERE id=?').get(id);if(!before)throw Error('התורם לא נמצא');if(before.status!=='archived')throw Error('התורם אינו בארכיון');db.prepare("UPDATE donors SET status='active',archive_reason=NULL,archive_until_year=NULL,updated_at=? WHERE id=?").run(now(),id);const after=db.prepare('SELECT * FROM donors WHERE id=?').get(id);audit(actor,'החזרת תורם מהארכיון','donor',id,before,after);return after}
 function listStreets(q=''){const like='%'+q+'%';return db.prepare(`SELECT s.*, (SELECT group_concat(alias,'; ') FROM street_aliases a WHERE a.street_id=s.id) aliases FROM streets s WHERE (?='' OR s.city||s.name||s.area||COALESCE((SELECT group_concat(alias,' ') FROM street_aliases a WHERE a.street_id=s.id),'') LIKE ?) ORDER BY s.city,s.area,s.name`).all(q,like)}
 function saveStreet(x,actor='מנהל'){const city=String(x.city||'').trim(),name=String(x.name||'').trim(),area=String(x.area||'').trim();if(!city||!name||!area)throw Error('יש למלא עיר, שם רחוב ואזור');const duplicate=db.prepare('SELECT id FROM streets WHERE city=? AND name=? AND area=? AND id<>COALESCE(?,0)').get(city,name,area,x.id||0);if(duplicate)throw Error('הרחוב כבר קיים במאגר');const before=x.id?db.prepare('SELECT * FROM streets WHERE id=?').get(x.id):null;if(x.id&&!before)throw Error('הרחוב לא נמצא');let id;if(before){db.prepare('UPDATE streets SET city=?,name=?,area=?,group_name=?,low_number=?,high_number=?,parity=? WHERE id=?').run(city,name,area,x.groupName||'',x.lowNumber?Number(x.lowNumber):null,x.highNumber?Number(x.highNumber):null,x.parity||'all',x.id);id=x.id}else{id=db.prepare('INSERT INTO streets(city,name,area,group_name,low_number,high_number,parity) VALUES(?,?,?,?,?,?,?)').run(city,name,area,x.groupName||'',x.lowNumber?Number(x.lowNumber):null,x.highNumber?Number(x.highNumber):null,x.parity||'all').lastInsertRowid}const after=db.prepare('SELECT * FROM streets WHERE id=?').get(id);audit(actor,before?'עדכון רחוב במאגר':'הוספת רחוב למאגר','street',id,before,after);return after}
 function addStreetAlias(streetId,alias,actor='מנהל'){const value=String(alias||'').trim();if(!value)throw Error('יש להזין כינוי רחוב');if(!db.prepare('SELECT id FROM streets WHERE id=?').get(streetId))throw Error('הרחוב לא נמצא');const existing=db.prepare('SELECT street_id FROM street_aliases WHERE alias=?').get(value);if(existing&&existing.street_id!==Number(streetId))throw Error('הכינוי כבר משויך לרחוב אחר');if(existing)return true;db.prepare('INSERT INTO street_aliases(street_id,alias) VALUES(?,?)').run(streetId,value);audit(actor,'הוספת כינוי רחוב','street',streetId,null,{alias:value});return true}
 function listStudents(){return db.prepare('SELECT s.*,c.name class_name FROM students s LEFT JOIN classes c ON c.id=s.class_id ORDER BY c.sort_order,s.last_name,s.first_name').all()}
 function saveStudent(x,actor='מנהל'){if(!x.firstName?.trim()||!x.lastName?.trim())throw Error('יש למלא שם פרטי ומשפחה');const t=now();return db.transaction(()=>{let id=x.id,before=id?db.prepare('SELECT * FROM students WHERE id=?').get(id):null;const vals=[x.firstName,x.lastName,x.classId||null,x.phone||'',x.fatherPhone||'',x.notes||'',JSON.stringify(x.custom||{}),t];if(before){db.prepare('UPDATE students SET first_name=?,last_name=?,class_id=?,phone=?,father_phone=?,notes=?,custom_json=?,updated_at=? WHERE id=?').run(...vals,id)}else{id=db.prepare('INSERT INTO students(first_name,last_name,class_id,phone,father_phone,notes,custom_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(...vals.slice(0,7),t,t).lastInsertRowid}audit(actor,before?'עדכון בחור':'הוספת בחור','student',id,before,x);return id;})()}
 function createYear(year,actor='מנהל'){const y=Number(year);if(!Number.isInteger(y)||y<2000||y>2200)throw Error('שנה לא תקינה');return db.transaction(()=>{const r=db.prepare('INSERT INTO years(year,created_at) VALUES(?,?)').run(y,now());const yearId=r.lastInsertRowid;const events=[['ליל י״ד','night14'],['יום י״ד','day14'],['יום ט״ו','day15']];const add=db.prepare('INSERT INTO collection_events(year_id,name,kind,sort_order) VALUES(?,?,?,?)');events.forEach((e,i)=>add.run(yearId,e[0],e[1],i));const reopened=db.prepare("SELECT id FROM donors WHERE status='archived' AND archive_until_year IS NOT NULL AND archive_until_year<=? AND COALESCE(do_not_contact,0)=0").all(y);if(reopened.length){db.prepare("UPDATE donors SET status='active',archive_reason=NULL,archive_until_year=NULL,updated_at=? WHERE status='archived' AND archive_until_year IS NOT NULL AND archive_until_year<=? AND COALESCE(do_not_contact,0)=0").run(now(),y);audit(actor,'החזרה אוטומטית של תורמים מהארכיון','donors',reopened.map(x=>x.id).join(','),{count:reopened.length},{year:y,donorIds:reopened.map(x=>x.id)})}return yearId})()}
 function listAudit(){return db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 1000').all()}
 function summary(year){return {donors:db.prepare("SELECT COUNT(*) n FROM donors WHERE status='active' AND do_not_contact=0").get().n,students:db.prepare("SELECT COUNT(*) n FROM students WHERE status='active'").get().n,donations:db.prepare('SELECT COALESCE(SUM(amount),0) n FROM donations WHERE year=?').get(year).n,year}}
 function campaignReport(year){
  const y=Number(year);if(!Number.isInteger(y)||y<2000||y>2200)throw Error('שנת דוח אינה תקינה');
  const totals=db.prepare("SELECT COUNT(*) donation_count,COALESCE(SUM(amount),0) total_amount,COUNT(DISTINCT donor_id) donors_count,COALESCE(AVG(amount),0) average_amount FROM donations WHERE year=?").get(y);
  const daily=db.prepare("SELECT substr(created_at,1,10) day,COUNT(*) count,COALESCE(SUM(amount),0) amount FROM donations WHERE year=? GROUP BY substr(created_at,1,10) ORDER BY day").all(y);
  const occasions=db.prepare("SELECT occasion,COUNT(*) count,COALESCE(SUM(amount),0) amount FROM donations WHERE year=? GROUP BY occasion ORDER BY amount DESC").all(y);
  const topDonors=db.prepare("SELECT d.id,d.title,d.first_name,d.last_name,d.city,d.street,d.building,COUNT(x.id) donation_count,SUM(x.amount) total_amount FROM donations x JOIN donors d ON d.id=x.donor_id WHERE x.year=? GROUP BY d.id ORDER BY total_amount DESC,d.last_name,d.first_name LIMIT 10").all(y);
  const activeDonors=db.prepare("SELECT COUNT(*) n FROM donors WHERE status='active' AND COALESCE(do_not_contact,0)=0").get().n;
  const missingPhone=db.prepare("SELECT COUNT(*) n FROM donors WHERE status='active' AND COALESCE(do_not_contact,0)=0 AND trim(COALESCE(phone,''))=''").get().n;
  const duplicateAddresses=db.prepare("SELECT COUNT(*) n FROM (SELECT city,street,building FROM donors WHERE status='active' GROUP BY lower(trim(city)),lower(trim(street)),lower(trim(building)) HAVING COUNT(*)>1)").get().n;
  return {year:y,totals, daily, occasions, topDonors, quality:{activeDonors,missingPhone,duplicateAddresses}};
 }
 function createFirstAdmin(x){if(db.prepare('SELECT COUNT(*) n FROM users').get().n)throw Error('כבר קיים משתמש במערכת');if(String(x.code||'').length<4)throw Error('הקוד חייב להכיל לפחות 4 תווים');const id=db.prepare('INSERT INTO users(username,display_name,password_hash,role,permissions_json) VALUES(?,?,?,?,?)').run('admin',x.displayName||'מנהל ראשי',hashCode(x.code),'admin',JSON.stringify({permissions:['*']})).lastInsertRowid;audit('מערכת','יצירת מנהל ראשי','user',id,null,{username:'admin'});return id}
 function addUser(x,actor='מנהל'){if(!x.username||!x.displayName||String(x.code||'').length<4)throw Error('נדרשים שם משתמש, שם תצוגה וקוד בן 4 תווים לפחות');const r=db.prepare('INSERT INTO users(username,display_name,password_hash,role,permissions_json,allowed_from,allowed_until) VALUES(?,?,?,?,?,?,?)').run(x.username,x.displayName,hashCode(x.code),x.role||'custom',JSON.stringify({permissions:x.permissions||ROLE_PRESETS[x.role]||[]}),x.allowedFrom||null,x.allowedUntil||null);audit(actor,'הוספת משתמש','user',r.lastInsertRowid,null,{username:x.username,role:x.role});return r.lastInsertRowid}
 function login(id,code){const u=db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(id);if(!u||!verifyCode(code,u.password_hash)||!allowed(u,'dashboard:read'))throw Error('פרטי הכניסה שגויים או שהגישה אינה פעילה');db.prepare('INSERT INTO access_log(actor,action,created_at) VALUES(?,?,?)').run(u.display_name,'כניסה למערכת',now());return {id:u.id,name:u.display_name,role:u.role,permissions:JSON.parse(u.permissions_json||'{}').permissions||ROLE_PRESETS[u.role]||[]}}
 function exportData(){const tables=['donors','commitments','donations','students','classes','parents','years','collection_events','streets','street_aliases','routes','route_streets','route_pairs','purim_groups','group_members','group_donors','phone_queue','tasks','users','audit','access_log','print_templates','snapshots','map_features'];const out={format:'purim-fundraising-backup',version:1,createdAt:now(),tables:{}};for(const t of tables)out.tables[t]=db.prepare('SELECT * FROM '+t).all();return out}
 function importData(data,actor='מנהל'){
  if(data?.format!=='purim-fundraising-backup'||!data.tables||typeof data.tables!=='object'||Array.isArray(data.tables))throw Error('קובץ גיבוי לא מזוהה');
  const insertOrder=['classes','years','donors','commitments','students','parents','streets','collection_events','routes','route_streets','route_pairs','purim_groups','group_members','group_donors','donations','street_aliases','phone_queue','tasks','users','audit','access_log','print_templates','snapshots','map_features'];
  // Validate every table, column and value before deleting any current data.
  const preparedRows={};
  for(const table of insertOrder){
   const rows=data.tables[table]??[];
   if(!Array.isArray(rows))throw Error('מבנה טבלת גיבוי אינו תקין: '+table);
   const columns=new Set(db.prepare('PRAGMA table_info("'+table+'")').all().map(c=>c.name));
   preparedRows[table]=rows.map((row,index)=>{
    if(!row||typeof row!=='object'||Array.isArray(row)||Object.getPrototypeOf(row)!==Object.prototype)throw Error('רשומה לא תקינה בטבלה '+table+' בשורה '+(index+1));
    const keys=Object.keys(row);
    if(!keys.length)throw Error('נמצאה רשומה ריקה בטבלה '+table);
    for(const key of keys){
     if(!columns.has(key))throw Error('עמודה לא מוכרת בקובץ הגיבוי: '+table+'.'+key);
     const value=row[key];
     if(value!==null&&!['string','number','boolean'].includes(typeof value))throw Error('ערך לא תקין בקובץ הגיבוי: '+table+'.'+key);
     if(typeof value==='number'&&!Number.isFinite(value))throw Error('מספר לא תקין בקובץ הגיבוי: '+table+'.'+key);
    }
    return row;
   });
  }
  const deleteOrder=['group_members','group_donors','route_pairs','route_streets','street_aliases','phone_queue','tasks','donations','commitments','parents','routes','purim_groups','collection_events','students','donors','streets','classes','years','users','audit','access_log','print_templates','snapshots','map_features'];
  return db.transaction(()=>{
   const backup=exportData();
   for(const table of deleteOrder)db.prepare('DELETE FROM "'+table+'"').run();
   for(const table of insertOrder){
    for(const row of preparedRows[table]){
     const keys=Object.keys(row);
     const quoted=keys.map(k=>'"'+k.replace(/"/g,'""')+'"').join(',');
     const placeholders=keys.map(k=>':'+k).join(',');
     db.prepare('INSERT INTO "'+table+'"('+quoted+') VALUES('+placeholders+')').run(row);
    }
   }
   audit(actor,'שחזור גיבוי','database','all',null,{createdAt:data.createdAt});
   return backup;
  })();
 }


 function importDonors(rows,actor='מנהל'){
  if(!Array.isArray(rows)||!rows.length)throw Error('לא נמצאו תורמים לייבוא');
  const prepared=rows.map((row,index)=>{try{return donorInput(row)}catch(error){throw Error('שורה '+(index+2)+': '+error.message)}});
  const seen=new Set();
  for(let i=0;i<prepared.length;i++){const d=prepared[i],key=[d.first_name,d.last_name,d.city,d.street,d.building].map(v=>String(v||'').trim().toLocaleLowerCase('he')).join('|');if(seen.has(key))throw Error('נמצא תורם כפול בקובץ, בשורה '+(i+2));seen.add(key)}
  return db.transaction(()=>{const exists=db.prepare('SELECT 1 FROM donors WHERE lower(trim(first_name))=? AND lower(trim(last_name))=? AND lower(trim(city))=? AND lower(trim(street))=? AND lower(trim(building))=? LIMIT 1');const stamp=now();const ids=[];for(let i=0;i<prepared.length;i++){const d=prepared[i],key=[d.first_name,d.last_name,d.city,d.street,d.building].map(v=>String(v||'').trim().toLowerCase());if(exists.get(...key))throw Error('תורם כבר קיים במערכת, בשורה '+(i+2));const result=db.prepare('INSERT INTO donors('+cols.join(',')+',created_at,updated_at) VALUES('+cols.map(c=>'@'+c).join(',')+',@created_at,@updated_at)').run({...d,created_at:stamp,updated_at:stamp});ids.push(Number(result.lastInsertRowid));audit(actor,'ייבוא תורם מקובץ CSV','donor',result.lastInsertRowid,null,{first_name:d.first_name,last_name:d.last_name,city:d.city,street:d.street})}return {count:ids.length,ids}})();
 }

 function importStudents(rows,actor='מנהל'){
  if(!Array.isArray(rows)||!rows.length)throw Error('לא נמצאו בחורים לייבוא');
  const prepared=rows.map((row,index)=>{
   const firstName=String(row.firstName||'').trim(),lastName=String(row.lastName||'').trim(),className=String(row.className||'').trim();
   if(!firstName||!lastName||!className)throw Error('שורה '+(index+2)+': נדרשים שם פרטי, שם משפחה ושיעור');
   if(firstName.length>100||lastName.length>100||className.length>100)throw Error('שורה '+(index+2)+': אחד השדות ארוך מדי');
   const cls=db.prepare('SELECT id FROM classes WHERE lower(trim(name))=lower(trim(?))').get(className);
   if(!cls)throw Error('שורה '+(index+2)+': השיעור לא קיים במערכת: '+className);
   return {firstName,lastName,classId:cls.id,phone:String(row.phone||'').trim(),fatherPhone:String(row.fatherPhone||'').trim(),notes:String(row.notes||'').trim()};
  });
  const seen=new Set();
  for(let i=0;i<prepared.length;i++){const x=prepared[i],key=[x.firstName,x.lastName,x.classId].map(v=>String(v).trim().toLocaleLowerCase('he')).join('|');if(seen.has(key))throw Error('בחור כפול בקובץ, בשורה '+(i+2));seen.add(key)}
  return db.transaction(()=>{
   const exists=db.prepare('SELECT 1 FROM students WHERE lower(trim(first_name))=? AND lower(trim(last_name))=? AND class_id IS ? LIMIT 1');
   const stamp=now(),ids=[];
   for(let i=0;i<prepared.length;i++){const x=prepared[i];if(exists.get(x.firstName.toLowerCase(),x.lastName.toLowerCase(),x.classId))throw Error('בחור כבר קיים במערכת, בשורה '+(i+2));
    const id=db.prepare('INSERT INTO students(first_name,last_name,class_id,phone,father_phone,notes,custom_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,\'active\',?,?)').run(x.firstName,x.lastName,x.classId,x.phone,x.fatherPhone,x.notes,'{}',stamp,stamp).lastInsertRowid;
    ids.push(Number(id));audit(actor,'ייבוא בחור מקובץ CSV','student',id,null,{first_name:x.firstName,last_name:x.lastName,class_id:x.classId});
   }
   return {count:ids.length,ids};
  })();
 }
 function importDonations(rows,actor='מנהל'){
  if(!Array.isArray(rows)||!rows.length)throw Error('לא נמצאו תרומות לייבוא');
  const prepared=rows.map((row,index)=>{
   const donorId=Number(String(row.donorCode||'').trim()),year=Number(String(row.year||'').trim()),amount=Number(String(row.amount||'').trim().replace(',','.'));
   const occasion=String(row.occasion||'day14').trim()||'day14',notes=String(row.notes||'').trim();
   if(!Number.isSafeInteger(donorId)||donorId<=0)throw Error('שורה '+(index+2)+': קוד תורם אינו תקין');
   if(!Number.isInteger(year)||year<2000||year>2200)throw Error('שורה '+(index+2)+': שנת קמפיין אינה תקינה');
   if(!Number.isFinite(amount)||amount<=0)throw Error('שורה '+(index+2)+': סכום התרומה חייב להיות גדול מאפס');
   if(!['night14','day14','day15','other','ליל י״ד','יום י״ד','יום ט״ו','אחר'].includes(occasion))throw Error('שורה '+(index+2)+': מועד התרומה אינו תקין');
   const mapped=({'ליל י״ד':'night14','יום י״ד':'day14','יום ט״ו':'day15','אחר':'other'})[occasion]||occasion;
   return {donorId,year,amount,occasion:mapped,notes,firstName:String(row.firstName||'').trim(),lastName:String(row.lastName||'').trim(),city:String(row.city||'').trim(),street:String(row.street||'').trim(),building:String(row.building||'').trim()};
  });
  const seen=new Set();
  for(let i=0;i<prepared.length;i++){const x=prepared[i],key=[x.donorId,x.year,x.occasion,x.amount,x.notes].join('|');if(seen.has(key))throw Error('תרומה כפולה בקובץ, בשורה '+(i+2));seen.add(key)}
  return db.transaction(()=>{
   const donorExists=db.prepare('SELECT id FROM donors WHERE id=?');
   const donorByAddress=db.prepare('SELECT id FROM donors WHERE lower(trim(first_name))=lower(trim(?)) AND lower(trim(last_name))=lower(trim(?)) AND lower(trim(city))=lower(trim(?)) AND lower(trim(street))=lower(trim(?)) AND lower(trim(building))=lower(trim(?)) ORDER BY id LIMIT 2');
   const duplicate=db.prepare('SELECT 1 FROM donations WHERE donor_id=? AND year=? AND occasion=? AND amount=? AND notes=? LIMIT 1');
   const stamp=now(),ids=[];
   for(let i=0;i<prepared.length;i++){const x=prepared[i];let donorId=x.donorId;
    if(x.firstName&&x.lastName&&x.city&&x.street){const matches=donorByAddress.all(x.firstName,x.lastName,x.city,x.street,x.building);if(matches.length!==1)throw Error('שורה '+(i+2)+': לא ניתן לזהות תורם באופן חד-משמעי לפי פרטים');donorId=matches[0].id}else if(!donorExists.get(donorId))throw Error('שורה '+(i+2)+': קוד התורם אינו קיים במערכת ('+donorId+')');
    if(duplicate.get(donorId,x.year,x.occasion,x.amount,x.notes))throw Error('תרומה זהה כבר קיימת במערכת, בשורה '+(i+2));
    const id=db.prepare('INSERT INTO donations(donor_id,year,occasion,amount,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(donorId,x.year,x.occasion,x.amount,x.notes,stamp,stamp).lastInsertRowid;
    ids.push(Number(id));audit(actor,'ייבוא תרומה מקובץ CSV','donation',id,null,{...x,donorId});
   }
   return {count:ids.length,ids};
  })();
 }


 function importWorkbookData(data,actor='מנהל'){
  const donors=Array.isArray(data.donors)?data.donors:[],students=Array.isArray(data.students)?data.students:[],donations=Array.isArray(data.donations)?data.donations:[];
  if(!donors.length&&!students.length&&!donations.length)throw Error('חוברת Excel אינה מכילה נתונים לייבוא');
  return db.transaction(()=>{
   const donorResult=donors.length?importDonors(donors,actor):{count:0,ids:[]};
   const studentResult=students.length?importStudents(students,actor):{count:0,ids:[]};
   const donationResult=donations.length?importDonations(donations,actor):{count:0,ids:[]};
   return {donors:donorResult.count,students:studentResult.count,donations:donationResult.count};
  })();
 }
 function listPhoneQueue(year){return db.prepare("SELECT q.*,d.title,d.first_name,d.last_name,d.city,d.street,d.building,d.phone FROM phone_queue q JOIN donors d ON d.id=q.donor_id WHERE q.year=? ORDER BY CASE q.status WHEN 'pending' THEN 0 WHEN 'call_back' THEN 1 ELSE 2 END,q.id").all(Number(year))}
 function enqueuePhone(donorId,year,actor='מנהל'){return db.transaction(()=>{const existing=db.prepare('SELECT id FROM phone_queue WHERE donor_id=? AND year=? AND status IN (\'pending\',\'call_back\')').get(donorId,Number(year));if(existing)throw Error('התורם כבר נמצא ברשימת הטלפונים לשנה זו');const d=db.prepare('SELECT * FROM donors WHERE id=?').get(donorId);if(!d)throw Error('התורם לא נמצא');db.prepare("UPDATE donors SET status='phone',updated_at=? WHERE id=?").run(now(),donorId);const r=db.prepare("INSERT INTO phone_queue(donor_id,year,status) VALUES(?,?,'pending')").run(donorId,Number(year));audit(actor,'העברה להתרמה טלפונית','donor',donorId,d,{status:'phone',year});return r.lastInsertRowid})()}
 function updatePhoneQueue(id,x,actor='מנהל'){const before=db.prepare('SELECT * FROM phone_queue WHERE id=?').get(id);if(!before)throw Error('רשומת שיחה לא נמצאה');const statuses=['pending','donated','call_back','no_answer','not_interested'];if(!statuses.includes(x.status))throw Error('סטטוס שיחה לא תקין');db.prepare('UPDATE phone_queue SET status=?,caller=?,next_call_at=?,notes=? WHERE id=?').run(x.status,x.caller||'',x.nextCallAt||null,x.notes||'',id);audit(actor,'עדכון שיחת התרמה','phone_queue',id,before,x);return true}
 function restorePhoneDonor(id,actor='מנהל'){const before=db.prepare('SELECT * FROM donors WHERE id=?').get(id);if(!before)throw Error('התורם לא נמצא');db.prepare("UPDATE donors SET status='active',updated_at=? WHERE id=?").run(now(),id);audit(actor,'החזרת תורם לפעיל','donor',id,before,{status:'active'});return true}
 function listRouteStreets(routeId){return db.prepare('SELECT rs.*,s.city,s.name,s.area,s.group_name FROM route_streets rs JOIN streets s ON s.id=rs.street_id WHERE rs.route_id=? ORDER BY s.city,s.area,s.name').all(Number(routeId))}
 function assignRouteStreet(x,actor='מנהל'){const routeId=Number(x.routeId),streetId=Number(x.streetId);const route=db.prepare('SELECT * FROM routes WHERE id=?').get(routeId);if(!route)throw Error('המסלול לא נמצא');if(!db.prepare('SELECT id FROM streets WHERE id=?').get(streetId))throw Error('הרחוב לא נמצא');const low=x.lowNumber===''||x.lowNumber==null?null:Number(x.lowNumber),high=x.highNumber===''||x.highNumber==null?null:Number(x.highNumber);if(low!==null&&(!Number.isInteger(low)||low<1)||high!==null&&(!Number.isInteger(high)||high<1)||low!==null&&high!==null&&low>high)throw Error('טווח מספרי בתים אינו תקין');const parity=x.parity||'all';if(!['all','odd','even'].includes(parity))throw Error('סוג זוגיות אינו תקין');const before=db.prepare('SELECT * FROM route_streets WHERE route_id=? AND street_id=?').get(routeId,streetId);const overlaps=(a,b)=>{const aLow=a.low_number==null?-Infinity:Number(a.low_number),aHigh=a.high_number==null?Infinity:Number(a.high_number),bLow=b.low_number==null?-Infinity:Number(b.low_number),bHigh=b.high_number==null?Infinity:Number(b.high_number);const parityOverlap=a.parity==='all'||b.parity==='all'||a.parity===b.parity;return parityOverlap&&aLow<=bHigh&&bLow<=aHigh};const candidates=db.prepare('SELECT rs.*,r.route_code FROM route_streets rs JOIN routes r ON r.id=rs.route_id WHERE rs.street_id=? AND rs.route_id<>? AND r.year_id=? AND r.event_id IS ?').all(streetId,routeId,route.year_id,route.event_id);const conflict=candidates.find(row=>overlaps({low_number:low,high_number:high,parity},{low_number:row.low_number,high_number:row.high_number,parity:row.parity}));if(conflict)throw Error('טווח הבתים חופף למסלול '+conflict.route_code+' באותו מועד. יש לשנות טווח או צד רחוב');db.prepare('INSERT INTO route_streets(route_id,street_id,low_number,high_number,parity) VALUES(?,?,?,?,?) ON CONFLICT(route_id,street_id) DO UPDATE SET low_number=excluded.low_number,high_number=excluded.high_number,parity=excluded.parity').run(routeId,streetId,low,high,parity);const after=db.prepare('SELECT * FROM route_streets WHERE route_id=? AND street_id=?').get(routeId,streetId);audit(actor,'שיוך רחוב למסלול','route_street',routeId,before,after);return after}
 function removeRouteStreet(routeId,streetId,actor='מנהל'){const before=db.prepare('SELECT * FROM route_streets WHERE route_id=? AND street_id=?').get(Number(routeId),Number(streetId));if(!before)return false;db.prepare('DELETE FROM route_streets WHERE route_id=? AND street_id=?').run(Number(routeId),Number(streetId));audit(actor,'הסרת רחוב ממסלול','route_street',routeId,before,null);return true}
 function listRoutePairs(routeId){return db.prepare('SELECT rp.*,a.first_name a_first,a.last_name a_last,b.first_name b_first,b.last_name b_last FROM route_pairs rp LEFT JOIN students a ON a.id=rp.student_a LEFT JOIN students b ON b.id=rp.student_b WHERE rp.route_id=? ORDER BY rp.id').all(Number(routeId))}
 function saveRoutePair(x,actor='מנהל'){const routeId=Number(x.routeId),a=x.studentA?Number(x.studentA):null,b=x.studentB?Number(x.studentB):null;if(!db.prepare('SELECT id FROM routes WHERE id=?').get(routeId))throw Error('המסלול לא נמצא');if(!a&&!b)throw Error('יש לבחור לפחות בחור אחד');if(a&&b&&a===b)throw Error('לא ניתן לשבץ את אותו בחור פעמיים בזוג');for(const id of [a,b].filter(Boolean))if(!db.prepare("SELECT id FROM students WHERE id=? AND status='active'").get(id))throw Error('בחור לא נמצא או אינו פעיל');const conflict=db.prepare('SELECT rp.id FROM route_pairs rp JOIN routes other ON other.id=rp.route_id JOIN routes target ON target.id=? WHERE rp.id<>COALESCE(?,0) AND other.year_id=target.year_id AND other.event_id IS target.event_id AND (rp.student_a IN (?,?) OR rp.student_b IN (?,?)) LIMIT 1').get(routeId,x.id||0,a||-1,b||-1,a||-1,b||-1);if(conflict)throw Error('אחד הבחורים כבר משובץ במסלול זה או במסלול אחר באותו מועד');let id;if(x.id){const before=db.prepare('SELECT * FROM route_pairs WHERE id=? AND route_id=?').get(Number(x.id),routeId);if(!before)throw Error('השיבוץ לא נמצא');db.prepare('UPDATE route_pairs SET student_a=?,student_b=?,reserve_used=? WHERE id=?').run(a,b,x.reserveUsed?1:0,Number(x.id));id=Number(x.id);audit(actor,'עדכון זוג במסלול','route_pair',id,before,x)}else{id=db.prepare('INSERT INTO route_pairs(route_id,student_a,student_b,reserve_used) VALUES(?,?,?,?)').run(routeId,a,b,x.reserveUsed?1:0).lastInsertRowid;audit(actor,'שיבוץ זוג למסלול','route_pair',id,null,x)}return id}
 function removeRoutePair(id,actor='מנהל'){const before=db.prepare('SELECT * FROM route_pairs WHERE id=?').get(Number(id));if(!before)return false;db.prepare('DELETE FROM route_pairs WHERE id=?').run(Number(id));audit(actor,'הסרת זוג ממסלול','route_pair',id,before,null);return true}
 function listGroups(year){return db.prepare("SELECT g.*,(SELECT COUNT(*) FROM group_members m WHERE m.group_id=g.id) member_count,(SELECT COUNT(*) FROM group_donors d WHERE d.group_id=g.id) donor_count FROM purim_groups g WHERE g.year_id=? ORDER BY g.name").all(Number(year))}
 function createGroup(x,actor='מנהל'){if(!x.yearId||!x.name?.trim()||!x.city?.trim()||!x.area?.trim())throw Error('יש למלא שנה, שם קבוצה, עיר ואזור');const r=db.prepare('INSERT INTO purim_groups(year_id,name,city,area,event_id,notes) VALUES(?,?,?,?,?,?)').run(Number(x.yearId),x.name.trim(),x.city.trim(),x.area.trim(),x.eventId||null,x.notes||'');audit(actor,'יצירת קבוצת פורים','group',r.lastInsertRowid,null,x);return r.lastInsertRowid}
 function listGroupMembers(groupId){return db.prepare('SELECT s.id,s.first_name,s.last_name,c.name class_name FROM group_members gm JOIN students s ON s.id=gm.student_id LEFT JOIN classes c ON c.id=s.class_id WHERE gm.group_id=? ORDER BY c.sort_order,s.last_name,s.first_name').all(Number(groupId))}
 function listGroupDonors(groupId){return db.prepare('SELECT d.id,d.title,d.first_name,d.last_name,d.city,d.street,d.building FROM group_donors gd JOIN donors d ON d.id=gd.donor_id WHERE gd.group_id=? ORDER BY d.city,d.street,d.last_name,d.first_name').all(Number(groupId))}
 function removeGroupMember(groupId,studentId,actor='מנהל'){const r=db.prepare('DELETE FROM group_members WHERE group_id=? AND student_id=?').run(Number(groupId),Number(studentId));if(r.changes)audit(actor,'הסרת בחור מקבוצה','group',groupId,null,{studentId});return r.changes>0}
 function removeGroupDonor(groupId,donorId,actor='מנהל'){const r=db.prepare('DELETE FROM group_donors WHERE group_id=? AND donor_id=?').run(Number(groupId),Number(donorId));if(r.changes)audit(actor,'הסרת תורם מקבוצה','group',groupId,null,{donorId});return r.changes>0}
 function addGroupMember(groupId,studentId,actor='מנהל'){db.prepare('INSERT OR IGNORE INTO group_members(group_id,student_id) VALUES(?,?)').run(groupId,studentId);audit(actor,'שיוך בחור לקבוצה','group',groupId,null,{studentId});return true}
 function addGroupDonor(groupId,donorId,actor='מנהל'){db.prepare('INSERT OR IGNORE INTO group_donors(group_id,donor_id) VALUES(?,?)').run(groupId,donorId);audit(actor,'שיוך תורם לקבוצה','group',groupId,null,{donorId});return true}
 return {db,audit,createFirstAdmin,addCommitment,listCommitments,listPayments,getReceipt,importDonors,importStudents,importDonations,importWorkbookData,findDonorByCode,listDonors,listArchivedDonors,archiveDonor,restoreDonor,saveDonor,addDonation,listStudents,saveStudent,listStreets,saveStreet,addStreetAlias,listRouteStreets,assignRouteStreet,removeRouteStreet,listRoutePairs,saveRoutePair,removeRoutePair,createYear,listAudit,summary,campaignReport,addUser,login,exportData,importData,listPhoneQueue,enqueuePhone,updatePhoneQueue,restorePhoneDonor,listGroups,createGroup,listGroupMembers,listGroupDonors,addGroupMember,addGroupDonor,removeGroupMember,removeGroupDonor};
}
module.exports={createStore};