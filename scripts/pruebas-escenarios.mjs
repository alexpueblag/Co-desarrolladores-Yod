// ===========================================================================
//  PRUEBAS DE ESCENARIOS (QA) — Co-desarrolladores-Yod
//  Prueba la LOGICA REAL del portal (la misma que corre en produccion) contra
//  proyectos de prueba de CADA tipo y un cliente por proyecto, en MULTIPLES
//  situaciones. NO toca el Google Sheet real: arma datos sinteticos en memoria.
//
//  Como garantiza que prueba el codigo REAL (sin copias que se desactualicen):
//  EXTRAE las funciones puras directamente de src/App.jsx (por nombre, casando
//  llaves) y las ejecuta. Si App.jsx cambia, estas pruebas usan la version nueva.
//
//  Correr:  node scripts/pruebas-escenarios.mjs
// ===========================================================================
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = join(__dirname, "..", "src", "App.jsx");
const src = readFileSync(APP, "utf8");

// --- Extractor: saca una funcion `function NAME(...){...}` casando llaves ----
function extraerFuncion(nombre) {
  const re = new RegExp("function\\s+" + nombre + "\\s*\\(", "g");
  const m = re.exec(src);
  if (!m) throw new Error("No encontre la funcion " + nombre + " en App.jsx");
  const abre = src.indexOf("{", m.index);
  let depth = 0;
  for (let j = abre; j < src.length; j++) {
    const c = src[j];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  throw new Error("No cerro la funcion " + nombre);
}
// --- Extractor: saca un `const NAME = ...;` hasta el ; a profundidad 0 -------
function extraerConst(nombre) {
  const re = new RegExp("const\\s+" + nombre + "\\b", "g");
  const m = re.exec(src);
  if (!m) throw new Error("No encontre la const " + nombre + " en App.jsx");
  let depth = 0;
  for (let j = m.index; j < src.length; j++) {
    const c = src[j];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === ";" && depth === 0) return src.slice(m.index, j + 1);
  }
  throw new Error("No cerro la const " + nombre);
}

const CONSTS = ["mxn", "TASA_DEFAULT", "ETAPAS_PLUSVALIA", "etiquetaEtapaPlusvalia"];
const FUNCS = [
  "money", "pct", "todayISO", "parseDate", "fmtFecha", "diasEntre",
  "fechaCorteRendimiento", "parseTramos", "mesParaTramo", "pctTramo",
  "calcularRendimientoInversion", "estadoAportacion", "arr", "num",
  "telefonoWA", "mensajeRecordatorioPago",
];

let modulo = "// AUTO-GENERADO desde src/App.jsx — no editar\n";
for (const c of CONSTS) modulo += extraerConst(c) + "\n";
for (const f of FUNCS) modulo += extraerFuncion(f) + "\n";
modulo += "\nexport { " + FUNCS.concat(["etiquetaEtapaPlusvalia"]).join(", ") + " };\n";

const TMP = join(__dirname, "_logica-extraida.mjs");
writeFileSync(TMP, modulo, "utf8");
const L = await import("file://" + TMP);
try { unlinkSync(TMP); } catch (e) { /* noop */ }

const {
  calcularRendimientoInversion, estadoAportacion, telefonoWA,
  mensajeRecordatorioPago, parseTramos, mesParaTramo, pctTramo, diasEntre, money, num,
} = L;

// --- Marco de aserciones ----------------------------------------------------
let PASS = 0, FAIL = 0;
const fallos = [];
function check(nombre, cond, detalle = "") {
  if (cond) { PASS++; }
  else { FAIL++; fallos.push(nombre + (detalle ? " — " + detalle : "")); }
}
function aprox(a, b, tol = 0.5) { return Math.abs(Number(a) - Number(b)) <= tol; }

// --- Helpers de fechas (hoy real del sistema) -------------------------------
function iso(d) { const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function hoyMasDias(n) { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); }
function hoyMasMeses(m) { const d = new Date(); d.setMonth(d.getMonth() + m); return iso(d); }
const HOY = iso(new Date());

// Detector de comprobante (misma regla que el componente VerComprobante).
const esEnlacePublico = (v) => /^https?:\/\//i.test(String(v || "").trim());

// --- Precios de plusvalia SIMULADOS (como los devuelve leerPreciosPlusvalia) -
const precios = {
  miramar: { etapas: { fund2: 2500, preventa1: 3000, preventa2: 3500, venta: 4200, mercado24: 5000 } },
};

// ===========================================================================
//  MATRIZ DE PROYECTOS (uno por tipo de rendimiento y de "tipo" de obra) +
//  UN CLIENTE por proyecto, cada uno en una situacion distinta.
// ===========================================================================
const escenarios = [];

