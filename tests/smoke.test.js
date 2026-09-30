// Prueba básica: carga index.html con datos falsos y revisa que las piezas clave rendericen.
const {JSDOM}=require('jsdom');const fs=require('fs');const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const hoy=new Date(),HOY=hoy.getFullYear()+'-'+String(hoy.getMonth()+1).padStart(2,'0')+'-'+String(hoy.getDate()).padStart(2,'0');const per=(d=>{const x=new Date(d);if(x.getDate()>22)x.setMonth(x.getMonth()+1);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')})(hoy);
const DB={
 categorias:[{clave:'comida',techo:250000},{clave:'fijo',techo:200000},{clave:'tech',techo:100000},{clave:'coleccionables',techo:0}],
 periodos:[{periodo:per}],
 cuotas:[{nombre:'Santander',monto_cuota:160000,recurrente:true,tarjeta:'santander'},{nombre:'Crossfit',monto_cuota:100000,recurrente:true,tarjeta:'scotiabank'},{id:7,nombre:'TOUS',monto_cuota:80800,total_cuotas:3,primer_periodo:per,tarjeta:'scotiabank'}],
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
  w.fetch=async(u,o)=>{heads.push(o&&o.headers);(w.CALLS=w.CALLS||[]).push({u,m:o&&o.method,b:o&&o.body});if(u.includes('functions/v1/cartola')){w.__cart=JSON.parse(o.body);return{ok:true,json:async()=>({fecha_cartola:'',nota:'',cuotas:[{nombre:'Falabella iPhone',monto_cuota:95000,cuota_actual:4,total_cuotas:12,banco:'Scotiabank'},{nombre:'TOUS',monto_cuota:80800,cuota_actual:1,total_cuotas:3,banco:'Scotiabank'}]})}}if(u.includes('functions/v1/acceso_google')){const t=(o.headers.Authorization||'').split(' ')[1];return{ok:true,json:async()=>t==='tok-vicho'?{clave:'test123',nombre:'Vicente Bishara'}:{error:'no_invitado',email:'amigo@gmail.com'}}}if(u.includes('functions/v1/consejo')){w.__ia=JSON.parse(o.body);return{ok:true,json:async()=>({respuesta:'🔴 **No**, cero cuotas nuevas'})}}if(u.includes('rpc/clave_ok'))return{ok:true,text:async()=>JSON.stringify(claveOk)};
   const k=u.includes('ahorros')?'ahorros':u.includes('categorias')?'categorias':u.includes('select=periodo')?'periodos':u.includes('cuotas')?'cuotas':u.includes('presupuestos')?null:u.includes('reglas')?'reglas':u.includes('ajustes')?'ajustes':u.includes('estado=eq.revisar')?'revisar':u.includes('gastos')?'gastos':u.includes('ingresos')?'ingresos':null;
   const rows=k?DB[k]:[];return{ok:true,text:async()=>JSON.stringify(u.includes('pulldex=eq.true')?rows.filter(g=>g.pulldex):rows)}};
 }});setTimeout(()=>res({dom,heads}),1200)})}
