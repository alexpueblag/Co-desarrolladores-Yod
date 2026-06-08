import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP = join(__dirname, "src", "App.jsx");
const src = readFileSync(APP, "utf8");

function extraerFuncion(nombre) {
  const re = new RegExp("function\\s+" + nombre + "\\s*\\(", "g");
  const m = re.exec(src);
  if (!m) return null;
  const abre = src.indexOf("{", m.index);
  let depth = 0;
  for (let j = abre; j < src.length; j++) {
    const c = src[j];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return src.slice(m.index, j + 1); }
  }
  return null;
}

function extraerConst(nombre) {
  const re = new RegExp("const\\s+" nombre + "\\b", "g");
  const m = re.exec(src);
  if (!m) return null;
  let depth = 0;
  for (let j = m.index; j < src.length; j++) {
    const c = src[j];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    else if (c === ";" && depth === 0) return src.slice(m.index, j + 1);
  }
  return null;
}

const FUNCS = [
  "money", "pct", "todayISO", "parseDate", "fmtFecha", "diasEntre",
  "fechaCorteRendimiento", "parseTramos", "mesParaTramo", "pctTramo",
  "calcularRendimientoInversion", "estadoAportacion", "arr", "num", "telefonoWA"
];
const CONSTS = ["mxn", "TASA_DEFAULT", "ETAPAS_PLUSVALIA"];

let modulo = "// AUTO-GENERADO\n";
for (const c of CONSTS) {
  const e = extraerConst(c);
  if (e) modulo += e + "\n";
}
for (const f of FUNCS) {
  const e = extraerFuncion(f);
  if (e) modulo += e + "\n";
}
modulo += "\nexport { " + FUNCS.join(", ") + " };\n";

const TMP = join(__dirname, "_test-real.mjs");
writeFileSync(TMP, modulo, "utf8");
const L = await import("file://" + TMP);
try { unlinkSync(TMP); } catch (e) { }

const { calcularRendimientoInversion, num } = L;

// VERDADERO GAP: plusvalia con precioEntrada = 0
console.log("\n=== GAP: Plusvalia con precioEntrada = 0 ===");
const inv_plusv = {
  montoTotal: 600000,
  fechaInicio: "2026-01-01",
  fechaSalida: "2026-12-31",
  estado: "Activa",
  precioEntrada: 0  // <-- EL PROBLEMA
};
const proyecto_plusv = {
  plusvaliaKey: "miramar",
  etapaPrecio: "preventa2"
};
const precios = {
  miramar: { etapas: { preventa2: 3500, venta: 4200 } }
};

try {
  const rend = calcularRendimientoInversion(inv_plusv, 600000, precios, proyecto_plusv);
  console.log("Resultado: " + JSON.stringify(rend).slice(0, 200));
} catch (e) {
  console.log("ERROR: " + e.message);
}