// ---------- A) ANUAL — tasa default 25%, activa, parcialmente aportada -------
escenarios.push({
  nombre: "A. Anual 25% — activa, recibido parcial",
  proyecto: { id: "P-A", nombre: "Residencial Sol", tipo: "Obra", etapaActual: "Estructura", banco: "BBVA", beneficiario: "YoDesarrollo SAPI", cuenta: "0123456789", clabe: "012180001234567890", conceptoBase: "Aportacion Sol" },
  cliente: { id: "C-A", nombre: "Ana López", telefono: "6621234567", email: "ana@correo.com", claveAcceso: "AAAAA-AAAAA-AAAAA" },
  inversion: { folio: "RS-AL-2026-01", inversionistaId: "C-A", proyectoId: "P-A", montoTotal: 1000000, fechaInicio: hoyMasDias(-400), fechaSalida: hoyMasDias(330), estado: "Activa", tasaAnual: 25 },
  aportaciones: [
    { id: "ap-a1", folio: "RS-AL-2026-01", numeroPago: 1, totalPagos: 4, concepto: "Aportacion 1", fechaProgramada: hoyMasDias(-400), monto: 250000, fechaRecibida: hoyMasDias(-398), comprobanteUrl: "https://drive.google.com/file/d/VIEJO123/view" },
    { id: "ap-a2", folio: "RS-AL-2026-01", numeroPago: 2, totalPagos: 4, concepto: "Aportacion 2", fechaProgramada: hoyMasDias(-300), monto: 250000, fechaRecibida: hoyMasDias(-298), comprobanteUrl: "1AbCdEfPrivadoFileId" },
    { id: "ap-a3", folio: "RS-AL-2026-01", numeroPago: 3, totalPagos: 4, concepto: "Aportacion 3", fechaProgramada: hoyMasDias(-10), monto: 250000 }, // VENCIDA
    { id: "ap-a4", folio: "RS-AL-2026-01", numeroPago: 4, totalPagos: 4, concepto: "Aportacion 4", fechaProgramada: hoyMasDias(120), monto: 250000 }, // PENDIENTE
  ],
});

// ---------- B) ANUAL — tasa custom 12%, salida futura (regresion dias) -------
escenarios.push({
  nombre: "B. Anual 12% — activa con salida FUTURA (no inflar dias)",
  proyecto: { id: "P-B", nombre: "Loft Centro", tipo: "Obra", etapaActual: "Acabados", banco: "Santander", beneficiario: "YoDesarrollo SAPI", cuenta: "9876543210", clabe: "014180009876543210", conceptoBase: "Aportacion Loft" },
  cliente: { id: "C-B", nombre: "Beto Ramírez", telefono: "52 662 765 4321", email: "", claveAcceso: "BBBBB-BBBBB-BBBBB" },
  inversion: { folio: "LC-BR-2025-01", inversionistaId: "C-B", proyectoId: "P-B", montoTotal: 700000, fechaInicio: hoyMasDias(-414), fechaSalida: hoyMasDias(469), estado: "Activa", tasaAnual: 12 },
  aportaciones: [
    { id: "ap-b1", folio: "LC-BR-2025-01", numeroPago: 1, totalPagos: 2, concepto: "Aportacion 1", fechaProgramada: hoyMasDias(-414), monto: 230000, fechaRecibida: hoyMasDias(-410) },
    { id: "ap-b2", folio: "LC-BR-2025-01", numeroPago: 2, totalPagos: 2, concepto: "Aportacion 2", fechaProgramada: hoyMasDias(200), monto: 470000 },
  ],
});

// ---------- C) TRAMOS / BRACKETS — retorno fijo por mes de venta -------------
const tramosHugo = JSON.stringify([
  { desde: 1, hasta: 6, pct: 12.5 },
  { desde: 7, hasta: 8, pct: 16.67 },
  { desde: 9, hasta: 12, pct: 20 },
]);
escenarios.push({
  nombre: "C. Tramos — activa, mes en curso dentro del primer tramo",
  proyecto: { id: "P-C", nombre: "Casa Alysa", tipo: "Obra", etapaActual: "Cimentacion", banco: "Banorte", beneficiario: "YoDesarrollo SAPI", cuenta: "1112223334", clabe: "072180001112223334", conceptoBase: "Aportacion Alysa" },
  cliente: { id: "C-C", nombre: "Hugo Meave", telefono: "(662) 111-2233", email: "hugo@correo.com", claveAcceso: "CCCCC-CCCCC-CCCCC" },
  inversion: { folio: "CA-HM-2026-01", inversionistaId: "C-C", proyectoId: "P-C", montoTotal: 800000, fechaInicio: hoyMasMeses(-3), fechaSalida: hoyMasMeses(7), estado: "Activa", tramos: tramosHugo },
  aportaciones: [
    { id: "ap-c1", folio: "CA-HM-2026-01", numeroPago: 1, totalPagos: 2, concepto: "Aportacion 1", fechaProgramada: hoyMasMeses(-3), monto: 400000, fechaRecibida: hoyMasMeses(-3) },
    { id: "ap-c2", folio: "CA-HM-2026-01", numeroPago: 2, totalPagos: 2, concepto: "Aportacion 2", fechaProgramada: hoyMasDias(-5), monto: 400000, fechaReporte: hoyMasDias(-2), montoReportado: 400000 }, // EN APROBACION
  ],
});

// ---------- C2) TRAMOS INCOMPLETOS — debe CAER a modo anual -------------------
escenarios.push({
  nombre: "C2. Tramos a medio capturar — cae a ANUAL (no 0%)",
  proyecto: { id: "P-C2", nombre: "Casa Beta", tipo: "Obra", etapaActual: "Permisos" },
  cliente: { id: "C-C2", nombre: "Carla Núñez", telefono: "6629998877", claveAcceso: "C2222-22222-22222" },
  inversion: { folio: "CB-CN-2026-01", inversionistaId: "C-C2", proyectoId: "P-C2", montoTotal: 500000, fechaInicio: hoyMasDias(-200), fechaSalida: hoyMasDias(165), estado: "Activa", tasaAnual: 18, tramos: JSON.stringify([{ desde: 1, hasta: 6, pct: "" }]) },
  aportaciones: [
    { id: "ap-c2a", folio: "CB-CN-2026-01", numeroPago: 1, totalPagos: 1, concepto: "Aportacion unica", fechaProgramada: hoyMasDias(-200), monto: 500000, fechaRecibida: hoyMasDias(-199) },
  ],
});

