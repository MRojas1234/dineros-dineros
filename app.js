/* Dineros Dineros — app de control financiero personal.
   Código propio, escrito desde cero. Licencia MIT (ver LICENSE).

   Reglas que gobiernan este archivo, y no se negocian:

   1. Nada sale del teléfono. No hay fetch, ni XMLHttpRequest, ni sendBeacon,
      ni WebSocket, ni imágenes de otro dominio. El navegador además lo tiene
      prohibido por el Content-Security-Policy de index.html.
   2. Ninguna cantidad viaja sin su moneda pegada. Nunca un número suelto.
   3. Las fechas se guardan como instante completo + zona IANA. El veredicto
      se puede recalcular; el instante perdido no se recupera.
   4. La parte emocional SIEMPRE es opcional y nunca regaña. Se le apunta al
      sufrimiento de mirar los números, jamás a la costumbre de mirarlos.
   5. Nada se borra solo. Las radiografías se acumulan con su fecha.
*/

'use strict';

const LLAVE = 'dd.v1';
const DIAS_AVISO_RESPALDO = 7;

const CATEGORIAS = {
  salida: ['Mandado', 'Renta', 'Carro y gasolina', 'Servicios', 'Comida fuera',
           'Salud', 'Escuela', 'Ropa', 'Deuda o tarjeta', 'Regalo', 'Mi meta', 'Otro'],
  entrada: ['Sueldo', 'Venta', 'Trabajo extra', 'Me pagaron algo', 'Regalo', 'Mi meta', 'Otro']
};

const EMOCIONES = {
  salida: ['En paz', 'Era necesario', 'Me gustó', 'Culpa', 'Miedo', 'Enojo', 'Nada en especial'],
  entrada: ['Alivio', 'Gratitud', 'Orgullo', 'Angustia', 'Culpa', 'Nada en especial']
};

const VERBOS = ['Recibir', 'Disfrutar', 'Confiar', 'Compartir'];

// En este orden se pintan. 'Otro' al final para lo que no cae en ninguno.
const GRUPOS = ['Casa y seguros', 'Servicios', 'Tarjetas y deudas', 'Impuestos', 'Otro'];

// Lo que NUNCA sale en el respaldo de números: con esto alguien te cobra.
const CAMPOS_SENSIBLES = ['telefono', 'cuenta', 'titular', 'ultimos4', 'correo'];

const PREGUNTAS = [
  { id: 'angustia', tipo: 'escala', texto: '¿Qué tanto te angustia abrir tus números?',
    izq: 'Nada', der: 'Muchísimo',
    nota: 'Esta pregunta y la siguiente parecen la misma y no lo son. Ésta mide el ' +
          'susto. La de abajo mide la costumbre. Al susto se le trabaja; a la ' +
          'costumbre de mirar tus números no se le toca, porque es justo lo que ' +
          'te tiene sin deudas que ruedan.' },
  { id: 'vigilancia', tipo: 'escala', texto: '¿Qué tan seguido los abres?',
    izq: 'Casi nunca', der: 'A diario' },
  { id: 'pavor', tipo: 'texto', texto: '¿Hay algún número que hoy te dé pavor mirar? ¿Cuál?' },
  { id: 'aprendi', tipo: 'texto', texto: '¿A quién le aprendiste tu forma de ver el dinero?' },
  { id: 'bien', tipo: 'texto', texto: '¿Qué haces bien con el dinero y nadie te lo reconoce?' },
  { id: 'seis_meses', tipo: 'texto', texto: 'Dentro de seis meses, ¿qué te gustaría que fuera distinto?' },
  { id: 'eq_recibir', tipo: 'escala', texto: 'Recibir: cuando alguien te da algo, ¿lo recibes a gusto?',
    izq: 'Me cuesta', der: 'Muy a gusto',
    nota: 'Las cuatro de abajo son las cuatro casillas del Money EQ. No son un ' +
          'diagnóstico de nada: son para conversar contigo misma.' },
  { id: 'eq_disfrutar', tipo: 'escala', texto: 'Disfrutar: ¿disfrutas lo que compras, o te queda la culpa?',
    izq: 'Me queda culpa', der: 'Lo disfruto' },
  { id: 'eq_confiar', tipo: 'escala', texto: 'Confiar: ¿sientes que va a alcanzar?',
    izq: 'Casi nunca', der: 'Casi siempre' },
  { id: 'eq_compartir', tipo: 'escala', texto: 'Compartir: ¿compartes sin que te pese?',
    izq: 'Me pesa', der: 'Sin que me pese' }
];

/* ───────────────────────── Estado ───────────────────────── */

const zona = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'desconocida'; }
  catch (e) { return 'desconocida'; }
};

const nuevoEstado = () => ({
  app: 'Dineros Dineros',
  version: 1,
  moneda: null,
  nombre: '',
  creado: { iso: new Date().toISOString(), zona: zona() },
  movimientos: [],
  radiografias: [],
  fijos: [],
  meta: null,
  ver_grafica: true,
  plan_deuda: { extra: null, orden: 'tasa' },
  ver_plan: true,
  respaldo: { ultimo_iso: null, ultimo_tipo: null, ultima_prueba_iso: null }
});

/* ────────── Los meses, en un solo formato ────────── */

// El historial que vino del Excel llegó con DOS formatos de llave distintos:
// "01".."12" en los gastos de casa, y "ene".."dic" en las tarjetas. Cada fijo se
// dibujaba bien por su cuenta, y por eso el error no se veía — pero nada que sume
// o compare ENTRE fijos podía funcionar: la mitad de los meses no existía para el
// que sumaba. Aquí se convierte todo a un solo formato, al entrar y al abrir.
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function mesesAlDerecho(h) {
  if (!h || typeof h !== 'object') return null;
  const limpio = {};
  Object.keys(h).forEach((k) => {
    const n = parseInt(k, 10);
    const llave = (n >= 1 && n <= 12) ? MESES[n - 1] : String(k).toLowerCase().trim().slice(0, 3);
    if (MESES.indexOf(llave) < 0) return;
    const v = parseFloat(h[k]);
    if (isNaN(v)) return;
    limpio[llave] = v;
  });
  return Object.keys(limpio).length ? limpio : null;
}

let estado = nuevoEstado();

function cargar() {
  try {
    const crudo = localStorage.getItem(LLAVE);
    if (!crudo) return false;
    const leido = JSON.parse(crudo);
    estado = Object.assign(nuevoEstado(), leido);
    if (!Array.isArray(estado.fijos)) estado.fijos = [];
    // Los fijos que ya estaban guardados pueden traer el historial en el formato
    // viejo. Se arregla aquí, al abrir, para que nadie tenga que importar de nuevo.
    estado.fijos.forEach((f) => { f.historial = mesesAlDerecho(f.historial); });
    estado.respaldo = Object.assign({ ultimo_iso: null, ultimo_tipo: null, ultima_prueba_iso: null }, leido.respaldo || {});
    return true;
  } catch (e) {
    console.warn('No se pudo leer lo guardado:', e);
    return false;
  }
}

function guardar() {
  try {
    localStorage.setItem(LLAVE, JSON.stringify(estado));
    return true;
  } catch (e) {
    aviso('No se pudo guardar. Es posible que al teléfono le falte espacio.');
    return false;
  }
}

/* ───────────────────────── Herramientas ───────────────────────── */

const $ = (sel, raiz) => (raiz || document).querySelector(sel);
const $$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));

const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Ninguna cantidad se escribe sin su moneda. Nunca.
function dinero(monto, moneda) {
  const n = Number(monto) || 0;
  const texto = n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return '$' + texto + ' ' + (moneda || estado.moneda || '');
}

