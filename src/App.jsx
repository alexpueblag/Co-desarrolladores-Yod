import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Building2, Users, Wallet, Calendar, FileText, Calculator, LayoutDashboard,
  Plus, Pencil, Trash2, X, Save, RefreshCw, LogOut, Lock, Eye, EyeOff,
  Copy, Check, AlertTriangle, CheckCircle2, Clock, ChevronRight, ChevronDown,
  TrendingUp, ShieldCheck, KeyRound, Link2, ArrowLeft, Banknote, CircleDollarSign,
  AlertCircle, Loader2, Sparkles, ExternalLink, BadgeCheck, CalendarClock,
  Image as ImageIcon, PlayCircle, MessageCircle, HardHat
} from 'lucide-react';
import logoWhite from './assets/logo_white.png';

// ===================================================================
// CONFIGURACION
// ===================================================================
// PEGA AQUI la URL del Web App del Apps Script (termina en /exec).
// Mientras siga el placeholder, la app muestra un aviso de "Falta conectar el backend".
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxoW0hz0nInT208B8L_WNEpYNW0iPTMNWosl3m3TG9VO6WVRVqh90xKLLSLRQCTEB9O3A/exec";

const ADMIN_KEY = "codeyod-admin-v1";       // bandera de sesion admin + pass tecleada (solo en este navegador)
const INVESTOR_KEY = "codeyod-investor-v1"; // bandera de sesion inversionista + clave tecleada
const CACHE_KEY = "codeyod-cache-v1";       // respaldo de getAll para arranque offline

const TABS = ["Inversionistas", "Proyectos", "Inversiones", "Aportaciones", "Documentos"];
const TASA_DEFAULT = 25;

// ===================================================================
// UTILIDADES
// ===================================================================
const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
function money(n) { const v = Number(n); return isFinite(v) ? mxn.format(v) : mxn.format(0); }
function pct(n) { const v = Number(n); return (isFinite(v) ? v : 0).toFixed(2) + "%"; }

// "Hoy" en hora LOCAL (no UTC), para que sea coherente con parseDate(),
// que construye la medianoche local. En Hermosillo (UTC-7), usar UTC haria
// que de noche "hoy" salte a la fecha de manana y rompa estados/fechas.
function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function makeId(prefix) {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${t}${r}`.toUpperCase();
}

// Parseo robusto de fechas (acepta "2026-06-03" o ISO con hora)
function parseDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  if (!str) return null;
  // YYYY-MM-DD
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

// Convierte cualquier valor de fecha (incluido un ISO con hora que regresa el
// backend, ej. "2026-06-03T07:00:00.000Z") al formato "yyyy-MM-dd" en hora LOCAL,
// que es el unico que acepta <input type="date">. Sin esto, al editar un registro
// existente el campo de fecha aparece VACIO y, al guardar, la fecha se borra.
function toDateInput(s) {
  if (!s) return "";
  const str = String(s).trim();
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return str; // ya viene como yyyy-MM-dd puro
  const d = parseDate(str);
  if (!d) return "";
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtFecha(s) {
  const d = parseDate(s);
  if (!d) return "—";
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Dias completos entre dos fechas (fin - inicio), piso a 0
function diasEntre(inicio, fin) {
  const a = parseDate(inicio);
  const b = parseDate(fin);
  if (!a || !b) return 0;
  const ms = b.getTime() - a.getTime();
  const dias = Math.floor(ms / (1000 * 60 * 60 * 24));
  return dias > 0 ? dias : 0;
}

// FORMULA OFICIAL DE RENDIMIENTO (preferente, prorrateado por dia)
function calcularRendimiento(capital, fechaInicio, fechaSalida, tasaAnual) {
  const cap = Number(capital) || 0;
  const tasa = (tasaAnual === "" || tasaAnual == null) ? TASA_DEFAULT : Number(tasaAnual);
  const dias = diasEntre(fechaInicio, fechaSalida);
  const rendimientoPct = dias * (tasa / 365);
  const totalARecibir = cap * (1 + rendimientoPct / 100);
  const ganancia = totalARecibir - cap;
  return { dias, rendimientoPct, totalARecibir, ganancia, tasa };
}

// Estado derivado de una aportacion (la fuente de verdad es fechaRecibida;
// la columna 'estado' del Sheet no se usa para derivar, por eso no se persiste)
function estadoAportacion(ap) {
  if (ap.fechaRecibida && String(ap.fechaRecibida).trim()) return "Recibida";
  // El inversionista ya reporto su pago (referencia/comprobante) pero el equipo aun no lo valida.
  if (ap.fechaReporte && String(ap.fechaReporte).trim()) return "En aprobacion";
  const prog = parseDate(ap.fechaProgramada);
  if (prog) {
    const hoy = parseDate(todayISO());
    if (prog < hoy) return "Vencida";
  }
  return "Pendiente";
}

function arr(x) { return Array.isArray(x) ? x : []; }
function num(x) { const v = Number(x); return isFinite(v) ? v : 0; }

// Genera una clave de acceso legible (mismo formato que el backend).
function generarClaveAcceso() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 15; i++) s += abc.charAt(Math.floor(Math.random() * abc.length));
  return s.slice(0, 5) + "-" + s.slice(5, 10) + "-" + s.slice(10);
}

// Suma n meses a una fecha "yyyy-MM-dd" (ajustando el dia si el mes es mas corto).
function sumarMeses(iso, n) {
  const d = parseDate(iso);
  if (!d) return iso;
  const dia = d.getDate();
  const destino = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const ultimoDia = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
  destino.setDate(Math.min(dia, ultimoDia));
  return `${destino.getFullYear()}-${String(destino.getMonth() + 1).padStart(2, "0")}-${String(destino.getDate()).padStart(2, "0")}`;
}

// Quita campos sensibles (claveAcceso, notas) de los inversionistas antes de
// persistir el cache en localStorage. El cache es solo para arranque/offline de
// la UI; no necesita las claves de acceso ni notas internas, que en una Mac
// compartida o con una extension maliciosa quedarian expuestas en texto plano.
function sanitizarParaCache(data) {
  const d = data || {};
  const inversionistas = arr(d.Inversionistas).map((i) => {
    const { claveAcceso, notas, ...resto } = i || {};
    return resto;
  });
  return { ...d, Inversionistas: inversionistas };
}

// ===================================================================
// API
// ===================================================================
const BACKEND_LISTO = APPS_SCRIPT_URL && !APPS_SCRIPT_URL.startsWith("PEGA_AQUI");

// Datos de EJEMPLO para vista previa local (solo cuando el backend no esta conectado).
// En cuanto pegues la URL real del Apps Script, esto se ignora por completo.
const DEMO_DATA = {
  inversionista: { id: "demo", nombre: "Juan Perez", email: "juan@ejemplo.mx", telefono: "" },
  proyectos: [{ id: "proy-demo", nombre: "Residencial Demo", banco: "Banco (ejemplo)", beneficiario: "YODESARROLLO SAPI DE CV", cuenta: "000000000", clabe: "000000000000000000", conceptoBase: "Aportacion Residencial Demo - <Codesarrollador> - <Folio>", estado: "Abierto" }],
  inversiones: [{ folio: "DEMO-2026-01", inversionistaId: "demo", proyectoId: "proy-demo", montoTotal: 1000000, fechaInicio: "2026-03-06", fechaSalida: "", tasaAnual: 25, estado: "Activa" }],
  aportaciones: [
    { id: "d-a1", folio: "DEMO-2026-01", numeroPago: 1, totalPagos: 4, concepto: "Aportacion inicial", fechaProgramada: "2026-03-06", monto: 350000, fechaRecibida: "2026-03-06", comprobanteUrl: "" },
    { id: "d-a2", folio: "DEMO-2026-01", numeroPago: 2, totalPagos: 4, concepto: "Aportacion 2 de 4", fechaProgramada: "2026-04-06", monto: 216667, fechaRecibida: "2026-04-08", comprobanteUrl: "" },
    { id: "d-a3", folio: "DEMO-2026-01", numeroPago: 3, totalPagos: 4, concepto: "Aportacion 3 de 4", fechaProgramada: "2026-05-06", monto: 216667, fechaRecibida: "2026-05-06", comprobanteUrl: "" },
    { id: "d-a4", folio: "DEMO-2026-01", numeroPago: 4, totalPagos: 4, concepto: "Aportacion final", fechaProgramada: "2026-06-06", monto: 216666, fechaRecibida: "", comprobanteUrl: "" },
  ],
  documentos: [{ id: "d-doc1", folio: "DEMO-2026-01", tipo: "Contrato", nombre: "Promesa de Pago (ejemplo)", url: "", fecha: "2026-03-06" }],
  avances: [
    { id: "av1", folio: "DEMO-2026-01", tipo: "foto", url: "https://picsum.photos/seed/obra-cimentacion/600/450", titulo: "Cimentacion terminada", fecha: "2026-03-20" },
    { id: "av2", folio: "DEMO-2026-01", tipo: "foto", url: "https://picsum.photos/seed/obra-estructura/600/450", titulo: "Estructura nivel 1", fecha: "2026-04-18" },
    { id: "av3", folio: "DEMO-2026-01", tipo: "video", url: "https://youtu.be/ejemplo", titulo: "Recorrido en obra", fecha: "2026-05-10" },
    { id: "av4", folio: "DEMO-2026-01", tipo: "foto", url: "https://picsum.photos/seed/obra-losa/600/450", titulo: "Colado de losa nivel 2", fecha: "2026-05-28" },
  ],
  bitacora: [
    { id: "b1", folio: "DEMO-2026-01", fecha: "2026-05-28", autor: "Sayri", etiqueta: "Avance", titulo: "Losa del nivel 2 colada", nota: "Esta semana completamos el colado de la losa del segundo nivel. Vamos en tiempo con el plan de obra." },
    { id: "b2", folio: "DEMO-2026-01", fecha: "2026-05-12", autor: "Sayri", etiqueta: "Respuesta", titulo: "", nota: "Juan, sobre tu pregunta de los acabados: la seleccion de pisos la vemos juntos en la visita del proximo mes." },
    { id: "b3", folio: "DEMO-2026-01", fecha: "2026-04-18", autor: "Sayri", etiqueta: "Avance", titulo: "Estructura del nivel 1 lista", nota: "Terminamos la estructura del primer nivel. Te subimos fotos nuevas a tu galeria de avance." },
  ],
};

// Detecta si un error del backend es por credenciales de admin invalidas,
// para poder forzar un re-login en vez de dejar la sesion atorada.
function esErrorCredenciales(msg) {
  return /credencial/i.test(String(msg || ""));
}

async function apiCall(action, payload = {}) {
  if (!BACKEND_LISTO) {
    throw new Error("Falta conectar el backend: pega la URL del Apps Script en APPS_SCRIPT_URL.");
  }
  const body = JSON.stringify({ action, ...payload });
  let res;
  try {
    res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body,
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      redirect: "follow",
    });
  } catch (e) {
    throw new Error("No se pudo conectar con el servidor. Revisa tu internet o la URL del Apps Script.");
  }
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error("El servidor respondio algo inesperado. Si re-desplegaste el Apps Script, actualiza la URL.");
  }
  if (!data || data.ok !== true) {
    throw new Error((data && data.error) || "Ocurrio un error en el servidor.");
  }
  return data;
}

// ===================================================================
// ERROR BOUNDARY
// ===================================================================
class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("[ErrorBoundary]", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-100">
          <div className="max-w-lg w-full bg-white border border-red-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-red-800 flex items-center gap-2">
              <AlertTriangle size={20} /> Algo salio mal
            </h2>
            <p className="text-sm text-slate-600 mt-2">
              Hubo un error al mostrar esta parte del portal. Recarga la pagina con Cmd+Shift+R.
              Si sigue igual, abre la consola (F12) y comparte el mensaje.
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-4 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
            >
              Intentar de nuevo
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ===================================================================
// COMPONENTES UI BASE
// ===================================================================
function Spinner({ size = 16, className = "" }) {
  return <Loader2 size={size} className={"animate-spin " + className} />;
}

function Toast({ toast }) {
  if (!toast) return null;
  const tone = toast.tipo === "error"
    ? "bg-red-600"
    : toast.tipo === "ok" ? "bg-emerald-600" : "bg-slate-800";
  const Icon = toast.tipo === "error" ? AlertCircle : toast.tipo === "ok" ? CheckCircle2 : Sparkles;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] px-4">
      <div className={`${tone} text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm max-w-md`}>
        <Icon size={18} className="shrink-0" />
        <span>{toast.msg}</span>
      </div>
    </div>
  );
}

function CopyButton({ value, label = "Copiar" }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(value || ""));
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch (e) { /* noop */ }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
      title={label}
    >
      {done ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
      {done ? "Copiado" : label}
    </button>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
      {hint ? <span className="text-[11px] text-slate-400 mt-1 block">{hint}</span> : null}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 bg-white";

function Input(props) { return <input {...props} className={inputCls + " " + (props.className || "")} />; }
function Select(props) { return <select {...props} className={inputCls + " " + (props.className || "")} />; }
function Textarea(props) { return <textarea {...props} className={inputCls + " resize-y " + (props.className || "")} />; }

function Btn({ children, variant = "primary", className = "", ...rest }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium px-3.5 py-2 transition disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-slate-900 text-white hover:bg-slate-800",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100",
    outline: "border border-slate-300 text-slate-700 hover:bg-slate-50 bg-white",
    danger: "bg-red-600 text-white hover:bg-red-500",
    success: "bg-emerald-600 text-white hover:bg-emerald-500",
    gold: "bg-amber-500 text-white hover:bg-amber-400",
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...rest}>{children}</button>;
}

function Badge({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
    gray: "bg-slate-100 text-slate-500",
  };
  return <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${tones[tone] || tones.slate}`}>{children}</span>;
}