(async()=>{
 const checks={};
 // Sin clave: pantalla de clave, sin pedir datos
 {const {dom,heads}=await run('https://finanzas-vicente.vercel.app/',true);const t=dom.window.document.getElementById('login').textContent;
  checks['sin clave muestra candado']=t.includes('clave')&&heads.length===0;}
 // Candado con botón de Google
 {const {dom}=await run('https://finanzas-vicente.vercel.app/',true);checks['candado ofrece Continuar con Google']=dom.window.document.getElementById('login').textContent.includes('Continuar con Google');}
 // Vuelta de Google: cuenta permitida → guarda la clave y limpia la URL
 {const {dom}=await run('https://finanzas-vicente.vercel.app/#access_token=tok-vicho&token_type=bearer',true);const w=dom.window;
  checks['Google: tu cuenta entra y guarda la clave']=w.localStorage.getItem('app-key')==='test123'&&!w.location.hash&&!w.document.getElementById('login').classList.contains('on')&&w.document.body.classList.contains('ready');}
 // Vuelta de Google: cuenta que no está invitada
 {const {dom}=await run('https://finanzas-vicente.vercel.app/#access_token=tok-otro',true);const w=dom.window;
  checks['Google: cuenta no invitada no entra']=!w.localStorage.getItem('app-key')&&w.document.getElementById('login').textContent.includes('Pídele acceso a Vicho');}
 // Pantalla de entrada: Face ID primero; si este aparato no tiene Face ID, Google primero
 {const {dom}=await run('https://finanzas-vicente.vercel.app/',true);const d=dom.window.document,b=[...d.querySelectorAll('#login .lg-b')];
  checks['entrada: pantalla completa con Face ID primero']=d.getElementById('login').classList.contains('on')&&b[0].id==='fid-btn'&&b[0].classList.contains('p');
  dom.window.localStorage.setItem('fid-no','1');dom.window.eval('lock()');const b2=[...d.querySelectorAll('#login .lg-b')];
  checks['entrada: sin Face ID en el aparato, Google va primero']=b2[0].id==='g-btn'&&b2[0].classList.contains('p');
  dom.window.localStorage.setItem('nombre','Vicente');dom.window.eval("lock('Esa clave no funciona','mal')");
  checks['entrada: saluda por nombre y muestra el error']=d.getElementById('login').textContent.includes('Hola de nuevo')&&!!d.querySelector('#login .lg-msg.mal');}
 // Clave mala
 {const {dom}=await run('https://finanzas-vicente.vercel.app/#k=mala',false);checks['clave mala avisa']=dom.window.document.getElementById('login').textContent.includes('no funciona');}
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
 w.eval('openCuotas()');checks['cuotas: cuántas quedan y cuánto falta']=t('sheet').includes('te quedan 2 después de esta')&&t('sheet').includes('por pagar en cuotas')&&t('sheet').includes('$242.400')&&t('sheet').includes('Fijos todos los meses')&&t('sheet').includes('a mano');
 w.eval("revisarCartola({fecha_cartola:'',cuotas:[{nombre:'Falabella iPhone',monto_cuota:95000,cuota_actual:4,total_cuotas:12,banco:'Scotiabank'},{nombre:'TOUS',monto_cuota:80800,cuota_actual:1,total_cuotas:3,banco:'Scotiabank'}]})");
 checks['cartola: revisar, la repetida viene desmarcada']=t('sheet').includes('Encontré 2')&&t('sheet').includes('ya la tienes')&&t('sheet').includes('Guardar 1 cuota');
 w.CALLS=[];await w.eval('guardarCartola()');{const c=w.CALLS.find(c=>c.m==='POST'&&c.u.includes('/cuotas'));const b=c&&JSON.parse(c.b);
  checks['cartola: guarda solo la nueva con su primer mes']=!!b&&b.length===1&&b[0].nombre==='Falabella iPhone'&&b[0].tarjeta==='scotiabank'&&b[0].primer_periodo===w.eval("addM(S.actual,-3)");}
 w.eval('closeSheet()');
 w.eval('openCuota()');checks['formulario de cuota']=!!d.getElementById('q-n');
 w.eval("openCheck()");d.getElementById('a-monto').value='30000';w.eval("fmtIn($('a-monto'))");d.getElementById('a-desc').value='cartas';w.eval('evalCheck()');
 checks['¿Me alcanza? bloquea cartas']=t('verdict').includes('bloqueadas');
 checks['veredicto: negritas en línea']=!!d.querySelector('#verdict .vt')&&d.querySelectorAll('#verdict .vt').length===1;
 d.getElementById('a-desc').value='zapatillas';w.eval("S.nc=6;evalCheck()");
 checks['¿Me alcanza? frena cuotas nuevas']=t('verdict').includes('cero cuotas');
 w.eval('askCheck()');await new Promise(r=>setTimeout(r,50));
 checks['Claude en ¿Me alcanza? (misma hoja, con el veredicto)']=d.getElementById('sheet-bg').classList.contains('on')&&d.querySelector('#chk-ia .ia-a b')?.textContent==='No'&&w.__ia.datos.veredicto_app.resultado.includes('cero cuotas');
 w.eval('seguirIA()');await new Promise(r=>setTimeout(r,300));
 checks['pregúntale a Claude']=d.getElementById('chat').classList.contains('on')&&d.querySelector('#ia-log .ia-a b')?.textContent==='No'&&w.eval('S.iaH.length')===2&&w.__ia.pregunta.includes('zapatillas')&&w.__ia.pregunta.includes('6 cuotas')&&w.__ia.datos.te_quedan===w.eval('S.V.queda')&&w.__ia.datos.cuotas_y_fijos.length===3;
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
 w.eval('closeSheet()');checks['cerrar hoja']=!d.getElementById('sheet-bg').classList.contains('on')&&!d.body.classList.contains('lock');
 d.querySelector('.mes-b').click();checks['tocar el mes abre el selector con fechas']=d.getElementById('sheet').textContent.includes('23 ')&&d.getElementById('sheet').textContent.includes('este mes');w.eval('closeSheet()');
 checks['fecha de hoy arriba']=/\d/.test(t('greet'));
 // Lista de deseos: anotar desde ¿Me alcanza?, preguntar a las 72 horas, aguantarse suma a "te aguantaste"
 w.eval('openCheck()');d.getElementById('a-monto').value='$300.000';d.getElementById('a-desc').value='iPad';w.eval('evalCheck()');
 w.CALLS=[];d.querySelector('[onclick="desear()"]').click();await new Promise(r=>setTimeout(r,50));
 {const c=w.CALLS.find(c=>c.m==='POST'&&c.u.includes('ajustes'));const b=c&&JSON.parse(c.b);checks['deseos: se anota con 72 horas']=!!b&&b.clave==='deseos'&&b.valor[0].que==='iPad'&&b.valor[0].estado==='espera';}
 w.eval("S.aj.deseos=[{id:1,que:'Audífonos',monto:120000,desde:new Date(Date.now()-80*36e5).toISOString(),estado:'espera'},{id:2,que:'Polera',monto:20000,desde:new Date().toISOString(),estado:'espera'}];renderCoach()");
 checks['deseos: pregunta a las 72 horas']=t('deseos-c').includes('¿Todavía lo quieres?')&&t('deseos-c').includes('Te pregunto en')&&t('coach').includes('Pasaron 72 horas');
 w.CALLS=[];await w.eval('deseoNo(1)');await new Promise(r=>setTimeout(r,50));
 checks['deseos: aguantarse suma a te aguantaste']=w.CALLS.some(c=>c.b&&c.b.includes('"evitado"')&&c.b.includes('120000'))&&w.eval("S.aj.deseos.find(x=>x.id===1).estado")==='aguantado';
 // Fondo gadgets
 w.eval("S.aj.fondo={que:'iPad',meta:600000,ahorrado:150000,mensual:50000};renderFondo()");
 checks['fondo gadgets: cuánto falta y cuándo llegas']=t('fondo-c').includes('Te faltan $450.000')&&t('fondo-c').includes('Apartando $50.000 al mes llegas en');
 w.eval("S.aj.fondo=null;renderFondo()");checks['fondo gadgets: invita a crearlo']=t('fondo-c').includes('Crear mi fondo');
 // Por pagar
 w.eval("S.aj.deudas=[{id:1,que:'PSA',monto:490000,nota:'US$510'}];renderDeudas()");
 checks['por pagar: muestra la deuda y el total']=t('deudas-c').includes('PSA')&&t('deudas-c').includes('$490.000')&&t('deudas-c').includes('La pagué');
 // Plata compacta: filas cortas que abren el detalle
 w.eval("S.aj.fondo={que:'iPhone Duo',meta:2100000,ahorrado:300000,mensual:0};S.aj.deudas=[{id:1,que:'PSA',monto:490000}];render()");
 checks['plata compacta: fondo, deudas, APV e impuestos en filas']=t('metas').includes('iPhone Duo')&&t('metas').includes('$300.000 de $2.100.000')&&t('metas').includes('$490.000')&&t('metas').includes('Impuestos');
 w.eval("verCard('deudas-c')");checks['plata compacta: la fila abre el detalle']=t('sheet').includes('La pagué');w.eval('closeSheet()');
 // Guía para ponerla en la pantalla de inicio
 w.eval('guiaInicio()');checks['guía inicio: pasos y no está en la tienda']=t('sheet').includes('Ponla en tu pantalla de inicio')&&t('sheet').includes('No la busques en la')&&d.querySelectorAll('#sheet .step').length>=3;w.eval('closeSheet()');
 // Bienvenida de cuenta nueva
 w.eval("bienvenida()");d.getElementById('bv-nom').value='Pedro Pérez';d.getElementById('bv-edad').value='58';w.eval('bv1()');
 d.getElementById('bv-sue').value='$1.500.000';w.eval('bv2()');
 checks['bienvenida: sugiere presupuesto 80% y dice cuánto ahorra']=d.getElementById('bv-ppto').value==='$1.200.000'&&t('sheet').includes('Ahorrarías $300.000')&&t('sheet').includes('Paso 3 de 3');
 w.CALLS=[];await w.eval('bv3()');await new Promise(r=>setTimeout(r,80));
 {const c=w.CALLS.find(c=>c.u.includes('ajustes')&&c.b&&c.b.includes('perfil'));checks['bienvenida: guarda perfil y presupuesto']=!!c&&c.b.includes('Pedro')&&c.b.includes('1500000')&&w.CALLS.some(c=>c.u.includes('presupuestos')&&c.b.includes('1200000'));}
 w.eval('closeSheet()');
 // El chat recuerda la conversación en este aparato
 checks['chat: se guarda y se puede empezar de nuevo']=JSON.parse(w.localStorage.getItem('chat-h')||'[]').length===2&&(w.eval('nuevoChat()'),w.eval('S.iaH.length')===0&&d.querySelectorAll('#ia-sug .chip').length===5);
 // Teclado abierto en iPhone: el chat se ajusta a la parte visible
 w.eval("Object.defineProperty(window,'visualViewport',{value:{height:400,offsetTop:250,addEventListener(){}},configurable:true});Object.defineProperty(window,'innerHeight',{value:844,configurable:true});openChat();chatVV()");
 {const c=d.getElementById('chat');checks['chat: con teclado queda arriba del teclado']=c.classList.contains('kb')&&c.style.top==='256px'&&c.style.height==='388px';}
 w.eval('closeChat()');
 w.eval('closeSheet()');d.querySelector('[onclick="guiaAP(0)"]').click();checks['guía Apple Pay abre en Coach']=t('sheet').includes('anotadas solas');
 d.querySelector('#sheet .gu .btn').click();d.querySelector('#sheet .gu .btn').click();checks['guía Apple Pay avanza sin apilar ‹ (vista previa sin link)']=t('sheet').includes('Paso 2 de 8')&&!!d.querySelector('#sheet .tap')&&!d.querySelector('#sheet .bk');
 d.querySelector('#sheet .gu .alt').click();checks['guía Apple Pay: atrás']=t('sheet').includes('Paso 1 de 8');
 w.eval('closeSheet()');
 // Invitar: solo aparece para la cuenta de Vicho
 w.eval('S.admin=false;renderCoach()');const invOff=d.getElementById('m-inv').style.display==='none';
 w.eval('S.admin=true;renderCoach()');await w.eval('openInvitar()');
 checks['invitar: solo admin y abre la hoja']=invOff&&d.getElementById('m-inv').style.display===''&&t('sheet').includes('Invitar a alguien');w.eval('closeSheet()');
 // Cuadrar con la cartola: salta las compras en cuotas y ofrece agregar las que faltan
 await w.eval("cuadrar({compras:[{fecha:'2026-09-29',comercio:'Tienda Rara XYZ',monto:4817,en_cuotas:false},{fecha:'2026-09-28',comercio:'Falabella TV',monto:99990,en_cuotas:true}]},'scotiabank')");
 checks['cuadrar: muestra lo que falta y salta cuotas']=t('sheet').includes('Tienda Rara XYZ')&&!t('sheet').includes('Falabella TV')&&t('sheet').includes('Agregar 1');
 w.CALLS=[];await w.eval('guardarCuadrar()');await new Promise(r=>setTimeout(r,50));
 checks['cuadrar: guarda lo marcado']=w.CALLS.some(c=>c.m==='POST'&&c.u.includes('gastos')&&c.b.includes('Tienda Rara XYZ')&&c.b.includes('scotiabank'));
 // El chat propone anotar un gasto y lo hace solo si confirmas
 w.eval("$('ia-log').insertAdjacentHTML('beforeend',accionHTML({tipo:'anotar_gasto',monto:5000,descripcion:'Almuerzo'}))");
 w.CALLS=[];await w.eval("hacerAccion(document.querySelector('.ia-acc').id)");await new Promise(r=>setTimeout(r,60));
 checks['chat: anota el gasto al confirmar']=w.CALLS.some(c=>c.m==='POST'&&c.u.includes('gastos')&&c.b.includes('Almuerzo')&&c.b.includes('5000'))&&t('ia-log').includes('Anotado');
 let ok=true;for(const[k,v]of Object.entries(checks)){console.log((v?'✅':'❌')+' '+k);if(!v)ok=false}
 process.exit(ok?0:1);
})();
