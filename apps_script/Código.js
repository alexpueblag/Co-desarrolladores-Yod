const SHEET_ID = '11DiE789WIVqIybKTPapayS5XEWHtcAXUiUA11KBQUQc';

/**
 * ============================================================================
 *  Co-desarrolladores-Yod  —  Backend (Google Apps Script)
 * ============================================================================
 *  Que es esto:
 *  Este archivo es el "cerebro" del portal de control financiero de
 *  co-desarrolladores (inversionistas) de YoDesarrollo SAPI de C.V.
 *
 *  Funciona como una pequena API (un servicio web) que:
 *    - Lee y escribe en un Google Sheet privado (la base de datos).
 *    - Hace de "portero": cada accion exige una credencial (contrasena de
 *      admin o clave de inversionista) y SOLO entrega lo que corresponde.
 *
 *  Reglas importantes (no tecnicas):
 *    - La contrasena de admin NO vive aqui en el codigo. Vive guardada en
 *      las "Propiedades del Script" (PropertiesService), bajo la clave
 *      'ADMIN_PASS'. Por eso el codigo se puede tener en un repo publico.
 *    - El inversionista entra con su propia "claveAcceso" (guardada en el
 *      Sheet) y solo ve SUS datos. Nunca ve los de otros.
 *    - Respondemos siempre en formato JSON, sin tocar encabezados HTTP
 *      (Apps Script no lo permite con ContentService).
 * ============================================================================
 */

// ---------------------------------------------------------------------------
//  ZONA HORARIA DEL NEGOCIO (Hermosillo, Sonora = America/Hermosillo)
// ---------------------------------------------------------------------------
//  La usamos para formatear las fechas como texto "yyyy-MM-dd" (sin hora),
//  asi el front las puede meter directo en los <input type="date"> y no se
//  rompen ni se borran al editar.
const TZ = 'America/Hermosillo';

// ---------------------------------------------------------------------------
//  URL DEL PORTAL (sitio publico en GitHub Pages)
// ---------------------------------------------------------------------------
//  La usamos en los correos (recuperar clave, avisar avance) y para armar el
//  link magico de acceso. Es una sola constante para no repetirla.
const PORTAL_URL = 'https://alexpueblag.github.io/Co-desarrolladores-Yod/';

// ---------------------------------------------------------------------------
//  CONFIGURACION DE LAS PESTANAS (HOJAS) DEL SHEET
// ---------------------------------------------------------------------------
//  Aqui definimos como se llama cada hoja, cual es su columna llave
//  (keyField) y que encabezados (columnas) lleva, en orden.
//  Si algun dia agregas una columna, agregala aqui y en setup().
const TABS = {
  Inversionistas: {
    keyField: 'id',
    headers: ['id', 'nombre', 'telefono', 'email', 'claveAcceso', 'notas', 'creado'],
    prefix: 'INV-'
  },
  Proyectos: {
    keyField: 'id',
    headers: ['id', 'nombre', 'tipo', 'etapaActual', 'banco', 'beneficiario', 'cuenta', 'clabe', 'conceptoBase', 'descripcion', 'estado', 'creado'],
    prefix: 'PRY-'
  },
  Inversiones: {
    keyField: 'folio',
    headers: ['folio', 'inversionistaId', 'proyectoId', 'montoTotal', 'fechaInicio', 'fechaSalida', 'tasaAnual', 'estado', 'notas', 'creado'],
    prefix: '' // el folio lo escribe el usuario (ej. CA-HM-2026-01); es obligatorio
  },
  Aportaciones: {
    keyField: 'id',
    headers: ['id', 'folio', 'numeroPago', 'totalPagos', 'concepto', 'fechaProgramada', 'monto', 'fechaRecibida', 'estado', 'comprobanteUrl', 'referencia', 'fechaReporte', 'creado'],
    prefix: 'AP-'
  },
  Documentos: {
    keyField: 'id',
    headers: ['id', 'folio', 'tipo', 'nombre', 'url', 'fecha', 'creado'],
    prefix: 'DOC-'
  },
  Avances: {
    keyField: 'id',
    headers: ['id', 'proyectoId', 'tipo', 'etapa', 'url', 'titulo', 'descripcion', 'fecha', 'creado'],
    prefix: 'AVN-'
  },
  Bitacora: {
    keyField: 'id',
    headers: ['id', 'proyectoId', 'fecha', 'autor', 'etiqueta', 'titulo', 'nota', 'creado'],
    prefix: 'BIT-'
  }
};