// ---------- D) PLUSVALIA con precios EN VIVO — terreno, etapa actual ---------
escenarios.push({
  nombre: "D. Plusvalia — con precios, etapa Preventa II",
  proyecto: { id: "P-D", nombre: "Real Miramar", tipo: "Lotificacion", etapaActual: "Urbanizacion", plusvaliaKey: "miramar", etapaPrecio: "preventa2", banco: "BBVA", beneficiario: "YoDesarrollo SAPI", cuenta: "5556667778", clabe: "012180005556667778" },
  cliente: { id: "C-D", nombre: "Diana Soto", telefono: "+52 662 444 5566", email: "diana@correo.com", claveAcceso: "DDDDD-DDDDD-DDDDD" },
  inversion: { folio: "RM-DS-2025-01", inversionistaId: "C-D", proyectoId: "P-D", montoTotal: 600000, fechaInicio: hoyMasDias(-300), fechaSalida: hoyMasDias(430), estado: "Activa", precioEntrada: 3000 }, // entro en Preventa I (3000)
  aportaciones: [
    { id: "ap-d1", folio: "RM-DS-2025-01", numeroPago: 1, totalPagos: 1, concepto: "Aportacion unica", fechaProgramada: hoyMasDias(-300), monto: 600000, fechaRecibida: hoyMasDias(-298) },
  ],
});

// ---------- E) PLUSVALIA SIN precios (Fundador I a mano sin etapa en hoja) ----
escenarios.push({
  nombre: "E. Plusvalia — SIN precio de etapa (debe avisar, no % falso)",
  proyecto: { id: "P-E", nombre: "Dunas Fase 1", tipo: "Desarrollo urbano", etapaActual: "Permisos", plusvaliaKey: "dunas", etapaPrecio: "preventa1" }, // 'dunas' NO esta en precios
  cliente: { id: "C-E", nombre: "Édgar Ruiz", telefono: "044 662 333 1122", claveAcceso: "EEEEE-EEEEE-EEEEE" },
  inversion: { folio: "DF-ER-2026-01", inversionistaId: "C-E", proyectoId: "P-E", montoTotal: 450000, fechaInicio: hoyMasDias(-120), fechaSalida: hoyMasDias(610), estado: "Activa", precioEntrada: 3750 }, // Fundador I a mano
  aportaciones: [
    { id: "ap-e1", folio: "DF-ER-2026-01", numeroPago: 1, totalPagos: 1, concepto: "Aportacion unica", fechaProgramada: hoyMasDias(-120), monto: 450000, fechaRecibida: hoyMasDias(-118) },
  ],
});

// ---------- F) PLUSVALIA LIQUIDADA — congela en precioSalida -----------------
escenarios.push({
  nombre: "F. Plusvalia — LIQUIDADA, congela en precio de salida",
  proyecto: { id: "P-F", nombre: "Real Miramar", tipo: "Lotificacion", etapaActual: "Comercializacion", plusvaliaKey: "miramar", etapaPrecio: "venta" },
  cliente: { id: "C-F", nombre: "Fer Olmos", telefono: "6620001122", claveAcceso: "FFFFF-FFFFF-FFFFF" },
  inversion: { folio: "RM-FO-2024-01", inversionistaId: "C-F", proyectoId: "P-F", montoTotal: 500000, fechaInicio: hoyMasDias(-700), fechaSalida: hoyMasDias(-30), estado: "Liquidada", precioEntrada: 2500, precioSalida: 3800 }, // salio en 3800 aunque la etapa hoy sea 4200
  aportaciones: [
    { id: "ap-f1", folio: "RM-FO-2024-01", numeroPago: 1, totalPagos: 1, concepto: "Aportacion unica", fechaProgramada: hoyMasDias(-700), monto: 500000, fechaRecibida: hoyMasDias(-698) },
  ],
});

// ---------- G) ANUAL LIQUIDADA — corte en la fecha de salida -----------------
escenarios.push({
  nombre: "G. Anual — LIQUIDADA, corte = fecha de salida",
  proyecto: { id: "P-G", nombre: "Townhouse Norte", tipo: "Obra", etapaActual: "Entrega", banco: "BBVA", beneficiario: "YoDesarrollo SAPI", cuenta: "2223334445", clabe: "012180002223334445" },
  cliente: { id: "C-G", nombre: "Gaby Cruz", telefono: "6627778899", claveAcceso: "GGGGG-GGGGG-GGGGG" },
  inversion: { folio: "TN-GC-2023-01", inversionistaId: "C-G", proyectoId: "P-G", montoTotal: 800000, fechaInicio: hoyMasDias(-800), fechaSalida: hoyMasDias(-65), estado: "Liquidada", tasaAnual: 20 },
  aportaciones: [
    { id: "ap-g1", folio: "TN-GC-2023-01", numeroPago: 1, totalPagos: 1, concepto: "Aportacion unica", fechaProgramada: hoyMasDias(-800), monto: 800000, fechaRecibida: hoyMasDias(-799) },
  ],
});

// ---------- H) RECIEN CREADO — sin aportaciones -------------------------------
escenarios.push({
  nombre: "H. Anual — recien creado, SIN aportaciones",
  proyecto: { id: "P-H", nombre: "Proyecto Nuevo", tipo: "Otro", etapaActual: "Permisos" },
  cliente: { id: "C-H", nombre: "Hilda Vega", telefono: "", claveAcceso: "HHHHH-HHHHH-HHHHH" }, // SIN telefono
  inversion: { folio: "PN-HV-2026-01", inversionistaId: "C-H", proyectoId: "P-H", montoTotal: 300000, fechaInicio: HOY, fechaSalida: hoyMasDias(365), estado: "Activa", tasaAnual: 25 },
  aportaciones: [],
});