function fechaLarga(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function fechaCorta(iso) {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

function horaCorta(iso) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
}

const diaDe = (iso) => {
  const d = new Date(iso);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

const diasDesde = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

function aviso(texto, segundos) {
  const caja = $('#aviso-flotante');
  caja.textContent = texto;
  caja.classList.remove('oculto');
  clearTimeout(aviso._t);
  aviso._t = setTimeout(() => caja.classList.add('oculto'), (segundos || 4) * 1000);
}

function paraInput(fecha) {
  const d = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

function escapar(t) {
  return String(t).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ───────────────────────── Bienvenida ───────────────────────── */

let monedaElegida = null;

function abrirBienvenida() {
  $('#bienvenida').classList.remove('oculto');
  $$('#bv-monedas .moneda').forEach((b) => {
    b.addEventListener('click', () => {
      monedaElegida = b.dataset.moneda;
      $$('#bv-monedas .moneda').forEach((o) => o.classList.toggle('puesta', o === b));
      $('#bv-listo').disabled = false;
    });
  });
  $('#bv-listo').addEventListener('click', () => {
    estado.moneda = monedaElegida;
    estado.nombre = $('#bv-nombre').value.trim();
    guardar();
    $('#bienvenida').classList.add('oculto');
    pintarTodo();
    abrirRadiografia();
  });
}

/* ───────────────────────── Pestañas ───────────────────────── */

function irA(vista) {
  $$('.vista').forEach((v) => v.classList.add('oculto'));
  $('#vista-' + vista).classList.remove('oculto');
  $$('.pestana').forEach((p) => p.classList.toggle('activa', p.dataset.vista === vista));
  window.scrollTo(0, 0);
}

/* ───────────────────────── Pantalla: Hoy ───────────────────────── */

function mesActual() {
  const ahora = new Date();
  return estado.movimientos.filter((m) => {
    const d = new Date(m.cuando);
    return d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear();
  });
}

function sumaPorMoneda(movs) {
  const por = {};
  movs.forEach((m) => {
    const mon = m.moneda || estado.moneda;
    por[mon] = (por[mon] || 0) + Number(m.monto);
  });
  return por;
}

// Suma de varias monedas: se escriben separadas. Jamás se suman entre sí.
function escribirSumas(por) {
  const llaves = Object.keys(por);
  if (!llaves.length) return dinero(0, estado.moneda);
  return llaves.map((mon) => dinero(por[mon], mon)).join(' + ');
}

function pintarVersiculo() {
  const v = versiculoDelDia(new Date());
  $('#versiculo-texto').textContent = v.t;
  $('#versiculo-ref').textContent = v.r;
}

function pintarMeta() {
  const caja = $('#tarjeta-meta');
  if (!estado.meta) {
    caja.innerHTML =
      '<h2>Ponle una meta</h2>' +
      '<p class="parrafo">Un número sin meta no se puede leer: no sabes si es bueno ' +
      'o malo. Con meta, esta tarjeta te va a decir <strong>cuánto te falta</strong>, ' +
      'que es lo único que cambia lo que haces hoy.</p>' +
      '<button class="btn btn-principal" data-abrir="meta">Poner mi meta</button>';
    return;
  }
  const juntado = estado.movimientos
    .filter((m) => m.categoria === 'Mi meta' && (m.moneda || estado.moneda) === estado.meta.moneda)
    .reduce((s, m) => s + Number(m.monto), 0);
  const falta = Math.max(0, estado.meta.monto - juntado);
  const pct = estado.meta.monto > 0 ? Math.min(100, (juntado / estado.meta.monto) * 100) : 0;

  caja.innerHTML =
    '<p class="cifra-rotulo">Te faltan para ' + escapar(estado.meta.titulo || 'tu meta') + '</p>' +
    '<p class="meta-brecha">' + escapar(dinero(falta, estado.meta.moneda)) + '</p>' +
    '<progress class="barra" max="100" value="' + pct.toFixed(1) + '"></progress>' +
    '<p class="parrafo">Llevas ' + escapar(dinero(juntado, estado.meta.moneda)) + ' de ' +
    escapar(dinero(estado.meta.monto, estado.meta.moneda)) + '. ' +
    'Cada movimiento que marques con la categoría <strong>Mi meta</strong> se suma aquí.</p>' +
    '<button class="btn" data-abrir="meta">Cambiar la meta</button>';
}

// La gráfica se dibuja a mano, en SVG, aquí mismo. No hay librerías de nadie
// ni nada que bajar de internet.
//
// Son dos dibujos distintos y a propósito no se mezclan:
//   · Su año  — lo que salió cada mes, según el Excel que ya traía.
//   · Su mes  — lo que lleva registrado aquí, día por día.
// Juntarlos en una sola línea daría un número que no significa nada.
//
// Solo grafica la moneda que traes puesta: dos monedas distintas no se suman
// en una misma línea, porque esa línea mentiría.
function pintarGrafica() {
  const caja = $('#tarjeta-grafica');
  const ano = graficaDelAno();
  const mes = graficaDelMes();

  const cabecera =
    '<div class="grafica-cabecera"><h3>' +
    (ano ? 'Tu dinero en el tiempo' : 'Tu balance del mes') + '</h3>' +
    '<button class="btn btn-chico" data-accion="grafica">' +
    (estado.ver_grafica ? 'Ocultar' : 'Mostrar') + '</button></div>';

  if (!estado.ver_grafica) {
    caja.innerHTML = cabecera + '<p class="parrafo sin-margen">Escondida. ' +
      'Está ahí cuando la quieras.</p>';
    return;
  }

  if (!ano && !mes) {
    caja.innerHTML = cabecera +
      '<p class="parrafo sin-margen">Este mes todavía no hay nada que dibujar. ' +
      'Con el primer movimiento aparece el punto de arranque, y del segundo en ' +
      'adelante se empieza a ver la línea. Esa diferencia es la que motiva.</p>';
    return;
  }

  caja.innerHTML = cabecera + ano + (ano && mes ? '<hr class="raya-grafica">' : '') + mes;
}

// Lo que salió cada mes, según su propio Excel. No son movimientos registrados
// aquí: es el año que ya traía puesto cuando llegó a esta app.
//
// Un mes al que le faltan conceptos NO se tapa ni se esconde: se pinta tenue, se
// nombra abajo y se deja fuera del promedio. Un hueco en su hoja es un dato, no
// un error que haya que maquillar.
function graficaDelAno() {
  const mon = estado.moneda;
  const suma = {}, cuantos = {};
  MESES.forEach((m) => { suma[m] = 0; cuantos[m] = 0; });

  let afuera = 0;
  estado.fijos.forEach((f) => {
    const h = f.historial;
    if (!h) return;
    if ((f.moneda || mon) !== mon) { afuera += 1; return; }
    MESES.forEach((m) => {
      // Un mes sin llave es un hueco; un mes que vale 0 es un dato. No son lo
      // mismo y no se pueden contar igual: si el cero no contara, un mes bien
      // llenado de ceros parecería incompleto y se saldría del promedio. Esto
      // ya mordió una vez, con una tarjeta cuyos últimos tres meses fueron 0.
      if (!Object.prototype.hasOwnProperty.call(h, m)) return;
      const v = Number(h[m]);
      if (isNaN(v)) return;
      suma[m] += v;
      cuantos[m] += 1;
    });
  });

  const conDato = MESES.filter((m) => cuantos[m] > 0);
  if (!conDato.length) return '';

  // Un mes cuenta como completo si trae al menos la mitad de los conceptos que
  // trae el mes mejor llenado. Así un septiembre a medias no se disfraza de mes
  // bueno ni le baja el promedio a los demás.
  const masLleno = Math.max.apply(null, conDato.map((m) => cuantos[m]));
  const aMedias = (m) => cuantos[m] * 2 < masLleno;
  const llenos = conDato.filter((m) => !aMedias(m));
  const flojos = conDato.filter(aMedias);

  const techo = Math.max.apply(null, conDato.map((m) => suma[m]));
  const base = llenos.length ? llenos : conDato;
  const prom = base.reduce((s, m) => s + suma[m], 0) / base.length;

  const W = 320, H = 152, aba = 26, arr = 10;
  const zona = H - arr - aba;
  const paso = W / conDato.length;
  const grueso = Math.min(28, paso * 0.6);
  // Si TODO el año fuera cero, dividir entre el techo daría NaN y no se
  // dibujaría nada. Con cero de verdad las barras quedan al mínimo, visibles.
  const altoDe = (v) => techo > 0 ? Math.max(2, (zona * v) / techo) : 2;

  let barras = '', rotulos = '';
  conDato.forEach((m, i) => {
    const cx = paso * i + paso / 2;
    const h = altoDe(suma[m]);
    barras += '<rect x="' + (cx - grueso / 2).toFixed(1) + '" y="' + (H - aba - h).toFixed(1) +
      '" width="' + grueso.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="4" fill="' +
      (aMedias(m) ? 'var(--verde-tenue)' : 'var(--verde)') + '"/>';
    rotulos += '<text x="' + cx.toFixed(1) + '" y="' + (H - aba + 13) +
      '" text-anchor="middle" font-size="10" fill="var(--texto-suave)">' + m + '</text>';
  });

  const yProm = (H - aba - altoDe(prom)).toFixed(1);
  const rayaProm = '<line x1="0" y1="' + yProm + '" x2="' + W + '" y2="' + yProm +
    '" stroke="var(--texto-suave)" stroke-width="1" stroke-dasharray="4 4"/>';

  const svg = '<svg class="grafica-lienzo" viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
    'aria-label="Lo que salió cada mes, según tu Excel">' +
    barras + rayaProm + rotulos + '</svg>';

  const arriba = conDato.reduce((a, m) => (suma[m] > suma[a] ? m : a), conDato[0]);
  const abajo = llenos.length
    ? llenos.reduce((a, m) => (suma[m] < suma[a] ? m : a), llenos[0]) : arriba;

  return '<h4 class="grafica-rotulo">Tu año, el que ya traías</h4>' + svg +
    '<p class="grafica-cierre">' + escapar(dinero(prom, mon)) + ' al mes</p>' +
    '<p class="parrafo margen-chico">Es tu promedio de ' + base.length + ' mes' +
      (base.length === 1 ? '' : 'es') + ', y la raya punteada es esa misma línea. ' +
      'Tu mes más pesado fue <strong>' + arriba + '</strong>, con ' +
      escapar(dinero(suma[arriba], mon)) +
      (abajo !== arriba ? ', y el más ligero <strong>' + abajo + '</strong>, con ' +
        escapar(dinero(suma[abajo], mon)) : '') + '.</p>' +
    (flojos.length
      ? '<p class="pista">Las barras tenues (' + flojos.join(', ') + ') están ' +
        'incompletas en tu hoja: a varios conceptos les falta el dato de ese mes. ' +
        'Las dejo a la vista en lugar de esconderlas, y fuera del promedio.</p>'
      : '') +
    '<p class="pista">Viene de tu Excel, de los fijos que trajiste. El año no está ' +
      'escrito en ninguna parte de esa hoja, así que aquí van solo los meses.' +
      (afuera > 0 ? ' ' + afuera + ' fijo' + (afuera === 1 ? '' : 's') + ' en otra ' +
        'moneda no entra' + (afuera === 1 ? '' : 'n') + ' en este dibujo.' : '') + '</p>';
}

// Lo que lleva registrado ella misma este mes, acumulado día por día.
function graficaDelMes() {
  const mon = estado.moneda;
  const todos = mesActual();
  const mes = todos.filter((m) => (m.moneda || mon) === mon);
  const otras = todos.length - mes.length;
  if (!mes.length) return '';

  // Un punto por día con movimientos, acumulando lo que entró menos lo que salió.
  const porDia = {};
  mes.forEach((m) => {
    const d = diaDe(m.cuando);
    porDia[d] = (porDia[d] || 0) + (m.tipo === 'entrada' ? Number(m.monto) : -Number(m.monto));
  });
  const dias = Object.keys(porDia).sort();
  let acumulado = 0;
  const puntos = dias.map((d) => { acumulado += porDia[d]; return { d: d, v: acumulado }; });

  const W = 320, H = 140, izq = 4, der = 4, arr = 12, aba = 22;
  let alto = Math.max(...puntos.map((p) => p.v), 0);
  let bajo = Math.min(...puntos.map((p) => p.v), 0);
  if (alto === bajo) { alto += 1; bajo -= 1; }
  const margen = (alto - bajo) * 0.12;
  alto += margen; bajo -= margen;

  const x = (i) => puntos.length === 1 ? W / 2 : izq + (i * (W - izq - der)) / (puntos.length - 1);
  const y = (v) => arr + ((alto - v) / (alto - bajo)) * (H - arr - aba);

  let linea = '', area = '', bolitas = '';
  puntos.forEach((p, i) => {
    linea += (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1) + ' ';
    bolitas += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.v).toFixed(1) +
      '" r="3.5" fill="var(--verde)" stroke="var(--tarjeta)" stroke-width="2"/>';
  });
  if (puntos.length > 1) {
    area = linea + 'L' + x(puntos.length - 1).toFixed(1) + ' ' + y(bajo).toFixed(1) +
      ' L' + x(0).toFixed(1) + ' ' + y(bajo).toFixed(1) + ' Z';
  }

  const cero = (bajo < 0 && alto > 0)
    ? '<line x1="0" y1="' + y(0).toFixed(1) + '" x2="' + W + '" y2="' + y(0).toFixed(1) +
      '" stroke="var(--borde)" stroke-width="1" stroke-dasharray="3 3"/>' : '';

  const etiqueta = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

  const svg =
    '<svg class="grafica-lienzo" viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
    'aria-label="Tu balance acumulado del mes">' +
      (area ? '<path d="' + area + '" fill="var(--verde-tenue)"/>' : '') +
      cero +
      (puntos.length > 1 ? '<path d="' + linea + '" fill="none" stroke="var(--verde)" ' +
        'stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' : '') +
      bolitas +
      '<text x="0" y="' + (H - 6) + '" font-size="10" fill="var(--texto-suave)">' +
        escapar(etiqueta(dias[0])) + '</text>' +
      (dias.length > 1
        ? '<text x="' + W + '" y="' + (H - 6) + '" font-size="10" text-anchor="end" ' +
          'fill="var(--texto-suave)">' + escapar(etiqueta(dias[dias.length - 1])) + '</text>'
        : '') +
    '</svg>';

  const cierre = puntos[puntos.length - 1].v;
  return '<h4 class="grafica-rotulo">Este mes, lo que llevas registrado</h4>' + svg +
    '<p class="grafica-cierre ' + (cierre >= 0 ? 'sube' : 'baja') + '">' +
      (cierre >= 0 ? '+' : '−') + escapar(dinero(Math.abs(cierre), mon)) + '</p>' +
    '<p class="parrafo margen-chico">Es lo que entró menos lo que salió en ' +
      (dias.length === 1 ? 'el único día que llevas registrado' : 'los ' + dias.length + ' días que llevas registrados') +
      ' de este mes.' +
      (puntos.length === 1 ? ' Con un solo punto todavía no hay línea; con el segundo empieza.' : '') +
    '</p>' +
    (otras > 0
      ? '<p class="pista">' + otras + ' movimiento' + (otras === 1 ? '' : 's') +
        ' de este mes están en otra moneda y no entran en esta línea: dos monedas ' +
        'distintas no se suman.</p>'
      : '');
}
function pintarCifrasDelMes() {
  const mes = mesActual();
  $('#mes-entro').textContent = escribirSumas(sumaPorMoneda(mes.filter((m) => m.tipo === 'entrada')));
  $('#mes-salio').textContent = escribirSumas(sumaPorMoneda(mes.filter((m) => m.tipo === 'salida')));
}

// El reloj corre por avance, no por calendario: se cuentan los días en que de
// verdad registraste algo, no los días que han pasado desde que instalaste.
function pintarConstancia() {
  const dias = new Set(estado.movimientos.map((m) => diaDe(m.cuando)));
  const caja = $('#tarjeta-constancia');
  if (dias.size === 0) {
    caja.innerHTML =
      '<h3>Todavía no registras nada</h3>' +
      '<p class="parrafo">Y está bien: hoy es el día uno. El primer movimiento es el ' +
      'que más cuesta. No tiene que ser grande — un café sirve.</p>';
    return;
  }
  const hoyTiene = dias.has(diaDe(new Date().toISOString()));
  caja.innerHTML =
    '<h3>Llevas ' + dias.size + (dias.size === 1 ? ' día' : ' días') + ' registrando</h3>' +
    '<p class="parrafo">Se cuentan los días en que <strong>sí</strong> registraste algo, ' +
    'no los días que han pasado. Si te pierdes una semana, aquí no te brinca nada: ' +
    'retomas donde te quedaste.' +
    (hoyTiene ? ' Hoy ya quedó.' : '') + '</p>';
}

function pintarRadiografiaResumen() {
  const caja = $('#tarjeta-radiografia-resumen');
  const ultima = estado.radiografias[estado.radiografias.length - 1];
  if (!ultima) {
    caja.innerHTML =
      '<h3>Tu radiografía</h3>' +
      '<p class="parrafo">Son unas pocas preguntas que se contestan una vez y se ' +
      'guardan con su fecha. Sirven para que dentro de seis meses puedas comparar.</p>' +
      '<button class="btn btn-principal" data-abrir="radiografia">Contestarla</button>';
    return;
  }
  const r = ultima.respuestas;
  let filas = '';
  if (r.angustia) filas += '<p class="radio-par"><strong>Qué tanto te angustia abrirlos</strong>' + r.angustia + ' de 5</p>';
  if (r.vigilancia) filas += '<p class="radio-par"><strong>Qué tan seguido los abres</strong>' + r.vigilancia + ' de 5</p>';
  if (r.seis_meses) filas += '<p class="radio-par"><strong>Qué quieres distinto en seis meses</strong>' + escapar(r.seis_meses) + '</p>';
  caja.innerHTML =
    '<h3>Tu radiografía</h3>' +
    '<p class="radio-fecha">Contestada el ' + fechaCorta(ultima.cuando) + '</p>' +
    filas +
    '<button class="btn" data-ir="radiografia">Verla completa</button>';
}

function pintarAvisoRespaldo() {
  const caja = $('#aviso-respaldo');
  const ult = estado.respaldo.ultimo_iso;
  if (estado.movimientos.length === 0 && estado.radiografias.length === 0) {
    caja.classList.add('oculto');
    return;
  }
  caja.classList.remove('oculto');
  if (!ult) {
    caja.className = 'aviso urge';
    caja.innerHTML = '<strong>Nunca has guardado un respaldo.</strong> Si se borran los ' +
      'datos del navegador o se pierde el teléfono, esto se va completo.<br>' +
      '<button class="btn" data-ir="respaldo">Guardar uno ahora</button>';
    return;
  }
  const d = diasDesde(ult);
  if (d >= DIAS_AVISO_RESPALDO) {
    caja.className = 'aviso urge';
    caja.innerHTML = '<strong>Tu último respaldo fue hace ' + d + ' días.</strong> ' +
      'Todo lo de después de esa fecha solo existe en este teléfono.<br>' +
      '<button class="btn" data-ir="respaldo">Guardar uno ahora</button>';
  } else {
    caja.className = 'aviso calma';
    caja.textContent = 'Último respaldo: ' + (d === 0 ? 'hoy' : 'hace ' + d + (d === 1 ? ' día' : ' días')) + '.';
  }
}

/* ───────────────────────── Pantalla: Movimientos ───────────────────────── */

let filtroActual = 'todos';

function pintarMovimientos() {
  const caja = $('#lista-movimientos');
  let movs = estado.movimientos.slice().sort((a, b) => new Date(b.cuando) - new Date(a.cuando));
  if (filtroActual !== 'todos') movs = movs.filter((m) => m.tipo === filtroActual);

  if (!movs.length) {
    caja.innerHTML = '<p class="vacio">Aquí no hay nada todavía. En cuanto registres ' +
      'algo, aparece aquí, por día.</p>';
    return;
  }

  let html = '';
  let diaAnterior = null;
  movs.forEach((m) => {
    const d = diaDe(m.cuando);
    if (d !== diaAnterior) {
      html += '<p class="dia-rotulo">' + fechaLarga(m.cuando) + '</p>';
      diaAnterior = d;
    }
    let etiquetas = '';
    if (m.sentir && m.sentir.emocion) etiquetas += '<span class="etiqueta">' + escapar(m.sentir.emocion) + '</span>';
    if (m.sentir && m.sentir.verbo) etiquetas += '<span class="etiqueta">' + escapar(m.sentir.verbo) + '</span>';
    if (m.sentir && m.sentir.gracias) etiquetas += '<span class="etiqueta oro">Dije gracias</span>';

    html +=
      '<div class="mov ' + m.tipo + '">' +
        '<div class="mov-cuerpo">' +
          '<p class="mov-cat">' + escapar(m.categoria || 'Sin categoría') + '</p>' +
          '<p class="mov-detalle">' + horaCorta(m.cuando) + ' · ' +
            (m.tipo === 'entrada' ? 'entró' : 'salió') + '</p>' +
          etiquetas +
          (m.sentir && m.sentir.escrito
            ? '<p class="mov-escrito">' + escapar(m.sentir.escrito) + '</p>' : '') +
        '</div>' +
        '<div><p class="mov-monto">' +
          (m.tipo === 'entrada' ? '+' : '−') +
          escapar(dinero(m.monto, m.moneda)) +
        '</p>' +
        '<button class="btn btn-mini" data-borrar="' + m.id + '">Borrar</button>' +
        '</div>' +
      '</div>';
  });
  caja.innerHTML = html;
}

/* ───────────────────────── Modal: registrar ───────────────────────── */

let regTipo = 'salida';
let regCategoria = '';
let regEmocion = '';
let regVerbo = '';

function pintarChips(contenedor, lista, puesto, alElegir) {
  contenedor.innerHTML = '';
  lista.forEach((texto) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (texto === puesto ? ' puesto' : '');
    b.textContent = texto;
    b.addEventListener('click', () => alElegir(texto === puesto ? '' : texto));
    contenedor.appendChild(b);
  });
}

function refrescarRegistro() {
  $$('#tipo .tipo-btn').forEach((b) => b.classList.toggle('activo', b.dataset.tipo === regTipo));
  $('#reg-moneda').textContent = estado.moneda;
  $('#reg-gracias-texto').textContent = regTipo === 'entrada' ? 'Dije gracias al entrar' : 'Dije gracias al salir';
  pintarChips($('#reg-categorias'), CATEGORIAS[regTipo], regCategoria, (v) => {
    regCategoria = v;
    if (v) $('#reg-categoria').value = '';
    refrescarRegistro();
  });
  pintarChips($('#reg-emociones'), EMOCIONES[regTipo], regEmocion, (v) => { regEmocion = v; refrescarRegistro(); });
  pintarChips($('#reg-verbos'), VERBOS, regVerbo, (v) => { regVerbo = v; refrescarRegistro(); });
}

function abrirRegistro(previo) {
  const p = previo || {};
  regTipo = p.tipo || 'salida';
  regCategoria = '';
  regEmocion = '';
  regVerbo = '';
  $('#reg-monto').value = p.monto != null ? p.monto : '';
  // Viene lleno, pero la pregunta del sentimiento sigue ahí sin contestar:
  // el momento del movimiento es el momento, aunque el monto ya lo supiéramos.
  $('#reg-categoria').value = p.categoria || '';
  $('#reg-escrito').value = '';
  $('#reg-gracias').checked = false;
  $('#reg-fecha').value = paraInput(new Date());
  refrescarRegistro();
  $('#modal-registro').classList.remove('oculto');
  setTimeout(() => $('#reg-monto').focus(), 50);
}

function guardarMovimiento() {
  const monto = parseFloat($('#reg-monto').value);
  if (!(monto > 0)) {
    aviso('Falta el monto. Es lo único que la app necesita de verdad.');
    $('#reg-monto').focus();
    return;
  }
  const escritaMano = $('#reg-categoria').value.trim();
  const cuandoLocal = $('#reg-fecha').value;
  const cuando = cuandoLocal ? new Date(cuandoLocal) : new Date();

  const mov = {
    id: id(),
    tipo: regTipo,
    monto: Math.round(monto * 100) / 100,
    moneda: estado.moneda,          // la unidad va pegada al número, siempre
    categoria: escritaMano || regCategoria || 'Sin categoría',
    cuando: cuando.toISOString(),
    zona: zona(),
    sentir: {
      emocion: regEmocion || '',
      gracias: $('#reg-gracias').checked,
      verbo: regVerbo || '',
      escrito: $('#reg-escrito').value.trim()
    }
  };
  estado.movimientos.push(mov);
  guardar();
  $('#modal-registro').classList.add('oculto');
  pintarTodo();
  aviso('Quedó registrado: ' + dinero(mov.monto, mov.moneda));
}

function borrarMovimiento(idMov) {
  const m = estado.movimientos.find((x) => x.id === idMov);
  if (!m) return;
  if (!confirm('¿Borrar este movimiento de ' + dinero(m.monto, m.moneda) + '? No se puede deshacer.')) return;
  estado.movimientos = estado.movimientos.filter((x) => x.id !== idMov);
  guardar();
  pintarTodo();
  aviso('Borrado.');
}

/* ───────────────────────── Fijos: lo del mes ─────────────────────────
   Un fijo es lo que se paga cada mes y ya se sabe que viene: la casa, la luz,
   la tarjeta. No es un movimiento — es un recordatorio con números. Registrar
   que se pagó sigue siendo un movimiento, y pasa por la pregunta del
   sentimiento como cualquier otro.                                           */

let fijoActual = null;   // el id abierto en el modal, o null si es nuevo

const grupoDe = (f) => (GRUPOS.indexOf(f.grupo) >= 0 ? f.grupo : 'Otro');

function fijoVacio() {
  return {
    id: id(), nombre: '', grupo: 'Casa y seguros', moneda: estado.moneda,
    monto_mes: null, saldo: null, limite: null, tasa_anual: null,
    dia_pago: null, autopago: false,
    telefono: '', cuenta: '', titular: '', ultimos4: '', correo: '',
    historial: null, revisar: '', nota: ''
  };
}

function pintarResumenFijos() {
  const caja = $('#resumen-fijos');
  const fijos = estado.fijos;
  if (!fijos.length) {
    caja.innerHTML = '<article class="tarjeta"><h3>Todavía no hay fijos</h3>' +
      '<p class="parrafo">Aquí va lo que pagas cada mes y ya sabes que viene: la ' +
      'casa, la luz, las tarjetas. Verlos juntos es la mitad del trabajo.</p></article>';
    return;
  }
  const mes = fijos.reduce((a, f) => a + (Number(f.monto_mes) || 0), 0);
  const deuda = fijos.reduce((a, f) => a + (Number(f.saldo) || 0), 0);
  const porGrupo = {};
  fijos.forEach((f) => {
    const g = grupoDe(f);
    porGrupo[g] = (porGrupo[g] || 0) + (Number(f.monto_mes) || 0);
  });
  let h = '<article class="tarjeta"><p class="cifra-rotulo">Lo que sale cada mes</p>' +
          '<p class="fijos-total">' + escapar(dinero(mes)) + '</p>' +
          '<p class="pista sin-margen">' + fijos.length + ' conceptos.</p>';
  GRUPOS.forEach((g) => {
    if (!porGrupo[g]) return;
    h += '<div class="fijos-renglon"><span>' + escapar(g) + '</span><strong>' +
         escapar(dinero(porGrupo[g])) + '</strong></div>';
  });
  h += '</article>';
  if (deuda > 0) {
    h += '<article class="tarjeta"><p class="cifra-rotulo">Lo que debes, de lo que tiene saldo anotado</p>' +
         '<p class="fijos-total deuda">' + escapar(dinero(deuda)) + '</p>' +
         '<p class="pista sin-margen">Solo cuenta los fijos donde escribiste un saldo. ' +
         'Abajo está el plan para salir.</p></article>';
  }
  caja.innerHTML = h;
}

function pintarFijos() {
  pintarResumenFijos();
  pintarSimulador();
  const caja = $('#lista-fijos');
  caja.innerHTML = '';
  if (!estado.fijos.length) return;

  GRUPOS.forEach((g) => {
    const delGrupo = estado.fijos.filter((f) => grupoDe(f) === g);
    if (!delGrupo.length) return;
    delGrupo.sort((a, b) => (Number(b.monto_mes) || 0) - (Number(a.monto_mes) || 0));
    const suma = delGrupo.reduce((a, f) => a + (Number(f.monto_mes) || 0), 0);

    const rot = document.createElement('div');
    rot.className = 'grupo-rotulo';
    rot.innerHTML = '<span>' + escapar(g) + '</span><span>' + escapar(dinero(suma)) + '</span>';
    caja.appendChild(rot);

    delGrupo.forEach((f) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fijo' + (f.revisar ? ' revisar' : '');
      b.dataset.fijo = f.id;

      const detalle = [];
      if (f.dia_pago) detalle.push('día ' + f.dia_pago);
      if (f.autopago) detalle.push('se paga solo');
      if (f.ultimos4) detalle.push('•••• ' + f.ultimos4);
      if (f.revisar) detalle.push('confírmalo');

      let cifras = '<span class="fijo-mes">' + escapar(dinero(f.monto_mes, f.moneda)) + '</span>';
      if (Number(f.saldo) > 0) {
        cifras += '<span class="fijo-saldo">debes ' + escapar(dinero(f.saldo, f.moneda)) + '</span>';
      }
      if (Number(f.tasa_anual) > 0) {
        cifras += '<span class="fijo-tasa">' + escapar(String(f.tasa_anual)) + '% al año</span>';
      }

      b.innerHTML =
        '<span class="fijo-cuerpo"><span class="fijo-nombre">' + escapar(f.nombre || 'Sin nombre') + '</span>' +
        (detalle.length ? '<span class="fijo-detalle">' + escapar(detalle.join(' · ')) + '</span>' : '') +
        '</span><span class="fijo-cifras">' + cifras + '</span>';
      caja.appendChild(b);
    });
  });
}

function pintarHistorialFijo(f) {
  const caja = $('#fijo-historial');
  const h = f.historial;
  if (!h || !Object.keys(h).length) { caja.innerHTML = ''; return; }
  const meses = Object.keys(h);
  const alto = Math.max.apply(null, meses.map((m) => Number(h[m]) || 0));
  let barras = '';
  meses.forEach((m) => {
    const v = Number(h[m]) || 0;
    const paso = alto > 0 ? Math.max(1, Math.round((v / alto) * 10)) : 1;
    barras += '<span class="historial-mes"><span class="historial-palo h' + paso + '"></span>' +
              '<span>' + escapar(m) + '</span></span>';
  });
  caja.innerHTML = '<article class="tarjeta bloque-resultado"><h3>Lo que pagaste cada mes</h3>' +
    '<div class="historial">' + barras + '</div>' +
    '<p class="pista">Viene de tu Excel. El año no está escrito en ninguna parte de esa hoja, ' +
    'así que aquí va solo el mes. Esto no se suma a nada: es para que veas el tamaño.</p></article>';
}

function abrirFijo(idf) {
  const f = idf ? estado.fijos.find((x) => x.id === idf) : null;
  const d = f || fijoVacio();
  fijoActual = f ? f.id : null;

  $('#fijo-titulo').textContent = f ? (d.nombre || 'Un fijo') : 'Un fijo nuevo';
  $('#fijo-nombre').value = d.nombre || '';
  $('#fijo-grupo').value = grupoDe(d);
  $('#fijo-monto').value = d.monto_mes != null ? d.monto_mes : '';
  $('#fijo-dia').value = d.dia_pago != null ? d.dia_pago : '';
  $('#fijo-autopago').checked = !!d.autopago;
  $('#fijo-saldo').value = d.saldo != null ? d.saldo : '';
  $('#fijo-limite').value = d.limite != null ? d.limite : '';
  $('#fijo-tasa').value = d.tasa_anual != null ? d.tasa_anual : '';
  $('#fijo-telefono').value = d.telefono || '';
  $('#fijo-cuenta').value = d.cuenta || '';
  $('#fijo-titular').value = d.titular || '';
  $('#fijo-u4').value = d.ultimos4 || '';
  $('#fijo-nota').value = d.nota || '';
  const m = d.moneda || estado.moneda;
  $('#fijo-moneda').textContent = m;
  $('#fijo-moneda2').textContent = m;
  $('#fijo-moneda3').textContent = m;

  $('#fijo-revisar').innerHTML = d.revisar ? '<div class="aviso urge">' + escapar(d.revisar) + '</div>' : '';
  $('#fijo-borrar').classList.toggle('oculto', !f);
  $('#fijo-pague').classList.toggle('oculto', !f);
  pintarHistorialFijo(d);

  $('#modal-fijo').classList.remove('oculto');
  setTimeout(() => $('#fijo-nombre').focus(), 50);
}

const numCampo = (sel) => {
  const v = parseFloat($(sel).value);
  return isNaN(v) ? null : v;
};

function guardarFijo() {
  const nombre = $('#fijo-nombre').value.trim();
  if (!nombre) {
    aviso('Ponle nombre, aunque sea corto. Es lo único que necesita.');
    $('#fijo-nombre').focus();
    return;
  }
  const viejo = fijoActual ? estado.fijos.find((x) => x.id === fijoActual) : null;
  const f = viejo || fijoVacio();

  f.nombre = nombre;
  f.grupo = $('#fijo-grupo').value;
  f.monto_mes = numCampo('#fijo-monto');
  f.dia_pago = numCampo('#fijo-dia');
  f.autopago = $('#fijo-autopago').checked;
  f.saldo = numCampo('#fijo-saldo');
  f.limite = numCampo('#fijo-limite');
  f.tasa_anual = numCampo('#fijo-tasa');
  f.telefono = $('#fijo-telefono').value.trim();
  f.cuenta = $('#fijo-cuenta').value.trim();
  f.titular = $('#fijo-titular').value.trim();
  f.ultimos4 = $('#fijo-u4').value.trim().slice(-4);
  f.nota = $('#fijo-nota').value.trim();
  f.moneda = f.moneda || estado.moneda;
  f.revisar = '';   // lo editó ella: ya lo revisó, el aviso se va

  if (!viejo) estado.fijos.push(f);
  guardar();
  fijoActual = null;
  $('#modal-fijo').classList.add('oculto');
  pintarTodo();
  aviso('Guardado: ' + f.nombre);
}

function borrarFijo() {
  const f = estado.fijos.find((x) => x.id === fijoActual);
  if (!f) return;
  const pregunta = 'Quitar "' + f.nombre + '" de tus fijos. ' +
    'Los movimientos que ya registraste de el NO se borran. Continuar?';
  if (!confirm(pregunta)) return;
  estado.fijos = estado.fijos.filter((x) => x.id !== fijoActual);
  guardar();
  fijoActual = null;
  $('#modal-fijo').classList.add('oculto');
  pintarTodo();
  aviso('Quitado de los fijos.');
}

// "Lo pagué" no guarda nada solo: abre el registro ya lleno, y la pregunta del
// sentimiento sigue en blanco esperando. El momento es el momento.
function pagarFijo() {
  const f = estado.fijos.find((x) => x.id === fijoActual);
  if (!f) return;
  $('#modal-fijo').classList.add('oculto');
  abrirRegistro({ tipo: 'salida', monto: f.monto_mes, categoria: f.nombre });
}

/* ── Traer fijos de un archivo: AGREGA, nunca reemplaza ── */

// La huella de un fijo es su nombre MÁS lo que cuesta. No basta el nombre:
// María paga tres seguros de vida y dos se llaman igual — con distinto monto.
// Si sólo miráramos el nombre, el segundo se perdería en silencio.
const huella = (f) => String(f.nombre || '').trim().toLowerCase() +
                      '|' + (parseFloat(f.monto_mes) || 0).toFixed(2);

async function importarFijos(archivo) {
  const caja = $('#resultado-fijos');
  let datos;
  try { datos = await leerArchivo(archivo); }
  catch (e) {
    caja.innerHTML = '<div class="aviso urge">' + escapar(e.message) + '</div>';
    return;
  }
  const lista = Array.isArray(datos.fijos) ? datos.fijos : null;
  if (!lista) {
    caja.innerHTML = '<div class="aviso urge">Ese archivo no trae una lista de fijos.</div>';
    return;
  }

  // Por aqui entran dos archivos distintos. El que se declara 'correcciones'
  // cambia fijos que ya existen, y por eso NO se aplica al abrirlo: se pinta
  // la lista completa de lo que cambiaria y se espera el boton.
  if (String(datos.tipo || '').trim().toLowerCase() === 'correcciones') {
    correccionesPendientes = planDeCorrecciones(lista);
    pintarPlanDeCorrecciones(correccionesPendientes);
    return;
  }
  const yaHay = estado.fijos.map(huella);
  const puestos = [];
  const saltados = [];
  lista.forEach((crudo) => {
    const nombre = String(crudo.nombre || '').trim();
    if (!nombre) return;
    if (yaHay.indexOf(huella(crudo)) >= 0) { saltados.push(nombre); return; }
    const f = fijoVacio();
    f.nombre = nombre;
    f.grupo = GRUPOS.indexOf(crudo.grupo) >= 0 ? crudo.grupo : 'Otro';
    f.moneda = crudo.moneda || estado.moneda;
    ['monto_mes', 'saldo', 'limite', 'tasa_anual', 'dia_pago'].forEach((c) => {
      const v = parseFloat(crudo[c]);
      f[c] = isNaN(v) ? null : v;
    });
    f.autopago = !!crudo.autopago;
    CAMPOS_SENSIBLES.forEach((c) => { f[c] = String(crudo[c] || '').trim(); });
    f.ultimos4 = f.ultimos4.slice(-4);
    f.historial = mesesAlDerecho(crudo.historial);
    f.revisar = String(crudo.revisar || '').trim();
    f.nota = String(crudo.nota || '').trim();
    estado.fijos.push(f);
    yaHay.push(huella(f));
    puestos.push(f);
  });

  if (!puestos.length) {
    caja.innerHTML = '<div class="aviso calma"><strong>No había nada nuevo que traer.</strong>' +
      '<p class="pista">Los ' + saltados.length + ' del archivo ya los tienes, y los dejé como están.</p></div>';
    return;
  }
  guardar();
  pintarTodo();

  const mes = puestos.reduce((a, f) => a + (Number(f.monto_mes) || 0), 0);
  const deuda = puestos.reduce((a, f) => a + (Number(f.saldo) || 0), 0);
  const porRevisar = puestos.filter((f) => f.revisar);
  const plural = puestos.length === 1 ? ' concepto.' : ' conceptos.';
  let h = '<div class="aviso calma"><strong>Entraron ' + puestos.length + plural + '</strong>' +
    '<p class="pista">Suman ' + escapar(dinero(mes)) + ' al mes' +
    (deuda > 0 ? ', y ' + escapar(dinero(deuda)) + ' de saldo anotado' : '') + '.' +
    (saltados.length ? ' Dejé ' + saltados.length + ' como estaban, ya los tenías.' : '') + '</p>';
  if (porRevisar.length) {
    h += '<p class="pista"><strong>' + porRevisar.length + ' traen un aviso para que los confirmes.</strong> ' +
         'Salen con una raya dorada en la lista. Ábrelos, corrige el número y el aviso se va.</p>';
  }
  h += '</div>';
  caja.innerHTML = h;
  aviso('Listo: ' + puestos.length + ' fijos nuevos.', 5);
}

/* ──────────────── Traer CORRECCIONES de un archivo ────────────────
   Importar agrega. Esto es lo otro: cambiar lo que ya existe.

   Nunca aplica nada al abrir el archivo. Calcula lo que cambiaría, lo pinta
   completo —lo que tienes y lo que dice el archivo, campo por campo— y espera
   un botón. Los efectos apagados son el estado normal, no un descuido: un
   archivo que corrige saldos y tasas no se ejecuta solo.

   Y nada se pierde: al aplicar, el valor anterior queda escrito en la nota del
   fijo, con su fecha. Si el cambio estuvo mal, ahí está de dónde venía.

   Lo que NO toca, a propósito:
   - El historial. Sus meses no traen año, así que mezclar 2025 con 2026 daría
     una suma sin significado con cara de buena.
   - Teléfono, cuenta, titular, últimos 4 y correo. Así un archivo de
     correcciones se puede mandar o guardar sin llevar con qué cobrarte. */

const CORREGIBLES = [
  { campo: 'nombre_nuevo', en: 'nombre',     rotulo: 'Nombre',               como: 'texto' },
  { campo: 'grupo',        en: 'grupo',      rotulo: 'Grupo',                como: 'grupo' },
  { campo: 'moneda',       en: 'moneda',     rotulo: 'Moneda',               como: 'texto' },
  { campo: 'monto_mes',    en: 'monto_mes',  rotulo: 'Lo que cuesta al mes', como: 'dinero' },
  { campo: 'saldo',        en: 'saldo',      rotulo: 'Saldo',                como: 'dinero' },
  { campo: 'limite',       en: 'limite',     rotulo: 'Límite',               como: 'dinero' },
  { campo: 'tasa_anual',   en: 'tasa_anual', rotulo: 'Tasa anual',           como: 'tasa' },
  { campo: 'dia_pago',     en: 'dia_pago',   rotulo: 'Día de pago',          como: 'numero' },
  { campo: 'autopago',     en: 'autopago',   rotulo: 'Autopago',             como: 'si_no' },
  { campo: 'nota',         en: 'nota',       rotulo: 'Nota',                 como: 'texto' },
  { campo: 'revisar',      en: 'revisar',    rotulo: 'Aviso',                como: 'texto' }
];

let correccionesPendientes = null;

const llave = (s) => String(s || '').trim().toLowerCase();

function comoSeVe(v, como) {
  if (v === null || v === undefined || v === '') return '(vacío)';
  if (como === 'dinero') return dinero(Number(v));
  if (como === 'tasa') return Number(v).toFixed(2) + '%';
  if (como === 'si_no') return v ? 'sí' : 'no';
  return String(v);
}

// Compara como se guardaria, no como viene escrito: "27.27" y 27.27 son el
// mismo numero, y no vale la pena ofrecerte un cambio que no cambia nada.
function mismoValor(hay, viene, como) {
  if (como === 'dinero' || como === 'tasa' || como === 'numero') {
    const a = hay === null || hay === '' ? null : Number(hay);
    const b = viene === null || viene === '' ? null : Number(viene);
    if (a === null || b === null) return a === b;
    return Math.abs(a - b) < 0.005;
  }
  if (como === 'si_no') return !!hay === !!viene;
  return String(hay || '') === String(viene || '');
}

/* Arma el plan. No escribe nada. */
function planDeCorrecciones(lista) {
  const plan = { cambios: [], sin_cambio: [], no_hallados: [], ambiguos: [], avisos: [] };

  lista.forEach((cruda) => {
    const nom = String(cruda.nombre || '').trim();
    if (!nom) return;

    let candidatos = estado.fijos.filter((f) => llave(f.nombre) === llave(nom));

    // Dos fijos pueden llamarse igual: ella paga dos seguros de vida con el
    // mismo nombre. Para esos, el archivo tiene que decir cual con monto_actual.
    if (candidatos.length > 1) {
      const m = parseFloat(cruda.monto_actual);
      if (!isNaN(m)) {
        candidatos = candidatos.filter((f) => Math.abs((Number(f.monto_mes) || 0) - m) < 0.005);
      }
    }
    if (!candidatos.length) { plan.no_hallados.push(nom); return; }
    if (candidatos.length > 1) { plan.ambiguos.push(nom); return; }

    const f = candidatos[0];
    if (cruda.historial) {
      plan.avisos.push('A ' + nom + ' no le toqué el historial: sus meses no traen año.');
    }
    CAMPOS_SENSIBLES.forEach((c) => {
      if (cruda[c]) plan.avisos.push('A ' + nom + ' no le toqué ' + c + ': eso se teclea en la app.');
    });

    const campos = [];
    CORREGIBLES.forEach((d) => {
      if (!(d.campo in cruda)) return;
      let viene = cruda[d.campo];
      if (d.como === 'dinero' || d.como === 'tasa' || d.como === 'numero') {
        // null a proposito = vaciar el campo. Pero basura NO es permiso para
        // vaciar: un numero mal escrito tirando un saldo bueno seria el peor
        // regalo de este modo. Se rechaza el campo y se avisa.
        if (viene !== null && viene !== '') {
          const v = parseFloat(viene);
          if (isNaN(v)) {
            plan.avisos.push('A ' + nom + ' no le toqu\u00e9 ' + d.rotulo.toLowerCase() +
                             ': "' + viene + '" no es un n\u00famero.');
            return;
          }
          viene = v;
        } else {
          viene = null;
        }
      } else if (d.como === 'si_no') {
        viene = !!viene;
      } else {
        viene = String(viene === null || viene === undefined ? '' : viene).trim();
      }
      if (d.como === 'grupo' && GRUPOS.indexOf(viene) < 0) {
        plan.avisos.push('A ' + nom + ' no le cambié el grupo: "' + viene + '" no existe.');
        return;
      }
      if (d.campo === 'nombre_nuevo' && !viene) return;
      const hay = f[d.en];
      if (mismoValor(hay, viene, d.como)) return;
      campos.push({ en: d.en, rotulo: d.rotulo, como: d.como, antes: hay, despues: viene });
    });

    if (!campos.length) plan.sin_cambio.push(nom);
    else plan.cambios.push({
      id: f.id, nombre: f.nombre, campos: campos,
      por_que: String(cruda.por_que || '').trim()
    });
  });

  return plan;
}

/* Pinta el plan completo y espera. Aqui no se decide nada todavia. */
function pintarPlanDeCorrecciones(plan) {
  const caja = $('#resultado-fijos');
  const n = plan.cambios.length;

  if (!n) {
    let h = '<div class="aviso calma"><strong>No hay nada que corregir.</strong>' +
            '<p class="pista">';
    if (plan.sin_cambio.length) {
      h += 'Los ' + plan.sin_cambio.length + ' del archivo ya tienen esos mismos valores. ';
    }
    if (plan.no_hallados.length) {
      h += 'No encontré: ' + escapar(plan.no_hallados.join(', ')) + '. ';
    }
    if (plan.ambiguos.length) {
      h += 'Tienes más de un fijo llamado ' + escapar(plan.ambiguos.join(', ')) +
           ', así que el archivo necesita decir cuál con "monto_actual". ';
    }
    h += '</p></div>';
    caja.innerHTML = h;
    correccionesPendientes = null;
    return;
  }

  let h = '<div class="aviso ojo"><strong>Esto es lo que cambiaría. Todavía no cambié nada.</strong>' +
    '<p class="pista">Léelo completo antes de aplicarlo. Son tus saldos y tus tasas: ' +
    'de aquí salen los años que te dice el simulador.</p></div>' +
    '<article class="tarjeta">' +
    '<h3>' + n + (n === 1 ? ' fijo cambiaría' : ' fijos cambiarían') + '</h3>' +
    '<ul class="lista-limpia correcciones">';

  plan.cambios.forEach((c) => {
    h += '<li class="corr-fijo"><strong>' + escapar(c.nombre) + '</strong>';
    if (c.por_que) h += '<span class="corr-porque">' + escapar(c.por_que) + '</span>';
    h += '<ul class="lista-limpia">';
    c.campos.forEach((k) => {
      h += '<li class="corr-campo"><span class="corr-rotulo">' + escapar(k.rotulo) + '</span>' +
           '<span class="corr-antes">' + escapar(comoSeVe(k.antes, k.como)) + '</span>' +
           '<span class="corr-flecha">→</span>' +
           '<span class="corr-despues">' + escapar(comoSeVe(k.despues, k.como)) + '</span></li>';
    });
    h += '</ul></li>';
  });
  h += '</ul>';

  // Las tres pruebas baratas. Si alguna truena, no se aplica.
  h += '<p class="pista"><strong>Antes de aplicar, tres pruebas de diez segundos:</strong></p>' +
    '<ul class="lista-limpia pruebas">' +
    '<li>Busca <strong>dos que te sepas de memoria</strong>. Si dicen otra cosa, no apliques.</li>' +
    '<li>¿Aparece cambiando <strong>algo que tú sabes que está bien</strong>? Ese renglón vale ' +
    'más que todos los demás juntos.</li>' +
    '<li>¿Quiere cambiar <strong>casi todo</strong>? Entonces el problema es del archivo, no ' +
    'de tus fijos.</li>' +
    '</ul>';

  const otros = [];
  if (plan.sin_cambio.length) {
    otros.push(plan.sin_cambio.length + ' ya estaban igual: ' + escapar(plan.sin_cambio.join(', ')));
  }
  if (plan.no_hallados.length) {
    otros.push('No encontré ' + plan.no_hallados.length + ': ' +
               escapar(plan.no_hallados.join(', ')));
  }
  if (plan.ambiguos.length) {
    otros.push('Tienes más de uno llamado ' + escapar(plan.ambiguos.join(', ')) +
               '. El archivo tiene que decir cuál con "monto_actual".');
  }
  plan.avisos.forEach((a) => otros.push(escapar(a)));
  if (otros.length) {
    h += '<p class="pista separado"><strong>Lo demás del archivo:</strong></p>' +
         '<ul class="lista-limpia">';
    otros.forEach((o) => { h += '<li class="pista">' + o + '</li>'; });
    h += '</ul>';
  }

  h += '<div class="botonera separado">' +
    '<button type="button" class="btn" data-accion="cancelar-correcciones">No, déjalo así</button>' +
    '<button type="button" class="btn btn-principal" data-accion="aplicar-correcciones">' +
    'Aplicar ' + (n === 1 ? 'el cambio' : 'los ' + n + ' cambios') + '</button>' +
    '</div></article>';

  caja.innerHTML = h;
}

/* Ahora sí escribe. Y deja escrito de dónde venía cada valor. */
function aplicarCorrecciones() {
  const plan = correccionesPendientes;
  if (!plan || !plan.cambios.length) return;

  const hoy = new Date();
  const fecha = hoy.getDate() + ' ' + MESES[hoy.getMonth()];
  let cuantos = 0;

  plan.cambios.forEach((c) => {
    const f = estado.fijos.filter((x) => x.id === c.id)[0];
    if (!f) return;
    const rastro = c.campos.map((k) =>
      k.rotulo.toLowerCase() + ': ' + comoSeVe(k.antes, k.como) +
      ' → ' + comoSeVe(k.despues, k.como)).join(' · ');
    c.campos.forEach((k) => { f[k.en] = k.despues; });
    // El valor viejo no se borra: queda arriba en la nota, con fecha.
    const linea = '[' + fecha + '] ' + rastro + (c.por_que ? ' \u2014 ' + c.por_que : '');
    f.nota = f.nota ? linea + '\n' + f.nota : linea;
    cuantos += 1;
  });

  correccionesPendientes = null;
  guardar();
  pintarTodo();
  $('#resultado-fijos').innerHTML =
    '<div class="aviso calma"><strong>Listo: cambié ' + cuantos +
    (cuantos === 1 ? ' fijo.' : ' fijos.') + '</strong>' +
    '<p class="pista">Lo que tenían antes quedó escrito en su nota, con la fecha. ' +
    'Ábrelos y lo ves. Si algo salió mal, de ahí lo regresas.</p></div>';
  aviso('Listo: ' + cuantos + (cuantos === 1 ? ' fijo corregido.' : ' fijos corregidos.'), 5);
}

function cancelarCorrecciones() {
  correccionesPendientes = null;
  $('#resultado-fijos').innerHTML =
    '<div class="aviso calma"><strong>No cambié nada.</strong>' +
    '<p class="pista">Tus fijos quedaron igual que estaban.</p></div>';
}

/* ───────────────────── Simulador: salir de las deudas ─────────────────────
   Esto no adivina nada. Solo puede proyectar una deuda que tenga ESCRITOS su
   saldo y su tasa; las que les falta uno de los dos se nombran aparte, sin
   rellenarlas. Un cero inventado aquí no sería un detalle: sería un plan de
   años construido sobre un número que nadie escribió.

   Lo que la cuenta NO sabe se dice en la pantalla, no se esconde: no conoce
   sus ingresos, así que no puede saber si el extra que escriba se sostiene.
   Una proyección que cruza ese límite no es conservadora ni optimista — es
   ficción con decimales. El límite se nombra y ahí se detiene.              */

const TOPE_MESES = 1200;   // 100 años: si no acabó aquí, no acaba nunca

// Solo las de la moneda de la app. Mezclar monedas en una suma da un numero
// que no significa nada, y se veria igual de confiable que uno bueno. Las de
// otra moneda no se convierten a ojo: se declaran y ya.
function deudasSimulables() {
  return estado.fijos
    .filter((f) => Number(f.saldo) > 0 && Number(f.tasa_anual) > 0 &&
                   (f.moneda || estado.moneda) === estado.moneda)
    .map((f) => ({
      nombre: f.nombre || 'Sin nombre',
      moneda: f.moneda || estado.moneda,
      saldo: Number(f.saldo),
      tasa: Number(f.tasa_anual),
      pago: Number(f.monto_mes) || 0
    }));
}

// Las que traen una pieza y les falta la otra. No se simulan: se declaran.
function deudasIncompletas() {
  const faltaSaldo = [];
  const faltaTasa = [];
  const otraMoneda = [];
  estado.fijos.forEach((f) => {
    const s = Number(f.saldo) > 0;
    const t = Number(f.tasa_anual) > 0;
    if (t && !s) faltaSaldo.push(f.nombre || 'Sin nombre');
    if (s && !t) faltaTasa.push(f.nombre || 'Sin nombre');
    if (s && t && (f.moneda || estado.moneda) !== estado.moneda) {
      otraMoneda.push((f.nombre || 'Sin nombre') + ' (' + (f.moneda || '?') + ')');
    }
  });
  return { faltaSaldo: faltaSaldo, faltaTasa: faltaTasa, otraMoneda: otraMoneda };
}

/* El motor. Mes por mes, igual que lo haría el banco:
   primero corre el interés, después se reparte el pago.

   rodar = true  : cuando una deuda muere, su pago se pasa a la siguiente.
                   Eso es lo que hace funcionar un plan, y no cuesta un peso más.
   rodar = false : cuando una deuda muere, ese dinero se desaparece. Es lo que
                   pasa solo, sin plan.
   orden = 'tasa'  → la más cara primero (avalancha)
   orden = 'saldo' → la más chica primero (bola de nieve)
   orden = null    → nadie ataca a nadie; cada una su mínimo.                */
function simularDeudas(deudas, extra, orden, rodar) {
  const ds = deudas.map((d) => Object.assign({}, d));
  const minimo = {};
  ds.forEach((d) => { minimo[d.nombre] = d.pago; });
  const todosLosMinimos = ds.reduce((a, d) => a + d.pago, 0);

  let mes = 0;
  let interesPagado = 0;
  const muertes = [];
  const viva = (d) => d.saldo > 0.005;

  while (ds.some(viva) && mes < TOPE_MESES) {
    mes += 1;
    ds.forEach((d) => {
      if (!viva(d)) return;
      const i = (d.saldo * d.tasa) / 100 / 12;
      d.saldo += i;
      interesPagado += i;
    });

    const vivas = ds.filter(viva);
    let bolsa = extra + (rodar
      ? todosLosMinimos
      : vivas.reduce((a, d) => a + minimo[d.nombre], 0));

    // El mínimo de cada una va primero: nadie se queda sin pagar lo suyo.
    vivas.forEach((d) => {
      const p = Math.min(minimo[d.nombre], d.saldo, bolsa);
      d.saldo -= p;
      bolsa -= p;
    });

    // Lo que sobró ataca al objetivo, hasta acabarlo, y sigue con el siguiente.
    if (orden) {
      const quedan = ds.filter(viva);
      quedan.sort(orden === 'tasa'
        ? (a, b) => b.tasa - a.tasa
        : (a, b) => a.saldo - b.saldo);
      for (let k = 0; k < quedan.length && bolsa > 0.005; k++) {
        const p = Math.min(bolsa, quedan[k].saldo);
        quedan[k].saldo -= p;
        bolsa -= p;
      }
    }

    ds.forEach((d) => {
      if (!viva(d) && muertes.every((m) => m.nombre !== d.nombre)) {
        muertes.push({ nombre: d.nombre, mes: mes });
      }
    });
  }

  return {
    meses: mes,
    interes: interesPagado,
    acabo: ds.every((d) => !viva(d)),
    muertes: muertes
  };
}

// "36 meses" dicho como lo diría una persona.
function enAnos(meses) {
  if (meses < 12) return meses + (meses === 1 ? ' mes' : ' meses');
  const a = Math.floor(meses / 12);
  const m = meses % 12;
  let t = a + (a === 1 ? ' año' : ' años');
  if (m) t += ' y ' + m + (m === 1 ? ' mes' : ' meses');
  return t;
}

function pintarSimulador() {
  const caja = $('#simulador');
  if (!caja) return;
  const deudas = deudasSimulables();
  const huecos = deudasIncompletas();

  if (!deudas.length) {
    // Sin las dos piezas no hay nada que calcular, y hay que decir por qué.
    const falta = huecos.faltaSaldo.length + huecos.faltaTasa.length;
    const ajenas = huecos.otraMoneda.length;
    caja.innerHTML = '<article class="tarjeta"><h3>Salir de las deudas</h3>' +
      '<p class="parrafo">Para decirte en cuántos meses sales, cada deuda necesita ' +
      '<strong>dos números escritos</strong>: cuánto debes y a qué tasa. ' +
      (falta
        ? 'Hay ' + falta + (falta === 1 ? ' donde falta' : ' donde falta') +
          ' uno de los dos. ' + (falta === 1 ? 'Ábrela' : 'Ábrelas') +
          ' y escríbelo: no lo voy a adivinar.'
        : 'Abre un fijo de tarjeta y escríbelos.') +
      (ajenas
        ? ' Y ' + ajenas + ' están completas pero en otra moneda, así que van aparte.'
        : '') +
      '</p></article>';
    return;
  }

  const plan = estado.plan_deuda || { extra: null, orden: 'tasa' };
  const extra = Number(plan.extra) || 0;
  const orden = plan.orden === 'saldo' ? 'saldo' : 'tasa';
  const mon = estado.moneda;   // nunca la de la primera de la lista
  const totalSaldo = deudas.reduce((a, d) => a + d.saldo, 0);
  const totalPago = deudas.reduce((a, d) => a + d.pago, 0);
  const interesMes = deudas.reduce((a, d) => a + (d.saldo * d.tasa) / 100 / 12, 0);

  const hoy = simularDeudas(deudas, 0, null, false);
  const conPlan = simularDeudas(deudas, extra, orden, true);
  const elOtro = simularDeudas(deudas, extra, orden === 'tasa' ? 'saldo' : 'tasa', true);

  const abierto = estado.ver_plan !== false;
  let h = '<article class="tarjeta">' +
    '<div class="grafica-cabecera"><h3>Salir de las deudas</h3>' +
    '<button type="button" class="btn btn-chico" data-accion="plan">' +
    (abierto ? 'Ocultar' : 'Ver el plan') + '</button></div>' +
    '<p class="cifra-rotulo">Lo que te cuesta cada mes solo en intereses</p>' +
    '<p class="fijos-total deuda">' + escapar(dinero(interesMes, mon)) + '</p>' +
    '<p class="pista">De ' + escapar(dinero(totalSaldo, mon)) + ' en ' + deudas.length +
    ' deudas, pagando ' + escapar(dinero(totalPago, mon)) + ' al mes. Ese dinero no baja ' +
    'nada de lo que debes: es la renta de deberlo.</p>';

  // El hallazgo que más importa, y es gratis: redirigir lo que se libera.
  if (hoy.acabo && conPlan.acabo) {
    const mesesMenos = hoy.meses - conPlan.meses;
    const ahorro = hoy.interes - conPlan.interes;
    h += '<div class="sim-comparar">' +
      '<div class="sim-caso"><span class="sim-caso-rotulo">Como va hoy</span>' +
      '<strong>' + escapar(enAnos(hoy.meses)) + '</strong>' +
      '<span class="sim-caso-nota">' + escapar(dinero(hoy.interes, mon)) + ' de intereses</span></div>' +
      '<div class="sim-caso bueno"><span class="sim-caso-rotulo">Con plan</span>' +
      '<strong>' + escapar(enAnos(conPlan.meses)) + '</strong>' +
      '<span class="sim-caso-nota">' + escapar(dinero(conPlan.interes, mon)) + ' de intereses</span></div>' +
      '</div>';
    if (mesesMenos > 0 || ahorro > 0) {
      h += '<p class="sim-gane"><strong>' + mesesMenos + ' meses menos</strong> y ' +
        '<strong>' + escapar(dinero(ahorro, mon)) + ' menos de intereses</strong>' +
        (extra > 0
          ? ', agregando ' + escapar(dinero(extra, mon)) + ' al mes.'
          : ', y sin poner un peso más.') + '</p>';
    }
    h += '<p class="pista">La diferencia no es pagar más: es que cuando una deuda se acaba, ' +
      'su pago <strong>se pasa a la siguiente</strong> en lugar de desaparecerse del bolsillo. ' +
      'Eso es todo el truco.</p>';
  } else if (!hoy.acabo) {
    h += '<p class="sim-nunca"><strong>Como va hoy, no se acaba.</strong> Lo que pagas al mes ' +
      'no alcanza a cubrir ni los intereses de alguna de estas deudas, así que crece sola. ' +
      'No es falta de disciplina: es aritmética, y hay que cambiar el pago o la tasa.</p>';
  }
  h += '</article>';

  // Cerrado, se queda con lo de arriba: la cifra y los dos caminos. Eso es lo
  // que sirve de un vistazo; lo demas es para cuando se siente a moverle.
  if (!abierto) { caja.innerHTML = h; return; }

  // Lo que ella decide: cuánto agrega y en qué orden.
  h += '<article class="tarjeta">' +
    '<h3>Muévele</h3>' +
    '<div class="campo"><label for="deuda-extra">Lo que puedo agregar cada mes</label>' +
    '<input type="number" id="deuda-extra" inputmode="decimal" min="0" step="10" ' +
    'placeholder="0" value="' +
    (plan.extra !== null && plan.extra !== undefined ? escapar(String(plan.extra)) : '') +
    '"></div>' +
    '<p class="pista">Escribe lo que de verdad puedes sostener todos los meses, no lo más que ' +
    'podrías un mes bueno. Un extra chico que aguanta un año le gana a uno grande que se cae ' +
    'en el mes dos — y esta cuenta no sabe cuánto ganas, así que ese juicio es tuyo.</p>' +
    '<p class="cifra-rotulo separado">Cuál atacar primero</p>' +
    '<div class="sim-ordenes">' +
    '<button type="button" class="sim-orden' + (orden === 'tasa' ? ' puesta' : '') + '" data-orden="tasa">' +
    '<strong>La más cara</strong><span>la de tasa más alta</span></button>' +
    '<button type="button" class="sim-orden' + (orden === 'saldo' ? ' puesta' : '') + '" data-orden="saldo">' +
    '<strong>La más chica</strong><span>para ver una caer pronto</span></button>' +
    '</div>';

  // Honestidad: si los dos caminos dan casi lo mismo, se dice. Vender la
  // avalancha como si fuera mucho mejor cuando son $36 sería mentir con cifras.
  if (conPlan.acabo && elOtro.acabo) {
    const difInt = Math.abs(conPlan.interes - elOtro.interes);
    const difMes = Math.abs(conPlan.meses - elOtro.meses);
    if (difMes === 0 && difInt < Math.max(50, totalSaldo * 0.01)) {
      h += '<p class="sim-igual">En tu caso los dos caminos acaban <strong>el mismo mes</strong>, ' +
        'y se diferencian en ' + escapar(dinero(difInt, mon)) + ' de intereses. ' +
        'Escoge el que te mantenga haciéndolo: es lo único que cambia el resultado.</p>';
    } else {
      h += '<p class="pista">El otro camino acabaría en ' + escapar(enAnos(elOtro.meses)) +
        ' con ' + escapar(dinero(elOtro.interes, mon)) + ' de intereses.</p>';
    }
  }
  h += '</article>';

  // El orden en que caen, con el plan puesto. Esto es lo que se siente.
  if (conPlan.acabo && conPlan.muertes.length) {
    h += '<article class="tarjeta"><h3>El orden en que se acaban</h3><div class="sim-caida">';
    conPlan.muertes.forEach((m) => {
      h += '<div class="sim-caida-fila"><span class="sim-caida-mes">mes ' + m.mes + '</span>' +
        '<span class="sim-caida-nombre">' + escapar(m.nombre) + '</span></div>';
    });
    h += '</div><p class="pista">' +
      (extra > 0
        ? 'Con los ' + escapar(dinero(extra, mon)) + ' que agregaste y el orden que escogiste. '
        : 'Con lo que ya pagas hoy y el orden que escogiste, sin agregar nada. ') +
      'Cada una que cae libera su pago para la siguiente, y por eso las últimas caen ' +
      'más rápido.</p></article>';
  }

  // Las deudas que casi no bajan: el pago apenas cubre el interés.
  const frenadas = deudas.filter((d) => {
    const i = (d.saldo * d.tasa) / 100 / 12;
    return d.pago > 0 && (d.pago - i) < d.pago * 0.2;
  });
  if (frenadas.length) {
    h += '<article class="tarjeta aviso-suave"><h3>Estas casi no bajan</h3>';
    frenadas.forEach((d) => {
      const i = (d.saldo * d.tasa) / 100 / 12;
      h += '<p class="parrafo"><strong>' + escapar(d.nombre) + '</strong> — de los ' +
        escapar(dinero(d.pago, d.moneda)) + ' que pagas, ' + escapar(dinero(i, d.moneda)) +
        ' se van en intereses. A lo que debes le bajan ' +
        escapar(dinero(d.pago - i, d.moneda)) + '.</p>';
    });
    h += '<p class="pista">No es que estés haciendo algo mal: el pago mínimo está calculado ' +
      'para que apenas avance. Es la que más gana si le mandas el extra.</p></article>';
  }

  // Lo que esta cuenta no sabe. Va en la pantalla, no en una nota al pie.
  h += '<article class="tarjeta"><h3>Lo que esta cuenta no sabe</h3><ul class="lista-limpia">';
  if (huecos.faltaSaldo.length) {
    const nS = huecos.faltaSaldo.length;
    h += '<li><strong>' + nS + (nS === 1 ? ' deuda tiene' : ' deudas tienen') +
      ' tasa pero no saldo</strong> — ' +
      escapar(huecos.faltaSaldo.join(', ')) + '. No están en esta cuenta, así que lo que debes ' +
      'de verdad es más que ' + escapar(dinero(totalSaldo, mon)) + '.</li>';
  }
  if (huecos.faltaTasa.length) {
    const nT = huecos.faltaTasa.length;
    h += '<li><strong>' + nT + (nT === 1 ? ' tiene' : ' tienen') +
      ' saldo pero no tasa</strong> — ' +
      escapar(huecos.faltaTasa.join(', ')) + '. Sin la tasa no se puede proyectar, y no me la ' +
      'voy a inventar.</li>';
  }
  if (huecos.otraMoneda.length) {
    const nM = huecos.otraMoneda.length;
    h += '<li><strong>' + nM + (nM === 1 ? ' está' : ' están') +
      ' en otra moneda</strong> — ' +
      escapar(huecos.otraMoneda.join(', ')) + '. No las sumo con las demás: un total que ' +
      'mezcla monedas no significa nada, y no voy a convertirlas a un tipo de cambio ' +
      'que me invente.</li>';
  }
  h += '<li><strong>No sé cuánto ganas.</strong> Por eso no te propongo un extra: no tengo ' +
    'manera de saber si lo aguantas. Si el número que escribes no se sostiene, la cuenta de ' +
    'arriba es bonita y falsa.</li>' +
    '<li><strong>Supone que la tasa no cambia</strong> y que no vuelves a usar la tarjeta. ' +
    'Una compra nueva en medio del plan mueve todo.</li>' +
    '</ul></article>';

  caja.innerHTML = h;
}

function guardarPlanDeuda(cambios) {
  estado.plan_deuda = Object.assign({ extra: null, orden: 'tasa' },
                                    estado.plan_deuda || {}, cambios);
  guardar();
  pintarSimulador();
}

/* ───────────────────────── Modal: radiografía ───────────────────────── */

const respuestas = {};

function abrirRadiografia() {
  Object.keys(respuestas).forEach((k) => delete respuestas[k]);
  const caja = $('#radio-preguntas');
  caja.innerHTML = '';

  PREGUNTAS.forEach((p) => {
    const div = document.createElement('div');
    div.className = 'pregunta';

    if (p.nota) {
      const nota = document.createElement('p');
      nota.className = 'pista nota-pregunta';
      nota.textContent = p.nota;
      div.appendChild(nota);
    }

    const et = document.createElement('label');
    et.textContent = p.texto;
    div.appendChild(et);

    if (p.tipo === 'escala') {
      const fila = document.createElement('div');
      fila.className = 'escala';
      for (let n = 1; n <= 5; n++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'escala-btn';
        b.textContent = n;
        b.addEventListener('click', () => {
          respuestas[p.id] = respuestas[p.id] === n ? undefined : n;
          Array.from(fila.children).forEach((o, i) => o.classList.toggle('puesto', respuestas[p.id] === i + 1));
        });
        fila.appendChild(b);
      }
      div.appendChild(fila);
      const pies = document.createElement('div');
      pies.className = 'escala-pies';
      pies.innerHTML = '<span>1 · ' + escapar(p.izq) + '</span><span>5 · ' + escapar(p.der) + '</span>';
      div.appendChild(pies);
    } else {
      const ta = document.createElement('textarea');
      ta.rows = 2;
      ta.placeholder = 'Puedes dejarla en blanco.';
      ta.addEventListener('input', () => { respuestas[p.id] = ta.value.trim(); });
      div.appendChild(ta);
    }
    caja.appendChild(div);
  });

  $('#modal-radiografia').classList.remove('oculto');
}

function guardarRadiografia() {
  const limpias = {};
  Object.keys(respuestas).forEach((k) => { if (respuestas[k]) limpias[k] = respuestas[k]; });
  if (!Object.keys(limpias).length) {
    aviso('No contestaste nada todavía. No pasa nada: ciérrala y vuelve cuando quieras.');
    return;
  }
  // Aditivo, nunca sustractivo: se agrega una nueva, no se pisa la anterior.
  estado.radiografias.push({ id: id(), cuando: new Date().toISOString(), zona: zona(), respuestas: limpias });
  guardar();
  $('#modal-radiografia').classList.add('oculto');
  pintarTodo();
  aviso('Guardada con la fecha de hoy. No se borra.');
}

function pintarRadiografias() {
  const caja = $('#lista-radiografias');
  if (!estado.radiografias.length) {
    caja.innerHTML = '<p class="vacio">Todavía no contestas ninguna.</p>';
    return;
  }
  let html = '';
  estado.radiografias.slice().reverse().forEach((r) => {
    html += '<article class="tarjeta radio-guardada">' +
      '<p class="radio-fecha">' + fechaCorta(r.cuando) + '</p>';
    PREGUNTAS.forEach((p) => {
      const v = r.respuestas[p.id];
      if (!v) return;
      html += '<p class="radio-par"><strong>' + escapar(p.texto) + '</strong>' +
        (p.tipo === 'escala' ? v + ' de 5' : escapar(v)) + '</p>';
    });
    html += '</article>';
  });
  caja.innerHTML = html;
}

/* ───────────────────────── Modal: meta ───────────────────────── */

function abrirMeta() {
  $('#meta-moneda').textContent = estado.moneda;
  $('#meta-titulo').value = estado.meta ? estado.meta.titulo : '';
  $('#meta-monto').value = estado.meta ? estado.meta.monto : '';
  $('#modal-meta').classList.remove('oculto');
}

function guardarMeta() {
  const monto = parseFloat($('#meta-monto').value);
  if (!(monto > 0)) { aviso('Falta cuánto quieres juntar.'); return; }
  estado.meta = {
    titulo: $('#meta-titulo').value.trim() || 'mi meta',
    monto: Math.round(monto * 100) / 100,
    moneda: estado.moneda
  };
  guardar();
  $('#modal-meta').classList.add('oculto');
  pintarTodo();
  aviso('Meta guardada.');
}

/* ───────────────────────── Respaldo ───────────────────────── */

// Se baja con un enlace local (blob). No hay servidor de por medio: el archivo
// se arma aquí mismo, en el teléfono, y se guarda donde tú le digas.
function bajarArchivo(nombre, texto) {
  const blob = new Blob([texto], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const selloFecha = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

// Dos archivos a propósito: los números por un lado, lo escrito por el otro.
// El de números lo puedes mandar por donde sea. El completo, no.
function respaldoNumeros() {
  const datos = {
    app: 'Dineros Dineros',
    version: 1,
    tipo: 'numeros',
    generado: new Date().toISOString(),
    zona: zona(),
    moneda: estado.moneda,
    meta: estado.meta,
    movimientos: estado.movimientos.map((m) => ({
      id: m.id, tipo: m.tipo, monto: m.monto, moneda: m.moneda,
      categoria: m.categoria, cuando: m.cuando, zona: m.zona
    })),
    // Los fijos van sin teléfono, cuenta, titular, últimos 4 ni correo.
    // Este archivo se puede mandar; con esos datos, no.
    fijos: estado.fijos.map((f) => {
      const limpio = Object.assign({}, f);
      CAMPOS_SENSIBLES.forEach((c) => { delete limpio[c]; });
      return limpio;
    })
  };
  bajarArchivo('dineros-numeros-' + selloFecha() + '.json', JSON.stringify(datos, null, 2));
  estado.respaldo.ultimo_iso = new Date().toISOString();
  estado.respaldo.ultimo_tipo = 'numeros';
  guardar();
  pintarTodo();
  aviso('Listo. Ese archivo trae montos y fechas, nada de lo que escribiste.', 6);
}

function respaldoCompleto() {
  const datos = Object.assign({}, estado, {
    tipo: 'completo',
    generado: new Date().toISOString()
  });
  bajarArchivo('dineros-completo-' + selloFecha() + '.json', JSON.stringify(datos, null, 2));
  estado.respaldo.ultimo_iso = new Date().toISOString();
  estado.respaldo.ultimo_tipo = 'completo';
  guardar();
  pintarTodo();
  aviso('Listo. Ése trae lo que escribiste de ti: guárdalo en una memoria, no lo mandes por mensaje.', 7);
}

function leerArchivo(archivo) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => {
      try { resolver(JSON.parse(lector.result)); }
      catch (e) { rechazar(new Error('Ese archivo no se puede leer como respaldo de Dineros Dineros.')); }
    };
    lector.onerror = () => rechazar(new Error('No se pudo abrir el archivo.'));
    lector.readAsText(archivo);
  });
}