// ---------------------------------------------------------------------------
//  SETUP — preparar el Google Sheet (correr UNA sola vez desde el editor)
// ---------------------------------------------------------------------------
//  Que hace esta funcion (la corres a mano desde el editor de Apps Script):
//    1. Crea cada pestana que falte con sus encabezados, y congela la fila 1.
//    2. Si la hoja por defecto "Hoja 1" / "Sheet1" quedo vacia, la borra.
//    3. Si todavia no existe la contrasena de admin, la deja en un valor
//       temporal ('cambia-esta-clave') para que la cambies de inmediato.
//  Al terminar te devuelve un texto de confirmacion.
function setup() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const mensajes = [];

  // 1) Crear/verificar cada pestana con sus encabezados.
  Object.keys(TABS).forEach(function (nombreHoja) {
    const conf = TABS[nombreHoja];
    let hoja = ss.getSheetByName(nombreHoja);

    if (!hoja) {
      hoja = ss.insertSheet(nombreHoja);
      mensajes.push('Creada la hoja "' + nombreHoja + '".');
    } else {
      mensajes.push('Ya existia la hoja "' + nombreHoja + '".');
    }

    // Escribir/asegurar los encabezados en la fila 1.
    hoja.getRange(1, 1, 1, conf.headers.length).setValues([conf.headers]);
    hoja.setFrozenRows(1);

    // Blindar las columnas de fecha como TEXTO PLANO, para que Google Sheets
    // NO auto-convierta "2026-06-03" en un objeto Date con hora (lo que rompia
    // el round-trip y vaciaba los <input type="date"> al editar).
    formatearColumnasDeFechaComoTexto(hoja, conf.headers);
  });

  // 2) Borrar la hoja por defecto si quedo vacia y sin uso.
  ['Hoja 1', 'Sheet1', 'Hoja1'].forEach(function (nombreDefault) {
    const h = ss.getSheetByName(nombreDefault);
    // Solo la borramos si no es una de nuestras pestanas y si esta vacia.
    if (h && !TABS[nombreDefault] && h.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(h);
      mensajes.push('Borrada la hoja vacia por defecto "' + nombreDefault + '".');
    }
  });

  // 3) Inicializar la contrasena de admin si todavia no existe.
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('ADMIN_PASS')) {
    props.setProperty('ADMIN_PASS', 'cambia-esta-clave');
    mensajes.push('Se creo ADMIN_PASS con valor temporal "cambia-esta-clave". CAMBIALA YA desde Configuracion del proyecto > Propiedades del script.');
  } else {
    mensajes.push('ADMIN_PASS ya estaba configurada (no se toco).');
  }

  return mensajes.join('\n');
}

// --- formatearColumnasDeFechaComoTexto: blinda columnas de fecha -----------
//  Pone en formato de TEXTO PLANO ("@") las columnas que guardan fechas, para
//  que el Sheet no las convierta en Date con hora. Asi conservamos siempre
//  "yyyy-MM-dd" tal cual lo manda el front.
function formatearColumnasDeFechaComoTexto(hoja, headers) {
  const columnasFecha = ['fechaInicio', 'fechaSalida', 'fechaProgramada', 'fechaRecibida', 'fecha'];
  const maxFilas = Math.max(hoja.getMaxRows() - 1, 1); // todas menos el encabezado
  headers.forEach(function (col, idx) {
    if (columnasFecha.indexOf(col) !== -1) {
      hoja.getRange(2, idx + 1, maxFilas, 1).setNumberFormat('@');
    }
  });
}

// ---------------------------------------------------------------------------
//  HELPER — generar una clave aleatoria para inversionistas
// ---------------------------------------------------------------------------
//  Genera una clave legible y dificil de adivinar (sin caracteres confusos
//  como 0/O o 1/l). Subimos la longitud a 15 caracteres (alfabeto de 31) para
//  resistir intentos de fuerza bruta, ya que es la unica barrera del
//  inversionista. La puedes usar desde el editor o el front la genera solo.
function generarClaveInversionista() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin O, 0, I, 1, l
  let clave = '';
  for (let i = 0; i < 15; i++) {
    clave += abc.charAt(Math.floor(Math.random() * abc.length));
  }
  // Formato agrupado para que sea facil de dictar: ABCDE-FGHJK-LMNPQ
  return clave.slice(0, 5) + '-' + clave.slice(5, 10) + '-' + clave.slice(10);
}

// ---------------------------------------------------------------------------
//  AUTORIZAR CORREO — correr UNA vez desde el editor
// ---------------------------------------------------------------------------
//  Corre esta funcion una sola vez para autorizar el envio de correos
//  (Google te pedira un permiso nuevo la primera vez). Te llega un correo de
//  prueba a ti mismo. Asi la recuperacion de clave podra enviar correos a los
//  inversionistas.
function autorizarCorreo() {
  const correo = Session.getActiveUser().getEmail();
  MailApp.sendEmail(correo, 'Prueba de correo - Co-desarrolladores-Yod',
    'Listo: el portal ya puede enviar correos (para la recuperacion de clave). Este es solo un correo de prueba.');
  return 'Correo de prueba enviado a ' + correo;
}

// ---------------------------------------------------------------------------
//  doGet — prueba de vida (abrir la URL del Web App en el navegador)
// ---------------------------------------------------------------------------
//  Si abres la URL del despliegue en el navegador, deberias ver {"ok":true}.
function doGet(e) {
  return jsonResponse({ ok: true, service: 'Co-desarrolladores-Yod', ts: Date.now() });
}

// ---------------------------------------------------------------------------
//  doPost — la puerta principal del API
// ---------------------------------------------------------------------------
//  El frontend manda aqui todas las peticiones, como texto JSON en el cuerpo.
//  Leemos la "action" y decidimos que hacer. Todo va envuelto en un try/catch
//  para que cualquier error se devuelva como JSON y no rompa el front.
function doPost(e) {
  try {
    // Leer y parsear el cuerpo de la peticion (texto JSON).
    let body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    const action = body.action || '';

    switch (action) {
      // --- Publicas (no requieren credencial) ---
      case 'ping':
        return jsonResponse({ ok: true, service: 'Co-desarrolladores-Yod', ts: Date.now() });

      case 'adminLogin':
        return adminLogin(body);

      case 'loginConToken':
        return loginConToken(body);

      // --- Solo admin (validan ADMIN_PASS) ---
      case 'getAll':
        return getAll(body);

      case 'save':
        return save(body);

      case 'delete':
        return remove(body);

      case 'notificarAvance':
        return notificarAvance(body);

      case 'generarLinkAcceso':
        return generarLinkAcceso(body);

      // --- Inversionista (validan claveAcceso) ---
      case 'investorLogin':
        return investorLogin(body);

      case 'getMine':
        return getMine(body);

      case 'reportarPago':
        return reportarPago(body);

      case 'recuperarClave':
        return recuperarClave(body);

      case 'subirArchivo':
        return subirArchivo(body);

      default:
        return jsonResponse({ ok: false, error: 'Accion no reconocida: ' + action });
    }
  } catch (err) {
    // Registramos el error REAL solo del lado servidor (para depurar), pero
    // al cliente publico le devolvemos un mensaje generico, para no filtrar
    // detalles internos (nombres de hoja, permisos, limites de cuota, etc.).
    console.error('Error en doPost: ' + String(err && err.stack ? err.stack : err));
    return jsonResponse({ ok: false, error: 'Ocurrio un error procesando la solicitud.' });
  }
}