// ---------- I) SOBREPAGO reportado --------------------------------------------
escenarios.push({
  nombre: "I. Anual — sobrepago reportado (reportado > programado)",
  proyecto: { id: "P-I", nombre: "Edificio Centro", tipo: "Obra", etapaActual: "Estructura", banco: "Banorte", beneficiario: "YoDesarrollo SAPI", cuenta: "9990001112", clabe: "072180009990001112" },
  cliente: { id: "C-I", nombre: "Iván Mora", telefono: "6624443322", claveAcceso: "IIIII-IIIII-IIIII" },
  inversion: { folio: "EC-IM-2026-01", inversionistaId: "C-I", proyectoId: "P-I", montoTotal: 400000, fechaInicio: hoyMasDias(-60), fechaSalida: hoyMasDias(305), estado: "Activa", tasaAnual: 22 },
  aportaciones: [
    { id: "ap-i1", folio: "EC-IM-2026-01", numeroPago: 1, totalPagos: 2, concepto: "Aportacion 1", fechaProgramada: hoyMasDias(-5), monto: 200000, fechaReporte: hoyMasDias(-1), montoReportado: 250000 }, // sobrepago
    { id: "ap-i2", folio: "EC-IM-2026-01", numeroPago: 2, totalPagos: 2, concepto: "Aportacion 2", fechaProgramada: hoyMasDias(120), monto: 200000 },
  ],
});

// ---------- J) ANUAL 0% — sin rendimiento; cliente con lada CDMX (55) --------
escenarios.push({
  nombre: "J. Anual 0% — sin rendimiento",
  proyecto: { id: "P-J", nombre: "Proyecto Cero", tipo: "Obra", etapaActual: "Permisos" },
  cliente: { id: "C-J", nombre: "Julia Paz", telefono: "5512345678", claveAcceso: "JJJJJ-JJJJJ-JJJJJ" },
  inversion: { folio: "PC-JP-2026-01", inversionistaId: "C-J", proyectoId: "P-J", montoTotal: 500000, fechaInicio: hoyMasDias(-100), fechaSalida: hoyMasDias(265), estado: "Activa", tasaAnual: 0 },
  aportaciones: [{ id: "ap-j1", folio: "PC-JP-2026-01", numeroPago: 1, totalPagos: 1, concepto: "Aportacion unica", fechaProgramada: hoyMasDias(-100), monto: 300000, fechaRecibida: hoyMasDias(-99) }],
});

// ---------- K) ANUAL activa SIN fecha de salida ------------------------------
escenarios.push({
  nombre: "K. Anual 15% — activa SIN fecha de salida",
  proyecto: { id: "P-K", nombre: "Proyecto Abierto", tipo: "Desarrollo urbano", etapaActual: "Urbanizacion" },
  cliente: { id: "C-K", nombre: "Karla Díaz", telefono: "6621112200", claveAcceso: "KKKKK-KKKKK-KKKKK" },
  inversion: { folio: "PA-KD-2026-01", inversionistaId: "C-K", proyectoId: "P-K", montoTotal: 600000, fechaInicio: hoyMasDias(-200), fechaSalida: "", estado: "Activa", tasaAnual: 15 },
  aportaciones: [{ id: "ap-k1", folio: "PA-KD-2026-01", numeroPago: 1, totalPagos: 2, concepto: "Aportacion 1", fechaProgramada: hoyMasDias(-200), monto: 400000, fechaRecibida: hoyMasDias(-198) }],
});

// ---------- L) ANUAL activa con fecha de salida PASADA (higiene de datos) ----
escenarios.push({
  nombre: "L. Anual 18% — ACTIVA con salida PASADA (higiene)",
  proyecto: { id: "P-L", nombre: "Proyecto Vencido", tipo: "Obra", etapaActual: "Entrega" },
  cliente: { id: "C-L", nombre: "Luis Mena", telefono: "6623334400", claveAcceso: "LLLLL-LLLLL-LLLLL" },
  inversion: { folio: "PV-LM-2025-01", inversionistaId: "C-L", proyectoId: "P-L", montoTotal: 400000, fechaInicio: hoyMasDias(-300), fechaSalida: hoyMasDias(-50), estado: "Activa", tasaAnual: 18 },
  aportaciones: [{ id: "ap-l1", folio: "PV-LM-2025-01", numeroPago: 1, totalPagos: 1, concepto: "Aportacion unica", fechaProgramada: hoyMasDias(-300), monto: 400000, fechaRecibida: hoyMasDias(-299) }],
});

// ---------- M) ANUAL tasa NEGATIVA (typo) — debe tratarse como 0% ------------
escenarios.push({
  nombre: "M. Anual -5% (typo) — se trata como 0% (sin perdidas)",
  proyecto: { id: "P-M", nombre: "Proyecto Typo", tipo: "Obra", etapaActual: "Estructura" },
  cliente: { id: "C-M", nombre: "Mara Ortiz", telefono: "6624445500", claveAcceso: "MMMMM-MMMMM-MMMMM" },
  inversion: { folio: "PT-MO-2026-01", inversionistaId: "C-M", proyectoId: "P-M", montoTotal: 500000, fechaInicio: hoyMasDias(-150), fechaSalida: hoyMasDias(215), estado: "Activa", tasaAnual: -5 },
  aportaciones: [{ id: "ap-m1", folio: "PT-MO-2026-01", numeroPago: 1, totalPagos: 1, concepto: "Aportacion unica", fechaProgramada: hoyMasDias(-150), monto: 300000, fechaRecibida: hoyMasDias(-149) }],
});