function describir(datos) {
  const movs = Array.isArray(datos.movimientos) ? datos.movimientos : [];
  const radios = Array.isArray(datos.radiografias) ? datos.radiografias : [];
  const fechas = movs.map((m) => new Date(m.cuando)).filter((d) => !isNaN(d));
  fechas.sort((a, b) => a - b);
  const porMoneda = sumaPorMoneda(movs);
  return {
    movs: movs.length,
    radios: radios.length,
    desde: fechas.length ? fechaCorta(fechas[0].toISOString()) : null,
    hasta: fechas.length ? fechaCorta(fechas[fechas.length - 1].toISOString()) : null,
    tipo: datos.tipo || 'desconocido',
    generado: datos.generado ? fechaCorta(datos.generado) : null,
    monedas: Object.keys(porMoneda)
  };
}

function textoDescripcion(d) {
  let html = '<p class="parrafo"><strong>' + d.movs + '</strong> movimiento' + (d.movs === 1 ? '' : 's') +
    ' y <strong>' + d.radios + '</strong> radiografía' + (d.radios === 1 ? '' : 's') + '.</p>';
  if (d.desde) html += '<p class="parrafo">Del ' + d.desde + ' al ' + d.hasta + '.</p>';
  if (d.monedas.length) html += '<p class="parrafo">Monedas que trae: ' + d.monedas.join(', ') + '.</p>';
  if (d.generado) html += '<p class="parrafo">Ese respaldo se hizo el ' + d.generado + ' (tipo: ' + d.tipo + ').</p>';
  return html;
}