function EstadoAportacionBadge({ ap }) {
  const e = estadoAportacion(ap);
  if (e === "Recibida") return <Badge tone="green"><CheckCircle2 size={12} /> Recibida</Badge>;
  if (e === "En aprobacion") return <Badge tone="blue"><Clock size={12} /> En aprobacion</Badge>;
  if (e === "Vencida") return <Badge tone="red"><AlertTriangle size={12} /> Vencida</Badge>;
  return <Badge tone="amber"><Clock size={12} /> Pendiente</Badge>;
}

function EstadoInversionBadge({ estado }) {
  if (estado === "Liquidada") return <Badge tone="blue"><BadgeCheck size={12} /> Liquidada</Badge>;
  if (estado === "Cancelada") return <Badge tone="gray"><X size={12} /> Cancelada</Badge>;
  return <Badge tone="green"><TrendingUp size={12} /> Activa</Badge>;
}

function Modal({ open, onClose, title, children, width = "max-w-2xl" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
      <div className={`bg-white rounded-2xl shadow-xl w-full ${width} my-auto`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ConfirmDialog({ open, title, message, onConfirm, onCancel, confirmLabel = "Eliminar" }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <AlertTriangle size={18} className="text-red-500" /> {title}
        </h3>
        <p className="text-sm text-slate-600 mt-2">{message}</p>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="outline" onClick={onCancel}>Cancelar</Btn>
          <Btn variant="danger" onClick={onConfirm}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
}

// ===================================================================
// LOGIN GATE
// ===================================================================
function LoginGate({ onAdmin, onInvestor }) {
  const [modo, setModo] = useState(null); // null | "admin" | "investor" | "recuperar"
  const [pass, setPass] = useState("");
  const [clave, setClave] = useState("");
  const [email, setEmail] = useState("");
  const [recOk, setRecOk] = useState(false);
  const [verPass, setVerPass] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const recuperar = async (e) => {
    e.preventDefault();
    setError(""); setCargando(true);
    if (!BACKEND_LISTO) { setRecOk(true); setCargando(false); return; }
    try {
      await apiCall("recuperarClave", { email });
      setRecOk(true);
    } catch (err) {
      setError(err.message || "No se pudo enviar. Intenta de nuevo.");
    } finally { setCargando(false); }
  };

  const entrarAdmin = async (e) => {
    e.preventDefault();
    setError(""); setCargando(true);
    try {
      await apiCall("adminLogin", { pass });
      onAdmin(pass);
    } catch (err) {
      setError(err.message || "Credenciales invalidas");
    } finally { setCargando(false); }
  };

  const entrarInversionista = async (e) => {
    e.preventDefault();
    setError(""); setCargando(true);
    if (!BACKEND_LISTO) { onInvestor("demo", {}); setCargando(false); return; }
    try {
      const res = await apiCall("investorLogin", { clave });
      onInvestor(clave, res);
    } catch (err) {
      setError(err.message || "Clave invalida");
    } finally { setCargando(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0a0a0c" }}>
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src={logoWhite} alt="YODESARROLLO.MX" className="h-8 md:h-9 w-auto mb-3.5" style={{ mixBlendMode: "screen" }} />
          <div className="text-[10px] tracking-[0.3em] uppercase" style={{ color: "#c9a96e" }}>Portal de Co-desarrolladores</div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          {!BACKEND_LISTO && (
            <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-amber-800 text-xs">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>Falta conectar el backend. Pega la URL del Apps Script en <b>APPS_SCRIPT_URL</b> dentro de App.jsx y vuelve a publicar.</span>
            </div>
          )}

          {modo === null && (
            <div>
              {/* HERO: el Codesarrollador es el protagonista */}
              <button
                onClick={() => { setModo("investor"); setError(""); }}
                className="group w-full text-left rounded-2xl shadow-lg transition p-5 hover:brightness-105"
                style={{ background: "linear-gradient(135deg, #d4be8a 0%, #c9a96e 100%)", boxShadow: "0 10px 30px -8px rgba(201,169,110,0.45)" }}
              >
                <div className="flex items-center gap-3.5">
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl shrink-0" style={{ background: "rgba(26,20,9,0.14)" }}>
                    <Wallet size={26} style={{ color: "#1a1409" }} />
                  </div>
                  <div>
                    <div className="font-display text-2xl leading-none" style={{ color: "#1a1409" }}>Soy Codesarrollador</div>
                    <div className="text-xs mt-1" style={{ color: "#5c4a24" }}>Consulta tu inversion, aportaciones y documentos</div>
                  </div>
                </div>
                <div className="mt-4 inline-flex items-center gap-2 font-semibold text-sm rounded-lg px-3.5 py-2.5 transition group-hover:gap-3" style={{ background: "rgba(26,20,9,0.12)", color: "#1a1409" }}>
                  Entrar a mi portal <ChevronRight size={16} />
                </div>
              </button>

              {/* Acceso del equipo: discreto, sin jerarquia */}
              <div className="mt-5 pt-4 border-t border-slate-100 text-center">
                <button
                  onClick={() => { setModo("admin"); setError(""); }}
                  className="text-xs text-slate-400 hover:text-slate-700 transition inline-flex items-center gap-1.5"
                >
                  <ShieldCheck size={13} /> ¿Eres del equipo? Acceso administrador
                </button>
              </div>
            </div>
          )}

          {modo === "admin" && (
            <form onSubmit={entrarAdmin} className="space-y-4">
              <button type="button" onClick={() => { setModo(null); setError(""); }} className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1">
                <ArrowLeft size={14} /> Volver
              </button>
              <h2 className="font-semibold text-slate-800 flex items-center gap-2"><ShieldCheck size={18} /> Acceso administrador</h2>
              <Field label="Contrasena de administrador">
                <div className="relative">
                  <input
                    type={verPass ? "text" : "password"}
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    autoFocus
                    className={inputCls + " pr-10"}
                    placeholder="••••••••"
                  />
                  <button type="button" onClick={() => setVerPass(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                    {verPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>
              {error && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle size={14} /> {error}</p>}
              <Btn type="submit" disabled={cargando || !pass} className="w-full">
                {cargando ? <Spinner /> : <Lock size={16} />} Entrar
              </Btn>
            </form>
          )}

          {modo === "investor" && (
            <form onSubmit={entrarInversionista} className="space-y-4">
              <button type="button" onClick={() => { setModo(null); setError(""); }} className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1">
                <ArrowLeft size={14} /> Volver
              </button>
              <h2 className="font-semibold text-slate-800 flex items-center gap-2"><Wallet size={18} className="text-amber-600" /> Acceso Codesarrollador</h2>
              <Field label="Tu clave de acceso" hint="Te la proporciona el equipo de YoDesarrollo.">
                <Input
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  autoFocus
                  placeholder="Tu clave personal"
                />
              </Field>
              {error && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle size={14} /> {error}</p>}
              {!BACKEND_LISTO && <p className="text-xs rounded-lg px-3 py-2" style={{ background: "rgba(201,169,110,0.12)", color: "#7a5e1e" }}>Vista previa: pulsa el boton para ver un ejemplo (datos de muestra).</p>}
              <Btn type="submit" variant="gold" disabled={cargando || (BACKEND_LISTO && !clave)} className="w-full">
                {cargando ? <Spinner /> : <KeyRound size={16} />} Ver mi cartera
              </Btn>
              <button type="button" onClick={() => { setModo("recuperar"); setError(""); setRecOk(false); setEmail(""); }} className="w-full text-center text-xs text-slate-400 hover:text-amber-600 transition">¿Olvidaste tu clave?</button>
            </form>
          )}

          {modo === "recuperar" && (
            <form onSubmit={recuperar} className="space-y-4">
              <button type="button" onClick={() => { setModo("investor"); setError(""); setRecOk(false); }} className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1">
                <ArrowLeft size={14} /> Volver
              </button>
              <h2 className="font-semibold text-slate-800 flex items-center gap-2"><KeyRound size={18} className="text-amber-600" /> Recuperar mi acceso</h2>
              {recOk ? (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-800 flex items-start gap-2">
                  <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                  <span>Si tu correo esta registrado, te enviamos tu acceso. Revisa tu bandeja (y la carpeta de spam).</span>
                </div>
              ) : (
                <>
                  <Field label="Tu correo registrado" hint="Te enviaremos tu clave de acceso a ese correo.">
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus placeholder="correo@ejemplo.com" />
                  </Field>
                  {error && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle size={14} /> {error}</p>}
                  <Btn type="submit" variant="gold" disabled={cargando || !email} className="w-full">
                    {cargando ? <Spinner /> : <KeyRound size={16} />} Enviarme mi acceso
                  </Btn>
                </>
              )}
            </form>
          )}
        </div>
        <p className="text-center text-[11px] text-slate-500 mt-4">
          Portal interno de control financiero. Tus datos viven solo en una hoja privada de Google.
        </p>
      </div>
    </div>
  );
}

// ===================================================================
// KPI CARD
// ===================================================================
function KpiCard({ icon: Icon, label, value, sub, tone = "slate", alert = false }) {
  const tones = {
    slate: "from-slate-50 to-white border-slate-200 text-slate-700",
    green: "from-emerald-50 to-white border-emerald-200 text-emerald-700",
    amber: "from-amber-50 to-white border-amber-200 text-amber-700",
    blue: "from-blue-50 to-white border-blue-200 text-blue-700",
    red: "from-red-50 to-white border-red-200 text-red-700",
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-4 ${tones[tone]} ${alert ? "ring-2 ring-red-300" : ""}`}>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-white/70 flex items-center justify-center">
          <Icon size={17} />
        </div>
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <div className="mt-2 text-xl sm:text-2xl font-semibold text-slate-900 tabular-nums">{value}</div>
      {sub ? <div className="text-xs text-slate-500 mt-0.5">{sub}</div> : null}
    </div>
  );
}

// ===================================================================
// CALCULADORA DE RENDIMIENTO
// ===================================================================
const REFERENCIAS = [
  { meses: 6, dias: 182 },
  { meses: 12, dias: 365 },
  { meses: 18, dias: 547 },
  { meses: 24, dias: 730 },
];

function Calculadora({ capitalInicial = 1000000, fechaInicio = todayISO(), tasaInicial = TASA_DEFAULT }) {
  const [capital, setCapital] = useState(capitalInicial);
  const [tasa, setTasa] = useState(tasaInicial);
  const [modo, setModo] = useState("meses"); // "meses" | "fecha"
  const [meses, setMeses] = useState(12);
  const [inicio, setInicio] = useState(toDateInput(fechaInicio));
  const [salida, setSalida] = useState("");

  useEffect(() => { setCapital(capitalInicial); }, [capitalInicial]);
  useEffect(() => { setInicio(toDateInput(fechaInicio) || todayISO()); }, [fechaInicio]);
  useEffect(() => { setTasa(tasaInicial); }, [tasaInicial]);

  // Calculo: por dias siempre es la fuente de verdad
  const resultado = useMemo(() => {
    if (modo === "fecha" && salida) {
      return calcularRendimiento(capital, inicio, salida, tasa);
    }
    // Por meses: convertimos meses a dias con 365/12 = 30.4167
    const dias = Math.round(Number(meses) * (365 / 12));
    const tasaN = Number(tasa) || TASA_DEFAULT;
    const rendimientoPct = dias * (tasaN / 365);
    const cap = Number(capital) || 0;
    const totalARecibir = cap * (1 + rendimientoPct / 100);
    return { dias, rendimientoPct, totalARecibir, ganancia: totalARecibir - cap, tasa: tasaN };
  }, [modo, salida, inicio, meses, capital, tasa]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Capital invertido">
          <Input type="number" value={capital} onChange={(e) => setCapital(e.target.value)} min={0} />
        </Field>
        <Field label="Tasa anual (%)" hint="Preferente, por defecto 25%.">
          <Input type="number" value={tasa} onChange={(e) => setTasa(e.target.value)} min={0} step="0.1" />
        </Field>
        <Field label="Simular por">
          <Select value={modo} onChange={(e) => setModo(e.target.value)}>
            <option value="meses">Numero de meses</option>
            <option value="fecha">Fecha de salida</option>
          </Select>
        </Field>
      </div>

      {modo === "meses" ? (
        <Field label={`Meses transcurridos: ${meses}`}>
          <input
            type="range" min={1} max={24} value={meses}
            onChange={(e) => setMeses(Number(e.target.value))}
            className="w-full accent-amber-500"
          />
          <div className="flex justify-between text-[11px] text-slate-400 mt-1">
            <span>1 mes</span><span>12 meses</span><span>24 meses</span>
          </div>
        </Field>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Fecha de inicio">
            <Input type="date" value={toDateInput(inicio)} onChange={(e) => setInicio(e.target.value)} />
          </Field>
          <Field label="Fecha de salida (venta)">
            <Input type="date" value={toDateInput(salida)} onChange={(e) => setSalida(e.target.value)} />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] text-slate-500">Dias</div>
          <div className="text-lg font-semibold text-slate-800 tabular-nums">{resultado.dias}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] text-slate-500">Rendimiento</div>
          <div className="text-lg font-semibold text-amber-600 tabular-nums">{pct(resultado.rendimientoPct)}</div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-[11px] text-emerald-600">Total a recibir</div>
          <div className="text-lg font-semibold text-emerald-700 tabular-nums">{money(resultado.totalARecibir)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[11px] text-slate-500">Ganancia</div>
          <div className="text-lg font-semibold text-slate-800 tabular-nums">{money(resultado.ganancia)}</div>
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-slate-500 mb-1.5">Tabla de referencia (con el capital y tasa actuales)</div>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Plazo</th>
                <th className="text-right px-3 py-2 font-medium">Dias</th>
                <th className="text-right px-3 py-2 font-medium">Rendimiento</th>
                <th className="text-right px-3 py-2 font-medium">Total a recibir</th>
              </tr>
            </thead>
            <tbody>
              {REFERENCIAS.map((r) => {
                const tasaN = Number(tasa) || TASA_DEFAULT;
                const rp = r.dias * (tasaN / 365);
                const total = (Number(capital) || 0) * (1 + rp / 100);
                return (
                  <tr key={r.meses} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-700">{r.meses} meses</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.dias}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-600">{pct(rp)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800">{money(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5">
          El calculo oficial siempre es por dias (tasa/365). Las pequenas diferencias contra los porcentajes redondeados del contrato son por el prorrateo diario real.
        </p>
      </div>
    </div>
  );
}

// ===================================================================
// FORMULARIOS POR PESTANA
// ===================================================================
function InversionistaForm({ value, onChange }) {
  const [verClave, setVerClave] = useState(false);
  const set = (k, v) => onChange({ ...value, [k]: v });
  const generarClave = () => {
    // 14 caracteres de un alfabeto de 31 (sin ambiguos) para dar mayor entropia
    // y dificultar la fuerza bruta sobre la unica barrera del inversionista.
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 14; i++) s += chars[Math.floor(Math.random() * chars.length)];
    set("claveAcceso", s);
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Nombre completo">
          <Input value={value.nombre || ""} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej. Hugo Meave" />
        </Field>
        <Field label="Telefono">
          <Input value={value.telefono || ""} onChange={(e) => set("telefono", e.target.value)} placeholder="(opcional)" />
        </Field>
      </div>
      <Field label="Correo electronico">
        <Input type="email" value={value.email || ""} onChange={(e) => set("email", e.target.value)} placeholder="(opcional)" />
      </Field>
      <Field label="Clave de acceso del Codesarrollador" hint="Con esta clave el Codesarrollador entra a ver SU cartera. Solo tu (admin) la ves aqui.">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={verClave ? "text" : "password"}
              value={value.claveAcceso || ""}
              onChange={(e) => set("claveAcceso", e.target.value)}
              className={inputCls + " pr-10"}
              placeholder="Genera o escribe una clave"
            />
            <button type="button" onClick={() => setVerClave(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
              {verClave ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <Btn type="button" variant="outline" onClick={generarClave}><KeyRound size={15} /> Generar</Btn>
        </div>
      </Field>
      <Field label="Notas internas">
        <Textarea rows={2} value={value.notas || ""} onChange={(e) => set("notas", e.target.value)} placeholder="(opcional, solo visible para el equipo)" />
      </Field>
    </div>
  );
}

const EJEMPLO_PROYECTO = {
  nombre: "Casa Alysa",
  banco: "BBVA",
  beneficiario: "YODESARROLLO SAPI DE CV",
  cuenta: "011628459",
  clabe: "012760001186284598",
  conceptoBase: "Aportacion Casa Alysa - <Codesarrollador> - <Folio>",
  descripcion: "Coinversion inmobiliaria.",
  estado: "Abierto",
};

function ProyectoForm({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Nombre del proyecto">
          <Input value={value.nombre || ""} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej. Casa Alysa" />
        </Field>
        <Field label="Estado">
          <Select value={value.estado || "Abierto"} onChange={(e) => set("estado", e.target.value)}>
            <option>Abierto</option>
            <option>Cerrado</option>
          </Select>
        </Field>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-slate-700 flex items-center gap-2"><Banknote size={16} /> Cuenta de deposito</div>
          <Btn type="button" variant="ghost" className="text-xs" onClick={() => onChange({ ...value, ...EJEMPLO_PROYECTO, nombre: value.nombre || EJEMPLO_PROYECTO.nombre })}>
            <Sparkles size={13} /> Precargar ejemplo Casa Alysa
          </Btn>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Banco">
            <Input value={value.banco || ""} onChange={(e) => set("banco", e.target.value)} placeholder="BBVA" />
          </Field>
          <Field label="Beneficiario">
            <Input value={value.beneficiario || ""} onChange={(e) => set("beneficiario", e.target.value)} placeholder="YODESARROLLO SAPI DE CV" />
          </Field>
          <Field label="Numero de cuenta">
            <Input value={value.cuenta || ""} onChange={(e) => set("cuenta", e.target.value)} placeholder="011628459" />
          </Field>
          <Field label="CLABE">
            <Input value={value.clabe || ""} onChange={(e) => set("clabe", e.target.value)} placeholder="012760001186284598" />
          </Field>
        </div>
        <Field label="Concepto base sugerido" hint="Lo que el Codesarrollador pone al transferir.">
          <Input value={value.conceptoBase || ""} onChange={(e) => set("conceptoBase", e.target.value)} placeholder="Aportacion Casa Alysa - <Inversionista> - <Folio>" />
        </Field>
      </div>

      <Field label="Descripcion">
        <Textarea rows={2} value={value.descripcion || ""} onChange={(e) => set("descripcion", e.target.value)} />
      </Field>
    </div>
  );
}

function InversionForm({ value, onChange, inversionistas, proyectos, esNuevo = true }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Folio" hint={esNuevo ? "Llave unica legible, ej. CA-HM-2026-01." : "El folio es la llave; no se puede cambiar al editar."}>
          <Input
            value={value.folio || ""}
            onChange={(e) => set("folio", e.target.value)}
            placeholder="CA-HM-2026-01"
            readOnly={!esNuevo}
            className={!esNuevo ? "bg-slate-100 text-slate-500 cursor-not-allowed" : ""}
          />
        </Field>
        <Field label="Estado">
          <Select value={value.estado || "Activa"} onChange={(e) => set("estado", e.target.value)}>
            <option>Activa</option>
            <option>Liquidada</option>
            <option>Cancelada</option>
          </Select>
        </Field>
        <Field label="Codesarrollador">
          <Select value={value.inversionistaId || ""} onChange={(e) => set("inversionistaId", e.target.value)}>
            <option value="">— Selecciona —</option>
            {arr(inversionistas).map((i) => <option key={i.id} value={i.id}>{i.nombre || i.id}</option>)}
          </Select>
        </Field>
        <Field label="Proyecto">
          <Select value={value.proyectoId || ""} onChange={(e) => set("proyectoId", e.target.value)}>
            <option value="">— Selecciona —</option>
            {arr(proyectos).map((p) => <option key={p.id} value={p.id}>{p.nombre || p.id}</option>)}
          </Select>
        </Field>
        <Field label="Monto total comprometido">
          <Input type="number" value={value.montoTotal || ""} onChange={(e) => set("montoTotal", e.target.value)} placeholder="1000000" />
        </Field>
        <Field label="Tasa anual (%)">
          <Input type="number" value={value.tasaAnual ?? TASA_DEFAULT} onChange={(e) => set("tasaAnual", e.target.value)} step="0.1" />
        </Field>
        <Field label="Fecha de inicio" hint="Arranca el conteo de dias del rendimiento.">
          <Input type="date" value={toDateInput(value.fechaInicio)} onChange={(e) => set("fechaInicio", e.target.value)} />
        </Field>
        <Field label="Fecha de salida" hint="Solo al liquidar (fecha real de venta).">
          <Input type="date" value={toDateInput(value.fechaSalida)} onChange={(e) => set("fechaSalida", e.target.value)} />
        </Field>
      </div>
      <Field label="Notas">
        <Textarea rows={2} value={value.notas || ""} onChange={(e) => set("notas", e.target.value)} />
      </Field>
    </div>
  );
}

function DocumentoForm({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Tipo">
          <Select value={value.tipo || "Contrato"} onChange={(e) => set("tipo", e.target.value)}>
            <option>Contrato</option>
            <option>Pagare</option>
            <option>Comprobante</option>
            <option>Identificacion</option>
            <option>Otro</option>
          </Select>
        </Field>
        <Field label="Fecha">
          <Input type="date" value={toDateInput(value.fecha) || todayISO()} onChange={(e) => set("fecha", e.target.value)} />
        </Field>
      </div>
      <Field label="Nombre del documento">
        <Input value={value.nombre || ""} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej. Contrato Casa Alysa firmado" />
      </Field>
      <Field label="Enlace (Drive u otro)" hint="Pega el link para compartir del archivo.">
        <Input value={value.url || ""} onChange={(e) => set("url", e.target.value)} placeholder="https://drive.google.com/..." />
      </Field>
    </div>
  );
}

function AportacionForm({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Pago #">
          <Input type="number" value={value.numeroPago || ""} onChange={(e) => set("numeroPago", e.target.value)} min={1} />
        </Field>
        <Field label="De (total)">
          <Input type="number" value={value.totalPagos || ""} onChange={(e) => set("totalPagos", e.target.value)} min={1} />
        </Field>
        <Field label="Monto">
          <Input type="number" value={value.monto || ""} onChange={(e) => set("monto", e.target.value)} />
        </Field>
        <Field label="Fecha programada">
          <Input type="date" value={toDateInput(value.fechaProgramada)} onChange={(e) => set("fechaProgramada", e.target.value)} />
        </Field>
      </div>
      <Field label="Concepto">
        <Input value={value.concepto || ""} onChange={(e) => set("concepto", e.target.value)} placeholder="Ej. Aportacion inicial" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Fecha recibida" hint="Vacio = aun no llega.">
          <Input type="date" value={toDateInput(value.fechaRecibida)} onChange={(e) => set("fechaRecibida", e.target.value)} />
        </Field>
        <Field label="Comprobante (URL)">
          <Input value={value.comprobanteUrl || ""} onChange={(e) => set("comprobanteUrl", e.target.value)} placeholder="https://..." />
        </Field>
      </div>
    </div>
  );
}

// ===================================================================
// VISTA ADMIN
// ===================================================================
// ===================================================================
// ASISTENTE: NUEVO CODESARROLLADOR (crea inversionista + inversion +
// aportaciones + clave, todo de un jalon)
// ===================================================================
function WizardAlta({ proyectos, onCrear, onClose }) {
  const [d, setD] = useState({ nombre: "", email: "", telefono: "", proyectoId: "", folio: "", montoTotal: "", fechaInicio: todayISO(), numPagos: 4, primerPago: "", tasaAnual: 25 });
  const [nuevoProy, setNuevoProy] = useState({ nombre: "", banco: "", beneficiario: "YODESARROLLO SAPI DE CV", cuenta: "", clabe: "", conceptoBase: "" });
  const [usarNuevoProy, setUsarNuevoProy] = useState(arr(proyectos).length === 0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);
  const set = (k, v) => setD(p => ({ ...p, [k]: v }));
  const setNP = (k, v) => setNuevoProy(p => ({ ...p, [k]: v }));
  const nPagos = Math.max(1, parseInt(d.numPagos, 10) || 1);

  const crear = async () => {
    setError("");
    if (!d.nombre.trim() || !d.email.trim()) { setError("Pon al menos el nombre y el correo del Codesarrollador."); return; }
    if (!d.folio.trim()) { setError("Escribe el folio (ej. CA-HM-2026-01)."); return; }
    if (usarNuevoProy && !nuevoProy.nombre.trim()) { setError("Ponle nombre al proyecto nuevo."); return; }
    if (!usarNuevoProy && !d.proyectoId) { setError("Elige un proyecto (o crea uno nuevo)."); return; }
    if (num(d.montoTotal) <= 0) { setError("Pon el monto total de la inversion."); return; }
    setCargando(true);
    try {
      const r = await onCrear({ ...d, numPagos: nPagos, nuevoProyecto: usarNuevoProy ? nuevoProy : null, proyectoId: usarNuevoProy ? "" : d.proyectoId });
      setResultado(r);
    } catch (e) {
      setError(e?.message || "No se pudo crear. Revisa los datos e intenta de nuevo.");
    } finally { setCargando(false); }
  };

  return (
    <Modal open onClose={onClose} title="Nuevo Codesarrollador" width="max-w-2xl">
      {resultado ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-800 flex items-start gap-2">
            <BadgeCheck size={20} className="shrink-0 mt-0.5" />
            <span>¡Listo! Se creo <b>{d.nombre}</b> con su inversion (<b>{d.folio}</b>) y <b>{nPagos} aportaciones</b>.</span>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="text-xs text-slate-500 mb-1">Clave de acceso del Codesarrollador (compartesela):</div>
            <div className="text-xl font-mono font-bold tracking-wide text-slate-800 select-all">{resultado.clave}</div>
            <div className="text-xs text-slate-400 mt-2">Tambien podra recuperarla solo, por correo, con "¿Olvidaste tu clave?".</div>
          </div>
          <div className="flex justify-end"><Btn onClick={onClose}>Cerrar</Btn></div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid md:grid-cols-3 gap-3">
            <Field label="Nombre"><Input value={d.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Hugo Meave" /></Field>
            <Field label="Correo (para su acceso)"><Input type="email" value={d.email} onChange={e => set("email", e.target.value)} placeholder="correo@ejemplo.com" /></Field>
            <Field label="Telefono (opcional)"><Input value={d.telefono} onChange={e => set("telefono", e.target.value)} /></Field>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-700">Proyecto</div>
              <label className="text-xs flex items-center gap-1.5 text-slate-500"><input type="checkbox" checked={usarNuevoProy} onChange={e => setUsarNuevoProy(e.target.checked)} /> Crear proyecto nuevo</label>
            </div>
            {usarNuevoProy ? (
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Nombre del proyecto"><Input value={nuevoProy.nombre} onChange={e => setNP("nombre", e.target.value)} placeholder="Casa Alysa" /></Field>
                <Field label="Banco"><Input value={nuevoProy.banco} onChange={e => setNP("banco", e.target.value)} placeholder="BBVA" /></Field>
                <Field label="Beneficiario"><Input value={nuevoProy.beneficiario} onChange={e => setNP("beneficiario", e.target.value)} /></Field>
                <Field label="Cuenta"><Input value={nuevoProy.cuenta} onChange={e => setNP("cuenta", e.target.value)} /></Field>
                <Field label="CLABE"><Input value={nuevoProy.clabe} onChange={e => setNP("clabe", e.target.value)} /></Field>
                <Field label="Concepto base"><Input value={nuevoProy.conceptoBase} onChange={e => setNP("conceptoBase", e.target.value)} placeholder="Aportacion <proyecto> - <Codesarrollador> - <Folio>" /></Field>
              </div>
            ) : (
              <Field label="Elige proyecto"><Select value={d.proyectoId} onChange={e => set("proyectoId", e.target.value)}><option value="">— Elige —</option>{arr(proyectos).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</Select></Field>
            )}
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <Field label="Folio" hint="Ej. CA-HM-2026-01"><Input value={d.folio} onChange={e => set("folio", e.target.value)} placeholder="CA-HM-2026-01" /></Field>
            <Field label="Monto total (MXN)"><Input type="number" value={d.montoTotal} onChange={e => set("montoTotal", e.target.value)} placeholder="1000000" /></Field>
            <Field label="Tasa anual (%)"><Input type="number" value={d.tasaAnual} onChange={e => set("tasaAnual", e.target.value)} /></Field>
            <Field label="Fecha de inicio"><Input type="date" value={d.fechaInicio} onChange={e => set("fechaInicio", e.target.value)} /></Field>
            <Field label="Numero de pagos"><Input type="number" value={d.numPagos} onChange={e => set("numPagos", e.target.value)} /></Field>
            <Field label="Primer pago (opcional)" hint="Si el 1er pago es distinto"><Input type="number" value={d.primerPago} onChange={e => set("primerPago", e.target.value)} placeholder="ej. 350000" /></Field>
          </div>

          <div className="text-xs text-slate-500">Se generaran <b>{nPagos} aportaciones</b> mensuales desde la fecha de inicio, y una <b>clave de acceso</b> para el Codesarrollador.</div>

          {error && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle size={14} /> {error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="text-sm text-slate-500 px-3">Cancelar</button>
            <Btn onClick={crear} disabled={cargando}>{cargando ? <Spinner /> : <Plus size={15} />} Crear Codesarrollador</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}

function AdminApp({ pass, onLogout }) {
  const [data, setData] = useState(() => {
    try {
      const c = localStorage.getItem(CACHE_KEY);
      return c ? JSON.parse(c) : { Inversionistas: [], Proyectos: [], Inversiones: [], Aportaciones: [], Documentos: [] };
    } catch (e) {
      return { Inversionistas: [], Proyectos: [], Inversiones: [], Aportaciones: [], Documentos: [] };
    }
  });
  const [vista, setVista] = useState("dashboard"); // dashboard | inversionistas | proyectos | inversiones | calculadora
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [inversionAbierta, setInversionAbierta] = useState(null); // folio
  const [modal, setModal] = useState(null); // { tab, row } para crear/editar
  const [confirm, setConfirm] = useState(null); // { tab, key, msg }
  const [wizard, setWizard] = useState(false); // asistente "Nuevo Codesarrollador"
  const toastTimer = useRef(null);

  const notificar = useCallback((msg, tipo = "info") => {
    setToast({ msg, tipo });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // Si una llamada admin falla por credenciales invalidas (ej. se cambio
  // ADMIN_PASS en ScriptProperties), cerramos la sesion para que el LoginGate
  // vuelva a pedir la contrasena en vez de dejar al usuario atorado.
  const manejarError = useCallback((err) => {
    const msg = err?.message || "Ocurrio un error.";
    if (esErrorCredenciales(msg)) {
      notificar("Tu sesion ya no es valida. Vuelve a iniciar sesion.", "error");
      setTimeout(() => onLogout(), 1200);
    }
    return msg;
  }, [notificar, onLogout]);

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    setError("");
    try {
      const res = await apiCall("getAll", { pass });
      const limpia = {
        Inversionistas: arr(res.data?.Inversionistas),
        Proyectos: arr(res.data?.Proyectos),
        Inversiones: arr(res.data?.Inversiones),
        Aportaciones: arr(res.data?.Aportaciones),
        Documentos: arr(res.data?.Documentos),
      };
      setData(limpia);
      // No persistimos claveAcceso ni notas en el cache local (datos sensibles).
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(sanitizarParaCache(limpia))); } catch (e) { /* noop */ }
    } catch (err) {
      setError(manejarError(err));
    } finally {
      setCargando(false);
    }
  }, [pass, manejarError]);

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  // ----- helpers de resolucion -----
  const inversionistaPorId = useCallback((id) => arr(data.Inversionistas).find(i => String(i.id) === String(id)), [data]);
  const proyectoPorId = useCallback((id) => arr(data.Proyectos).find(p => String(p.id) === String(id)), [data]);
  const aportacionesDeFolio = useCallback((folio) =>
    arr(data.Aportaciones).filter(a => String(a.folio) === String(folio))
      .sort((a, b) => num(a.numeroPago) - num(b.numeroPago)), [data]);
  const documentosDeFolio = useCallback((folio) =>
    arr(data.Documentos).filter(d => String(d.folio) === String(folio)), [data]);
  const capitalRecibido = useCallback((folio) =>
    aportacionesDeFolio(folio).filter(a => estadoAportacion(a) === "Recibida").reduce((s, a) => s + num(a.monto), 0),
    [aportacionesDeFolio]);

  // ----- guardar (save) con UI optimista -----
  const guardarFila = useCallback(async (tab, row) => {
    setGuardando(true);
    setError("");
    try {
      const res = await apiCall("save", { pass, tab, row });
      const key = res.key;
      // refresca esa fila en memoria
      setData(prev => {
        const keyField = tab === "Inversiones" ? "folio" : "id";
        const filaFinal = { ...row, [keyField]: key };
        const lista = arr(prev[tab]);
        const idx = lista.findIndex(r => String(r[keyField]) === String(key));
        const nueva = idx >= 0
          ? lista.map((r, i) => i === idx ? { ...r, ...filaFinal } : r)
          : [...lista, filaFinal];
        const out = { ...prev, [tab]: nueva };
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(sanitizarParaCache(out))); } catch (e) { /* noop */ }
        return out;
      });
      notificar(res.updated ? "Cambios guardados." : "Registro creado.", "ok");
      return key;
    } catch (err) {
      const msg = manejarError(err);
      setError(msg);
      notificar(msg, "error");
      throw err;
    } finally {
      setGuardando(false);
    }
  }, [pass, notificar, manejarError]);

  // ----- asistente: alta completa de un Codesarrollador -----
  const altaCodesarrollador = useCallback(async (d) => {
    // 1) Inversionista (con clave generada).
    const clave = generarClaveAcceso();
    const invId = await guardarFila("Inversionistas", { nombre: d.nombre.trim(), email: d.email.trim(), telefono: d.telefono || "", claveAcceso: clave, notas: "" });
    // 2) Proyecto (nuevo o existente).
    let proyectoId = d.proyectoId;
    if (!proyectoId && d.nuevoProyecto) {
      proyectoId = await guardarFila("Proyectos", { ...d.nuevoProyecto, estado: "Abierto" });
    }
    // 3) Inversion.
    await guardarFila("Inversiones", { folio: d.folio.trim(), inversionistaId: invId, proyectoId: proyectoId, montoTotal: num(d.montoTotal), fechaInicio: d.fechaInicio, fechaSalida: "", tasaAnual: num(d.tasaAnual) || 25, estado: "Activa", notas: "" });
    // 4) Aportaciones (reparto del monto + fechas mensuales).
    const n = Math.max(1, parseInt(d.numPagos, 10) || 1);
    const total = num(d.montoTotal);
    const primero = num(d.primerPago);
    const montos = [];
    if (primero > 0 && n > 1) {
      const cada = Math.round((total - primero) / (n - 1));
      for (let i = 0; i < n; i++) {
        if (i === 0) montos.push(primero);
        else if (i === n - 1) montos.push(total - primero - cada * (n - 2));
        else montos.push(cada);
      }
    } else {
      const cada = Math.round(total / n);
      for (let i = 0; i < n; i++) montos.push(i === n - 1 ? total - cada * (n - 1) : cada);
    }
    for (let i = 0; i < n; i++) {
      const concepto = i === 0 ? "Aportacion inicial" : (i === n - 1 ? "Aportacion final" : `Aportacion ${i + 1} de ${n}`);
      await guardarFila("Aportaciones", { folio: d.folio.trim(), numeroPago: i + 1, totalPagos: n, concepto, fechaProgramada: sumarMeses(d.fechaInicio, i), monto: montos[i], fechaRecibida: "", comprobanteUrl: "", referencia: "", fechaReporte: "" });
    }
    return { clave, folio: d.folio.trim() };
  }, [guardarFila]);

  // ----- eliminar (delete) -----
  const eliminarFila = useCallback(async (tab, key) => {
    setGuardando(true);
    try {
      await apiCall("delete", { pass, tab, key });
      setData(prev => {
        const keyField = tab === "Inversiones" ? "folio" : "id";
        const out = { ...prev, [tab]: arr(prev[tab]).filter(r => String(r[keyField]) !== String(key)) };
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(sanitizarParaCache(out))); } catch (e) { /* noop */ }
        return out;
      });
      notificar("Eliminado.", "ok");
    } catch (err) {
      notificar(manejarError(err), "error");
    } finally {
      setGuardando(false);
      setConfirm(null);
    }
  }, [pass, notificar, manejarError]);

  // ----- KPIs -----
  const kpis = useMemo(() => {
    const inversionesActivas = arr(data.Inversiones).filter(i => (i.estado || "Activa") === "Activa");
    const totalComprometido = inversionesActivas.reduce((s, i) => s + num(i.montoTotal), 0);
    const recibidas = arr(data.Aportaciones).filter(a => estadoAportacion(a) === "Recibida");
    const totalRecibido = recibidas.reduce((s, a) => s + num(a.monto), 0);
    const totalProgramado = arr(data.Aportaciones).reduce((s, a) => s + num(a.monto), 0);
    const vencidas = arr(data.Aportaciones).filter(a => estadoAportacion(a) === "Vencida");
    const proyectosAbiertos = arr(data.Proyectos).filter(p => (p.estado || "Abierto") === "Abierto");
    return {
      totalComprometido,
      totalRecibido,
      porRecibir: Math.max(0, totalProgramado - totalRecibido),
      numInversionistas: arr(data.Inversionistas).length,
      numProyectos: proyectosAbiertos.length,
      vencidas,
      recibidasCount: recibidas.length,
      pendientesCount: arr(data.Aportaciones).filter(a => estadoAportacion(a) === "Pendiente").length,
    };
  }, [data]);

  // proximas aportaciones por vencer (pendientes ordenadas por fecha)
  const proximas = useMemo(() => {
    return arr(data.Aportaciones)
      .filter(a => estadoAportacion(a) === "Pendiente")
      .sort((a, b) => (parseDate(a.fechaProgramada)?.getTime() || Infinity) - (parseDate(b.fechaProgramada)?.getTime() || Infinity))
      .slice(0, 6);
  }, [data]);

  const NAV = [
    { id: "dashboard", label: "Resumen", icon: LayoutDashboard },
    { id: "inversionistas", label: "Codesarrolladores", icon: Users },
    { id: "proyectos", label: "Proyectos", icon: Building2 },
    { id: "inversiones", label: "Inversiones", icon: Wallet },
    { id: "calculadora", label: "Calculadora", icon: Calculator },
  ];

  // Abrir modal de creacion con valores por defecto
  const nuevoRegistro = (tab, base = {}) => {
    const bases = {
      Inversionistas: { nombre: "", telefono: "", email: "", claveAcceso: "", notas: "" },
      Proyectos: { nombre: "", banco: "", beneficiario: "", cuenta: "", clabe: "", conceptoBase: "", descripcion: "", estado: "Abierto" },
      Inversiones: { folio: "", inversionistaId: "", proyectoId: "", montoTotal: "", fechaInicio: todayISO(), fechaSalida: "", tasaAnual: TASA_DEFAULT, estado: "Activa", notas: "" },
      Aportaciones: { folio: "", numeroPago: "", totalPagos: "", concepto: "", fechaProgramada: "", monto: "", fechaRecibida: "", comprobanteUrl: "" },
      Documentos: { folio: "", tipo: "Contrato", nombre: "", url: "", fecha: todayISO() },
    };
    setModal({ tab, row: { ...bases[tab], ...base }, esNuevo: true });
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <Toast toast={toast} />

      {/* Header */}
      <header className="bg-slate-900 text-white sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center shrink-0">
            <CircleDollarSign size={20} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold leading-tight truncate">Co-desarrolladores</div>
            <div className="text-[11px] text-slate-400 leading-tight">Panel de administracion</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setWizard(true)}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: "#c9a96e", color: "#1a1409" }}
            >
              <Plus size={14} /> <span className="hidden sm:inline">Nuevo Codesarrollador</span><span className="sm:hidden">Nuevo</span>
            </button>
            <button
              onClick={() => cargar()}
              disabled={cargando}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
            >
              <RefreshCw size={14} className={cargando ? "animate-spin" : ""} /> <span className="hidden sm:inline">Sincronizar</span>
            </button>
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700"
            >
              <LogOut size={14} /> <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </div>
        {/* Nav */}
        <div className="border-t border-slate-800">
          <div className="max-w-7xl mx-auto px-2 flex gap-1 overflow-x-auto">
            {NAV.map((n) => {
              const Icon = n.icon;
              const activo = vista === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => { setVista(n.id); setInversionAbierta(null); }}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap border-b-2 transition ${
                    activo ? "border-amber-500 text-white" : "border-transparent text-slate-400 hover:text-white"
                  }`}
                >
                  <Icon size={16} /> {n.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {!BACKEND_LISTO && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800 text-sm">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <span>Falta conectar el backend. Pega la URL del Apps Script en <b>APPS_SCRIPT_URL</b> (dentro de App.jsx) y vuelve a publicar para guardar datos reales.</span>
          </div>
        )}
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
            <AlertCircle size={18} className="shrink-0 mt-0.5" /> <span>{error}</span>
          </div>
        )}

        {/* ---------- DASHBOARD ---------- */}
        {vista === "dashboard" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              <KpiCard icon={TrendingUp} label="Capital comprometido (activo)" value={money(kpis.totalComprometido)} tone="slate" />
              <KpiCard icon={CheckCircle2} label="Capital recibido" value={money(kpis.totalRecibido)} sub={`${kpis.recibidasCount} aportaciones`} tone="green" />
              <KpiCard icon={Clock} label="Por recibir" value={money(kpis.porRecibir)} sub={`${kpis.pendientesCount} pendientes`} tone="amber" />
              <KpiCard icon={Users} label="Codesarrolladores" value={kpis.numInversionistas} tone="blue" />
              <KpiCard icon={Building2} label="Proyectos abiertos" value={kpis.numProyectos} tone="slate" />
              <KpiCard icon={AlertTriangle} label="Aportaciones vencidas" value={kpis.vencidas.length} tone="red" alert={kpis.vencidas.length > 0} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Proximas a vencer */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-3"><CalendarClock size={18} /> Proximas aportaciones</h3>
                {proximas.length === 0 ? (
                  <p className="text-sm text-slate-400">No hay aportaciones pendientes.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {proximas.map((a) => {
                      const inv = arr(data.Inversiones).find(i => String(i.folio) === String(a.folio));
                      const nom = inv ? (inversionistaPorId(inv.inversionistaId)?.nombre || a.folio) : a.folio;
                      return (
                        <li key={a.id} className="py-2.5 flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-slate-700 truncate">{nom}</div>
                            <div className="text-xs text-slate-400">{a.concepto || `Pago ${a.numeroPago}`} · {fmtFecha(a.fechaProgramada)}</div>
                          </div>
                          <div className="text-sm font-semibold text-slate-700 tabular-nums">{money(a.monto)}</div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Vencidas */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-3"><AlertTriangle size={18} className="text-red-500" /> Aportaciones vencidas</h3>
                {kpis.vencidas.length === 0 ? (
                  <p className="text-sm text-slate-400">Sin aportaciones vencidas. Todo al dia.</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {kpis.vencidas.map((a) => {
                      const inv = arr(data.Inversiones).find(i => String(i.folio) === String(a.folio));
                      const nom = inv ? (inversionistaPorId(inv.inversionistaId)?.nombre || a.folio) : a.folio;
                      return (
                        <li key={a.id} className="py-2.5 flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-slate-700 truncate">{nom}</div>
                            <div className="text-xs text-red-500">{a.concepto || `Pago ${a.numeroPago}`} · vencio {fmtFecha(a.fechaProgramada)}</div>
                          </div>
                          <div className="text-sm font-semibold text-red-600 tabular-nums">{money(a.monto)}</div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ---------- INVERSIONISTAS ---------- */}
        {vista === "inversionistas" && (
          <ListaInversionistas
            data={data}
            onNuevo={() => nuevoRegistro("Inversionistas")}
            onEditar={(row) => setModal({ tab: "Inversionistas", row: { ...row }, esNuevo: false })}
            onEliminar={(row) => setConfirm({ tab: "Inversionistas", key: row.id, msg: `Se eliminara a "${row.nombre}". Sus inversiones quedaran sin titular.` })}
          />
        )}

        {/* ---------- PROYECTOS ---------- */}
        {vista === "proyectos" && (
          <ListaProyectos
            data={data}
            onNuevo={() => nuevoRegistro("Proyectos")}
            onEditar={(row) => setModal({ tab: "Proyectos", row: { ...row }, esNuevo: false })}
            onEliminar={(row) => setConfirm({ tab: "Proyectos", key: row.id, msg: `Se eliminara el proyecto "${row.nombre}".` })}
          />
        )}

        {/* ---------- INVERSIONES ---------- */}
        {vista === "inversiones" && !inversionAbierta && (
          <ListaInversiones
            data={data}
            inversionistaPorId={inversionistaPorId}
            proyectoPorId={proyectoPorId}
            capitalRecibido={capitalRecibido}
            onNuevo={() => nuevoRegistro("Inversiones")}
            onEditar={(row) => setModal({ tab: "Inversiones", row: { ...row }, esNuevo: false })}
            onEliminar={(row) => setConfirm({ tab: "Inversiones", key: row.folio, msg: `Se eliminara la inversion ${row.folio}. (Sus aportaciones/documentos no se borran solos.)` })}
            onAbrir={(folio) => setInversionAbierta(folio)}
          />
        )}

        {vista === "inversiones" && inversionAbierta && (
          <DetalleInversion
            folio={inversionAbierta}
            data={data}
            inversionistaPorId={inversionistaPorId}
            proyectoPorId={proyectoPorId}
            aportacionesDeFolio={aportacionesDeFolio}
            documentosDeFolio={documentosDeFolio}
            capitalRecibido={capitalRecibido}
            onVolver={() => setInversionAbierta(null)}
            onEditarInversion={(row) => setModal({ tab: "Inversiones", row: { ...row }, esNuevo: false })}
            onNuevaAportacion={(folio) => nuevoRegistro("Aportaciones", { folio })}
            onEditarAportacion={(row) => setModal({ tab: "Aportaciones", row: { ...row }, esNuevo: false })}
            onEliminarAportacion={(row) => setConfirm({ tab: "Aportaciones", key: row.id, msg: `Se eliminara el pago "${row.concepto || row.numeroPago}".` })}
            onMarcarRecibida={(row) => guardarFila("Aportaciones", { ...row, fechaRecibida: todayISO() })}
            onGuardarComprobante={(row, url) => guardarFila("Aportaciones", { ...row, comprobanteUrl: url })}
            onGenerarPlanCasaAlysa={(folio) => generarPlanCasaAlysa(folio)}
            onNuevoDocumento={(folio) => nuevoRegistro("Documentos", { folio })}
            onEliminarDocumento={(row) => setConfirm({ tab: "Documentos", key: row.id, msg: `Se eliminara el documento "${row.nombre || row.tipo}".` })}
          />
        )}

        {/* ---------- CALCULADORA ---------- */}
        {vista === "calculadora" && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2 mb-1"><Calculator size={18} /> Calculadora de rendimiento</h2>
            <p className="text-sm text-slate-500 mb-4">Rendimiento preferente del 25% anual, prorrateado por dia. Solo simula, no guarda nada.</p>
            <Calculadora />
          </div>
        )}
      </main>

      {/* Indicador de guardado */}
      {guardando && (
        <div className="fixed bottom-5 right-5 z-[90] bg-slate-900 text-white px-3 py-2 rounded-lg text-xs flex items-center gap-2 shadow-lg">
          <Spinner size={14} /> Guardando...
        </div>
      )}

      {/* Modal de formulario */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal ? `${modal.esNuevo ? "Nuevo" : "Editar"} · ${modal.tab === "Aportaciones" ? "aportacion" : modal.tab.slice(0, -1).toLowerCase()}` : ""}
      >
        {modal && (
          <FormularioModal
            tab={modal.tab}
            rowInicial={modal.row}
            esNuevo={modal.esNuevo}
            data={data}
            onCancelar={() => setModal(null)}
            onGuardar={async (row) => {
              try { await guardarFila(modal.tab, row); setModal(null); } catch (e) { /* el error ya se muestra */ }
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title="Confirmar eliminacion"
        message={confirm?.msg}
        onCancel={() => setConfirm(null)}
        onConfirm={() => eliminarFila(confirm.tab, confirm.key)}
      />

      {wizard && (
        <WizardAlta
          proyectos={data.Proyectos}
          onCrear={altaCodesarrollador}
          onClose={() => { setWizard(false); cargar(true); }}
        />
      )}
    </div>
  );

  // Generador rapido de las 4 aportaciones del ejemplo Casa Alysa
  async function generarPlanCasaAlysa(folio) {
    const inv = arr(data.Inversiones).find(i => String(i.folio) === String(folio));
    const baseFecha = inv && inv.fechaInicio ? parseDate(inv.fechaInicio) : parseDate(todayISO());
    const sumaMes = (n) => {
      const d = new Date(baseFecha.getTime());
      d.setMonth(d.getMonth() + n);
      const p = (x) => String(x).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };
    const plan = [
      { numeroPago: 1, totalPagos: 4, concepto: "Aportacion inicial", monto: 350000, fechaProgramada: sumaMes(0) },
      { numeroPago: 2, totalPagos: 4, concepto: "Aportacion 2 de 4", monto: 216667, fechaProgramada: sumaMes(1) },
      { numeroPago: 3, totalPagos: 4, concepto: "Aportacion 3 de 4", monto: 216667, fechaProgramada: sumaMes(2) },
      { numeroPago: 4, totalPagos: 4, concepto: "Aportacion final", monto: 216666, fechaProgramada: sumaMes(3) },
    ];
    try {
      for (const p of plan) {
        await guardarFila("Aportaciones", { ...p, folio, fechaRecibida: "", comprobanteUrl: "" });
      }
      notificar("Plan de 4 aportaciones generado.", "ok");
    } catch (e) { /* error ya notificado */ }
  }
}

// ----- Formulario dentro del modal (decide que form mostrar) -----
function FormularioModal({ tab, rowInicial, data, onCancelar, onGuardar, esNuevo = true }) {
  const [row, setRow] = useState(rowInicial);
  const [enviando, setEnviando] = useState(false);

  const valido = useMemo(() => {
    if (tab === "Inversiones") return !!(row.folio && String(row.folio).trim());
    if (tab === "Inversionistas") return !!(row.nombre && String(row.nombre).trim());
    if (tab === "Proyectos") return !!(row.nombre && String(row.nombre).trim());
    if (tab === "Aportaciones") return !!(row.folio && row.monto);
    if (tab === "Documentos") return !!(row.folio && (row.nombre || row.url));
    return true;
  }, [tab, row]);

  const submit = async () => {
    setEnviando(true);
    await onGuardar(row);
    setEnviando(false);
  };

  return (
    <div>
      {tab === "Inversionistas" && <InversionistaForm value={row} onChange={setRow} />}
      {tab === "Proyectos" && <ProyectoForm value={row} onChange={setRow} />}
      {tab === "Inversiones" && <InversionForm value={row} onChange={setRow} inversionistas={data.Inversionistas} proyectos={data.Proyectos} esNuevo={esNuevo} />}
      {tab === "Aportaciones" && <AportacionForm value={row} onChange={setRow} />}
      {tab === "Documentos" && <DocumentoForm value={row} onChange={setRow} />}

      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
        <Btn variant="outline" onClick={onCancelar}>Cancelar</Btn>
        <Btn onClick={submit} disabled={!valido || enviando}>
          {enviando ? <Spinner /> : <Save size={16} />} Guardar
        </Btn>
      </div>
    </div>
  );
}

// ----- Lista de inversionistas -----
function ListaInversionistas({ data, onNuevo, onEditar, onEliminar }) {
  const [verClaves, setVerClaves] = useState({});
  const lista = arr(data.Inversionistas);
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><Users size={20} /> Codesarrolladores <span className="text-sm font-normal text-slate-400">({lista.length})</span></h2>
        <Btn onClick={onNuevo}><Plus size={16} /> Nuevo</Btn>
      </div>
      {lista.length === 0 ? (
        <EmptyState icon={Users} texto="Aun no hay codesarrolladores. Crea el primero." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {lista.map((i) => {
            const numInv = arr(data.Inversiones).filter(x => String(x.inversionistaId) === String(i.id)).length;
            const tieneClave = !!(i.claveAcceso && String(i.claveAcceso).trim());
            return (
              <div key={i.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800 truncate">{i.nombre || "(sin nombre)"}</div>
                    <div className="text-xs text-slate-400">{i.email || "sin correo"} · {i.telefono || "sin tel."}</div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <IconBtn onClick={() => onEditar(i)} icon={Pencil} title="Editar" />
                    <IconBtn onClick={() => onEliminar(i)} icon={Trash2} title="Eliminar" danger />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5">
                  <div className="text-xs text-slate-500 flex items-center gap-1.5 min-w-0">
                    <KeyRound size={13} className="shrink-0" />
                    {tieneClave
                      ? <span className="font-mono truncate">{verClaves[i.id] ? i.claveAcceso : "••••••••"}</span>
                      : <span className="italic text-slate-400 truncate">Editar para ver/asignar clave</span>}
                  </div>
                  {tieneClave ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setVerClaves(v => ({ ...v, [i.id]: !v[i.id] }))} className="text-slate-400 hover:text-slate-700">
                        {verClaves[i.id] ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                      <CopyButton value={i.claveAcceso} label="Copiar" />
                    </div>
                  ) : null}
                </div>
                <div className="mt-2 text-xs text-slate-400">{numInv} inversion{numInv === 1 ? "" : "es"}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ----- Lista de proyectos -----
function ListaProyectos({ data, onNuevo, onEditar, onEliminar }) {
  const lista = arr(data.Proyectos);
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><Building2 size={20} /> Proyectos <span className="text-sm font-normal text-slate-400">({lista.length})</span></h2>
        <Btn onClick={onNuevo}><Plus size={16} /> Nuevo</Btn>
      </div>
      {lista.length === 0 ? (
        <EmptyState icon={Building2} texto="Aun no hay proyectos. Crea el primero (puedes precargar Casa Alysa)." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {lista.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 flex items-center gap-2">
                    {p.nombre || "(sin nombre)"}
                    {(p.estado || "Abierto") === "Abierto"
                      ? <Badge tone="green">Abierto</Badge>
                      : <Badge tone="gray">Cerrado</Badge>}
                  </div>
                  {p.descripcion ? <div className="text-xs text-slate-400 mt-0.5">{p.descripcion}</div> : null}
                </div>
                <div className="flex gap-1 shrink-0">
                  <IconBtn onClick={() => onEditar(p)} icon={Pencil} title="Editar" />
                  <IconBtn onClick={() => onEliminar(p)} icon={Trash2} title="Eliminar" danger />
                </div>
              </div>
              <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-3 text-sm">
                <div className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5"><Banknote size={14} /> Cuenta de deposito</div>
                <DatoBanco label="Banco" valor={p.banco} />
                <DatoBanco label="Beneficiario" valor={p.beneficiario} />
                <DatoBanco label="Cuenta" valor={p.cuenta} copiable />
                <DatoBanco label="CLABE" valor={p.clabe} copiable mono />
                {p.conceptoBase ? <DatoBanco label="Concepto" valor={p.conceptoBase} /> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DatoBanco({ label, valor, copiable, mono }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-xs text-slate-400 shrink-0">{label}</span>
      <span className={`text-xs text-slate-700 text-right truncate ${mono ? "font-mono" : ""}`}>
        {valor || "—"}
        {copiable && valor ? <span className="ml-1.5 inline-block align-middle"><CopyButton value={valor} label="" /></span> : null}
      </span>
    </div>
  );
}

// ----- Lista de inversiones -----
function ListaInversiones({ data, inversionistaPorId, proyectoPorId, capitalRecibido, onNuevo, onEditar, onEliminar, onAbrir }) {
  const lista = arr(data.Inversiones);
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2"><Wallet size={20} /> Inversiones <span className="text-sm font-normal text-slate-400">({lista.length})</span></h2>
        <Btn onClick={onNuevo}><Plus size={16} /> Nueva</Btn>
      </div>
      {lista.length === 0 ? (
        <EmptyState icon={Wallet} texto="Aun no hay inversiones. Crea la primera (recuerda el folio, ej. CA-HM-2026-01)." />
      ) : (
        <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Folio</th>
                <th className="text-left px-4 py-3 font-medium">Codesarrollador</th>
                <th className="text-left px-4 py-3 font-medium">Proyecto</th>
                <th className="text-right px-4 py-3 font-medium">Monto</th>
                <th className="text-right px-4 py-3 font-medium">Recibido</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((inv) => {
                const recibido = capitalRecibido(inv.folio);
                const monto = num(inv.montoTotal);
                const progreso = monto > 0 ? Math.min(100, Math.round((recibido / monto) * 100)) : 0;
                return (
                  <tr key={inv.folio} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <button onClick={() => onAbrir(inv.folio)} className="font-mono font-medium text-slate-800 hover:text-amber-600 inline-flex items-center gap-1">
                        {inv.folio} <ChevronRight size={14} />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{inversionistaPorId(inv.inversionistaId)?.nombre || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{proyectoPorId(inv.proyectoId)?.nombre || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-800">{money(monto)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <div className="text-emerald-700 font-medium">{money(recibido)}</div>
                      <div className="w-20 ml-auto mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: progreso + "%" }} />
                      </div>
                    </td>
                    <td className="px-4 py-3"><EstadoInversionBadge estado={inv.estado || "Activa"} /></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <IconBtn onClick={() => onEditar(inv)} icon={Pencil} title="Editar" />
                        <IconBtn onClick={() => onEliminar(inv)} icon={Trash2} title="Eliminar" danger />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ----- Detalle de una inversion -----
function DetalleInversion({
  folio, data, inversionistaPorId, proyectoPorId, aportacionesDeFolio, documentosDeFolio, capitalRecibido,
  onVolver, onEditarInversion, onNuevaAportacion, onEditarAportacion, onEliminarAportacion,
  onMarcarRecibida, onGuardarComprobante, onGenerarPlanCasaAlysa, onNuevoDocumento, onEliminarDocumento,
}) {
  const inv = arr(data.Inversiones).find(i => String(i.folio) === String(folio));
  const [compEdit, setCompEdit] = useState({}); // id -> url temporal

  if (!inv) {
    return (
      <div>
        <Btn variant="outline" onClick={onVolver}><ArrowLeft size={16} /> Volver</Btn>
        <p className="text-sm text-slate-500 mt-4">No se encontro la inversion.</p>
      </div>
    );
  }

  const inversionista = inversionistaPorId(inv.inversionistaId);
  const proyecto = proyectoPorId(inv.proyectoId);
  const aportaciones = aportacionesDeFolio(folio);
  const documentos = documentosDeFolio(folio);
  const recibido = capitalRecibido(folio);
  const monto = num(inv.montoTotal);

  // Rendimiento al dia de hoy (o a fechaSalida si esta liquidada)
  const fechaFin = inv.fechaSalida && String(inv.fechaSalida).trim() ? inv.fechaSalida : todayISO();
  const rend = calcularRendimiento(monto, inv.fechaInicio, fechaFin, inv.tasaAnual);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Btn variant="outline" onClick={onVolver}><ArrowLeft size={16} /> Volver</Btn>
        <div className="min-w-0">
          <div className="font-mono font-semibold text-slate-800">{inv.folio}</div>
          <div className="text-xs text-slate-400">{inversionista?.nombre || "—"} · {proyecto?.nombre || "—"}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <EstadoInversionBadge estado={inv.estado || "Activa"} />
          <Btn variant="outline" onClick={() => onEditarInversion(inv)}><Pencil size={15} /> Editar</Btn>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={TrendingUp} label="Monto total" value={money(monto)} tone="slate" />
        <KpiCard icon={CheckCircle2} label="Capital recibido" value={money(recibido)} sub={`Falta ${money(Math.max(0, monto - recibido))}`} tone="green" />
        <KpiCard icon={Sparkles} label={`Rendimiento (${rend.dias} dias)`} value={pct(rend.rendimientoPct)} sub={inv.fechaSalida ? "a fecha de salida" : "estimado a hoy"} tone="amber" />
        <KpiCard icon={CircleDollarSign} label="Total a recibir (estimado)" value={money(rend.totalARecibir)} sub={`Ganancia ${money(rend.ganancia)}`} tone="blue" />
      </div>

      {/* Cuenta de deposito del proyecto */}
      {proyecto && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-3"><Banknote size={18} /> Cuenta de deposito · {proyecto.nombre}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 max-w-2xl">
            <DatoBanco label="Banco" valor={proyecto.banco} />
            <DatoBanco label="Beneficiario" valor={proyecto.beneficiario} />
            <DatoBanco label="Cuenta" valor={proyecto.cuenta} copiable />
            <DatoBanco label="CLABE" valor={proyecto.clabe} copiable mono />
          </div>
          {proyecto.conceptoBase ? <div className="mt-2 text-xs text-slate-400">Concepto sugerido: {proyecto.conceptoBase}</div> : null}
        </div>
      )}

      {/* Calendario de aportaciones */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2"><Calendar size={18} /> Calendario de aportaciones</h3>
          <div className="flex gap-2">
            {aportaciones.length === 0 && (
              <Btn variant="gold" onClick={() => onGenerarPlanCasaAlysa(folio)}><Sparkles size={15} /> Generar plan (4 pagos)</Btn>
            )}
            <Btn variant="outline" onClick={() => onNuevaAportacion(folio)}><Plus size={15} /> Pago</Btn>
          </div>
        </div>
        {aportaciones.length === 0 ? (
          <p className="text-sm text-slate-400">Aun no hay aportaciones. Usa "Generar plan" para crear los 4 pagos del ejemplo, o agrega uno manual.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead className="text-slate-500 text-xs">
                <tr className="border-b border-slate-100">
                  <th className="text-left px-2 py-2 font-medium">#</th>
                  <th className="text-left px-2 py-2 font-medium">Concepto</th>
                  <th className="text-left px-2 py-2 font-medium">Programada</th>
                  <th className="text-right px-2 py-2 font-medium">Monto</th>
                  <th className="text-left px-2 py-2 font-medium">Estado</th>
                  <th className="text-left px-2 py-2 font-medium">Comprobante</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {aportaciones.map((a) => {
                  const est = estadoAportacion(a);
                  const compVal = compEdit[a.id] !== undefined ? compEdit[a.id] : (a.comprobanteUrl || "");
                  return (
                    <tr key={a.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-2 py-2 text-slate-500 tabular-nums">{a.numeroPago}/{a.totalPagos || "—"}</td>
                      <td className="px-2 py-2 text-slate-700">{a.concepto || "—"}</td>
                      <td className="px-2 py-2 text-slate-500">{fmtFecha(a.fechaProgramada)}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium text-slate-800">{money(a.monto)}</td>
                      <td className="px-2 py-2"><EstadoAportacionBadge ap={a} /></td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <input
                            value={compVal}
                            onChange={(e) => setCompEdit(c => ({ ...c, [a.id]: e.target.value }))}
                            onBlur={() => {
                              const nv = compEdit[a.id];
                              if (nv !== undefined && nv !== (a.comprobanteUrl || "")) onGuardarComprobante(a, nv);
                            }}
                            placeholder="URL comprobante"
                            className="w-36 rounded-md border border-slate-200 px-2 py-1 text-xs"
                          />
                          {a.comprobanteUrl ? (
                            <a href={a.comprobanteUrl} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-amber-600"><ExternalLink size={14} /></a>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1 justify-end">
                          {est !== "Recibida" && (
                            <button onClick={() => onMarcarRecibida(a)} title="Marcar recibida" className="text-emerald-600 hover:text-emerald-700 p-1 rounded hover:bg-emerald-50">
                              <CheckCircle2 size={16} />
                            </button>
                          )}
                          <IconBtn onClick={() => onEditarAportacion(a)} icon={Pencil} title="Editar" />
                          <IconBtn onClick={() => onEliminarAportacion(a)} icon={Trash2} title="Eliminar" danger />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Calculadora con datos de esta inversion */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-3"><Calculator size={18} /> Simular rendimiento de esta inversion</h3>
        <Calculadora capitalInicial={monto || 1000000} fechaInicio={toDateInput(inv.fechaInicio) || todayISO()} tasaInicial={inv.tasaAnual ?? TASA_DEFAULT} />
      </div>

      {/* Documentos */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2"><FileText size={18} /> Documentos</h3>
          <Btn variant="outline" onClick={() => onNuevoDocumento(folio)}><Plus size={15} /> Documento</Btn>
        </div>
        {documentos.length === 0 ? (
          <p className="text-sm text-slate-400">Sin documentos. Agrega el contrato, pagare o comprobantes (enlaces de Drive).</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {documentos.map((d) => (
              <li key={d.id} className="py-2.5 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><FileText size={15} className="text-slate-500" /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-700 truncate">{d.nombre || d.tipo}</div>
                  <div className="text-xs text-slate-400">{d.tipo} · {fmtFecha(d.fecha)}</div>
                </div>
                {d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-amber-600"><Link2 size={16} /></a> : null}
                <IconBtn onClick={() => onEliminarDocumento(d)} icon={Trash2} title="Eliminar" danger />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function IconBtn({ onClick, icon: Icon, title, danger }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-lg ${danger ? "text-slate-400 hover:text-red-600 hover:bg-red-50" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"}`}
    >
      <Icon size={16} />
    </button>
  );
}

function EmptyState({ icon: Icon, texto }) {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">
      <div className="inline-flex w-12 h-12 rounded-2xl bg-slate-100 items-center justify-center mb-3"><Icon size={22} className="text-slate-400" /></div>
      <p className="text-sm text-slate-500">{texto}</p>
    </div>
  );
}

// ===================================================================
// VISTA INVERSIONISTA (Fase 2 — solo lectura)
// ===================================================================
function InvestorApp({ clave, onLogout }) {
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // Pagos reportados por el inversionista (en vista previa se guardan localmente;
  // al conectar el backend, esto llamara a la accion reportarPago).
  const [reportes, setReportes] = useState({});
  const [reportando, setReportando] = useState(null);
  const [refDraft, setRefDraft] = useState("");
  const [compDraft, setCompDraft] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true); setError("");
    if (!BACKEND_LISTO) { setData(DEMO_DATA); setCargando(false); return; }
    try {
      const res = await apiCall("getMine", { clave });
      setData(res.data);
    } catch (err) {
      setError(err.message || "No se pudo cargar tu cartera.");
    } finally {
      setCargando(false);
    }
  }, [clave]);

  useEffect(() => { cargar(); }, [cargar]);

  // Reporta el pago: en linea lo guarda en el backend; en vista previa, local.
  const enviarReporte = async (apId) => {
    if (BACKEND_LISTO) {
      try {
        await apiCall("reportarPago", { clave, id: apId, referencia: refDraft, comprobanteUrl: compDraft });
        setReportando(null); setRefDraft(""); setCompDraft("");
        cargar();
      } catch (err) { setError(err.message || "No se pudo reportar el pago."); }
    } else {
      setReportes(prev => ({ ...prev, [apId]: { fechaReporte: todayISO(), referencia: refDraft, comprobanteUrl: compDraft } }));
      setReportando(null); setRefDraft(""); setCompDraft("");
    }
  };

  const inv = data?.inversionista;
  const inversiones = arr(data?.inversiones);
  const aportaciones = arr(data?.aportaciones);
  const proyectos = arr(data?.proyectos);
  const documentos = arr(data?.documentos);

  const proyectoPorId = (id) => proyectos.find(p => String(p.id) === String(id));
  const aportacionesDeFolio = (folio) => aportaciones.filter(a => String(a.folio) === String(folio)).sort((a, b) => num(a.numeroPago) - num(b.numeroPago));

  return (
    <div className="min-h-screen" style={{ background: "#f5f1ea" }}>
      <header style={{ background: "#0a0a0c" }}>
        <div className="max-w-3xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <img src={logoWhite} alt="YODESARROLLO.MX" className="h-6 w-auto" style={{ mixBlendMode: "screen" }} />
          <button onClick={onLogout} className="ml-auto inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-white/80 hover:text-white transition" style={{ background: "rgba(255,255,255,0.08)" }}>
            <LogOut size={14} /> Salir
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {cargando && (
          <div className="flex items-center gap-2 text-slate-500 text-sm justify-center py-10"><Spinner /> Cargando tu cartera...</div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
            <AlertCircle size={18} className="shrink-0 mt-0.5" /> <span>{error}</span>
          </div>
        )}

        {!cargando && !error && data && (
          <>
            <div className="mb-1">
              <div className="text-2xl font-display text-slate-900">Hola, {(inv?.nombre || "").split(" ")[0] || "Codesarrollador"}</div>
              <div className="text-sm text-slate-500">Este es el resumen de tu inversion con YoDesarrollo.</div>
            </div>
            {inversiones.length === 0 ? (
              <EmptyState icon={Wallet} texto="Aun no tienes inversiones registradas. Contacta al equipo de YoDesarrollo." />
            ) : inversiones.map((iv) => {
              const proyecto = proyectoPorId(iv.proyectoId);
              const aps = aportacionesDeFolio(iv.folio).map(a => reportes[a.id] ? { ...a, ...reportes[a.id] } : a);
              const recibido = aps.filter(a => estadoAportacion(a) === "Recibida").reduce((s, a) => s + num(a.monto), 0);
              const monto = num(iv.montoTotal);
              const fechaFin = iv.fechaSalida && String(iv.fechaSalida).trim() ? iv.fechaSalida : todayISO();
              const rend = calcularRendimiento(monto, iv.fechaInicio, fechaFin, iv.tasaAnual);
              const ganancia = Math.max(0, rend.totalARecibir - monto);
              const pagosRecibidos = aps.filter(a => estadoAportacion(a) === "Recibida").length;
              const proximo = aps.find(a => estadoAportacion(a) !== "Recibida");
              const progresoPct = monto > 0 ? Math.min(100, Math.round((recibido / monto) * 100)) : 0;
              const docs = documentos.filter(d => String(d.folio) === String(iv.folio));
              const liquidada = (iv.estado || "Activa") === "Liquidada";
              const avances = arr(data?.avances).filter(a => String(a.folio) === String(iv.folio)).sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
              const bitacora = arr(data?.bitacora).filter(b => String(b.folio) === String(iv.folio)).sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
              return (
                <div key={iv.folio} className="space-y-4">
                  {/* HERO: cuanto vale hoy tu inversion */}
                  <div className="rounded-3xl p-6 text-center shadow-lg" style={{ background: "linear-gradient(160deg,#221a0f 0%,#1a1409 55%,#0a0a0c 100%)" }}>
                    <div className="text-[11px] tracking-[0.22em] uppercase mb-3" style={{ color: "#c9a96e" }}>{proyecto?.nombre || "Tu inversion"} · {iv.folio}</div>
                    <div className="text-sm text-white/50">{liquidada ? "Tu inversion se liquido en" : "Hoy tu inversion vale"}</div>
                    <div className="font-display leading-none mt-1" style={{ color: "#e0c590", fontSize: "2.9rem" }}>{money(rend.totalARecibir)}</div>
                    <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1 rounded-full" style={{ background: "rgba(201,169,110,0.16)", color: "#d4be8a" }}>
                      <TrendingUp size={15} /> +{pct(rend.rendimientoPct)} · {rend.dias} dias
                    </div>
                    <div className="text-xs text-white/40 mt-3">Invertiste {money(monto)} · ganancia estimada {money(ganancia)}</div>

                    <div className="mt-5 text-left">
                      <div className="flex items-center justify-between text-[11px] mb-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>
                        <span>{pagosRecibidos} de {aps.length || num(iv.totalPagos) || 0} aportaciones</span>
                        <span>{money(recibido)} de {money(monto)}</span>
                      </div>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${progresoPct}%`, background: "linear-gradient(90deg,#c9a96e,#e0c590)" }} />
                      </div>
                    </div>
                  </div>

                  {/* TU PROXIMO PASO */}
                  {!liquidada && proximo && estadoAportacion(proximo) === "En aprobacion" ? (
                    <div className="bg-white rounded-2xl border p-5 shadow-sm" style={{ borderColor: "#bfdbfe" }}>
                      <div className="flex items-center gap-2 mb-1"><Clock size={16} className="text-blue-600" /><div className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">Pago en validacion</div></div>
                      <div className="text-lg font-semibold text-slate-800">Reportaste {money(proximo.monto)}</div>
                      <div className="text-sm text-slate-500 mt-0.5">{proximo.referencia ? <>Referencia: <b>{proximo.referencia}</b>. </> : null}Lo estamos validando; te avisaremos en cuanto quede como <b>Recibido</b>.</div>
                      {proximo.comprobanteUrl ? <a href={proximo.comprobanteUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 inline-flex items-center gap-1 mt-2"><ExternalLink size={13} /> Ver mi comprobante</a> : null}
                    </div>
                  ) : !liquidada && proximo ? (
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Tu proximo paso</div>
                      <div className="flex items-baseline justify-between flex-wrap gap-1">
                        <div className="text-xl font-semibold text-slate-800">Deposita {money(proximo.monto)}</div>
                        <div className="text-sm text-slate-500">{proximo.concepto || `Aportacion ${proximo.numeroPago}`} · vence {fmtFecha(proximo.fechaProgramada)}</div>
                      </div>
                      {proyecto && (
                        <div className="mt-3 rounded-xl bg-slate-50 border border-slate-100 p-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                            <DatoBanco label="Banco" valor={proyecto.banco} />
                            <DatoBanco label="Beneficiario" valor={proyecto.beneficiario} />
                            <DatoBanco label="CLABE" valor={proyecto.clabe} copiable mono />
                            <DatoBanco label="Cuenta" valor={proyecto.cuenta} copiable />
                          </div>
                          {proyecto.conceptoBase ? <div className="mt-2 text-xs text-slate-400">Concepto sugerido: {proyecto.conceptoBase}</div> : null}
                        </div>
                      )}
                      {reportando === proximo.id ? (
                        <div className="mt-3 rounded-xl border border-slate-200 p-3 space-y-2">
                          <div className="text-sm font-medium text-slate-700">Reportar mi pago</div>
                          <Input value={refDraft} onChange={(e) => setRefDraft(e.target.value)} placeholder="Numero de referencia / clave de rastreo" autoFocus />
                          <Input value={compDraft} onChange={(e) => setCompDraft(e.target.value)} placeholder="Link del comprobante (Drive, foto) — opcional" />
                          <div className="flex items-center gap-2">
                            <Btn variant="gold" disabled={!refDraft && !compDraft} onClick={() => enviarReporte(proximo.id)}><Check size={15} /> Enviar reporte</Btn>
                            <button onClick={() => setReportando(null)} className="text-sm text-slate-500 px-2">Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setReportando(proximo.id); setRefDraft(""); setCompDraft(""); }} className="mt-3 w-full inline-flex items-center justify-center gap-2 font-semibold text-sm rounded-xl py-3 transition hover:brightness-110" style={{ background: "#1a1409", color: "#e0c590" }}>
                          <CheckCircle2 size={16} /> Ya deposite — reportar mi pago
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-emerald-100 p-5 flex items-center gap-3 shadow-sm">
                      <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0"><BadgeCheck size={24} className="text-emerald-600" /></div>
                      <div>
                        <div className="font-semibold text-slate-800">{liquidada ? "Inversion liquidada" : "Estas al dia"}</div>
                        <div className="text-sm text-slate-500">{liquidada ? "Gracias por confiar en YoDesarrollo." : "Completaste todas tus aportaciones. Gracias."}</div>
                      </div>
                    </div>
                  )}

                  {/* AVANCE DE OBRA (galeria de fotos/videos) */}
                  {avances.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                      <div className="flex items-center gap-2 mb-3">
                        <HardHat size={17} style={{ color: "#c9a96e" }} />
                        <h3 className="font-semibold text-slate-800">Avance de tu proyecto</h3>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {avances.map((av) => (
                          <a key={av.id} href={av.url || "#"} target="_blank" rel="noreferrer" className="group relative block rounded-xl overflow-hidden aspect-[4/3] bg-slate-100">
                            {av.tipo === "video" ? (
                              <div className="w-full h-full flex items-center justify-center" style={{ background: "#1a1409" }}>
                                <PlayCircle size={36} style={{ color: "#d4be8a" }} />
                              </div>
                            ) : (
                              <img src={av.url} alt={av.titulo || "Avance"} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition" />
                            )}
                            <div className="absolute inset-x-0 bottom-0 p-2" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72), transparent)" }}>
                              <div className="text-[11px] text-white font-medium leading-tight truncate">{av.titulo}</div>
                              <div className="text-[10px] text-white/70">{fmtFecha(av.fecha)}</div>
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* BITACORA / SEGUIMIENTO DEL ASESOR (linea de tiempo) */}
                  {bitacora.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                      <div className="flex items-center gap-2 mb-4">
                        <MessageCircle size={17} style={{ color: "#c9a96e" }} />
                        <h3 className="font-semibold text-slate-800">Seguimiento de tu asesor</h3>
                      </div>
                      <ol className="relative border-l border-slate-200 ml-1.5 space-y-5">
                        {bitacora.map((b) => (
                          <li key={b.id} className="ml-4">
                            <span className="absolute -left-[7px] mt-1 w-3.5 h-3.5 rounded-full border-2 border-white" style={{ background: "#c9a96e" }} />
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-slate-400">{fmtFecha(b.fecha)}</span>
                              {b.etiqueta ? <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(201,169,110,0.16)", color: "#7a5e1e" }}>{b.etiqueta}</span> : null}
                            </div>
                            {b.titulo ? <div className="text-sm font-semibold text-slate-800 mt-0.5">{b.titulo}</div> : null}
                            <div className="text-sm text-slate-600 mt-0.5">{b.nota}</div>
                            {b.autor ? <div className="text-xs text-slate-400 mt-1">— {b.autor}</div> : null}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* DETALLE (secundario, colapsado) */}
                  <details className="bg-white rounded-2xl border border-slate-200 p-5 group shadow-sm">
                    <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-medium text-slate-700">
                      <span className="flex items-center gap-2"><Calendar size={15} className="text-slate-400" /> Detalle de mis aportaciones y documentos</span>
                      <ChevronDown size={16} className="text-slate-400 group-open:rotate-180 transition" />
                    </summary>
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-sm min-w-[420px]">
                        <tbody>
                          {aps.map((a) => (
                            <tr key={a.id} className="border-b border-slate-50 last:border-0">
                              <td className="py-2 text-slate-600">{a.concepto || `Pago ${a.numeroPago}`}</td>
                              <td className="py-2 text-slate-400 text-xs">{fmtFecha(a.fechaProgramada)}</td>
                              <td className="py-2 text-right tabular-nums font-medium text-slate-800">{money(a.monto)}</td>
                              <td className="py-2 text-right"><EstadoAportacionBadge ap={a} /></td>
                              <td className="py-2 text-right">{a.comprobanteUrl ? <a href={a.comprobanteUrl} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-amber-600 inline-block"><ExternalLink size={14} /></a> : null}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {docs.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <div className="text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1.5"><FileText size={14} /> Mis documentos</div>
                        <ul className="space-y-1">
                          {docs.map((d) => (
                            <li key={d.id} className="flex items-center gap-2 text-sm">
                              <FileText size={14} className="text-slate-400 shrink-0" />
                              <span className="text-slate-600 truncate flex-1">{d.nombre || d.tipo}</span>
                              {d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-amber-600"><Link2 size={15} /></a> : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </details>
                </div>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}

function MiniKpi({ label, value, tone = "slate" }) {
  const tones = {
    slate: "text-slate-800",
    green: "text-emerald-700",
    amber: "text-amber-600",
    blue: "text-blue-700",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
      <div className="text-[10px] text-slate-400 leading-tight">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${tones[tone]}`}>{value}</div>
    </div>
  );
}

// ===================================================================
// APP RAIZ — maneja la sesion
// ===================================================================
export default function App() {
  const [sesion, setSesion] = useState(() => {
    try {
      const a = localStorage.getItem(ADMIN_KEY);
      if (a) { const o = JSON.parse(a); if (o && o.pass) return { rol: "admin", pass: o.pass }; }
      const i = localStorage.getItem(INVESTOR_KEY);
      if (i) { const o = JSON.parse(i); if (o && o.clave) return { rol: "investor", clave: o.clave }; }
    } catch (e) { /* noop */ }
    return null;
  });

  const entrarAdmin = useCallback((pass) => {
    try { localStorage.setItem(ADMIN_KEY, JSON.stringify({ sesion: true, pass })); } catch (e) { /* noop */ }
    setSesion({ rol: "admin", pass });
  }, []);

  const entrarInversionista = useCallback((clave) => {
    try { localStorage.setItem(INVESTOR_KEY, JSON.stringify({ sesion: true, clave })); } catch (e) { /* noop */ }
    setSesion({ rol: "investor", clave });
  }, []);

  const salir = useCallback(() => {
    // Limpiamos tambien el cache local para no dejar datos sensibles tras cerrar sesion.
    try { localStorage.removeItem(ADMIN_KEY); localStorage.removeItem(INVESTOR_KEY); localStorage.removeItem(CACHE_KEY); } catch (e) { /* noop */ }
    setSesion(null);
  }, []);

  return (
    <ErrorBoundary>
      {!sesion && (
        <LoginGate
          onAdmin={entrarAdmin}
          onInvestor={(clave) => entrarInversionista(clave)}
        />
      )}
      {sesion?.rol === "admin" && <AdminApp pass={sesion.pass} onLogout={salir} />}
      {sesion?.rol === "investor" && <InvestorApp clave={sesion.clave} onLogout={salir} />}
    </ErrorBoundary>
  );
}