// ---------- N) ANUAL montoTotal = 0 ------------------------------------------
escenarios.push({
  nombre: "N. Anual 25% — montoTotal 0 (caso raro)",
  proyecto: { id: "P-N", nombre: "Proyecto Vacio", tipo: "Otro", etapaActual: "Permisos" },
  cliente: { id: "C-N", nombre: "Nora Lares", telefono: "6625556600", claveAcceso: "NNNNN-NNNNN-NNNNN" },
  inversion: { folio: "PX-NL-2026-01", inversionistaId: "C-N", proyectoId: "P-N", montoTotal: 0, fechaInicio: hoyMasDias(-30), fechaSalida: hoyMasDias(335), estado: "Activa", tasaAnual: 25 },
  aportaciones: [],
});

// ---------- O) ANUAL recibido > comprometido (sobrepago total) ---------------
escenarios.push({
  nombre: "O. Anual 22% — recibido MAYOR que comprometido",
  proyecto: { id: "P-O", nombre: "Proyecto Extra", tipo: "Obra", etapaActual: "Acabados" },
  cliente: { id: "C-O", nombre: "Omar Ruiz", telefono: "6626667700", claveAcceso: "OOOOO-OOOOO-OOOOO" },
  inversion: { folio: "PE-OR-2026-01", inversionistaId: "C-O", proyectoId: "P-O", montoTotal: 300000, fechaInicio: hoyMasDias(-100), fechaSalida: hoyMasDias(265), estado: "Activa", tasaAnual: 22 },
  aportaciones: [{ id: "ap-o1", folio: "PE-OR-2026-01", numeroPago: 1, totalPagos: 1, concepto: "Aportacion unica", fechaProgramada: hoyMasDias(-100), monto: 350000, fechaRecibida: hoyMasDias(-99) }],
});

// ---------- P) TRAMOS recibido 0 + venta DESPUES del ultimo tramo ------------
escenarios.push({
  nombre: "P. Tramos — recibido 0 y venta despues del ultimo tramo",
  proyecto: { id: "P-P", nombre: "Casa Gamma", tipo: "Obra", etapaActual: "Cimentacion" },
  cliente: { id: "C-P", nombre: "Paty Vela", telefono: "6627778800", claveAcceso: "PPPPP-PPPPP-PPPPP" },
  inversion: { folio: "CG-PV-2026-01", inversionistaId: "C-P", proyectoId: "P-P", montoTotal: 600000, fechaInicio: hoyMasMeses(-2), fechaSalida: hoyMasMeses(13), estado: "Activa", tramos: tramosHugo },
  aportaciones: [{ id: "ap-p1", folio: "CG-PV-2026-01", numeroPago: 1, totalPagos: 1, concepto: "Aportacion unica", fechaProgramada: hoyMasMeses(-2), monto: 600000 }],
});

// ---------- R) PLUSVALIA con PERDIDA (el terreno retrocedio) -----------------
escenarios.push({
  nombre: "R. Plusvalia — terreno RETROCEDIO (perdida legitima)",
  proyecto: { id: "P-R", nombre: "Real Miramar", tipo: "Lotificacion", etapaActual: "Permisos", plusvaliaKey: "miramar", etapaPrecio: "fund2" },
  cliente: { id: "C-R", nombre: "Rosa Gil", telefono: "6628889900", claveAcceso: "RRRRR-RRRRR-RRRRR" },
  inversion: { folio: "RM-RG-2026-01", inversionistaId: "C-R", proyectoId: "P-R", montoTotal: 600000, fechaInicio: hoyMasDias(-200), fechaSalida: hoyMasDias(530), estado: "Activa", precioEntrada: 4000 },
  aportaciones: [{ id: "ap-r1", folio: "RM-RG-2026-01", numeroPago: 1, totalPagos: 1, concepto: "Aportacion unica", fechaProgramada: hoyMasDias(-200), monto: 600000, fechaRecibida: hoyMasDias(-198) }],
});

// ---------- S) PLUSVALIA LIQUIDADA sin precioSalida (cae a etapa actual) -----
escenarios.push({
  nombre: "S. Plusvalia — LIQUIDADA sin precioSalida (cae a etapa actual)",
  proyecto: { id: "P-S", nombre: "Real Miramar", tipo: "Lotificacion", etapaActual: "Comercializacion", plusvaliaKey: "miramar", etapaPrecio: "venta" },
  cliente: { id: "C-S", nombre: "Saul Vela", telefono: "6620002200", claveAcceso: "SSSSS-SSSSS-SSSSS" },
  inversion: { folio: "RM-SV-2025-01", inversionistaId: "C-S", proyectoId: "P-S", montoTotal: 500000, fechaInicio: hoyMasDias(-600), fechaSalida: hoyMasDias(-20), estado: "Liquidada", precioEntrada: 3000 },
  aportaciones: [{ id: "ap-s1", folio: "RM-SV-2025-01", numeroPago: 1, totalPagos: 1, concepto: "Aportacion unica", fechaProgramada: hoyMasDias(-600), monto: 500000, fechaRecibida: hoyMasDias(-598) }],
});