async function probarRespaldo(archivo) {
  const caja = $('#resultado-prueba');
  try {
    const datos = await leerArchivo(archivo);
    const d = describir(datos);
    caja.innerHTML = '<div class="aviso calma bloque-resultado">' +
      '<strong>Tu respaldo sirve.</strong>' + textoDescripcion(d) +
      '<p class="parrafo sin-margen">No cambié nada de lo que tienes ahorita.</p></div>';
    estado.respaldo.ultima_prueba_iso = new Date().toISOString();
    guardar();
    pintarEstadoRespaldo();
  } catch (e) {
    caja.innerHTML = '<div class="aviso urge bloque-resultado"><strong>Ese archivo no sirve como respaldo.</strong><br>' +
      escapar(e.message) + '</div>';
  }
}

async function restaurar(archivo) {
  const caja = $('#resultado-restaurar');
  try {
    const datos = await leerArchivo(archivo);
    const d = describir(datos);
    const aviso1 = d.tipo === 'numeros'
      ? '\n\nOJO: es un respaldo SOLO DE NÚMEROS. Tus radiografías y lo que escribiste no vienen ahí, y se van a perder.'
      : '';
    const ok = confirm(
      'Vas a reemplazar lo que tienes hoy (' + estado.movimientos.length + ' movimientos, ' +
      estado.radiografias.length + ' radiografías) por lo que trae el archivo (' +
      d.movs + ' movimientos, ' + d.radios + ' radiografías).' + aviso1 +
      '\n\nEsto no se puede deshacer. ¿Le seguimos?'
    );
    if (!ok) { caja.innerHTML = '<p class="parrafo">No se tocó nada.</p>'; return; }

    const base = nuevoEstado();
    estado = Object.assign(base, {
      moneda: datos.moneda || estado.moneda,
      nombre: datos.nombre || estado.nombre,
      movimientos: Array.isArray(datos.movimientos) ? datos.movimientos : [],
      radiografias: Array.isArray(datos.radiografias) ? datos.radiografias : [],
      meta: datos.meta || null,
      respaldo: { ultimo_iso: new Date().toISOString(), ultimo_tipo: 'restaurado', ultima_prueba_iso: null }
    });
    guardar();
    pintarTodo();
    caja.innerHTML = '<div class="aviso calma bloque-resultado"><strong>Restaurado.</strong>' +
      textoDescripcion(d) + '</div>';
    aviso('Listo, tus datos están de vuelta.');
  } catch (e) {
    caja.innerHTML = '<div class="aviso urge bloque-resultado">' + escapar(e.message) + '</div>';
  }
}

