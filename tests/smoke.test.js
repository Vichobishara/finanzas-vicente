// Prueba básica: carga index.html con datos falsos y revisa que las piezas clave rendericen.
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const hoy=new Date(),HOY=hoy.getFullYear()+'-'+String(hoy.getMonth()+1).padStart(2,'0')+'-'+String(hoy.getDate()).padStart(2,'0');const per=(d=>{const x=new Date(d);if(x.getDate()>22)x.setMonth(x.getMonth()+1);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')})(hoy);
const DB={
 categorias:[{clave:'comida',techo:250000},{clave:'fijo',techo:200000},{clave:'tech',techo:100000},{clave:'coleccionables',techo:0}],
 periodos:[{periodo:per}],
 cuotas:[{nombre:'Santander',monto_cuota:160000,recurrente:true,tarjeta:'santander'},{nombre:'Crossfit',monto_cuota:100000,recurrente:true,tarjeta:'scotiabank'},{nombre:'TOUS',monto_cuota:80800,total_cuotas:3,primer_periodo:per,tarjeta:'scotiabank'}],
 reglas:[{palabra:'jumbo',categoria_clave:'comida',negocio:false},{palabra:'cartas',categoria_clave:'coleccionables',negocio:false}],
 ajustes:[{clave:'patrimonio',valor:{fintual:13000000,colchon:2700000,cartas:5000000,eth:1400000}},{clave:'perfil',valor:{nacimiento:'1999-12-03',meta:100000000,sueldo:1900000}}],
 gastos:[{id:1,fecha:HOY,descripcion:'Jumbo',monto:50000,categoria_clave:'comida',tarjeta:'scotiabank',periodo:per,pulldex:false,fuente:'app',estado:'ok'},
  {id:4,fecha:HOY,descripcion:'Transferencia a Eduardo',monto:1455000,categoria_clave:'otros',tarjeta:'otro',periodo:per,pulldex:false,fuente:'transferencia',estado:'ignorado',destinatario:'Eduardo'},
  {id:5,fecha:HOY,descripcion:'Transferencia a Gustavo',monto:40000,categoria_clave:'otros',tarjeta:'otro',periodo:per,pulldex:false,fuente:'transferencia',estado:'revisar',destinatario:'Gustavo'},
  {id:2,fecha:HOY,descripcion:'Sobres',monto:30000,categoria_clave:'coleccionables',tarjeta:'bci',periodo:per,pulldex:true,fuente:'bci_auto'},
  {id:3,fecha:HOY,descripcion:'Venta: Charizard',monto:-80000,categoria_clave:'coleccionables',tarjeta:'otro',periodo:per,pulldex:true,fuente:'app'}],
 revisar:[{id:5,fecha:HOY,descripcion:'Transferencia a Gustavo',monto:40000,categoria_clave:'otros',tarjeta:'otro',periodo:per,pulldex:false,fuente:'transferencia',estado:'revisar',destinatario:'Gustavo'}],
 ingresos:[{fecha:'2026-04-30',monto:8240127,base_tributable:9708178,impuesto:1768051},{fecha:'2026-09-29',monto:1970880,base_tributable:1700157,impuesto:29277}],
 ahorros:[{fecha:'2026-09-30',monto:239000,destino:'apv',periodo:'2026-09'},{fecha:'2026-09-30',monto:200000,destino:'fintual',periodo:'2026-09'}]
};
function run(url,claveOk){return new Promise(res=>{const heads=[];
 const dom=new JSDOM(html,{url,runScripts:'dangerously',pretendToBeVisual:true,beforeParse(w){
  w.scrollTo=()=>{};w.AbortController=AbortController;
  w.fetch=async(u,o)=>{heads.push(o&&o.headers);(w.CALLS=w.CALLS||[]).push({u,m:o&&o.method,b:o&&o.body});if(u.includes('functions/v1/consejo')){w.__ia=JSON.parse(o.body);return{ok:true,json:async()=>({respuesta:'🔴 **No**, cero cuotas nuevas'})}}if(u.includes('rpc/clave_ok'))return{ok:true,text:async()=>JSON.stringify(claveOk)};
   const k=u.includes('ahorros')?'ahorros':u.includes('categorias')?'categorias':u.includes('select=periodo')?'periodos':u.includes('cuotas')?'cuotas':u.includes('presupuestos')?null:u.includes('reglas')?'reglas':u.includes('ajustes')?'ajustes':u.includes('estado=eq.revisar')?'revisar':u.includes('gastos')?'gastos':u.includes('ingresos')?'ingresos':null;
   const rows=k?DB[k]:[];return{ok:true,text:async()=>JSON.stringify(u.includes('pulldex=eq.true')?rows.filter(g=>g.pulldex):rows)}};
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
 checks['alerta al abrir si te pasaste hoy']=t('sheet').includes('Ojo')&&t('sheet').includes('Hoy te pasaste');
 checks['la alerta no se repite']=w.eval('avisar()')===false;
 w.eval('closeSheet()');
 checks['link guarda la clave y limpia la URL']=w.localStorage.getItem('app-key')==='test123'&&!w.location.hash;
 checks['manda x-app-key']=heads.every(h=>h&&h['x-app-key']==='test123');
 checks['hero muestra monto']=/\$/.test(t('hero-w'));
 checks['top categorías']=t('top3').includes('Comida');
 checks['tarjeta Fintual']=t('fin').includes('Fintual');
 checks['camino a millonario']=t('meta').includes('Camino');
 checks['barra de navegación']=d.body.classList.contains('ready')&&d.querySelectorAll('#nav button[data-t]').length===4&&!!d.querySelector('#nav button.add');
 w.eval("tab('gastos')");checks['pestaña gastos']=!d.querySelector('[data-tab=gastos]').hidden&&d.querySelector('[data-tab=hoy]').hidden;
 w.eval("tab('coach')");checks['coach en pestaña']=t('coach').length>20;w.eval("tab('hoy')");
 checks['coach: hábitos con puntaje']=/\d\/\d/.test(t('coach-hab'))&&t('coach-hab').includes('Todo ordenado')&&t('coach-hab').includes('Mandaste plata a Fintual');
 checks['coach: consejos con botón']=!!d.querySelector('#coach .tip .go');
 checks['gastos: resumen del mes']=t('g-res').includes('de $1.000.000')&&t('g-pend').includes('por revisar')&&t('g-ult').includes('Jumbo');
 checks['plata: plan, APV e impuestos a la vista']=t('fin').includes('Fintual')&&t('apv-c').includes('APV')&&t('tax-c').includes('SII')&&t('meta').includes('Colchón');
 w.eval('openBono()');d.getElementById('b-in').value='$4.000.000';w.eval('calcBono()');checks['bono en su hoja']=t('b-out').includes('APV');w.eval('closeSheet()');
 checks['transferencias por revisar']=t('nudges').includes('1 transferencia por revisar');
 checks['ignoradas y por revisar no descuentan']=w.eval('S.V.gast')===50000;
 w.eval('openRev()');checks['lista por revisar']=t('sheet').includes('Gustavo');
 w.eval('openRevTx(5)');checks['botón no cuenta']=t('sheet').includes('No cuenta');
 w.eval('openCuotas()');checks['cuotas editables']=t('sheet').includes('Agregar cuota');
 w.eval('openCuota()');checks['formulario de cuota']=!!d.getElementById('q-n');
 w.eval("openCheck()");d.getElementById('a-monto').value='30000';w.eval("fmtIn($('a-monto'))");d.getElementById('a-desc').value='cartas';w.eval('evalCheck()');
 checks['¿Me alcanza? bloquea cartas']=t('verdict').includes('bloqueadas');
 checks['veredicto: negritas en línea']=!!d.querySelector('#verdict .vt')&&d.querySelectorAll('#verdict .vt').length===1;
 d.getElementById('a-desc').value='zapatillas';w.eval("S.nc=6;evalCheck()");
 checks['¿Me alcanza? frena cuotas nuevas']=t('verdict').includes('cero cuotas');
 w.eval('askCheck()');await new Promise(r=>setTimeout(r,50));
 checks['Claude en ¿Me alcanza? (misma hoja, con el veredicto)']=d.getElementById('sheet-bg').classList.contains('on')&&d.querySelector('#chk-ia .ia-a b')?.textContent==='No'&&w.__ia.datos.veredicto_app.resultado.includes('cero cuotas');
 w.eval('seguirIA()');
 checks['pregúntale a Claude']=!d.querySelector('[data-tab=coach]').hidden&&d.querySelector('#ia-log .ia-a b')?.textContent==='No'&&w.eval('S.iaH.length')===2&&w.__ia.pregunta.includes('zapatillas')&&w.__ia.pregunta.includes('6 cuotas')&&w.__ia.datos.te_quedan===w.eval('S.V.queda')&&w.__ia.datos.cuotas_y_fijos.length===3;
 checks['chat: vive en una hoja, no en la tarjeta de Coach']=d.getElementById('sheet').classList.contains('chat')&&!d.querySelector('[data-tab=coach] #ia-log');
 w.eval('closeSheet()');checks['chat: Coach ofrece seguir la conversación']=t('ia-open-t').includes('Seguir la conversación');
 w.eval("openNeg()");await new Promise(r=>setTimeout(r,300));
 checks['negocio muestra resultado']=t('sheet').includes('Ganaste')&&t('neg-tot').includes('Vas ganando');
 w.eval("openFin()");checks['ahorro real en sueldos']=t('sheet').includes('Lo que de verdad ahorraste')&&t('sheet').includes('$439.000');
 w.eval("openAhorro()");checks['sheet ahorro']=!!d.getElementById('h-fin');
 w.eval("openPlata()");checks['colchón dinámico']=t('sheet').includes('te faltan')&&!t('sheet').includes('26,7');
 // Arreglos de UX: la hoja se puede cerrar, editar un monto con puntos no lo rompe y una venta sigue siendo venta
 w.eval('openTx(1)');checks['hoja tiene botón cerrar']=!!d.querySelector('#sheet .x');
 d.getElementById('e-monto').value='12.990';w.CALLS=[];w.eval('saveTx(1)');await new Promise(r=>setTimeout(r,50));
 checks['editar monto con puntos']=JSON.parse(w.CALLS.find(c=>c.m==='PATCH').b).monto===12990;
 w.eval('openTx(3)');d.getElementById('e-monto').value='90.000';w.CALLS=[];w.eval('saveTx(3)');await new Promise(r=>setTimeout(r,50));
 checks['editar venta mantiene el signo']=JSON.parse(w.CALLS.find(c=>c.m==='PATCH').b).monto===-90000;
 // Cupo del día fijo: lo que gastas hoy lo baja; si te pasas, se reparte en los días que quedan
 {const V=w.eval('S.V');checks['cupo de hoy descuenta lo de hoy']=Math.round(V.cupoHoy-V.diario)===50000&&Math.round(V.cupoHoy*V.dias)===Math.round(V.queda+50000);
  w.eval("S.gastos.push({id:9,fecha:hoyISO(),descripcion:'Zapatillas',monto:Math.round(S.V.cupoHoy*10),categoria_clave:'otros',tarjeta:'scotiabank',periodo:S.actual,pulldex:false});render()");
  checks['gasto grande: te pasaste hoy y desde mañana']=w.eval('S.V').dias>1?t('hero-w').includes('Hoy te pasaste')&&t('hero-w').includes('desde mañana'):true;
  checks['hero muestra la semana']=t('hero-w').includes('Esta semana');
  w.eval('S.gastos.pop();render()');}
 w.eval('openAdd()');checks['anotar: sugerencias']=d.querySelectorAll('#sheet .sugs button').length>=5;
 d.getElementById('a-monto').value='$5.000';w.CALLS=[];await w.eval('saveAdd()');await new Promise(r=>setTimeout(r,1400));
 const tb=d.querySelector('#toast button');checks['anotar: botón deshacer']=!!tb&&tb.textContent==='Deshacer';
 if(tb){w.CALLS=[];tb.click();await new Promise(r=>setTimeout(r,50));checks['deshacer borra el gasto']=w.CALLS.some(c=>c.m==='DELETE'&&c.u.includes('gastos?id=eq.'))}
 w.eval('openTx(1)');checks['fecha legible']=!/\d{4}-\d{2}-\d{2}/.test(t('sheet'));
 w.eval('openAvisos()');checks['avisos: explica y lista los push']=t('sheet').includes('Avisos')&&t('sheet').includes('Lunes 9:00');
 w.eval("S.aj.fintual_pausa={hasta:'2099-01-01'};render()");checks['pausa Fintual: sin nudge ni promesa de Fintual']=!t('nudges').includes('Fintual')&&!t('hero-w').includes('a Fintual')&&t('fin').includes('primero las tarjetas');
 w.eval("delete S.aj.fintual_pausa;render()");
 w.eval('closeSheet();openAll()');d.querySelector('#sheet .crow[onclick*="openCat"]').click();
 checks['hoja: ‹ aparece al entrar a una categoría']=!!d.querySelector('#sheet .bk')&&!t('sheet').includes('Toca una categoría');
 d.querySelector('#sheet .bk').click();checks['hoja: ‹ vuelve a la lista']=t('sheet').includes('Toca una categoría')&&!d.querySelector('#sheet .bk');
 w.eval('closeSheet();openAll()');checks['hoja: sin ‹ si se abre de cero']=!d.querySelector('#sheet .bk');
 w.eval('closeSheet()');checks['hoy: tu semana con 7 días']=d.querySelectorAll('#sem .sem-d').length===7&&t('sem').includes('Hoy llevas');
 w.eval('closeSheet()');checks['cerrar hoja']=!d.getElementById('sheet-bg').classList.contains('on')&&!d.body.classList.contains('lock');
 d.querySelector('.mes-b').click();checks['tocar el mes abre el selector con fechas']=d.getElementById('sheet').textContent.includes('23 ')&&d.getElementById('sheet').textContent.includes('este mes');w.eval('closeSheet()');
 checks['fecha de hoy arriba']=/\d/.test(t('greet'));
 let ok=true;for(const[k,v]of Object.entries(checks)){console.log((v?'✅':'❌')+' '+k);if(!v)ok=false}
 process.exit(ok?0:1);
})();