// ---------- T) PLUSVALIA sin precio de entrada (entrada 0 -> sinPrecios) -----
escenarios.push({
  nombre: "T. Plusvalia — sin precio de entrada (-> sinPrecios)",
  proyecto: { id: "P-T", nombre: "Real Miramar", tipo: "Lotificacion", etapaActual: "Urbanizacion", plusvaliaKey: "miramar", etapaPrecio: "preventa2" },
  cliente: { id: "C-T", nombre: "Tere Ríos", telefono: "6620003300", claveAcceso: "TTTTT-TTTTT-TTTTT" },
  inversion: { folio: "RM-TR-2026-01", inversionistaId: "C-T", proyectoId: "P-T", montoTotal: 600000, fechaInicio: hoyMasDias(-100), fechaSalida: hoyMasDias(630), estado: "Activa", precioEntrada: 0 },
  aportaciones: [{ id: "ap-t1", folio: "RM-TR-2026-01", numeroPago: 1, totalPagos: 1, concepto: "Aportacion unica", fechaProgramada: hoyMasDias(-100), monto: 600000, fechaRecibida: hoyMasDias(-98) }],
});

// ---------- U) PLUSVALIA etapa de precio inexistente (-> sinPrecios) ---------
escenarios.push({
  nombre: "U. Plusvalia — etapa de precio inexistente (-> sinPrecios)",
  proyecto: { id: "P-U", nombre: "Real Miramar", tipo: "Lotificacion", etapaActual: "Permisos", plusvaliaKey: "miramar", etapaPrecio: "noexiste" },
  cliente: { id: "C-U", nombre: "Ulises Paz", telefono: "6620004400", claveAcceso: "UUUUU-UUUUU-UUUUU" },
  inversion: { folio: "RM-UP-2026-01", inversionistaId: "C-U", proyectoId: "P-U", montoTotal: 500000, fechaInicio: hoyMasDias(-80), fechaSalida: hoyMasDias(650), estado: "Activa", precioEntrada: 3000 },
  aportaciones: [{ id: "ap-u1", folio: "RM-UP-2026-01", numeroPago: 1, totalPagos: 1, concepto: "Aportacion unica", fechaProgramada: hoyMasDias(-80), monto: 500000, fechaRecibida: hoyMasDias(-78) }],
});

// ===========================================================================
//  EJECUCION + ASERCIONES
// ===========================================================================
function recibidoDe(aps) {
  return aps.filter((a) => estadoAportacion(a) === "Recibida").reduce((s, a) => s + (Number(a.monto) || 0), 0);
}