// ===========================================================================
//  ACCIONES DEL API
// ===========================================================================

// --- adminLogin: verifica la contrasena de admin ---------------------------
//  Compara la contrasena que tecleo el usuario contra la guardada en las
//  Propiedades del Script. Mensaje generico si falla (no decimos por que).
function adminLogin(body) {
  if (!esAdmin(body.pass)) {
    return jsonResponse({ ok: false, error: 'Credenciales invalidas' });
  }
  return jsonResponse({ ok: true, role: 'admin' });
}

// --- getAll: devuelve TODAS las filas de TODAS las hojas (solo admin) -------
function getAll(body) {
  if (!esAdmin(body.pass)) {
    return jsonResponse({ ok: false, error: 'Credenciales invalidas' });
  }
  const data = {};
  Object.keys(TABS).forEach(function (nombreHoja) {
    data[nombreHoja] = leerHoja(nombreHoja);
  });
  return jsonResponse({ ok: true, data: data });
}

// --- save: alta o edicion (upsert) por la columna llave (solo admin) -------
//  Si la fila trae llave y ya existe, la reemplaza (updated=true).
//  Si no trae llave, la genera (o exige folio en Inversiones) e inserta
//  (updated=false). Tambien rellena 'creado' si falta.
function save(body) {
  if (!esAdmin(body.pass)) {
    return jsonResponse({ ok: false, error: 'Credenciales invalidas' });
  }

  const tab = body.tab;
  const conf = TABS[tab];
  if (!conf) {
    return jsonResponse({ ok: false, error: 'Pestana invalida: ' + String(tab) });
  }

  // La fila que llega del front (objeto {columna: valor}).
  const row = body.row || {};
  const keyField = conf.keyField;
  let key = row[keyField];

  // Si no viene la llave, la generamos.
  if (key === undefined || key === null || String(key).trim() === '') {
    if (tab === 'Inversiones') {
      // El folio es obligatorio y legible (ej. CA-HM-2026-01); no se inventa.
      return jsonResponse({ ok: false, error: 'El folio es obligatorio para crear una inversion.' });
    }
    key = conf.prefix + nuevoId();
    row[keyField] = key;
  } else {
    key = String(key).trim();
    row[keyField] = key;
  }

  const hoja = obtenerHojaConEncabezados(tab);
  const headers = conf.headers;

  // Buscar si ya existe una fila con esa llave.
  const indiceFila = buscarFilaPorLlave(hoja, headers, keyField, key);

  // Validar unicidad de la claveAcceso en Inversionistas: dos inversionistas
  // con la MISMA clave provocarian suplantacion silenciosa (el segundo veria
  // los datos del primero). Si la clave ya la usa OTRO inversionista, no
  // dejamos guardar.
  if (tab === 'Inversionistas') {
    const claveNueva = row.claveAcceso !== undefined && row.claveAcceso !== null ? String(row.claveAcceso).trim() : '';
    if (claveNueva !== '') {
      const inversionistas = leerHoja('Inversionistas');
      const chocada = inversionistas.some(function (otro) {
        return String(otro.claveAcceso).trim() === claveNueva && String(otro.id).trim() !== key;
      });
      if (chocada) {
        return jsonResponse({ ok: false, error: 'Esa clave de acceso ya esta en uso, genera otra.' });
      }
    }
  }

  // Si no trae fecha de creacion, se la ponemos ahora (ISO).
  if (!row.creado || String(row.creado).trim() === '') {
    row.creado = new Date().toISOString();
  }

  // Armar el arreglo de valores en el ORDEN de los encabezados, SANITIZANDO
  // cada texto para evitar inyeccion de formulas (CSV/Formula Injection):
  // un valor que empiece con = + - @ se interpretaria como formula viva en
  // la celda (ej. =HYPERLINK / =IMPORTRANGE) y podria filtrar datos.
  const valores = headers.map(function (col) {
    const v = (row[col] !== undefined && row[col] !== null) ? row[col] : '';
    return sanitizarValor(v);
  });

  let updated;
  if (indiceFila > 0) {
    // Reemplazar la fila existente.
    hoja.getRange(indiceFila, 1, 1, headers.length).setValues([valores]);
    updated = true;
  } else {
    // Insertar una fila nueva al final.
    hoja.appendRow(valores);
    updated = false;
  }

  return jsonResponse({ ok: true, key: key, updated: updated });
}

