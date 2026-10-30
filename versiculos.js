// Versículos — Santa Biblia, Reina-Valera 1909.
// Esta traducción está en DOMINIO PÚBLICO. Se puede copiar y repartir libremente.
// Texto tomado de eBible.org (spaRV1909), que la publica marcada "Public Domain".
// Se conserva la ortografía de 1909 tal cual ("á", "empresta", "fué"): no se moderniza.
//
// Ojo con el criterio de la lista: hay promesas y hay advertencias. A propósito.
// Una app de dinero que solo cita abundancia termina diciendo que el dinero
// llega por actitud, y eso es justo lo que no va.

const VERSICULOS = [
  { r: "Génesis 41:35-36", t: "Y junten toda la provisión de estos buenos años que vienen, y alleguen el trigo bajo la mano de Faraón para mantenimiento de las ciudades; y guárdenlo. Y esté aquella provisión en depósito para el país, para los siete años del hambre que serán en la tierra de Egipto; y el país no perecerá de hambre." },
  { r: "Deuteronomio 8:17-18", t: "Y digas en tu corazón: Mi poder y la fortaleza de mi mano me han traído esta riqueza. Antes acuérdate de Jehová tu Dios: porque él te da el poder para hacer las riquezas, á fin de confirmar su pacto que juró á tus padres, como en este día." },
  { r: "Josué 1:8", t: "El libro de aquesta ley nunca se apartará de tu boca: antes de día y de noche meditarás en él, para que guardes y hagas conforme á todo lo que en él está escrito: porque entonces harás prosperar tu camino, y todo te saldrá bien." },
  { r: "Salmos 37:21", t: "El impío toma prestado, y no paga; mas el justo tiene misericordia, y da." },
  { r: "Salmos 37:25", t: "Mozo fuí, y he envejecido, y no he visto justo desamparado, ni su simiente que mendigue pan." },
  { r: "Salmos 112:5", t: "El hombre de bien tiene misericordia y presta; gobierna sus cosas con juicio." },
  { r: "Proverbios 3:9-10", t: "Honra á Jehová de tu sustancia, y de las primicias de todos tus frutos; Y serán llenas tus trojes con abundancia, y tus lagares rebosarán de mosto." },
  { r: "Proverbios 6:6-8", t: "Ve á la hormiga, oh perezoso, mira sus caminos, y sé sabio; La cual no teniendo capitán, ni gobernador, ni señor, Prepara en el verano su comida y allega en el tiempo de la siega su mantenimiento." },
  { r: "Proverbios 10:4", t: "La mano negligente hace pobre: mas la mano de los diligentes enriquece." },
  { r: "Proverbios 11:24-25", t: "Hay quienes reparten, y les es añadido más: y hay quienes son escasos más de lo que es justo, mas vienen á pobreza. El alma liberal será engordada: y el que saciare, él también será saciado." },
  { r: "Proverbios 13:11", t: "Disminuiránse las riquezas de vanidad: empero multiplicará el que allega con su mano." },
  { r: "Proverbios 13:22", t: "El bueno dejará herederos á los hijos de los hijos; y el haber del pecador, para el justo está guardado." },
  { r: "Proverbios 14:23", t: "En toda labor hay fruto: mas la palabra de los labios solamente empobrece." },
  { r: "Proverbios 15:16", t: "Mejor es lo poco con el temor de Jehová, que el gran tesoro donde hay turbación." },
  { r: "Proverbios 16:8", t: "Mejor es lo poco con justicia, que la muchedumbre de frutos sin derecho." },
  { r: "Proverbios 19:17", t: "A Jehová empresta el que da al pobre, y él le dará su paga." },
  { r: "Proverbios 21:5", t: "Los pensamientos del solícito ciertamente van á abundancia; mas todo presuroso, indefectiblemente á pobreza." },
  { r: "Proverbios 21:20", t: "Tesoro codiciable y pingüe hay en la casa del sabio; mas el hombre insensato lo disipará." },
  { r: "Proverbios 22:7", t: "El rico se enseñoreará de los pobres; y el que toma prestado, siervo es del que empresta." },
  { r: "Proverbios 22:26-27", t: "No estés entre los que tocan la mano, entre los que fían por deudas. Si no tuvieres para pagar, ¿por qué han de quitar tu cama de debajo de ti?" },
  { r: "Proverbios 23:4-5", t: "No trabajes por ser rico; pon coto á tu prudencia. ¿Has de poner tus ojos en las riquezas, siendo ningunas? porque hacerse han alas, como alas de águila, y volarán al cielo." },
  { r: "Proverbios 27:23-24", t: "Considera atentamente el aspecto de tus ovejas; pon tu corazón á tus rebaños: Porque las riquezas no son para siempre; ¿y será la corona para perpetuas generaciones?" },
  { r: "Proverbios 28:19", t: "El que labra su tierra, se hartará de pan: mas el que sigue los ociosos, se hartará de pobreza." },
  { r: "Proverbios 28:20", t: "El hombre de verdad tendrá muchas bendiciones: mas el que se apresura á enriquecer, no será sin culpa." },
  { r: "Proverbios 28:22", t: "Apresúrase á ser rico el hombre de mal ojo; y no conoce que le ha de venir pobreza." },
  { r: "Proverbios 30:8-9", t: "Vanidad y palabra mentirosa aparta de mí. No me des pobreza ni riquezas; manténme del pan que he menester; No sea que me harte, y te niegue, y diga, ¿Quién es Jehová? ó no sea que siendo pobre, hurte, y blasfeme el nombre de mi Dios." },
  { r: "Proverbios 31:16", t: "Consideró la heredad, y compróla; y plantó viña del fruto de sus manos." },
  { r: "Eclesiastés 5:10", t: "El que ama el dinero, no se hartará de dinero; y el que ama el mucho tener, no sacará fruto. También esto es vanidad." },
  { r: "Eclesiastés 5:12", t: "Dulce es el sueño del trabajador, ora coma mucho ó poco; mas al rico no le deja dormir la hartura." },
  { r: "Eclesiastés 11:2", t: "Reparte á siete, y aun á ocho: porque no sabes el mal que vendrá sobre la tierra." },
  { r: "Malaquías 3:10", t: "Traed todos los diezmos al alfolí, y haya alimento en mi casa; y probadme ahora en esto, dice Jehová de los ejércitos, si no os abriré las ventanas de los cielos, y vaciaré sobre vosotros bendición hasta que sobreabunde." },
  { r: "Mateo 6:19-21", t: "No os hagáis tesoros en la tierra, donde la polilla y el orín corrompe, y donde ladrones minan y hurtan; Mas haceos tesoros en el cielo, donde ni polilla ni orín corrompe, y donde ladrones no minan ni hurtan: Porque donde estuviere vuestro tesoro, allí estará vuestro corazón." },
  { r: "Mateo 6:24", t: "Ninguno puede servir á dos señores; porque ó aborrecerá al uno y amará al otro, ó se llegará al uno y menospreciará al otro: no podéis servir á Dios y á Mammón." },
  { r: "Mateo 6:31-33", t: "No os congojéis pues, diciendo: ¿Qué comeremos, ó qué beberemos, ó con qué nos cubriremos? Porque los Gentiles buscan todas estas cosas: que vuestro Padre celestial sabe que de todas estas cosas habéis menester. Mas buscad primeramente el reino de Dios y su justicia, y todas estas cosas os serán añadidas." },
  { r: "Mateo 25:21", t: "Y su señor le dijo: Bien, buen siervo y fiel; sobre poco has sido fiel, sobre mucho te pondré: entra en el gozo de tu señor." },
  { r: "Lucas 12:15", t: "Y díjoles: Mirad, y guardaos de toda avaricia; porque la vida del hombre no consiste en la abundancia de los bienes que posee." },
  { r: "Lucas 14:28", t: "Porque ¿cuál de vosotros, queriendo edificar una torre, no cuenta primero sentado los gastos, si tiene lo que necesita para acabarla?" },
  { r: "Lucas 16:10", t: "El que es fiel en lo muy poco, también en lo más es fiel: y el que en lo muy poco es injusto, también en lo más es injusto." },
  { r: "Hechos 20:35", t: "En todo os he enseñado que, trabajando así, es necesario sobrellevar á los enfermos, y tener presente las palabras del Señor Jesús, el cual dijo: Más bienaventurada cosa es dar que recibir." },
  { r: "Romanos 13:8", t: "No debáis á nadie nada, sino amaros unos á otros; porque el que ama al prójimo, cumplió la ley." },
  { r: "1 Corintios 16:2", t: "Cada primer día de la semana cada uno de vosotros aparte en su casa, guardando lo que por la bondad de Dios pudiere; para que cuando yo llegare, no se hagan entonces colectas." },
  { r: "2 Corintios 9:6", t: "Esto empero digo: El que siembra escasamente, también segará escasamente; y el que siembra en bendiciones, en bendiciones también segará." },
  { r: "2 Corintios 9:7", t: "Cada uno dé como propuso en su corazón: no con tristeza, ó por necesidad; porque Dios ama el dador alegre." },
  { r: "Filipenses 4:11-12", t: "No lo digo en razón de indigencia, pues he aprendido á contentarme con lo que tengo. Sé estar humillado, y sé tener abundancia: en todo y por todo estoy enseñado, así para hartura como para hambre, así para tener abundancia como para padecer necesidad." },
  { r: "Filipenses 4:19", t: "Mi Dios, pues, suplirá todo lo que os falta conforme á sus riquezas en gloria en Cristo Jesús." },
  { r: "1 Timoteo 6:6-8", t: "Empero grande granjería es la piedad con contentamiento. Porque nada hemos traído á este mundo, y sin duda nada podremos sacar. Así que, teniendo sustento y con qué cubrirnos, seamos contentos con esto." },
  { r: "1 Timoteo 6:9-10", t: "Porque los que quieren enriquecerse, caen en tentación y lazo, y en muchas codicias locas y dañosas, que hunden á los hombres en perdición y muerte. Porque el amor del dinero es la raíz de todos los males: el cual codiciando algunos, se descaminaron de la fe, y fueron traspasados de muchos dolores." },
  { r: "1 Timoteo 6:17-18", t: "A los ricos de este siglo manda que no sean altivos, ni pongan la esperanza en la incertidumbre de las riquezas, sino en el Dios vivo, que nos da todas las cosas en abundancia de que gocemos: Que hagan bien, que sean ricos en buenas obras, dadivosos, que con facilidad comuniquen;" },
  { r: "Hebreos 13:5", t: "Sean las costumbres vuestras sin avaricia; contentos de lo presente; porque él dijo: No te desampararé, ni te dejaré." },
  { r: "Santiago 4:13-15", t: "Ea ahora, los que decís: Hoy y mañana iremos á tal ciudad, y estaremos allá un año, y compraremos mercadería, y ganaremos: Y no sabéis lo que será mañana. Porque ¿qué es vuestra vida? Ciertamente es un vapor que se aparece por un poco de tiempo, y luego se desvanece. En lugar de lo cual deberíais decir: Si el Señor quisiere, y si viviéremos, haremos esto ó aquello." },
  { r: "Santiago 5:4", t: "He aquí, el jornal de los obreros que han segado vuestras tierras, el cual por engaño no les ha sido pagado de vosotros, clama; y los clamores de los que habían segado, han entrado en los oídos del Señor de los ejércitos." }
];

// El del día: cambia cada día y recorre la lista completa antes de repetir.
// 51 es primo con 31, así que el salto de 31 pasa por los 51 sin saltarse ninguno.
function versiculoDelDia(fecha) {
  const dias = Math.floor((fecha - new Date(fecha.getFullYear(), 0, 0)) / 86400000);
  const semilla = fecha.getFullYear() * 1000 + dias;
  return VERSICULOS[(semilla * 31) % VERSICULOS.length];
}