function pintarEstadoRespaldo() {
  const caja = $('#estado-respaldo');
  const ult = estado.respaldo.ultimo_iso;
  if (!ult) {
    caja.textContent = 'Nunca has guardado un respaldo.';
    caja.className = 'estado-respaldo urgente';
  } else {
    const d = diasDesde(ult);
    caja.textContent = 'Último respaldo: ' + fechaCorta(ult) + (d === 0 ? ' (hoy)' : ' (hace ' + d + (d === 1 ? ' día' : ' días') + ')');
    caja.className = 'estado-respaldo ' + (d >= DIAS_AVISO_RESPALDO ? 'urgente' : 'bien');
  }
  const pr = estado.respaldo.ultima_prueba_iso;
  if (pr) caja.textContent += ' · Probado el ' + fechaCorta(pr);
}

async function pintarPersistencia() {
  const caja = $('#estado-persistencia');
  const boton = $('#btn-persistir');
  if (!navigator.storage || !navigator.storage.persisted) {
    caja.textContent = 'Este navegador no me deja consultarlo. Guarda tu respaldo seguido.';
    boton.classList.add('oculto');
    return;
  }
  const seguro = await navigator.storage.persisted();
  if (seguro) {
    caja.innerHTML = '<strong>No.</strong> Este navegador se comprometió a no borrar tus datos ' +
      'por su cuenta. Aun así, el respaldo sigue siendo tu única copia si se pierde el teléfono.';
    boton.classList.add('oculto');
  } else {
    caja.innerHTML = '<strong>Sí puede.</strong> Si pasas días sin abrirla y al teléfono le falta ' +
      'espacio, el navegador tiene permiso de borrar lo guardado. Se le puede pedir que no.';
    boton.classList.remove('oculto');
  }
}

