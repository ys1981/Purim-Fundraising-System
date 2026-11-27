const HEADERS=[
 ['title','תואר'],['firstName','שם פרטי'],['lastName','שם משפחה'],['city','עיר'],['street','רחוב'],['building','מספר בניין'],['entrance','כניסה'],['apartment','דירה'],['floor','קומה'],['area','אזור / שכונה'],['groupName','קבוצה'],['printNotes','הערות להדפסה'],['privateNotes','הערות פנימיות'],['phone','טלפון'],['email','דוא״ל'],['collectionTime','מועד איסוף'],['doNotContact','לא ליצור קשר']
];
function encodeCell(value){const s=String(value??'');return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function stringifyCsv(rows){return '\uFEFF'+[HEADERS.map(x=>x[1]).join(','),...rows.map(row=>HEADERS.map(([key])=>encodeCell(row[key])).join(','))].join('\r\n')}
function parseCsv(input){
 const text=String(input??'').replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++}else if(ch==='"')quoted=false;else cell+=ch;continue}
 if(ch==='"'&&cell===''){quoted=true;continue}if(ch===','){row.push(cell);cell='';continue}if(ch==='\n'){row.push(cell.replace(/\r$/,''));if(row.some(v=>v.trim()!==''))rows.push(row);row=[];cell='';continue}cell+=ch}
 if(quoted)throw Error('קובץ CSV מכיל מרכאות לא סגורות');row.push(cell.replace(/\r$/,''));if(row.some(v=>v.trim()!==''))rows.push(row);
 return rows;
}
function parseDonorCsv(input){
 const rows=parseCsv(input);if(rows.length<2)throw Error('קובץ הייבוא ריק או חסרה בו שורת נתונים');
 const labels=new Map(HEADERS.map(([key,label])=>[label,key]));const header=rows[0].map(v=>v.trim());const indexes={};
 header.forEach((label,i)=>{const key=labels.get(label);if(key)indexes[key]=i});
 for(const key of ['firstName','lastName','city','street'])if(indexes[key]===undefined)throw Error('חסרה עמודה נדרשת: '+HEADERS.find(x=>x[0]===key)[1]);
 return rows.slice(1).map((cells,index)=>{const out={};for(const [key] of HEADERS)out[key]=cells[indexes[key]]??'';out.doNotContact=/^(1|כן|true|yes)$/i.test(String(out.doNotContact).trim())?1:0;return out}).filter(x=>Object.values(x).some(v=>String(v).trim()!==''));
}
function templateCsv(){return stringifyCsv([])}
module.exports={HEADERS,stringifyCsv,parseCsv,parseDonorCsv,templateCsv};