// --- delete: borra la fila por su llave (solo admin, idempotente) ----------
//  Se llama remove() internamente porque "delete" es palabra reservada.
function remove(body) {
  if (!esAdmin(body.pass)) {
    return jsonResponse({ ok: false, error: 'Credenciales invalidas' });
  }

  const tab = body.tab;
  const conf = TABS[tab];
  if (!conf) {
    return jsonResponse({ ok: false, error: 'Pestana invalida: ' + String(tab) });
  }

  const key = body.key !== undefined && body.key !== null ? String(body.key).trim() : '';
  const hoja = obtenerHojaConEncabezados(tab);
  const indiceFila = buscarFilaPorLlave(hoja, conf.headers, conf.keyField, key);

  if (indiceFila > 0) {
    hoja.deleteRow(indiceFila);
  }
  // Idempotente: aunque no exista, decimos ok.
  return jsonResponse({ ok: true });
}

// --- investorLogin: el inversionista entra con su claveAcceso ---------------
//  Busca la fila cuya claveAcceso coincida (exacta, sin espacios). Si existe,
//  devuelve su id y nombre. NUNCA devuelve la clave ni datos de contacto.
//  Antes de buscar, aplicamos un limite de intentos global (anti fuerza
//  bruta), ya que esta accion es publica y la URL del endpoint es conocida.
function investorLogin(body) {
  if (demasiadosIntentos()) {
    return jsonResponse({ ok: false, error: 'Demasiados intentos, espera un momento e intenta de nuevo.' });
  }

  const inv = buscarInversionistaPorClave(body.clave);
  if (!inv) {
    registrarIntentoFallido();
    return jsonResponse({ ok: false, error: 'Clave invalida' });
  }
  return jsonResponse({
    ok: true,
    role: 'investor',
    inversionistaId: inv.id,
    nombre: inv.nombre
  });
}

// --- getMine: el inversionista ve SOLO sus datos ---------------------------
//  Re-valida la clave para obtener su id, y arma un paquete con:
//    - sus datos basicos (sin claveAcceso ni notas internas),
//    - sus inversiones, las aportaciones de esas inversiones,
//    - sus documentos, y los proyectos (con cuenta de deposito) ligados.
function getMine(body) {
  if (demasiadosIntentos()) {
    return jsonResponse({ ok: false, error: 'Demasiados intentos, espera un momento e intenta de nuevo.' });
  }

  const inv = buscarInversionistaPorClave(body.clave);
  if (!inv) {
    registrarIntentoFallido();
    return jsonResponse({ ok: false, error: 'Clave invalida' });
  }
  const miId = String(inv.id).trim();

  // 1) Datos basicos del inversionista (filtrados: sin clave ni notas).
  const inversionista = {
    id: inv.id,
    nombre: inv.nombre,
    email: inv.email,
    telefono: inv.telefono
  };

  // 2) Sus inversiones (las que apuntan a su inversionistaId).
  const todasInversiones = leerHoja('Inversiones');
  const misInversiones = todasInversiones.filter(function (i) {
    return String(i.inversionistaId).trim() === miId;
  });

  // Conjunto de folios y de proyectos referenciados por SUS inversiones.
  const misFolios = {};
  const misProyectoIds = {};
  misInversiones.forEach(function (i) {
    if (i.folio) misFolios[String(i.folio).trim()] = true;
    if (i.proyectoId) misProyectoIds[String(i.proyectoId).trim()] = true;
  });

  // 3) Aportaciones SOLO de esos folios.
  const todasAportaciones = leerHoja('Aportaciones');
  const misAportaciones = todasAportaciones.filter(function (a) {
    return misFolios[String(a.folio).trim()] === true;
  });

  // 4) Documentos SOLO de esos folios.
  const todosDocumentos = leerHoja('Documentos');
  const misDocumentos = todosDocumentos.filter(function (d) {
    return misFolios[String(d.folio).trim()] === true;
  });

  // 5) Proyectos SOLO los referenciados por sus inversiones (con cuenta).
  const todosProyectos = leerHoja('Proyectos');
  const misProyectos = todosProyectos.filter(function (p) {
    return misProyectoIds[String(p.id).trim()] === true;
  });

  // 6) Avances (fotos/videos) y bitacora (seguimiento del asesor): ahora viven
  //    a nivel PROYECTO, asi que se filtran por los proyectoId del codesarrollador.
  const misAvances = leerHoja('Avances').filter(function (a) {
    return misProyectoIds[String(a.proyectoId).trim()] === true;
  });
  const miBitacora = leerHoja('Bitacora').filter(function (b) {
    return misProyectoIds[String(b.proyectoId).trim()] === true;
  });

  return jsonResponse({
    ok: true,
    data: {
      inversionista: inversionista,
      inversiones: misInversiones,
      aportaciones: misAportaciones,
      documentos: misDocumentos,
      proyectos: misProyectos,
      avances: misAvances,
      bitacora: miBitacora
    }
  });
}