/* ───────────────────────── Moneda ───────────────────────── */

function pintarMoneda() {
  $('#insignia-moneda').textContent = estado.moneda === 'MXN' ? 'Pesos · MXN' : 'Dólares · USD';
  const actual = $('#moneda-actual');
  if (actual) actual.textContent = estado.moneda === 'MXN' ? 'pesos (MXN)' : 'dólares (USD)';
  $$('#cambiar-moneda .moneda').forEach((b) => b.classList.toggle('puesta', b.dataset.moneda === estado.moneda));
}

/* ───────────────────────── Pintar todo ───────────────────────── */

function pintarTodo() {
  const n = estado.nombre ? estado.nombre.split(' ')[0] : '';
  $('#saludo').textContent = n ? 'Hola, ' + n : 'Dineros Dineros';
  $('#fecha-hoy').textContent = fechaLarga(new Date().toISOString());
  pintarMoneda();
  pintarVersiculo();
  pintarAvisoRespaldo();
  pintarMeta();
  pintarCifrasDelMes();
  pintarGrafica();
  pintarConstancia();
  pintarRadiografiaResumen();
  pintarMovimientos();
  pintarFijos();
  pintarRadiografias();
  pintarEstadoRespaldo();
  pintarPersistencia();
}

/* ───────────────────────── Enganches ───────────────────────── */

