(()=>{
 let map=null,marker=null,started=false;
 const $=id=>document.getElementById(id);
 const style={
  version:8,
  sources:{israel:{type:'vector',tiles:['purim-map://tiles/{z}/{x}/{y}.pbf'],minzoom:0,maxzoom:16,attribution:'© OpenStreetMap contributors · ODbL'}},
  layers:[
   {id:'background',type:'background',paint:{'background-color':'#f2f0e9'}},
   {id:'landcover',type:'fill',source:'israel','source-layer':'landcover',paint:{'fill-color':'#e6eadf','fill-opacity':0.8}},
   {id:'landuse',type:'fill',source:'israel','source-layer':'landuse',paint:{'fill-color':'#e3e9d8','fill-opacity':0.55}},
   {id:'water',type:'fill',source:'israel','source-layer':'water',paint:{'fill-color':'#b9dce9'}},
   {id:'building',type:'fill',source:'israel','source-layer':'building',minzoom:13,paint:{'fill-color':'#d6cfc2','fill-outline-color':'#b7ad9e','fill-opacity':0.9}},
   {id:'roads-casing',type:'line',source:'israel','source-layer':'transportation',paint:{'line-color':'#fff','line-width':['interpolate',['linear'],['zoom'],5,0.4,14,5]}},
   {id:'roads',type:'line',source:'israel','source-layer':'transportation',paint:{'line-color':'#e4ad72','line-width':['interpolate',['linear'],['zoom'],5,0.2,14,2.5]}},
   {id:'road-labels',type:'symbol',source:'israel','source-layer':'transportation_name',minzoom:12,layout:{'text-field':['coalesce',['get','name:he'],['get','name']],'text-font':['Noto Sans Regular'],'text-size':11,'symbol-placement':'line'},paint:{'text-color':'#64564a','text-halo-color':'#fff','text-halo-width':1.2}},
   {id:'places',type:'symbol',source:'israel','source-layer':'place',layout:{'text-field':['coalesce',['get','name:he'],['get','name']],'text-font':['Noto Sans Regular'],'text-size':['interpolate',['linear'],['zoom'],4,10,12,16]},paint:{'text-color':'#34445a','text-halo-color':'#fff','text-halo-width':1.4}},
   {id:'house-numbers',type:'symbol',source:'israel','source-layer':'housenumber',minzoom:16,layout:{'text-field':['get','housenumber'],'text-font':['Noto Sans Regular'],'text-size':10},paint:{'text-color':'#55483e','text-halo-color':'#fff','text-halo-width':1}}
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
   $('mapFeatureInfo').textContent='נקודה שסומנה: קו רוחב '+lat.toFixed(6)+' · קו אורך '+lng.toFixed(6)+' (לחץ שוב כדי להזיז את הסמן).';
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