// --- reportarPago: el inversionista avisa que ya deposito ------------------
//  Guarda referencia y/o comprobante y deja el pago en "En aprobacion".
//  NO marca "Recibida" (eso solo lo hace el admin). Seguridad: solo permite
//  reportar un pago cuyo folio pertenezca a UNA de SUS inversiones.
function reportarPago(body) {
  if (demasiadosIntentos()) {
    return jsonResponse({ ok: false, error: 'Demasiados intentos, espera un momento e intenta de nuevo.' });
  }
  const inv = buscarInversionistaPorClave(body.clave);
  if (!inv) {
    registrarIntentoFallido();
    return jsonResponse({ ok: false, error: 'Clave invalida' });
  }
  const miId = String(inv.id).trim();

  const apId = (body.id !== undefined && body.id !== null) ? String(body.id).trim() : '';
  if (!apId) {
    return jsonResponse({ ok: false, error: 'Falta el identificador de la aportacion.' });
  }

  // Folios que le pertenecen a este inversionista.
  const misFolios = {};
  leerHoja('Inversiones').forEach(function (i) {
    if (String(i.inversionistaId).trim() === miId && i.folio) {
      misFolios[String(i.folio).trim()] = true;
    }
  });

  // Buscar la aportacion y validar que sea de uno de SUS folios.
  const aportaciones = leerHoja('Aportaciones');
  let ap = null;
  for (let k = 0; k < aportaciones.length; k++) {
    if (String(aportaciones[k].id).trim() === apId) { ap = aportaciones[k]; break; }
  }
  if (!ap || misFolios[String(ap.folio).trim()] !== true) {
    return jsonResponse({ ok: false, error: 'No autorizado para reportar este pago.' });
  }

  // Aplicar el reporte (sin tocar fechaRecibida; eso lo confirma el admin).
  if (body.referencia !== undefined) ap.referencia = String(body.referencia);
  if (body.comprobanteUrl !== undefined && String(body.comprobanteUrl).trim() !== '') {
    ap.comprobanteUrl = String(body.comprobanteUrl);
  }
  ap.fechaReporte = new Date().toISOString().slice(0, 10);

  const conf = TABS['Aportaciones'];
  const hoja = obtenerHojaConEncabezados('Aportaciones');
  const indiceFila = buscarFilaPorLlave(hoja, conf.headers, conf.keyField, apId);
  if (indiceFila <= 0) {
    return jsonResponse({ ok: false, error: 'No se encontro la aportacion.' });
  }
  const valores = conf.headers.map(function (col) {
    const v = (ap[col] !== undefined && ap[col] !== null) ? ap[col] : '';
    return sanitizarValor(v);
  });
  hoja.getRange(indiceFila, 1, 1, conf.headers.length).setValues([valores]);

  return jsonResponse({ ok: true });
}

// --- recuperarClave: el inversionista pide su acceso por correo ------------
//  Recibe un email. Si coincide con un inversionista registrado, le GENERA una
//  clave NUEVA (rota la anterior), la guarda y se la envia por correo (gratis,
//  con MailApp). Por privacidad, SIEMPRE responde igual (mensaje generico),
//  exista o no el correo, y NUNCA devuelve la clave en la respuesta: solo va
//  al correo registrado.
function recuperarClave(body) {
  if (demasiadosIntentos()) {
    return jsonResponse({ ok: false, error: 'Demasiados intentos, espera un momento e intenta de nuevo.' });
  }
  const generico = { ok: true, msg: 'Si tu correo esta registrado, te enviamos tu acceso. Revisa tu bandeja (y spam).' };

  const email = (body.email !== undefined && body.email !== null) ? String(body.email).trim().toLowerCase() : '';
  if (email === '') return jsonResponse(generico);

  // Buscar inversionista por email (exacto, sin distinguir mayusculas).
  const inversionistas = leerHoja('Inversionistas');
  let inv = null;
  for (let i = 0; i < inversionistas.length; i++) {
    if (String(inversionistas[i].email).trim().toLowerCase() === email) { inv = inversionistas[i]; break; }
  }
  if (!inv) {
    registrarIntentoFallido();
    return jsonResponse(generico); // no revelamos que no existe
  }

  // Generar clave nueva y guardarla en su fila (rota la anterior).
  const nuevaClave = generarClaveInversionista();
  inv.claveAcceso = nuevaClave;
  const conf = TABS['Inversionistas'];
  const hoja = obtenerHojaConEncabezados('Inversionistas');
  const indiceFila = buscarFilaPorLlave(hoja, conf.headers, conf.keyField, String(inv.id).trim());
  if (indiceFila <= 0) return jsonResponse(generico);
  const valores = conf.headers.map(function (col) {
    const v = (inv[col] !== undefined && inv[col] !== null) ? inv[col] : '';
    return sanitizarValor(v);
  });
  hoja.getRange(indiceFila, 1, 1, conf.headers.length).setValues([valores]);

  // Enviar el correo con la clave nueva.
  const portalUrl = PORTAL_URL;
  const nombre = inv.nombre ? String(inv.nombre) : 'Codesarrollador';
  const asunto = 'Tu acceso al portal de YoDesarrollo';
  const cuerpo =
    'Hola ' + nombre + ',\n\n' +
    'Aqui esta tu clave de acceso al portal de Co-desarrolladores de YoDesarrollo:\n\n' +
    '    ' + nuevaClave + '\n\n' +
    'Entra aqui y elige "Soy Codesarrollador": ' + portalUrl + '\n\n' +
    'Por seguridad, esta clave reemplaza cualquier clave anterior que tuvieras.\n\n' +
    'YoDesarrollo SAPI de C.V.';
  try {
    MailApp.sendEmail(String(inv.email).trim(), asunto, cuerpo);
  } catch (e) {
    console.error('Error enviando correo de recuperacion: ' + String(e));
  }
  return jsonResponse(generico);
}

