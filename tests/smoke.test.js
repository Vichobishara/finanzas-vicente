// Prueba básica: carga index.html con datos falsos y revisa que las piezas clave rendericen.
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const hoy=new Date();const per=(d=>{const x=new Date(d);if(x.getDate()>22)x.setMonth(x.getMonth()+1);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')})(hoy);
const DB={
 categorias:[{clave:'comida',techo:250000},{clave:'fijo',techo:200000},{clave:'tech',techo:100000},{clave:'coleccionables',techo:0}],
 periodos:[{periodo:per}],
 cuotas:[{nombre:'Santander',monto_cuota:160000,recurrente:true,tarjeta:'santander'}],
 reglas:[{palabra:'jumbo',categoria_clave:'comida',negocio:false},{palabra:'cartas',categoria_clave:'coleccionables',negocio:false}],
 ajustes:[{clave:'patrimonio',valor:{fintual:13000000,cartas:5000000,eth:1400000}},{clave:'perfil',valor:{nacimiento:'1999-12-03',meta:100000000}}],
 gastos:[{id:1,fecha:hoy.toISOString().slice(0,10),descripcion:'Jumbo',monto:50000,categoria_clave:'comida',tarjeta:'scotiabank',periodo:per,pulldex:false,fuente:'app'}],
 ingresos:[{fecha:'2026-04-30',monto:8240127,base_tributable:9708178,impuesto:1768051},{fecha:'2026-09-29',monto:1970880,base_tributable:1700157,impuesto:29277}]
};
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
 w.scrollTo=()=>{};w.AbortController=AbortController;
 w.fetch=async(u)=>{const k=u.includes('categorias')?'categorias':u.includes('select=periodo')?'periodos':u.includes('cuotas')?'cuotas':u.includes('presupuestos')?null:u.includes('reglas')?'reglas':u.includes('ajustes')?'ajustes':u.includes('gastos')?'gastos':u.includes('ingresos')?'ingresos':null;
  return{ok:true,text:async()=>JSON.stringify(k?DB[k]:[])}};
}});
const d=dom.window.document,t=id=>(d.getElementById(id)||{}).textContent||'';
setTimeout(()=>{
 const checks={
  'hero muestra monto':/\$/.test(t('hero-w')),
  'top categorías':t('top3').includes('Comida'),
  'tarjeta Fintual':t('fin').includes('Fintual'),
  'camino a millonario':t('meta').includes('Camino'),
 };
 dom.window.eval("openCheck()");const m=d.getElementById('a-monto');m.value='30000';dom.window.eval("fmtIn($('a-monto'))");d.getElementById('a-desc').value='cartas';dom.window.eval('evalCheck()');
 checks['¿Me alcanza? bloquea cartas']=t('verdict').includes('bloqueadas');
 let ok=true;for(const[k,v]of Object.entries(checks)){console.log((v?'✅':'❌')+' '+k);if(!v)ok=false}
 process.exit(ok?0:1);
},1200);
