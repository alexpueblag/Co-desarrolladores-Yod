// Buscar errores reales de logica

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
  const re = new RegExp("const\\s+" + nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");
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

const FUNCS = ["num", "parseDate", "diasEntre", "fmtFecha", "calcularRendimientoInversion"];
const CONSTS = ["TASA_DEFAULT"];

let modulo = "// AUTO-GENERADO\n";
for (const c of CONSTS) {
  const e = extraerConst(c);
  if (e) modulo += e + "\n";
}
for (const f of FUNCS) {
  const e = extraerFuncion(f);
  if (e) modulo += e + "\n";
}
modulo += "\nexport { num, parseDate, diasEntre, fmtFecha, calcularRendimientoInversion };\n";

const TMP = join(__dirname, "_test-error.mjs");
writeFileSync(TMP, modulo, "utf8");
const L = await import("file://" + TMP);
try { unlinkSync(TMP); } catch (e) { }

const { calcularRendimientoInversion, num, parseDate, diasEntre, fmtFecha } = L;

// VERIFICAR: calcularRendimientoInversion ANUAL — diasTotal vs dias
console.log("\n=== ERROR POTENCIAL: en ANUAL, ¿diasTotal se calcula siempre de inicio a salida? ===");
const inv_activa = {
  montoTotal: 1000000,
  fechaInicio: "2026-01-01",
  fechaSalida: "2026-12-31",  // SALIDA FUTURA
  estado: "Activa",
  tasaAnual: 25
};

const hoy_iso = new Date().toISOString().slice(0, 10);
console.log("Hoy: " + hoy_iso);

const rend = calcularRendimientoInversion(inv_activa, 500000, {}, {});
console.log("dias (hasta HOY): " + rend.dias);
console.log("diasTotal (init->salida): " + rend.diasTotal);
console.log("rendPctFinal (sobre diasTotal): " + rend.rendPctFinal.toFixed(2) + "%");
console.log("(Si diasTotal > dias, se inflaba el %final para ACTIVAS)");

// Verificar que el calculo de rendPctFinal sea CORRECTO
const diasEsperados = diasEntre(inv_activa.fechaInicio, inv_activa.fechaSalida);
const tasaAnual = 25;
const rendPctFinalEsperado = diasEsperados * (tasaAnual / 365);
console.log("\nCalculo manual:");
console.log("  diasEntre(init, salida): " + diasEsperados);
console.log("  rendPctFinal esperado: " + diasEsperados + " * (25/365) = " + rendPctFinalEsperado.toFixed(2) + "%");
console.log("  rendPctFinal real: " + rend.rendPctFinal.toFixed(2) + "%");
console.log("  Match: " + (Math.abs(rend.rendPctFinal - rendPctFinalEsperado) < 0.01 ? "OK" : "ERROR!"));