// --- notificarAvance: avisa por correo a los codesarrolladores -------------
//  Solo admin. Recibe un proyectoId (y opcionalmente un mensaje). Junta los
//  correos UNICOS de los codesarrolladores de ese proyecto (inversiones con
//  ese proyectoId -> inversionistas -> emails) y les manda un correo avisando
//  que hay un nuevo avance, con el link al portal. Es OPT-IN: solo se manda
//  cuando el admin aprieta el boton, no automatico (para no spamear).
//  Devuelve { ok, enviados:n }.
function notificarAvance(body) {
  if (!esAdmin(body.pass)) {
    return jsonResponse({ ok: false, error: 'Credenciales invalidas' });
  }

  const proyectoId = (body.proyectoId !== undefined && body.proyectoId !== null) ? String(body.proyectoId).trim() : '';
  if (proyectoId === '') return jsonResponse({ ok: false, error: 'Falta el proyecto.' });

  // Buscar el proyecto para usar su nombre en el correo.
  const proyectos = leerHoja('Proyectos');
  let proyecto = null;
  for (let i = 0; i < proyectos.length; i++) {
    if (String(proyectos[i].id).trim() === proyectoId) { proyecto = proyectos[i]; break; }
  }
  if (!proyecto) return jsonResponse({ ok: false, error: 'Proyecto no encontrado' });
  const nombreProyecto = proyecto.nombre ? String(proyecto.nombre) : 'tu proyecto';

  // Inversionistas que aportan a este proyecto (via la hoja Inversiones).
  const inversiones = leerHoja('Inversiones');
  const idsCodes = {};
  for (let i = 0; i < inversiones.length; i++) {
    if (String(inversiones[i].proyectoId).trim() === proyectoId) {
      idsCodes[String(inversiones[i].inversionistaId).trim()] = true;
    }
  }

  // Resolver emails unicos de esos inversionistas.
  const inversionistas = leerHoja('Inversionistas');
  const emails = {};
  for (let i = 0; i < inversionistas.length; i++) {
    const id = String(inversionistas[i].id).trim();
    if (!idsCodes[id]) continue;
    const email = String(inversionistas[i].email || '').trim();
    if (email !== '') emails[email.toLowerCase()] = email;
  }

  // Armar y mandar el correo a cada email (uno por uno, sin abortar si falla).
  const asunto = 'Nuevo avance en ' + nombreProyecto;
  const cuerpo = (body.mensaje !== undefined && body.mensaje !== null && String(body.mensaje).trim() !== '')
    ? String(body.mensaje)
    : ('Hay un nuevo avance en tu proyecto ' + nombreProyecto + '. Entra a verlo: ' + PORTAL_URL);

  let enviados = 0;
  const claves = Object.keys(emails);
  for (let i = 0; i < claves.length; i++) {
    try {
      MailApp.sendEmail(emails[claves[i]], asunto, cuerpo);
      enviados++;
    } catch (e) {
      console.error('notificarAvance: error enviando a ' + emails[claves[i]] + ': ' + String(e));
    }
  }

  return jsonResponse({ ok: true, enviados: enviados });
}

// --- generarLinkAcceso: crea un "link magico" de acceso sin teclear clave ---
//  Solo admin. Recibe un inversionistaId, genera un token aleatorio con
//  expiracion (7 dias) y lo guarda en PropertiesService (NO toca el Sheet):
//    'tok_'+token = JSON { inversionistaId, exp }
//  Devuelve la URL del portal con el token en el query (?t=...). El admin se la
//  envia al cliente; al abrirla, el front canjea el token y entra solo.
function generarLinkAcceso(body) {
  if (!esAdmin(body.pass)) {
    return jsonResponse({ ok: false, error: 'Credenciales invalidas' });
  }

  const inversionistaId = (body.inversionistaId !== undefined && body.inversionistaId !== null)
    ? String(body.inversionistaId).trim()
    : '';
  if (inversionistaId === '') return jsonResponse({ ok: false, error: 'Falta el codesarrollador.' });

  // Validar que el inversionista exista (no generamos links a fantasmas).
  const inversionistas = leerHoja('Inversionistas');
  let existe = false;
  for (let i = 0; i < inversionistas.length; i++) {
    if (String(inversionistas[i].id).trim() === inversionistaId) { existe = true; break; }
  }
  if (!existe) return jsonResponse({ ok: false, error: 'Codesarrollador no encontrado' });

  // Token aleatorio robusto (UUID) + expiracion a 7 dias.
  const token = Utilities.getUuid();
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000;
  PropertiesService.getScriptProperties()
    .setProperty('tok_' + token, JSON.stringify({ inversionistaId: inversionistaId, exp: exp }));

  return jsonResponse({ ok: true, url: PORTAL_URL + '?t=' + token });
}

// --- loginConToken: canjea un "link magico" por la clave del inversionista --
//  Publica (el usuario aun no tiene sesion). Recibe el token del query (?t=),
//  valida que exista y no este vencido en PropertiesService, busca al
//  inversionista y devuelve su claveAcceso para que el front la use como sesion
//  normal de inversionista (igual que investorLogin, pero sin teclear). El
//  token sigue valido hasta su expiracion para tolerar recargas del navegador.
function loginConToken(body) {
  if (demasiadosIntentos()) {
    return jsonResponse({ ok: false, error: 'Demasiados intentos, espera un momento e intenta de nuevo.' });
  }

  const token = (body.token !== undefined && body.token !== null) ? String(body.token).trim() : '';
  if (token === '') {
    registrarIntentoFallido();
    return jsonResponse({ ok: false, error: 'Enlace invalido o vencido' });
  }

  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('tok_' + token);
  if (!raw) {
    registrarIntentoFallido();
    return jsonResponse({ ok: false, error: 'Enlace invalido o vencido' });
  }

  let datos = null;
  try {
    datos = JSON.parse(raw);
  } catch (e) {
    props.deleteProperty('tok_' + token);
    return jsonResponse({ ok: false, error: 'Enlace invalido o vencido' });
  }

  if (!datos || !datos.exp || Date.now() > Number(datos.exp)) {
    props.deleteProperty('tok_' + token); // limpiamos el token vencido
    return jsonResponse({ ok: false, error: 'Enlace vencido' });
  }

  // Buscar al inversionista para devolver su clave de acceso vigente.
  const inversionistaId = String(datos.inversionistaId).trim();
  const inversionistas = leerHoja('Inversionistas');
  let inv = null;
  for (let i = 0; i < inversionistas.length; i++) {
    if (String(inversionistas[i].id).trim() === inversionistaId) { inv = inversionistas[i]; break; }
  }
  if (!inv) {
    props.deleteProperty('tok_' + token);
    return jsonResponse({ ok: false, error: 'Enlace invalido o vencido' });
  }

  return jsonResponse({ ok: true, clave: inv.claveAcceso });
}