function enganchar() {
  $$('.pestana').forEach((p) => p.addEventListener('click', () => irA(p.dataset.vista)));

  $$('#tipo .tipo-btn').forEach((b) => b.addEventListener('click', () => {
    regTipo = b.dataset.tipo;
    regCategoria = '';
    regEmocion = '';
    refrescarRegistro();
  }));

  $('#reg-guardar').addEventListener('click', guardarMovimiento);
  $('#fijo-guardar').addEventListener('click', guardarFijo);
  $('#fijo-borrar').addEventListener('click', borrarFijo);
  $('#fijo-pague').addEventListener('click', pagarFijo);
  $('#archivo-fijos').addEventListener('change', (e) => {
    if (e.target.files[0]) importarFijos(e.target.files[0]);
    e.target.value = '';
  });
  $('#radio-guardar').addEventListener('click', guardarRadiografia);
  $('#meta-guardar').addEventListener('click', guardarMeta);
  $('#meta-quitar').addEventListener('click', () => {
    estado.meta = null;
    guardar();
    $('#modal-meta').classList.add('oculto');
    pintarTodo();
  });

  $$('.filtro').forEach((f) => f.addEventListener('click', () => {
    filtroActual = f.dataset.filtro;
    $$('.filtro').forEach((o) => o.classList.toggle('activo', o === f));
    pintarMovimientos();
  }));

  $('#btn-respaldo-numeros').addEventListener('click', respaldoNumeros);
  $('#btn-respaldo-completo').addEventListener('click', respaldoCompleto);
  $('#archivo-probar').addEventListener('change', (e) => {
    if (e.target.files[0]) probarRespaldo(e.target.files[0]);
    e.target.value = '';
  });
  $('#archivo-restaurar').addEventListener('change', (e) => {
    if (e.target.files[0]) restaurar(e.target.files[0]);
    e.target.value = '';
  });
  $('#btn-persistir').addEventListener('click', async () => {
    const ok = await navigator.storage.persist();
    aviso(ok ? 'Listo: el navegador se comprometió a no borrarlos.'
             : 'El navegador dijo que no. Guarda tu respaldo más seguido.', 6);
    pintarPersistencia();
  });

  $$('#cambiar-moneda .moneda').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.moneda === estado.moneda) return;
    if (!confirm('¿Cambiar a ' + b.dataset.moneda + '? Lo que ya registraste conserva su propia moneda.')) return;
    estado.moneda = b.dataset.moneda;
    guardar();
    pintarTodo();
    aviso('De aquí en adelante, ' + estado.moneda + '.');
  }));

  // Clics delegados: abrir modales, cambiar de vista, borrar movimientos.
  document.addEventListener('click', (e) => {
    const abrir = e.target.closest('[data-abrir]');
    if (abrir) {
      const cual = abrir.dataset.abrir;
      if (cual === 'registro') abrirRegistro();
      if (cual === 'radiografia') abrirRadiografia();
      if (cual === 'meta') abrirMeta();
      if (cual === 'fijo-nuevo') abrirFijo(null);
      return;
    }
    const cerrar = e.target.closest('[data-cerrar]');
    if (cerrar) { $('#' + cerrar.dataset.cerrar).classList.add('oculto'); return; }

    const ir = e.target.closest('[data-ir]');
    if (ir) { irA(ir.dataset.ir); return; }

    const ord = e.target.closest('[data-orden]');
    if (ord) { guardarPlanDeuda({ orden: ord.dataset.orden }); return; }

    const accion = e.target.closest('[data-accion]');
    if (accion && accion.dataset.accion === 'plan') {
      estado.ver_plan = estado.ver_plan === false;
      guardar();
      pintarSimulador();
      return;
    }
    if (accion && accion.dataset.accion === 'grafica') {
      estado.ver_grafica = !estado.ver_grafica;
      guardar();
      pintarGrafica();
      return;
    }

    if (accion && accion.dataset.accion === 'aplicar-correcciones') {
      aplicarCorrecciones();
      return;
    }
    if (accion && accion.dataset.accion === 'cancelar-correcciones') {
      cancelarCorrecciones();
      return;
    }

    const verFijo = e.target.closest('[data-fijo]');
    if (verFijo) { abrirFijo(verFijo.dataset.fijo); return; }

    const borrar = e.target.closest('[data-borrar]');
    if (borrar) { borrarMovimiento(borrar.dataset.borrar); }
  });

  // El extra se guarda al salir del campo, no en cada tecla: repintar a media
  // cifra le quitaria el cursor de las manos.
  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'deuda-extra') {
      const v = parseFloat(e.target.value);
      guardarPlanDeuda({ extra: isNaN(v) || v < 0 ? null : v });
    }
  });

  // Tocar el fondo oscuro cierra el modal, pero nunca la bienvenida.
  $$('.telon').forEach((t) => t.addEventListener('click', (e) => {
    if (e.target === t && t.id !== 'bienvenida') t.classList.add('oculto');
  }));
}

/* ───────────────────────── Arranque ───────────────────────── */

function arrancar() {
  enganchar();
  const habia = cargar();
  if (!habia || !estado.moneda) {
    abrirBienvenida();
    pintarVersiculo();
  } else {
    pintarTodo();
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Sin modo sin señal:', e));
  }
}

document.addEventListener('DOMContentLoaded', arrancar);
