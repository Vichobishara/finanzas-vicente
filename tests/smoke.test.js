// Prueba básica: carga index.html con datos falsos y revisa que las piezas clave rendericen.
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const hoy=new Date();const per=(d=>{const x=new Date(d);if(x.getDate()>22)x.setMonth(x.getMonth()+1);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')})(hoy);
const DB={
 categorias:[{clave:'comida',techo:250000},{clave:'fijo',techo:200000},{clave:'tech',techo:100000},{clave:'coleccionables',techo:0}],
 periodos:[{periodo:per}],
 cuotas:[{nombre:'Santander',monto_cuota:160000,recurrente:true,tarjeta:'santander'},{nombre:'Crossfit',monto_cuota:100000,recurrente:true,tarjeta:'scotiabank'},{nombre:'TOUS',monto_cuota:80800,total_cuotas:3,primer_periodo:per,tarjeta:'scotiabank'}],
 reglas:[{palabra:'jumbo',categoria_clave:'comida',negocio:false},{palabra:'cartas',categoria_clave:'coleccionables',negocio:false}],
 ajustes:[{clave:'patrimonio',valor:{fintual:13000000,colchon:2700000,cartas:5000000,eth:1400000}},{clave:'perfil',valor:{nacimiento:'1999-12-03',meta:100000000,sueldo:1900000}}],
 gastos:[{id:1,fecha:hoy.toISOString().slice(0,10),descripcion:'Jumbo',monto:50000,categoria_clave:'comida',tarjeta:'scotiabank',periodo:per,pulldex:false,fuente:'app'},
  {id:2,fecha:hoy.toISOString().slice(0,10),descripcion:'Sobres',monto:30000,categoria_clave:'coleccionables',tarjeta:'bci',periodo:per,pulldex:true,fuente:'bci_auto'},
  {id:3,fecha:hoy.toISOString().slice(0,10),descripcion:'Venta: Charizard',monto:-80000,categoria_clave:'coleccionables',tarjeta:'otro',periodo:per,pulldex:true,fuente:'app'}],
 ingresos:[{fecha:'2026-04-30',monto:8240127,base_tributable:9708178,impuesto:1768051},{fecha:'2026-09-29',monto:1970880,base_tributable:1700157,impuesto:29277}],
 ahorros:[{fecha:'2026-09-30',monto:239000,destino:'apv',periodo:'2026-09'},{fecha:'2026-09-30',monto:200000,destino:'fintual',periodo:'2026-09'}]
};
function run(url,claveOk){return new Promise(res=>{const heads=[];
 const dom=new JSDOM(html,{url,runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
  w.scrollTo=()=>{};w.AbortController=AbortController;
  w.fetch=async(u,o)=>{heads.push(o&&o.headers);if(u.includes('rpc/clave_ok'))return{ok:true,text:async()=>JSON.stringify(claveOk)};
   const k=u.includes('ahorros')?'ahorros':u.includes('categorias')?'categorias':u.includes('select=periodo')?'periodos':u.includes('cuotas')?'cuotas':u.includes('presupuestos')?null:u.includes('reglas')?'reglas':u.includes('ajustes')?'ajustes':u.includes('gastos')?'gastos':u.includes('ingresos')?'ingresos':null;
   return{ok:true,text:async()=>JSON.stringify(k?DB[k]:[])}};
 }});setTimeout(()=>res({dom,heads}),1200)})}
(async()=>{
 const checks={};
 // Sin clave: pantalla de clave, sin pedir datos
 {const {dom,heads}=await run('https://finanzas-vicente.vercel.app/',true);const t=dom.window.document.getElementById('hero-w').textContent;
  checks['sin clave muestra candado']=t.includes('clave')&&heads.length===0;}
 // Clave mala
 {const {dom}=await run('https://finanzas-vicente.vercel.app/#k=mala',false);checks['clave mala avisa']=dom.window.document.getElementById('hero-w').textContent.includes('no funciona');}
 // Clave buena por link
 const {dom,heads}=await run('https://finanzas-vicente.vercel.app/#k=test123',true);
 const w=dom.window,d=w.document,t=id=>(d.getElementById(id)||{}).textContent||'';
 checks['link guarda la clave y limpia la URL']=w.localStorage.getItem('app-key')==='test123'&&!w.location.hash;
 checks['manda x-app-key']=heads.every(h=>h&&h['x-app-key']==='test123');
 checks['hero muestra monto']=/\$/.test(t('hero-w'));
 checks['top categorías']=t('top3').includes('Comida');
 checks['tarjeta Fintual']=t('fin').includes('Fintual');
 checks['camino a millonario']=t('meta').includes('Camino');
 w.eval("openCheck()");d.getElementById('a-monto').value='30000';w.eval("fmtIn($('a-monto'))");d.getElementById('a-desc').value='cartas';w.eval('evalCheck()');
 checks['¿Me alcanza? bloquea cartas']=t('verdict').includes('bloqueadas');
 d.getElementById('a-desc').value='zapatillas';w.eval("S.nc=6;evalCheck()");
 checks['¿Me alcanza? frena cuotas nuevas']=t('verdict').includes('cero cuotas');
 w.eval("openNeg()");await new Promise(r=>setTimeout(r,300));
 checks['negocio muestra resultado']=t('sheet').includes('Ganaste')&&t('neg-tot').includes('Vas ganando');
 w.eval("openFin()");checks['ahorro real en sueldos']=t('sheet').includes('Lo que de verdad ahorraste')&&t('sheet').includes('$439.000');
 w.eval("openAhorro()");checks['sheet ahorro']=!!d.getElementById('h-fin');
 w.eval("openPlata()");checks['colchón dinámico']=t('sheet').includes('te faltan')&&!t('sheet').includes('26,7');
 let ok=true;for(const[k,v]of Object.entries(checks)){console.log((v?'✅':'❌')+' '+k);if(!v)ok=false}
 process.exit(ok?0:1);
})();