const filas = [];
for (const e of escenarios) {
  const recibido = recibidoDe(e.aportaciones);
  let rend;
  try { rend = calcularRendimientoInversion(e.inversion, recibido, precios, e.proyecto); }
  catch (err) { check(e.nombre + " :: no truena", false, "EXCEPCION " + err.message); continue; }
  check(e.nombre + " :: devuelve objeto", rend && typeof rend === "object");
  check(e.nombre + " :: cifras finitas", [rend.rendimientoPct, rend.totalARecibir, rend.totalFinal, rend.ganancia].every((x) => Number.isFinite(Number(x))), JSON.stringify(rend).slice(0, 120));

  const liquidada = (e.inversion.estado || "Activa") === "Liquidada";

  // Estado de cada aportacion: siempre uno de los 4 validos
  for (const a of e.aportaciones) {
    const st = estadoAportacion(a);
    check(e.nombre + " :: estado valido (" + a.id + ")", ["Recibida", "Vencida", "Pendiente", "En aprobacion"].includes(st), st);
  }

  // Comprobante: detectar enlace publico viejo vs fileId privado
  for (const a of e.aportaciones) {
    if (!a.comprobanteUrl) continue;
    const esLink = esEnlacePublico(a.comprobanteUrl);
    const esperadoLink = String(a.comprobanteUrl).startsWith("http");
    check(e.nombre + " :: deteccion comprobante (" + a.id + ")", esLink === esperadoLink, a.comprobanteUrl);
  }

  // Checks especificos por modo
  if (rend.modo === "anual") {
    const inicio = e.inversion.fechaInicio;
    const salida = e.inversion.fechaSalida && String(e.inversion.fechaSalida).trim() ? String(e.inversion.fechaSalida).trim() : "";
    const tasaEsp = (e.inversion.tasaAnual === "" || e.inversion.tasaAnual == null) ? 25 : Math.max(0, Number(e.inversion.tasaAnual) || 0);
    // corte (recompute independiente): liquidada -> salida; activa -> min(hoy, salida)
    const corte = liquidada ? (salida || HOY) : (salida && salida < HOY ? salida : HOY);
    const diasEsp = diasEntre(inicio, corte);
    const finProy = salida || corte;
    const diasTotEsp = diasEntre(inicio, finProy);
    check(e.nombre + " :: [anual] dias >= 0", rend.dias >= 0, "dias=" + rend.dias);
    check(e.nombre + " :: [anual] dias = corte esperado (min hoy/salida)", aprox(rend.dias, diasEsp, 1), `dias=${rend.dias} esp=${diasEsp}`);
    check(e.nombre + " :: [anual] rendimiento = dias*tasa/365", aprox(rend.rendimientoPct, diasEsp * tasaEsp / 365, 0.05), `pct=${rend.rendimientoPct} esp=${diasEsp * tasaEsp / 365}`);
    // valor hoy SIEMPRE sobre lo APORTADO (no sobre el comprometido)
    check(e.nombre + " :: [anual] valor hoy sobre lo aportado", aprox(rend.totalARecibir, recibido * (1 + rend.rendimientoPct / 100)), `vh=${rend.totalARecibir}`);
    check(e.nombre + " :: [anual] total final sobre comprometido", aprox(rend.totalFinal, num(e.inversion.montoTotal) * (1 + diasTotEsp * tasaEsp / 365 / 100), 1), `tf=${rend.totalFinal} esp=${num(e.inversion.montoTotal) * (1 + diasTotEsp * tasaEsp / 365 / 100)}`);
  } else if (rend.modo === "tramos") {
    check(e.nombre + " :: [tramos] mesHoy >= 1", rend.mesHoy >= 1, "mesHoy=" + rend.mesHoy);
    check(e.nombre + " :: [tramos] valor hoy sobre lo aportado", aprox(rend.totalARecibir, recibido * (1 + rend.rendimientoPct / 100)), `vh=${rend.totalARecibir}`);
    check(e.nombre + " :: [tramos] total final sobre comprometido", aprox(rend.totalFinal, num(e.inversion.montoTotal) * (1 + rend.rendPctFinal / 100)), `tf=${rend.totalFinal}`);
  } else if (rend.modo === "plusvalia") {
    if (rend.sinPrecios) {
      // sin precios: NO inventar % ni ganancia; valor hoy = lo recibido
      check(e.nombre + " :: [plusvalia sinPrecios] rendimiento 0", rend.rendimientoPct === 0);
      check(e.nombre + " :: [plusvalia sinPrecios] valor hoy = recibido", aprox(rend.totalARecibir, recibido), `vh=${rend.totalARecibir} recibido=${recibido}`);
      check(e.nombre + " :: [plusvalia sinPrecios] ganancia 0", aprox(rend.ganancia, 0));
    } else {
      const pEntrada = Number(e.inversion.precioEntrada) || 0;
      const pSalida = Number(e.inversion.precioSalida) || 0;
      const stage = Number((precios[e.proyecto.plusvaliaKey] && precios[e.proyecto.plusvaliaKey].etapas || {})[e.proyecto.etapaPrecio]) || 0;
      const pActual = (liquidada && pSalida > 0) ? pSalida : stage; // mismo criterio que el codigo
      const factor = pActual / pEntrada;
      check(e.nombre + " :: [plusvalia] valor hoy = recibido x (pActual/pEntrada)", aprox(rend.totalARecibir, recibido * factor, 1), `vh=${rend.totalARecibir} esperado=${recibido * factor}`);
      check(e.nombre + " :: [plusvalia] precioActual usado correcto", aprox(rend.precioActual, pActual), `pAct=${rend.precioActual} esp=${pActual}`);
      // si el terreno RETROCEDIO (precio actual < entrada) la plusvalia puede ser NEGATIVA (perdida legitima)
      if (factor < 1) check(e.nombre + " :: [plusvalia] permite perdida cuando precio < entrada", rend.rendimientoPct < 0 && rend.totalARecibir < recibido, `pct=${rend.rendimientoPct}`);
      if (factor > 1) check(e.nombre + " :: [plusvalia] ganancia positiva cuando precio > entrada", rend.rendimientoPct > 0);
    }
  }

  // Mensaje de recordatorio WhatsApp para la primera aportacion vencida/pendiente
  const aRecordar = e.aportaciones.find((a) => ["Vencida", "Pendiente"].includes(estadoAportacion(a)));
  if (aRecordar && e.cliente.telefono) {
    const msg = mensajeRecordatorioPago(aRecordar, e.cliente, e.proyecto);
    check(e.nombre + " :: msg WA tiene monto", msg.includes(money(aRecordar.monto)));
    check(e.nombre + " :: msg WA tiene proyecto", !e.proyecto.nombre || msg.includes(e.proyecto.nombre));
  }

  filas.push({
    escenario: e.nombre,
    modo: rend.modo + (rend.sinPrecios ? " (sin precios)" : ""),
    recibido: money(recibido),
    valorHoy: rend.modo === "plusvalia" && rend.sinPrecios ? "en config" : money(rend.totalARecibir),
    totalFinal: rend.modo === "plusvalia" && rend.sinPrecios ? "en config" : money(rend.totalFinal),
    dias: rend.dias ?? "-",
    rendPct: (Number(rend.rendimientoPct) || 0).toFixed(2) + "%",
    telWA: e.cliente.telefono ? telefonoWA(e.cliente.telefono) : "(sin tel)",
  });
}

// ===========================================================================
//  PRUEBAS DE UNIDAD: telefonoWA y mesParaTramo (fronteras)
// ===========================================================================
const telCasos = [
  ["6621234567", "526621234567"],
  ["52 662 123 4567", "526621234567"],
  ["+52 662 123 4567", "526621234567"],
  ["044 662 123 4567", "526621234567"],
  ["045 662 123 4567", "526621234567"],
  ["01 662 123 4567", "526621234567"],
  ["(662) 123-4567", "526621234567"],
  ["5216621234567", "526621234567"],
  ["5512345678", "525512345678"],          // CDMX (lada 55)
  ["662 123 4567", "526621234567"],        // con espacios
  ["ext 500", ""],                          // basura (solo extension) -> vacio
  ["123", ""],                              // muy corto -> vacio
  ["", ""],
];
for (const [entrada, esperado] of telCasos) {
  check("telefonoWA('" + entrada + "')", telefonoWA(entrada) === esperado, "dio '" + telefonoWA(entrada) + "', esperaba '" + esperado + "'");
}

// mesParaTramo: aniversario exacto de 6 meses = mes 6 (no 7)
const inicioT = "2026-01-15";
check("mesParaTramo dia 0 = mes 1", mesParaTramo(inicioT, "2026-01-15") === 1, "dio " + mesParaTramo(inicioT, "2026-01-15"));
check("mesParaTramo 6 meses exactos = mes 6", mesParaTramo(inicioT, "2026-07-15") === 6, "dio " + mesParaTramo(inicioT, "2026-07-15"));
check("mesParaTramo 6 meses + 1 dia = mes 7", mesParaTramo(inicioT, "2026-07-16") === 7, "dio " + mesParaTramo(inicioT, "2026-07-16"));

