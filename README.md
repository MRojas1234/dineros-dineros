# Dineros Dineros

Una app para llevar tu dinero personal. **Todo vive en tu teléfono y nada sale de
ahí.** No tiene cuenta, no tiene contraseña, no tiene servidor y no sabe quién
eres. Se comparte el enlace, no los datos: cada quien guarda lo suyo en su propio
aparato.

Es de María Rojas, y la puede repartir a quien quiera — por eso trae su `LICENSE`.

---

## Qué hace hoy (Etapa 1)

- **Registra lo que entra y lo que sale**, y al momento de registrarlo pregunta
  cómo se siente. No en un cuestionario de bienvenida: en el movimiento.
- **Guarda tu radiografía con su fecha**, y cada vez que la vuelves a contestar
  guarda una nueva. Nunca se encima una sobre otra.
- **Fijos**: lo que se paga cada mes, agrupado y sumado — casa, servicios,
  tarjetas, impuestos. Cada uno se edita entero: monto, día de pago, autopago,
  saldo, límite, tasa anual, y los datos de contacto de quien cobra. Un botón
  *Lo pagué* abre el registro ya lleno, con la pregunta del sentimiento todavía
  en blanco: el momento del movimiento sigue siendo el momento.
- **Traer fijos de un archivo JSON**: **agrega, nunca reemplaza**. Los movimientos
  y las radiografías no se tocan, y lo que ya existe se queda como está. La
  huella de un fijo es su nombre *más* su monto, porque dos recibos pueden
  llamarse igual y costar distinto.
- **Respaldo y restauración que de verdad funcionan**, con aviso de cuándo fue el
  último y un botón para *probar* un respaldo sin tocar nada.
- **Versículo distinto cada día**, Reina-Valera 1909 (dominio público).
- **Dólares o pesos**, a elegir la primera vez. Cada cantidad guarda su moneda
  pegada. La app no convierte entre monedas: convertir necesitaría internet.
- **Gráfica del mes**, con botón para esconderla.
- Funciona sin señal y se instala en la pantalla de inicio.

Para después: el simulador de salida de deudas (avalancha y bola de nieve), el
lector de facturas y los retos. Los fijos ya guardan saldo y tasa anual, que es
justo lo que el simulador va a necesitar.

### Un archivo de fijos, por dentro

```json
{ "app": "Dineros Dineros", "tipo": "fijos",
  "fijos": [ { "nombre": "...", "grupo": "Servicios", "moneda": "USD",
               "monto_mes": 0, "saldo": null, "limite": null,
               "tasa_anual": null, "dia_pago": null, "autopago": false,
               "telefono": "", "cuenta": "", "titular": "", "ultimos4": "",
               "correo": "", "historial": {"ene": 0}, "revisar": "", "nota": "" } ] }
```

`grupo` tiene que ser uno de: `Casa y seguros`, `Servicios`, `Tarjetas y deudas`,
`Impuestos`, `Otro` — cualquier otra cosa cae en `Otro`. `revisar` pinta un aviso
rojo dentro del fijo y una raya dorada en la lista; se borra solo en cuanto lo
editas y guardas.

**Un archivo así nunca va dentro de este repositorio.** Trae números de cuenta y
últimos 4; este repositorio es público. Vive en tu computadora, y el `.gitignore`
está puesto para que no se cuele por accidente.

---

## Las reglas que gobiernan este código

1. **Nada sale del teléfono.** No hay `fetch`, `XMLHttpRequest`, `sendBeacon`,
   `WebSocket` ni imágenes de otro dominio. Además el navegador lo tiene
   prohibido por el `Content-Security-Policy` de `index.html`
   (`connect-src 'none'`): aunque alguien metiera código que lo intentara, no
   podría.
2. **Ninguna cantidad viaja sin su moneda pegada.** Nunca un número suelto.
3. **Las fechas se guardan como instante completo más zona horaria.** El veredicto
   se puede recalcular; el instante perdido no se recupera.
4. **La parte emocional siempre es opcional y nunca regaña.** Se le apunta al
   sufrimiento de mirar los números, jamás a la costumbre de mirarlos.
5. **Nada se borra solo.** Lo que se agrega, se queda.

## Cómo comprobar que nada sale

Desde esta carpeta:

```
grep -nE "fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|navigator.send|https?://" app.js versiculos.js index.html app.css sw.js
```

Lo único que debe aparecer son las menciones dentro de comentarios y el `fetch`
del `sw.js`, que solo sirve para guardar **los archivos de la propia app** y
rechaza cualquier dirección que no sea del mismo origen.

## El respaldo: dos archivos a propósito

- **Respaldo de números** — montos, categorías y fechas, y los fijos **sin** el
  teléfono, la cuenta, el titular, los últimos 4 ni el correo. Ése lo puedes
  mandar por donde quieras.
- **Respaldo completo** — además trae tus radiografías, lo que escribiste en cada
  movimiento y los datos de contacto de cada fijo. Ése **no** se manda por WhatsApp ni por correo: ahí se queda, en los
  servidores de alguien más. Va a una memoria o a tu computadora.

Y hay un botón para **probar** un respaldo: lo lee, te dice qué trae y no toca
nada. Un respaldo que nunca abriste no es un respaldo, es una intención.

---

## De dónde salió, y qué no se tomó

La idea y la estructura vienen de analizar una app de Control Financiero que
repartieron en una clase. **De su código no se tomó ni una línea**: ese
repositorio no tiene licencia, así que legalmente es "todos los derechos
reservados". Las ideas, las pestañas y el método son libres; la redacción y el
código, no. Todo esto se escribió desde cero.

Los versículos son de la Santa Biblia **Reina-Valera 1909**, que está en dominio
público. Las traducciones modernas (RV1960, NVI, NTV) tienen derechos de autor
vigentes y no se pueden repartir así.
