(()=>{
 let map=null,marker=null,started=false;
 const $=id=>document.getElementById(id);
 const style={
  version:8,
  sources:{israel:{type:'vector',tiles:['purim-map://tiles/{z}/{x}/{y}.pbf'],minzoom:0,maxzoom:14,attribution:'© OpenStreetMap contributors · ODbL'}},
  layers:[
   {id:'background',type:'background',paint:{'background-color':'#f2f0e9'}},
   {id:'land',type:'fill',source:'israel','source-layer':'land',paint:{'fill-color':'#e6eadf','fill-opacity':0.85}},
   {id:'ocean',type:'fill',source:'israel','source-layer':'ocean',paint:{'fill-color':'#b9dce9'}},
   {id:'water',type:'fill',source:'israel','source-layer':'water_polygons',paint:{'fill-color':'#b9dce9'}},
   {id:'building',type:'fill',source:'israel','source-layer':'buildings',minzoom:14,paint:{'fill-color':'#d6cfc2','fill-outline-color':'#b7ad9e','fill-opacity':0.9}},
   {id:'house-number-points',type:'circle',source:'israel','source-layer':'addresses',minzoom:14,paint:{'circle-radius':2.4,'circle-color':'#8b6546','circle-stroke-color':'#fff','circle-stroke-width':1}},
   {id:'roads-casing',type:'line',source:'israel','source-layer':'streets',paint:{'line-color':'#fff','line-width':['interpolate',['linear'],['zoom'],5,0.4,14,5]}},
   {id:'roads',type:'line',source:'israel','source-layer':'streets',paint:{'line-color':'#e4ad72','line-width':['interpolate',['linear'],['zoom'],5,0.2,14,2.5]}},

  ]
 };
 async function initOfflineMap(){
  const host=$('offlineMap');if(!host)return;
  if(started){if(map)map.resize();return}
  started=true;
  let status;
  try{status=await window.purim.mapStatus()}catch(e){status={available:false}}
  if(!status.available){$('mapStatus').textContent='קובץ המפות לא נמצא במתקין. המפה אינה זמינה.';host.innerHTML='<div class="map-unavailable">חבילת המפות הארצית לא נכללה בבנייה זו. אין חיבור למפת אינטרנט חלופית.</div>';return}
  $('mapStatus').textContent='מפת ישראל מקומית זמינה · עד זום 16';
  if(!window.maplibregl){$('mapStatus').textContent='רכיב תצוגת המפה לא נטען';return}
  map=new maplibregl.Map({container:host,style,center:[34.85,31.45],zoom:7.1,locale:{'AttributionControl.ToggleAttribution':'הצגת ייחוס','AttributionControl.MapFeedback':'משוב על המפה'}});
  map.addControl(new maplibregl.NavigationControl(),'top-left');
  map.addControl(new maplibregl.ScaleControl({unit:'metric'}),'bottom-left');
  map.on('click',e=>{
   const {lng,lat}=e.lngLat;
   if(marker)marker.remove();
   marker=new maplibregl.Marker({color:'#7257d5'}).setLngLat([lng,lat]).addTo(map);
   const features=map.queryRenderedFeatures(e.point);
   const props=features.map(f=>f.properties||{}).find(p=>p.housenumber||p['addr:housenumber']||p.name||p['name:he']);
   const detail=props?Object.entries(props).filter(([k,v])=>v&&(/name|house|addr|street|ref/i.test(k))).slice(0,6).map(([k,v])=>k+': '+v).join(' · '):'לא נמצא מידע כתובת מפורט בנקודה זו';
   $('mapFeatureInfo').textContent='נקודה: '+lat.toFixed(6)+', '+lng.toFixed(6)+' · '+detail;
  });
  map.on('error',e=>{if(e?.error)$('mapStatus').textContent='שגיאה בטעינת נתוני מפה מקומיים';});
  $('mapLocateBtn').onclick=()=>map.flyTo({center:[34.85,31.45],zoom:7.1});
  $('mapSearchBtn').onclick=()=>{
   const v=$('mapSearch').value.trim().split(/[ ,;]+/).map(Number);
   if(v.length!==2||!v.every(Number.isFinite)||v[0]<29||v[0]>34||v[1]<34||v[1]>36){$('mapFeatureInfo').textContent='לחיפוש נקודה, הזן קו רוחב וקו אורך, לדוגמה: 32.08, 34.83';return}
   map.flyTo({center:[v[1],v[0]],zoom:16});
  };
  $('mapSearch').addEventListener('keydown',e=>{if(e.key==='Enter')$('mapSearchBtn').click()});
 }
 window.initOfflineMap=initOfflineMap;
})();