// parseTramos: una fila incompleta o con % negativo no debe activar el modo tramos
check("parseTramos ignora filas incompletas", parseTramos(JSON.stringify([{ desde: 1, hasta: 6, pct: "" }])).length === 0);
check("parseTramos rechaza % negativo", parseTramos(JSON.stringify([{ desde: 1, hasta: 6, pct: -5 }])).length === 0);
check("parseTramos acepta filas completas", parseTramos(JSON.stringify([{ desde: 1, hasta: 6, pct: 12.5 }])).length === 1);

// pctTramo: huecos y despues del ultimo heredan el tramo inferior; antes -> 0
const tramosHueco = parseTramos(JSON.stringify([{ desde: 1, hasta: 3, pct: 10 }, { desde: 6, hasta: 9, pct: 20 }]));
check("pctTramo dentro de tramo (mes 2) = 10", pctTramo(tramosHueco, 2) === 10, String(pctTramo(tramosHueco, 2)));
check("pctTramo en HUECO (mes 5) hereda inferior (10)", pctTramo(tramosHueco, 5) === 10, String(pctTramo(tramosHueco, 5)));
check("pctTramo despues del ultimo (mes 12) hereda 20", pctTramo(tramosHueco, 12) === 20, String(pctTramo(tramosHueco, 12)));
check("pctTramo antes del primero (mes 0) = 0", pctTramo(tramosHueco, 0) === 0, String(pctTramo(tramosHueco, 0)));

// mensajeRecordatorioPago: sin datos bancarios ni concepto, no truena y trae lo basico
const msgMin = mensajeRecordatorioPago({ monto: 12345, fechaProgramada: hoyMasDias(-3) }, { nombre: "Test User" }, { nombre: "Proyecto X" });
check("mensaje WA sin banco/concepto trae monto y proyecto", msgMin.includes(money(12345)) && msgMin.includes("Proyecto X"), msgMin.slice(0, 60));

// ---------------------------------------------------------------------------
//  PRIVACIDAD: regla de autorizacion de verComprobante (espejo del backend).
//  El backend REAL ya se verifico con el enjambre de seguridad; aqui validamos
//  la REGLA de pertenencia con los clientes de prueba.
// ---------------------------------------------------------------------------
function puedeVerComprobante(rol, idActor, asesorProyIds, aportacion, todasInversiones) {
  if (rol === "admin") return true;
  const folio = String(aportacion.folio);
  const invDelFolio = todasInversiones.filter((i) => String(i.folio) === folio);
  if (rol === "codesarrollador") return invDelFolio.some((i) => String(i.inversionistaId) === String(idActor));
  if (rol === "asesor") return invDelFolio.some((i) => (asesorProyIds || {})[String(i.proyectoId)] === true);
  return false;
}
const todasInv = escenarios.map((e) => e.inversion);
const apAna = escenarios[0].aportaciones[0];                                  // C-A Ana, folio RS-AL...
const apBeto = escenarios[1].aportaciones[0];                                 // C-B Beto, folio LC-BR...
const apDiana = escenarios.find((e) => e.cliente.id === "C-D").aportaciones[0]; // proyecto P-D
check("[priv] admin ve cualquier comprobante", puedeVerComprobante("admin", null, null, apAna, todasInv) && puedeVerComprobante("admin", null, null, apBeto, todasInv));
check("[priv] Ana ve SU comprobante", puedeVerComprobante("codesarrollador", "C-A", null, apAna, todasInv));
check("[priv] Ana NO ve el de Beto", !puedeVerComprobante("codesarrollador", "C-A", null, apBeto, todasInv));
check("[priv] Beto NO ve el de Ana", !puedeVerComprobante("codesarrollador", "C-B", null, apAna, todasInv));
check("[priv] asesor de P-D ve el de Diana", puedeVerComprobante("asesor", null, { "P-D": true }, apDiana, todasInv));
check("[priv] asesor de P-D NO ve el de Ana (otro proyecto)", !puedeVerComprobante("asesor", null, { "P-D": true }, apAna, todasInv));

// ===========================================================================
//  REPORTE
// ===========================================================================
function pad(s, n) { s = String(s); return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length); }
let out = "";
out += "RESULTADOS POR ESCENARIO (HOY = " + HOY + ")\n";
out += "=".repeat(110) + "\n";
out += pad("Escenario", 46) + pad("Modo", 18) + pad("Recibido", 12) + pad("Valor hoy", 13) + pad("Total final", 13) + pad("Dias", 6) + "\n";
out += "-".repeat(110) + "\n";
for (const f of filas) out += pad(f.escenario, 46) + pad(f.modo, 18) + pad(f.recibido, 12) + pad(f.valorHoy, 13) + pad(f.totalFinal, 13) + pad(String(f.dias), 6) + "\n";
out += "\n";
out += "Telefonos normalizados para WhatsApp:\n";
for (const f of filas) out += "  " + pad(f.escenario, 46) + " -> " + f.telWA + "\n";
out += "\n" + "=".repeat(110) + "\n";
out += `RESUMEN:  ${PASS} pruebas OK, ${FAIL} fallas\n`;
if (FAIL) { out += "\nFALLAS:\n"; for (const f of fallos) out += "  ✗ " + f + "\n"; }
else out += "\n✓ Todas las pruebas pasaron.\n";

console.log(out);
process.exit(FAIL ? 1 : 0);
