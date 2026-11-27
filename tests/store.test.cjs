const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {openDatabase}=require('../src/db.cjs');
const {createStore}=require('../src/store.cjs');

function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'purim-store-'));
 const db=openDatabase(dir);
 const store=createStore(db);
 t.after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true})});
 return {db,store};
}

test('donor, donation and phone transfer preserve donor data',t=>{
 const {store}=fixture(t);
 const donor=store.saveDonor({firstName:'ישראל',lastName:'ישראלי',city:'ירושלים',street:'יפו',building:'10',phone:'0500000000'});
 assert.ok(donor.id>0);
 store.addDonation({donorId:donor.id,year:2027,amount:180,occasion:'day14'});
 assert.equal(store.listDonors()[0].total_donations,180);
 store.enqueuePhone(donor.id,2027);
 assert.equal(store.listDonors().length,0);
 const queue=store.listPhoneQueue(2027);
 assert.equal(queue.length,1);
 assert.equal(queue[0].donor_id,donor.id);
 store.updatePhoneQueue(queue[0].id,{status:'call_back',caller:'בודק'});
 assert.equal(store.listPhoneQueue(2027)[0].status,'call_back');
 store.restorePhoneDonor(donor.id);
 assert.equal(store.listDonors().length,1);
});

test('campaign groups can be created and linked to students and donors',t=>{
 const {store}=fixture(t);
 const yearId=store.createYear(2027);
 const studentId=store.saveStudent({firstName:'משה',lastName:'כהן'});
 const donor=store.saveDonor({firstName:'דוד',lastName:'לוי',city:'בני ברק',street:'רבי עקיבא'});
 const groupId=store.createGroup({yearId,name:'קבוצה א',city:'בני ברק',area:'מרכז'});
 store.addGroupMember(groupId,studentId);
 store.addGroupDonor(groupId,donor.id);
 const [group]=store.listGroups(yearId);
 assert.equal(group.member_count,1);
 assert.equal(group.donor_count,1);
});

test('full JSON backup restores linked records',t=>{
 const {store}=fixture(t);
 const yearId=store.createYear(2028);
 const donor=store.saveDonor({firstName:'אברהם',lastName:'לוי',city:'בית שמש',street:'נהר הירדן'});
 const student=store.saveStudent({firstName:'יעקב',lastName:'כהן'});
 store.addDonation({donorId:donor.id,year:2028,amount:250});
 const eventId=store.db.prepare('SELECT id FROM collection_events WHERE year_id=? ORDER BY id LIMIT 1').get(yearId).id;
 const groupId=store.createGroup({yearId,name:'קבוצה א',city:'בית שמש',area:'מרכז',eventId});
 store.addGroupMember(groupId,student);
 store.addGroupDonor(groupId,donor.id);
 const streetId=store.db.prepare('INSERT INTO streets(city,name,area) VALUES(?,?,?)').run('בית שמש','נהר הירדן','מרכז').lastInsertRowid;
 const routeId=store.db.prepare('INSERT INTO routes(year_id,event_id,route_code,name) VALUES(?,?,?,?)').run(yearId,eventId,'A1','מסלול א').lastInsertRowid;
 store.db.prepare('INSERT INTO route_streets(route_id,street_id) VALUES(?,?)').run(routeId,streetId);
 store.db.prepare('INSERT INTO route_pairs(route_id,student_a) VALUES(?,?)').run(routeId,student);
 const backup=store.exportData();
 store.saveDonor({firstName:'אחר',lastName:'אדם',city:'ירושלים',street:'הנביאים'});
 store.importData(backup);
 assert.equal(store.listDonors().length,1);
 assert.equal(store.listDonors()[0].first_name,'אברהם');
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM donations').get().n,1);
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM collection_events WHERE year_id=?').get(yearId).n,3);
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM group_members').get().n,1);
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM route_streets').get().n,1);
 assert.equal(store.db.prepare('SELECT COUNT(*) n FROM route_pairs').get().n,1);
});

test('front desk and collector role presets allow initial login',t=>{
 const {store}=fixture(t);
 for(const role of ['frontdesk','collector']){
  const username='user_'+role;
  const id=store.addUser({username,displayName:role,code:'1234',role});
  const user=store.login(id,'1234');
  assert.ok(user.permissions.includes('dashboard:read'));
 }
});
