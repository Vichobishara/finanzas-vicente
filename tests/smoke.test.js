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
  w.fetch=async(u,o)=>{heads.push(o&&o.headers);(w.CALLS=w.CALLS||[]).push({u,m:o&&o.method,b:o&&o.body});if(u.includes('functions/v1/cartola')){w.__cart=JSON.parse(o.body);return{ok:true,json:async()=>({fecha_cartola:'',nota:'',cuotas:[{nombre:'Falabella iPhone',monto_cuota:95000,cuota_actual:4,total_cuotas:12,banco:'Scotiabank'},{nombre:'TOUS',monto_cuota:80800,cuota_actual:1,total_cuotas:3,banco:'Scotiabank'}]})}}if(u.includes('functions/v1/acceso_google')){const t=(o.headers.Authorization||'').split(' ')[1];return{ok:true,json:async()=>t==='tok-vicho'?{clave:'test123',nombre:'Vicente Bishara'}:{error:'no_invitado',email:'amigo@gmail.com'}}}if(u.includes('functions/v1/fintual')){const b=JSON.parse(o.body);w.__fin=b;return{ok:true,status:b.password==='mala'?401:200,json:async()=>b.password==='mala'?{error:'credenciales'}:{ok:true,anotados:b.accion==='sync'?300000:0}}}if(u.includes('functions/v1/consejo')){w.__ia=JSON.parse(o.body);return{ok:true,json:async()=>({respuesta:'🔴 **No**, cero cuotas nuevas'})}}if(u.includes('rpc/clave_ok'))return{ok:true,text:async()=>JSON.stringify(claveOk)};
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
 checks['Hoy muestra lo anotado hoy']=t('hoy-g').includes('Hoy anotaste')&&t('hoy-g').includes('Jumbo')&&!t('hoy-g').includes('Sobres');
 checks['top categorías']=t('top3').includes('Comida');
 checks['tarjeta Fintual']=t('fin').includes('Fintual');
 checks['camino a millonario']=t('meta').includes('Camino');
 checks['barra de navegación']=d.body.classList.contains('ready')&&d.querySelectorAll('#nav button[data-t]').length===5&&!d.querySelector('#nav button.add')&&!!d.querySelector('[data-tab="gastos"] .tab-h button');
 w.eval("tab('gastos')");checks['pestaña gastos']=!d.querySelector('[data-tab=gastos]').hidden&&d.querySelector('[data-tab=hoy]').hidden;
 w.eval("tab('coach')");checks['coach en pestaña']=t('coach').length>20;w.eval("tab('hoy')");
 checks['coach: hábitos con puntaje, primero lo pendiente']=/\d\/\d/.test(t('coach-hab'))&&(t('coach-hab').includes('que ya cumples')||t('coach-hab').includes('Todo ordenado'))&&(w.eval('S.habAll=1;renderCoach()'),t('coach-hab').includes('Todo ordenado')&&t('coach-hab').includes('Mandaste plata a Fintual'));w.eval('S.habAll=0;renderCoach()');
 checks['coach: consejos con botón']=!!d.querySelector('#coach .tip .go');
 checks['gastos: resumen del mes']=t('g-res').includes('de $1.000.000')&&t('g-pend').includes('por revisar')&&t('g-ult').includes('Jumbo');
 checks['plata: plan, APV e impuestos a la vista']=t('fin').includes('Fintual')&&t('apv-c').includes('APV')&&t('tax-c').includes('SII')&&t('meta').includes('Colchón');
 w.eval('openBono()');d.getElementById('b-in').value='$4.000.000';w.eval('calcBono()');checks['bono: cuotas, tarjeta y el resto a Fintual']=t('b-out').includes('Adelantar todas las cuotas')&&t('b-out').includes('Pagar la tarjeta')&&t('b-out').includes('Risky');w.eval('closeSheet()');
 checks['transferencias por revisar']=t('nudges').includes('1 transferencia por revisar');
 checks['ignoradas y por revisar no descuentan']=w.eval('S.V.gast')===50000;
 w.eval('openRev()');checks['lista por revisar']=t('sheet').includes('Gustavo');
 w.eval('openRevTx(5)');checks['botón no cuenta']=t('sheet').includes('No cuenta');
 w.eval('openCuotas()');checks['cuotas: cuántas quedan y cuánto falta']=t('sheet').includes('te quedan 2 después de esta')&&t('sheet').includes('por pagar')&&t('sheet').includes('$242.400')&&t('sheet').includes('Fijos todos los meses')&&t('sheet').includes('a mano');
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
  checks['gasto grande: te pasaste hoy y desde mañana']=w.eval('S.V').dias>1?t('hero-w').includes('Hoy te pasaste')&&t('hero-w').includes('Desde mañana puedes gastar')&&d.querySelector('#hero-w .h-amt').textContent.includes(w.eval('fmt(S.V.manana)')):true;
  checks['hero muestra la semana']=t('hero-w').includes('Esta semana');
  checks['hero corto: semana y hasta el 22, sin desglose']=t('hero-w').includes('Hasta el 22 te quedan')&&!t('hero-w').includes('Plata del mes');
  w.eval('S.gastos.pop();render()');}
 w.eval('openAdd()');checks['anotar: sugerencias']=d.querySelectorAll('#sheet .sugs button').length>=5;
 d.getElementById('a-monto').value='$5.000';w.CALLS=[];await w.eval('saveAdd()');await new Promise(r=>setTimeout(r,1400));
 const tb=d.querySelector('#toast button');checks['anotar: botón deshacer']=!!tb&&tb.textContent==='Deshacer';
 if(tb){w.CALLS=[];tb.click();await new Promise(r=>setTimeout(r,50));checks['deshacer borra el gasto']=w.CALLS.some(c=>c.m==='DELETE'&&c.u.includes('gastos?id=eq.'))}
 w.eval('openTx(1)');checks['fecha legible']=!/\d{4}-\d{2}-\d{2}/.test(t('sheet'));
 w.eval('openAvisos()');checks['avisos: explica y lista los push']=t('sheet').includes('Avisos')&&t('sheet').includes('Lunes 9:00');
 checks['hoy: pasado del mes dice por qué categoría']=/Más que nada por/.test(t('hero-w'))||w.eval('S.V.queda>=0');
 w.eval("S.aj.fintual_pausa={hasta:'2099-01-01'};render()");checks['pausa Fintual: sin nudge ni promesa de Fintual']=!t('nudges').includes('Fintual')&&!t('hero-w').includes('a Fintual')&&t('fin').includes('Primero las tarjetas');
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
 checks['plata compacta: lo que tienes y debes, metas y herramientas en una fila']=t('metas').includes('iPhone Duo')&&t('metas').includes('$300.000 de $2.100.000')&&t('metas').includes('Lo que debes')&&t('metas').includes('Tus metas')&&t('metas').includes('Herramientas')&&(w.eval('openHerr()'),t('sheet').includes('Impuestos')&&t('sheet').includes('bono o comisión'))&&(w.eval('closeSheet()'),true);
 w.eval("verCard('deudas-c')");checks['plata compacta: la fila abre el detalle']=t('sheet').includes('La pagué');w.eval('closeSheet()');
 // Guía para ponerla en la pantalla de inicio
 w.eval('guiaInicio()');checks['guía inicio: pasos y no está en la tienda']=t('sheet').includes('Ponla en tu pantalla de inicio')&&t('sheet').includes('No la busques en la')&&d.querySelectorAll('#sheet .step').length>=3;w.eval('closeSheet()');
 // Bienvenida de cuenta nueva
 w.eval("bienvenida()");d.getElementById('bv-nom').value='Pedro Pérez';d.getElementById('bv-edad').value='58';w.eval('bv1()');
 d.getElementById('bv-sue').value='$1.500.000';w.eval('bv2()');
 checks['bienvenida: paso 3 de 6 pregunta los fijos']=t('sheet').includes('Paso 3 de 6')&&t('sheet').includes('Arriendo');
 d.getElementById('bvf-arriendo').value='$400.000';d.getElementById('bvf-cel').value='$25.000';w.eval('bv3()');
 d.getElementById('bv-cuo').value='$80.000';w.eval('bv4()');
 d.getElementById('bv-aho').value='$2.000.000';d.getElementById('bv-caja').value='$150.000';d.getElementById('bv-deu').value='$300.000';d.getElementById('bv-ya').value='$200.000';w.eval('bv5()');
 checks['bienvenida: resumen con fijos, cuotas, día a día y ahorro']=d.getElementById('bv-ppto').value==='$1.200.000'&&t('sheet').includes('Ahorras')&&t('sheet').includes('$425.000')&&t('sheet').includes('pagar la tarjeta va primero');
 w.CALLS=[];await w.eval('bvGuardar()');await new Promise(r=>setTimeout(r,80));
 {const B=w.CALLS.map(c=>c.u+' '+(c.b||'')).join('\n');
  checks['bienvenida: guarda perfil, presupuesto menos lo gastado, fijos, ahorro y deuda']=/ajustes[^\n]*perfil[^\n]*Pedro[^\n]*1500000/.test(B)&&/presupuestos[^\n]*1000000/.test(B)&&/cuotas[^\n]*Arriendo[^\n]*400000/.test(B)&&/ajustes[^\n]*patrimonio[^\n]*2000000/.test(B)&&/ajustes[^\n]*deudas[^\n]*300000/.test(B);}
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
 // Revisión de la semana
 w.eval('openRevision()');checks['revisión de la semana: resumen, pendientes y meta']=t('sheet').includes('Tu semana en 2 minutos')&&t('sheet').includes('Gastaste esta semana')&&t('sheet').includes('Para la próxima semana');
 w.eval('cerrarSemana()');checks['revisión: se marca hecha']=w.localStorage.getItem('revision-'+w.eval('semanaDe()'))==='1';
 // Widget de Scriptable: el script generado es JS válido y lleva el código
 {const js=w.eval("widgetJS('abc123')");let okjs=true;try{new (Object.getPrototypeOf(async function(){}).constructor)(js)}catch(e){okjs=false;console.log(e.message)}
  checks['widget: script válido con el código']=okjs&&js.includes('"abc123"')&&js.includes('/rest/v1/rpc/widget');}
 // Meta independizarme: calcula lo que necesitas
 checks['independizarme: garantía + mes + corretaje + muebles']=w.eval("casaNecesitas({arriendo:400000,muebles:800000})")===1800000;
 w.eval("S.aj.casa={arriendo:400000,muebles:800000,ahorrado:300000,mensual:100000};openCasa()");checks['independizarme: hoja con fecha']=t('sheet').includes('Te faltan $1.500.000')&&t('sheet').includes('te vas en');w.eval('closeSheet()');
 // ¿Cuál me compro?
 w.eval("openComparar()");d.getElementById('c-a').value='AirPods Pro';d.getElementById('c-pa').value='$250.000';d.getElementById('c-b').value='AirPods 4';d.getElementById('c-pb').value='$150.000';w.eval('comparar()');
 checks['cuál me compro: recomienda la más barata']=t('c-out').includes('👉 AirPods 4')&&t('c-out').includes('Costo real');w.eval('closeSheet()');
 // Suscripciones y logros
 await w.eval('openSubs()');checks['suscripciones: abre con total al año']=t('sheet').includes('Pagas al mes')&&t('sheet').includes('al año');w.eval('closeSheet()');
 w.eval('renderLogros()');checks['logros: se muestran']=t('logros-c').includes('Logros')&&t('logros-c').includes('7 días seguidos');
 // Arma tu app: pasos en orden (Face ID antes de ponerla en inicio) y revisar el atajo
 w.eval("localStorage.removeItem('fid-ok');localStorage.removeItem('ap-ok');armaApp()");
 checks['arma tu app: Face ID primero, luego inicio y Apple Pay']=/Entrar con tu cara[\s\S]*pantalla de inicio/.test(t('sheet'))&&t('sheet').includes('de 3 listos')||t('sheet').includes('de 2 listos');
 w.eval('closeSheet()');
 w.eval("guiaAP(8)");checks['guía Apple Pay: último paso revisa sin gastar extra']=t('sheet').includes('Ya pagué: revisar')&&t('sheet').includes('No tienes que gastar extra');w.eval('closeSheet()');
 // Experiencia: Hoy nunca muestra más de 3 avisos, decimales con coma y logros cortos
 w.eval("closeSheet();localStorage.removeItem('fid-ok');localStorage.removeItem('arma-ok');S.revisar=[{id:5},{id:6}];render()");
 checks['hoy: máximo 3 avisos y sin "Úsala como app" repetido']=d.querySelectorAll('#nudges .nudge').length<=3&&!(t('nudges').includes('Arma tu app')&&t('nudges').includes('Úsala como app'));
 w.eval('openCheck()');d.getElementById('a-monto').value='$'+Math.round(w.eval('S.V.cupoHoy')*2.5);d.getElementById('a-desc').value='zapatillas';w.eval('S.nc=1;evalCheck()');
 checks['¿Me alcanza?: días con coma decimal']=!/\d\.\d días/.test(t('verdict'));w.eval('closeSheet()');
 w.eval('S.logrosAll=0;renderLogros()');checks['logros: los que tienes y los 2 próximos']=d.querySelectorAll('#logros-c .logro').length<7&&t('logros-c').includes('que faltan');
 // Fintual: conectar sin guardar la contraseña, metas con destino y aportes solos
 w.eval("delete S.aj.fintual;openFintual()");checks['fintual: pide correo y dice que la contraseña no se guarda']=t('sheet').includes('Conecta tu Fintual')&&t('sheet').includes('no se guarda');
 d.getElementById('fz-e').value='vicho@mail.com';d.getElementById('fz-p').value='mala';await w.eval('conectarFintual()');
 checks['fintual: contraseña mala avisa y no conecta']=w.__fin.accion==='conectar'&&d.getElementById('fz-p').value===''&&t('sheet').includes('Conecta tu Fintual');
 w.eval("S.aj.fintual={conectado:true,email:'vicho@mail.com',sync_at:new Date().toISOString(),metas:[{id:'1',nombre:'Risky <b>',nav:9000000,depositado:8000000,destino:'fintual'},{id:'2',nombre:'Colchón',nav:3000000,depositado:2900000,destino:'colchon'}]};openFintual()");
 checks['fintual: conectado muestra metas, total y destinos (escapado)']=t('sheet').includes('$12.000.000')&&t('sheet').includes('Risky <b>')&&d.querySelectorAll('#sheet .chip.on').length===2;
 w.eval('openAhorro()');checks['fintual: aportes se detectan solos (sin inputs)']=t('sheet').includes('lo detecta y lo anota sola')&&!d.getElementById('h-fin');w.eval('closeSheet()');
 w.eval('delete S.aj.fintual');
 // Tu caja: caja vs próxima factura y mínimo
 w.eval("S.aj.perfil={...S.aj.perfil,caja:388372,caja_fecha:hoyISO()};renderMetas();openCaja()");
 checks['caja: muestra cuenta, factura y que no suma al presupuesto']=t('metas').includes('Tu caja')&&t('sheet').includes('Próxima factura')&&t('sheet').includes('No suma al presupuesto')&&t('sheet').includes('$88.372');
 d.getElementById('cj-m').value='$250.000';await w.eval('saveCaja()');
 {const c=w.CALLS.filter(c=>c.m==='POST'&&c.u.includes('ajustes')).pop();checks['caja: guarda en perfil']=!!c&&/"caja":250000/.test(c.b)&&/"caja_min":300000/.test(c.b);}
 w.eval('closeSheet()');
 // Casa y Ropa: categorías nuevas; lo comprado para la casa avanza Independizarme
 w.eval('openTx(1)');checks['categorías: Casa y Ropa para elegir']=t('sheet').includes('🏠 Casa')&&t('sheet').includes('👕 Ropa');
 checks['casa: lo comprado se descuenta de amoblar']=w.eval("S.casaComp=300000;const r=casaNecesitas({arriendo:400000,muebles:800000});S.casaComp=0;r")===1500000;
 // Devolví algo: baja el monto y deja la nota
 w.eval('openDevol(1)');d.getElementById('dv-m').value='$20.000';w.CALLS=[];await w.eval('saveDevol(1)');await new Promise(r=>setTimeout(r,50));
 {const c=w.CALLS.find(c=>c.m==='PATCH'&&c.u.includes('gastos?id=eq.1'));checks['devolución: baja el gasto a lo que queda']=!!c&&/"monto":30000/.test(c.b)&&c.b.includes('devolución $20.000');}
 w.eval('closeSheet()');
 // Por cobrar: aparece en Plata y al llegar se le da destino
 w.eval("S.aj.cobrar=[{id:7,que:'IVA iPhone',monto:399160}];S.aj.casa={arriendo:400000,muebles:800000,ahorrado:0,mensual:100000};renderMetas()");
 checks['por cobrar: fila en Plata con el total']=t('metas').includes('Por cobrar')&&t('metas').includes('$399.160');
 w.CALLS=[];await w.eval('cobroLlego(7)');checks['por cobrar: al llegar pregunta adónde va']=t('sheet').includes('Llegaron $399.160')&&t('sheet').includes('Lo aparto para irme');
 await w.eval("cobroA('casa',399160)");await new Promise(r=>setTimeout(r,50));
 checks['por cobrar: sale de la lista y suma a la casa']=w.CALLS.some(c=>c.u.includes('ajustes')&&/"clave":"cobrar","valor":\[\]/.test(c.b))&&w.CALLS.some(c=>c.u.includes('ajustes')&&/"ahorrado":399160/.test(c.b));
 w.eval('closeSheet();delete S.aj.casa');
 // ¿Me alcanza? en cuotas: carga mes a mes
 w.eval('openCheck()');d.getElementById('a-monto').value='$2.400.000';d.getElementById('a-desc').value='iPhone';w.eval('S.nc=24;evalCheck()');
 checks['¿Me alcanza? en 24 cuotas: muestra la carga mes a mes']=t('verdict').includes('Tus cuotas al mes con esta compra')&&t('verdict').includes('30%');w.eval('closeSheet()');
 // Anotar: la categoría se ve mientras escribes
 w.eval('openAdd()');d.getElementById('a-desc').value='jumbo';w.eval('aCat()');checks['anotar: muestra la categoría que adivina']=t('a-cat').includes('Comida');
 w.eval('aCat(1)');checks['anotar: se puede cambiar la categoría']=d.querySelectorAll('#a-cat .chip').length>=8;w.eval('closeSheet()');
 // Todos los gastos: buscar y agrupar por día
 w.eval('openMovs()');d.getElementById('mv-q').value='jumbo';w.eval("S.mv.q='jumbo';mvPinta()");
 checks['todos los gastos: buscar con total y días']=t('mv-l').includes('Jumbo')&&t('mv-t').includes('1 gasto')&&t('mv-l').includes('Hoy');w.eval('closeSheet()');
 checks['gastos: día a día y barra por categoría']=t('g-res').includes('Día a día')&&!!d.querySelector('#g-res .cats-seg');
 // Decidir: 3 preguntas y consejo; a los 3 días aparece en Hoy
 w.eval('openCheck()');d.getElementById('a-monto').value='$54.000';d.getElementById('a-desc').value='lentes';w.eval("evalCheck();dqSel('nec','q');dqSel('par','s');dqSel('uso',1)");
 checks['decidir: 3 preguntas dan un consejo con costo por uso']=t('dq').includes('Mi consejo')&&t('dq').includes('cada uso te sale')&&d.getElementById('chk-gen').style.display==='none';
 w.eval('desear()');await new Promise(r=>setTimeout(r,50));
 w.eval("S.aj.deseos[0].desde=new Date(Date.now()-80*36e5).toISOString();closeSheet();render()");
 checks['decidir: a los 3 días aparece en Hoy']=t('nudges').includes('Pasaron 3 días')&&t('nudges').includes('lentes');
 w.eval('openDeseo(S.aj.deseos[0].id)');checks['decidir: recuerda lo que dijiste']=t('sheet').includes('Ese día dijiste que')&&t('sheet').includes('ya tienes algo parecido')&&t('sheet').includes('Espérame 3 días más');
 w.eval("closeSheet();S.aj.deseos=[];render()");
 // Día a día: tocar un día abre su detalle
 w.eval('openDia(hoyISO())');checks['día a día: detalle del día con sus gastos']=t('sheet').includes('Hoy')&&t('sheet').includes('Jumbo')&&t('sheet').includes('tu plata del día');w.eval('closeSheet()');
 // Pestaña Cuotas en la barra: regla del 30% y el detalle
 w.eval("tab('cuotas')");checks['pestaña Cuotas: regla del 30% y lista']=!d.querySelector('[data-tab="cuotas"]').hidden&&t('cuo-v').includes('tu regla del 30%')&&t('cuo-v').includes('¿Puedo comprar algo en cuotas?')&&d.querySelectorAll('#nav button[data-t]').length===5;w.eval("tab('hoy')");
 // Adelantar cuotas: termina este mes y lo que faltaba queda como gasto de hoy
 w.confirm=()=>true;w.CALLS=[];await w.eval('adelantarCuota(7)');await new Promise(r=>setTimeout(r,60));
 checks['adelantar cuotas: termina este mes y anota lo que faltaba']=w.CALLS.some(c=>c.m==='PATCH'&&c.u.includes('cuotas?id=eq.7')&&/"total_cuotas":1/.test(c.b))&&w.CALLS.some(c=>c.m==='POST'&&c.u.includes('gastos')&&c.b.includes('Adelanto cuotas')&&/"monto":161600/.test(c.b));
 // Lo que debes: tarjetas por separado, cuotas que faltan y deudas
 w.eval("S.aj.deudas=[{id:1,que:'PSA',monto:490000}];openDebo()");
 checks['lo que debes: total, tarjetas, cuotas que faltan y deudas']=t('sheet').includes('Lo que debes')&&t('sheet').includes('Tus tarjetas de este mes')&&t('sheet').includes('Scotia')&&t('sheet').includes('PSA')&&t('sheet').includes('Prepago de cuotas');
 w.eval("closeSheet();renderMetas()");checks['lo que debes: fila en Plata']=t('metas').includes('Lo que debes');w.eval('S.aj.deudas=[]');
 // Hoy: el número se explica al tocarlo; pasado del mes muestra lo básico al día en vez de $0
 w.eval("tab('hoy');openHeroInfo()");checks['hoy: al tocar el número se explica la cuenta']=t('sheet').includes('¿De dónde sale este número?')&&t('sheet').includes('Presupuesto del mes')&&t('sheet').includes('Cuotas y fijos');w.eval('closeSheet()');
 w.eval("S.pptoBak=S.ppto;S.ppto=100000;render()");checks['hoy: pasado del mes muestra lo básico al día, no $0']=t('hero-w').includes('solo lo básico')&&t('hero-w').includes('al día')&&!/\$0(?!\d|\.)/.test(t('hero-w'));
 w.eval('openHeroInfo()');checks['hoy: pasado del mes, la cuenta dice cuánto vas pasado']=t('sheet').includes('Vas pasado del mes por');w.eval('closeSheet();S.ppto=S.pptoBak;render()');
 // Hoy: saludo con nombre y la semana (L a D) en el recuadro; tocar un día abre su detalle
 w.eval("tab('hoy');render()");checks['hoy: la semana L a D en el recuadro']=d.querySelectorAll('#hero-w .wk button').length===7&&!!d.querySelector('#hero-w .wk .hoy');
 d.querySelector('#hero-w .wk .hoy').click();checks['hoy: tocar un día abre su detalle']=t('sheet').includes('tu plata del día')||t('sheet').includes('Nada anotado');w.eval('closeSheet()');
 let ok=true;for(const[k,v]of Object.entries(checks)){console.log((v?'✅':'❌')+' '+k);if(!v)ok=false}
 process.exit(ok?0:1);
})();
