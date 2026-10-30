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
         '<p class="pista sin-margen">Solo cuenta los fijos donde escribiste un saldo. Con el ' +
         'saldo y la tasa, el simulador de salida podrá decirte en cuántos meses sale.</p></article>';
  }
  caja.innerHTML = h;
}

function pintarFijos() {
  pintarResumenFijos();
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

    const accion = e.target.closest('[data-accion]');
    if (accion && accion.dataset.accion === 'grafica') {
      estado.ver_grafica = !estado.ver_grafica;
      guardar();
      pintarGrafica();
      return;
    }

    const verFijo = e.target.closest('[data-fijo]');
    if (verFijo) { abrirFijo(verFijo.dataset.fijo); return; }

    const borrar = e.target.closest('[data-borrar]');
    if (borrar) { borrarMovimiento(borrar.dataset.borrar); }
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