// --- subirArchivo: sube un archivo (foto/comprobante) a Drive --------------
//  Recibe el archivo en base64 y lo guarda en una carpeta de Drive del
//  proyecto, con permiso "cualquiera con el enlace puede ver", y devuelve la
//  URL. Lo puede usar el admin (pass) o un inversionista (clave). Asi el front
//  solo guarda la URL en la celda, manteniendo el mismo sistema de enlaces.
function subirArchivo(body) {
  // Autorizacion: admin O inversionista valido.
  let autorizado = esAdmin(body.pass);
  if (!autorizado) {
    if (demasiadosIntentos()) {
      return jsonResponse({ ok: false, error: 'Demasiados intentos, espera un momento e intenta de nuevo.' });
    }
    const inv = buscarInversionistaPorClave(body.clave);
    if (!inv) { registrarIntentoFallido(); return jsonResponse({ ok: false, error: 'No autorizado' }); }
    autorizado = true;
  }

  const b64 = body.base64 || '';
  if (!b64) return jsonResponse({ ok: false, error: 'No llego ningun archivo.' });
  // Limite ~10 MB (base64 ocupa ~4/3 de los bytes reales).
  if (b64.length > 14000000) return jsonResponse({ ok: false, error: 'El archivo es muy grande (max ~10 MB). Usa una foto mas ligera.' });

  const nombre = String(body.filename || 'archivo').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
  const mime = body.mime || 'application/octet-stream';

  try {
    const bytes = Utilities.base64Decode(b64);
    const blob = Utilities.newBlob(bytes, mime, nombre);
    const carpeta = obtenerCarpetaArchivos();
    const archivo = carpeta.createFile(blob);
    archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return jsonResponse({ ok: true, url: archivo.getUrl(), id: archivo.getId() });
  } catch (e) {
    console.error('subirArchivo: ' + String(e));
    return jsonResponse({ ok: false, error: 'No se pudo subir el archivo.' });
  }
}

// --- obtenerCarpetaArchivos: carpeta de Drive donde viven los archivos ------
function obtenerCarpetaArchivos() {
  const nombre = 'Co-desarrolladores-Yod - Archivos';
  const it = DriveApp.getFoldersByName(nombre);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(nombre);
}

// --- autorizarDrive: correr UNA vez desde el editor para autorizar Drive ----
//  Crea (si no existe) la carpeta de archivos. Google pedira el permiso nuevo
//  de Drive la primera vez. Despues, la subida de fotos/comprobantes ya jala.
function autorizarDrive() {
  const c = obtenerCarpetaArchivos();
  return 'Carpeta lista: ' + c.getName() + ' (' + c.getId() + ')';
}

// ===========================================================================
//  FUNCIONES DE APOYO (helpers internos)
// ===========================================================================

// --- esAdmin: compara la contrasena recibida contra ADMIN_PASS -------------
//  Usa comparacion de tiempo constante para no filtrar informacion por el
//  tiempo de respuesta (timing attack).
function esAdmin(pass) {
  const guardada = PropertiesService.getScriptProperties().getProperty('ADMIN_PASS');
  if (!guardada) return false; // si no esta configurada, nadie entra como admin
  return comparacionConstante(String(pass), String(guardada));
}

// --- comparacionConstante: compara dos textos en tiempo constante ----------
//  Recorre SIEMPRE el mismo numero de caracteres, sin cortar antes al primer
//  desajuste, para que el tiempo de respuesta no revele cuanto coincidio.
function comparacionConstante(a, b) {
  const sa = String(a);
  const sb = String(b);
  const len = Math.max(sa.length, sb.length);
  let diff = sa.length === sb.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    const ca = i < sa.length ? sa.charCodeAt(i) : 0;
    const cb = i < sb.length ? sb.charCodeAt(i) : 0;
    diff |= (ca ^ cb);
  }
  return diff === 0;
}

// --- demasiadosIntentos / registrarIntentoFallido: anti fuerza bruta -------
//  Como Apps Script no expone la IP del cliente, llevamos un contador GLOBAL
//  de intentos fallidos de clave de inversionista dentro de una ventana de
//  tiempo, usando CacheService. Si se exceden, bloqueamos temporalmente los
//  intentos. Es una barrera basica (no perfecta) pero encarece la fuerza
//  bruta sobre la claveAcceso, que es la unica credencial del inversionista.
const MAX_INTENTOS = 20;          // intentos fallidos permitidos por ventana
const VENTANA_SEGUNDOS = 300;     // ventana de 5 minutos

function demasiadosIntentos() {
  const cache = CacheService.getScriptCache();
  const n = parseInt(cache.get('intentos_login_inv') || '0', 10);
  return n >= MAX_INTENTOS;
}

function registrarIntentoFallido() {
  const cache = CacheService.getScriptCache();
  const n = parseInt(cache.get('intentos_login_inv') || '0', 10) + 1;
  cache.put('intentos_login_inv', String(n), VENTANA_SEGUNDOS);
}

// --- buscarInversionistaPorClave: encuentra al inversionista por su clave --
//  Compara la claveAcceso de forma exacta (recortando espacios). Devuelve el
//  objeto de la fila completa (incluye la clave) SOLO para uso interno;
//  las funciones que responden al inversionista filtran lo que exponen.
function buscarInversionistaPorClave(clave) {
  const claveLimpia = clave !== undefined && clave !== null ? String(clave).trim() : '';
  if (claveLimpia === '') return null;

  const inversionistas = leerHoja('Inversionistas');
  for (let i = 0; i < inversionistas.length; i++) {
    const fila = inversionistas[i];
    if (String(fila.claveAcceso).trim() === claveLimpia) {
      return fila;
    }
  }
  return null;
}

// --- leerHoja: lee toda una hoja como arreglo de objetos {columna: valor} --
//  Usa la fila 1 como encabezados. Salta filas totalmente vacias.
function leerHoja(nombreHoja) {
  const hoja = obtenerHojaConEncabezados(nombreHoja);
  const ultimaFila = hoja.getLastRow();
  const ultimaCol = hoja.getLastColumn();

  // Si solo hay encabezados (o nada), devolvemos arreglo vacio.
  if (ultimaFila < 2 || ultimaCol < 1) return [];

  const rango = hoja.getRange(1, 1, ultimaFila, ultimaCol).getValues();
  const headers = rango[0];
  const filas = [];

  for (let r = 1; r < rango.length; r++) {
    const fila = rango[r];
    // Saltar filas completamente vacias.
    const vacia = fila.every(function (c) { return c === '' || c === null; });
    if (vacia) continue;

    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      const nombreCol = headers[c];
      if (nombreCol === '' || nombreCol === null) continue;
      obj[nombreCol] = normalizarValor(fila[c]);
    }
    filas.push(obj);
  }
  return filas;
}

// --- normalizarValor: deja todo "limpio" para el front ---------------------
//  Las fechas que el Sheet haya guardado como objeto Date las devolvemos como
//  texto "yyyy-MM-dd" (SOLO fecha, sin hora) en la zona horaria del negocio.
//  Esto es clave: el front las mete directo en <input type="date">, que solo
//  acepta "yyyy-MM-dd"; si devolvieramos un ISO con hora, el campo se veria
//  VACIO al editar y la fecha se borraria al guardar.
function normalizarValor(valor) {
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, TZ, 'yyyy-MM-dd');
  }
  return valor;
}

// --- sanitizarValor: previene inyeccion de formulas en el Sheet ------------
//  Si un texto empieza con = + - @ (o un par de caracteres que Sheets tambien
//  trata como inicio de formula), le anteponemos un apostrofe para que la
//  celda lo guarde como TEXTO y nunca lo ejecute como formula viva.
function sanitizarValor(v) {
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) {
    return "'" + v;
  }
  return v;
}

// --- obtenerHojaConEncabezados: trae la hoja y la crea si no existe --------
//  Si la hoja no existe (por si setup() no se corrio), la crea con sus
//  encabezados para no romper. Asi save() funciona "en caliente".
function obtenerHojaConEncabezados(nombreHoja) {
  const conf = TABS[nombreHoja];
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let hoja = ss.getSheetByName(nombreHoja);

  if (!hoja) {
    hoja = ss.insertSheet(nombreHoja);
    if (conf) {
      hoja.getRange(1, 1, 1, conf.headers.length).setValues([conf.headers]);
      hoja.setFrozenRows(1);
      formatearColumnasDeFechaComoTexto(hoja, conf.headers);
    }
    return hoja;
  }

  // Si la hoja existe pero esta vacia (sin encabezados), los escribimos.
  if (conf && hoja.getLastRow() === 0) {
    hoja.getRange(1, 1, 1, conf.headers.length).setValues([conf.headers]);
    hoja.setFrozenRows(1);
    formatearColumnasDeFechaComoTexto(hoja, conf.headers);
  }
  return hoja;
}

// --- buscarFilaPorLlave: devuelve el numero de fila (1-based) o -1 ---------
//  Recorre la columna llave buscando una coincidencia exacta (como texto).
function buscarFilaPorLlave(hoja, headers, keyField, key) {
  const colLlave = headers.indexOf(keyField); // 0-based dentro de headers
  if (colLlave < 0) return -1;

  const ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) return -1; // solo encabezados o vacia

  const valores = hoja.getRange(2, colLlave + 1, ultimaFila - 1, 1).getValues();
  const objetivo = String(key).trim();

  for (let i = 0; i < valores.length; i++) {
    const v = valores[i][0];
    if (v !== '' && v !== null && String(v).trim() === objetivo) {
      return i + 2; // +2 porque empezamos en la fila 2 (1-based)
    }
  }
  return -1;
}

// --- nuevoId: genera un identificador unico (timestamp + aleatorio) --------
//  Combina la marca de tiempo con un pedacito aleatorio para evitar choques
//  si se crean dos registros en el mismo milisegundo.
function nuevoId() {
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 1e6).toString(36);
  return t + r;
}

// --- jsonResponse: arma la respuesta SIEMPRE como JSON ---------------------
//  Usamos ContentService (lo unico permitido en Apps Script para esto).
//  NO se usan encabezados HTTP manuales: Apps Script no lo permite aqui.
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
