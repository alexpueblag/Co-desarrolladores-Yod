# Co-desarrolladores-Yod — *Portal de inversionistas de YoDesarrollo*

Lee este archivo completo antes de tocar nada.

Escrito el 2026-09-04. Todo lo que aquí se afirma trae su prueba entre paréntesis (commit, archivo:línea, código HTTP o nombre de memoria). Lo que no se pudo verificar está hasta abajo, en **Por confirmar** — no lo des por cierto.

## Qué es

Portal privado donde cada **codesarrollador** (inversionista de YoDesarrollo SAPI de C.V.) ve **su** inversión: aportaciones programadas y pagadas, estado de cuenta en PDF, plusvalía por etapa, avance de obra, documentos y bitácora del proyecto. Del otro lado, Alejandro entra como **admin** y captura todo. Hay un tercer rol, **asesor**, que solo publica avances y bitácora de los proyectos que trae asignados y nunca ve dinero (`apps_script/Código.js:100-105`).

- **App:** React + Vite + Tailwind, con PWA (`package.json`, `vite.config.js`).
- **Dirección en vivo:** `https://yodesarrollomx.github.io/Co-desarrolladores-Yod/` → **HTTP 200** (curl 2026-09-04).
- **Casa vieja:** `https://alexpueblag.github.io/Co-desarrolladores-Yod/` → **HTTP 200**, pero ya es **cascarón**: su HTML es un `<meta http-equiv="refresh">` a la dirección nueva (curl 2026-09-04). No lo borres: hay QRs y correos viejos apuntando ahí.
- **Dominio propio:** `https://tableros.yodesarrollo.mx/Co-desarrolladores-Yod/` → **no resuelve** (curl 2026-09-04, código `000`). Todavía no existe en el DNS.
- **Backend:** Apps Script publicado como Web App. `GET /exec` responde `{"ok":true,"service":"Co-desarrolladores-Yod"}` — **HTTP 200** (curl 2026-09-04).

## Reglas INVIOLABLES

1. **Nunca hagas `clasp push` del `apps_script/Código.js` de este repo sin un `clasp pull` antes.** El repo va ATRÁS del script desplegado: aquí faltan `leerEtapaBoard_`, `homologarProyectos_`, `contarTramitesPorEtapa_`, `notificarPago`, `obraProyecto`, `BOARD_SHEET_ID` y `OBRA_SHEET_ID` (grep = 0 ocurrencias en el archivo), y el front SÍ los llama (`src/App.jsx:4190` pide `obraProyecto`, `src/App.jsx:4379` lee `proyecto.tramitesEtapa`, `src/App.jsx:2454` lee `data.sheet.url`). Empujar este archivo mata la homologación de julio ([[codesarrolladores-yod-sistema]]).
2. **No corras `configurarRealMiramar()` ni `cargarPagosMiguel()`** (`apps_script/Código.js:371` y `:416`). Son sembradores viejos: pisarían el `precioEntrada` real y contractual de un codesarrollador con un valor obsoleto ([[codesarrolladores-yod-sistema]]). En el script desplegado ya están bloqueados por una propiedad; en esta copia local **no lo están**.
3. **La ADMIN_PASS no vive en el código.** Vive en las Propiedades del Script bajo `ADMIN_PASS` (`apps_script/Código.js:1586`). Por eso el repo puede ser público. Nunca la escribas en un archivo del repo.
4. **El Sheet manda.** El id del Sheet ni siquiera va en el bundle del front: el botón "Abrir el Sheet" usa una URL que **solo** viaja en la respuesta de admin (`src/App.jsx:2450-2463`). No lo hardcodees en el front.
5. **Un codesarrollador solo ve lo suyo.** `getMine` filtra por su `claveAcceso`; el asesor jamás toca lo financiero (`apps_script/Código.js:766` y `:1477`). Si tocas esas funciones, la fuga es de dinero ajeno.
6. **Regla única de visibilidad = columna `visibilidad` del Sheet**, con dos defaults opuestos a propósito (commits `0d2345c`, `f15154f`): Avances y Documentos **nacen visibles** y se esconden con `oculto`; la **Bitácora nace OCULTA** y solo se publica con `publicar` (`src/App.jsx:669`, `:677`, `:1899`). Invertirlo publica notas internas.
7. **No mandes POST al `/exec` para "probar".** Las acciones crean o mueven datos reales de inversionistas. Para prueba de vida basta el `GET` (devuelve `ok:true`).
8. **Cero datos inventados en pantalla.** Si el backend no trae el dato, el bloque no se pinta (`src/App.jsx:4190`, el `catch` deja el bloque fuera). No rellenes con demo lo que es real.

## Archivos

> **DÓNDE VIVE EL CÓDIGO (léelo antes que la lista).** El código vive en **`yodesarrollomx/Co-desarrolladores-Yod`** (`gh api …/contents` lista `src`, `apps_script`, `.clasp.json`, `vite.config.js`… 2026-09-04). El clon de `~/Desktop/Co-desarrolladores-Yod` es el repo **cascarón** de `alexpueblag`: `git ls-files` devuelve exactamente 5 archivos (`.nojekyll`, `404.html`, `CLAUDE.md`, `README.md`, `index.html`) y su `index.html` es la página "Se mudó". **Ese clon NO sirve para tocar la app: hay que clonar el de la org.** Las citas `archivo:línea` de abajo (y las de Reglas INVIOLABLES) corresponden al árbol del commit **`f15154f`** (2026-08-31), cuya raíz coincide con la del repo de la org.

- `src/App.jsx` — **la app entera** (4,820 líneas en `f15154f`). Config arriba: `APPS_SCRIPT_URL` (`:17`), `SITIO_URL` (`:19`), llaves de sesión en localStorage (`:21-24`). Aquí viven los 3 logins, el CRUD de admin, la vista del codesarrollador, la calculadora, el PDF y el lightbox.
- `apps_script/Código.js` — **espejo** del backend (ver advertencia abajo). `SHEET_ID` (`:1`), `PORTAL_URL` (`:40`), definición de las 9 hojas en `TABS` (`:48`), router `doPost` (`:517`).
- `apps_script/appsscript.json` — manifiesto (scopes) del script.
- `.clasp.json` — `scriptId` del Apps Script. `rootDir: apps_script`.
- `vite.config.js` — `base = '/Co-desarrolladores-Yod/'` y el PWA (manifest, service worker `autoUpdate`). **Los POST al Apps Script no se cachean**, por eso los datos siempre salen frescos (comentario en el propio archivo).
- `index.html` — cascarón HTML; fuentes Instrument Serif + Manrope (identidad Fintech Editorial de los boards, ver [[boards-identidad-fintech]]).
- `SETUP.md` — guía paso a paso para Alejandro de cómo pegar y publicar el Apps Script.
- `scripts/pruebas-escenarios.mjs` — harness de escenarios de cálculo (commit `705f201`).
- `.github/workflows/deploy.yml` — existe en disco del clon del Escritorio pero **sin rastrear**: `git status` lo marca `??` y `git ls-files` no lo lista, o sea nunca se commiteó, y por eso el Action no publica. En este clon ya **no hay `.gitignore`** (`ls` da "No such file or directory" y `git check-ignore -v` sale con código 1); en el árbol viejo `f15154f` sí ignoraba `.github/workflows/`. Ver Arquitectura.

## Arquitectura de datos

```
Google Sheet "Co-desarrolladores-Yod"  (11DiE789WIVqIybKTPapayS5XEWHtcAXUiUA11KBQUQc — Código.js:1)
  9 hojas: Inversionistas · Proyectos · Inversiones · Aportaciones · Documentos
           Avances · Bitacora · Asesores · Referidos          (TABS, Código.js:48)
        │
Sheet de PRECIOS de plusvalía (11tkKgl4W3ugthjWh80ZxHfT_PXSH_rPbCVmwM9l3CeU — Código.js:139)
  columnas pv_fund2 / pv_preventa1 / pv_preventa2 / pv_venta / pv_mercado24
        │
        ├── (solo en el script DESPLEGADO) Sheet Maestro del board de trámites
        │      Real Miramar → etapa y escalera de precios [[codesarrolladores-yod-sistema]]
        └── (solo en el script DESPLEGADO) Sheet del motor de obra → frentes y avance
        │
   Apps Script (Web App) — ÚNICO puente. Todo entra por POST {action:...}
   /exec  https://script.google.com/macros/s/AKfycbxoW0hz0nInT208B8L_WNEpYNW0iPTMNWosl3m3TG9VO6WVRVqh90xKLLSLRQCTEB9O3A/exec
        │  acciones (doPost, Código.js:517):
        │   públicas   ping · adminLogin · loginConToken
        │   admin      getAll · save · delete · notificarAvance · generarLinkAcceso
        │   inversor   investorLogin · getMine · reportarPago · recuperarClave ·
        │              subirArchivo · verComprobante · cambiarClave ·
        │              actualizarMisDatos · enviarMensaje · registrarReferido
        │   asesor     asesorLogin · getMineAsesor · guardarComoAsesor · eliminarComoAsesor
        │   (el front además llama notificarPago y obraProyecto — solo existen en el vivo)
        ▼
   src/App.jsx  →  GitHub Pages, rama gh-pages  →  yodesarrollomx.github.io/Co-desarrolladores-Yod/
```

**ADVERTENCIA — el repo es ESPEJO.** Lo que corre es lo que está pegado en el editor de Apps Script, no lo que está aquí. Evidencia dura hoy: `apps_script/Código.js` tiene 1,906 líneas y no contiene ninguna de las funciones que el front ya consume (`obraProyecto`, `notificarPago`, `tramitesEtapa`, `data.sheet`); además `MAX_INTENTOS = 20` / `VENTANA_SEGUNDOS = 300` (`:1632-1633`), valores que la memoria da por endurecidos en el vivo ([[codesarrolladores-yod-sistema]]). **Siempre `clasp pull` primero.** El deploy se hace SOBRE la implementación de producción (`clasp deploy -i AKfycbxoW0hz…`) para que la URL no cambie; sin `-i` se crea otra y el portal se cae.

**ADVERTENCIA 2 — Pages NO se publica con el Action.** El sitio en vivo sale de la rama `gh-pages` de **`yodesarrollomx/Co-desarrolladores-Yod`** (`gh api repos/yodesarrollomx/Co-desarrolladores-Yod/pages` → source branch `gh-pages`, 2026-09-04), que se actualiza copiando `dist/` a mano; el workflow ni siquiera está versionado (ver Archivos). **Ojo con el clon del Escritorio:** ese `origin/gh-pages` que aparece en `git branch -a` es una referencia vieja — `git ls-remote --heads origin` solo devuelve `main`, y el Pages de `alexpueblag` sirve el cascarón desde `main` (`gh api repos/alexpueblag/…/pages`). Hoy sí están alineados: el HTML en vivo pide `assets/index-hWFf4Jum.js` y ese mismo archivo está en `dist/assets/` (curl + `ls`, 2026-09-04), o sea que lo publicado corresponde al último build local (`f15154f`, 2026-08-31).

## Decisiones

- **2026-07-01 · Alejandro** — etapa comercial de Real Miramar = **Preventa I**, y los precios oficiales son los del sistema de codesarrolladores. Porqué: había tres escaleras de precios distintas entre board de trámites, app de ventas y portal ([[codesarrolladores-yod-sistema]]).
- **2026-07-01 · Alejandro** — *"lo que está mal son los HITOS — el alcance de cada hito"*: primero se redefine qué trámite vive en cada etapa, luego calzan los precios ([[codesarrolladores-yod-sistema]]).
- **2026-07-02 · homologación** — el portal deja de tener su propia verdad: deriva etapa y precios del board de trámites (fuente única). Porqué: el precio comercial iba adelante del avance real de permisos ([[codesarrolladores-yod-sistema]]).
- **2026-07-02 · Alejandro** — **no** habrá subtablero de lotes en el board de trámites: lo personal del inversionista vive SOLO en este portal ([[real-miramar-board-project]]).
- **2026-08-27 · Alejandro** — Real Miramar paga **plusvalía Y rendimiento anual juntos, se suman** (commit `ff1ee96`). Porqué: la rama de plusvalía retornaba antes de leer `tasaAnual` y el rendimiento capturado se ignoraba en silencio.
- **2026-08-27 · Alejandro** — el estatus legal del lote **no se publica todavía**; primero se cierran trámites. Y se sostiene Preventa I **mostrando el denominador** (cuántos trámites la sostienen) — commit `96c6275`.
- **2026-08-28 · auditoría** — el "reloj del dato": cada bloque dice su edad pasando de 30 días. Criterio acordado: *si nadie toca nada un mes, el portal debe VERSE desactualizado, no verse perfecto* (commit `4c0aa3f`).
- **2026-08-28 · Alejandro** — tramos ponderados por aportación se aplican sin avisar a los codesarrolladores; el impacto medido fue $0.00 ([[codesarrolladores-yod-sistema]]).
- **2026-08-28 · Alejandro** — botón directo al Sheet, siempre a la vista y **solo para admin** (commit `4628bdc`); la URL viaja solo en la respuesta de admin.
- **2026-08-28 → 2026-08-31 · una sola regla de visibilidad**: la columna `visibilidad` del Sheet, alineada en portal y admin (commits `0d2345c`, `67c171e`) y con la bitácora naciendo oculta (`f15154f`). Porqué: la bitácora era por proyecto y se publicaba entera.
- ~~El sitio se despliega con el workflow de GitHub Actions.~~ **OBSOLETO desde 2026-08-27**: el Action no corre; Pages sirve de `gh-pages` copiando `dist/` ([[codesarrolladores-yod-sistema]]).
- ~~La casa del portal es `alexpueblag.github.io`.~~ **OBSOLETO desde 2026-09-04**: la casa es `yodesarrollomx.github.io`; la vieja quedó como cascarón que reenvía (curl 2026-09-04). **Ojo: el código todavía no se enteró** — `src/App.jsx:19` (`SITIO_URL`) y `apps_script/Código.js:40` (`PORTAL_URL`, la liga que va en los correos y en el link mágico) siguen apuntando a la vieja.

## Pendientes

| Tema | Dueño | Qué evidencia lo cierra |
|---|---|---|
| Actualizar `SITIO_URL` (`src/App.jsx:19`) y `PORTAL_URL` (`Código.js:40`) a `yodesarrollomx.github.io` | quien toque el repo, con OK de Alejandro | Un correo de recuperación recibido cuyo enlace apunte ya al dominio nuevo (hoy pasa por el cascarón) |
| Sincronizar `apps_script/Código.js` con el vivo (`clasp pull`) para que el repo deje de mentir | quien toque el backend | El archivo del repo contiene `obraProyecto` y `notificarPago`, y `node --check` pasa |
| Versionar `.github/workflows/deploy.yml` o borrarlo y documentar el deploy manual a `gh-pages` | quien toque el repo | `git ls-files` lo lista, o el archivo ya no existe y SETUP.md explica el copiado a `gh-pages` |
| Vigilante diario del portal (4 alarmas) | pendiente de asignar | Su log existe y corrió al menos un día — regla de [[centinelas-launchd-trampa]] |
| Formato de la nota al inversionista y dueño del corte del viernes | Alejandro | El formato escrito y una nota enviada con él |
| Cargar los avances reales de obra | bloqueado por 6 mensajes que **manda Alejandro**, no Claude | Los avances visibles en el portal con foto y fecha ([[codesarrolladores-yod-sistema]]) |
| Alinear el catálogo comercial de ventas a Preventa I | Alejandro (contenido comercial) | Las celdas del Sheet de precios ya no dicen "Fundador II" en stats/kicker |
| `SETUP.md` cita `apps_script/Code.gs`; el archivo real se llama `Código.js` | quien toque el repo | El nombre corregido en SETUP.md |
| Rama `dominio-propio` (y su respaldo `…-ANTES-DEL-REBASE`) sin fusionar | quien cierre la mudanza | La rama fusionada o borrada, después de medir `git rev-list --count dominio-propio..main` ([[rename-github-yodesarrollomx]]) |
| El clon del Escritorio es del repo **cascarón** (`alexpueblag`, solo `main`, 5 archivos). Para trabajar la app hay que clonar de nuevo `yodesarrollomx/Co-desarrolladores-Yod`; el del Escritorio se conserva (o se borra) como el cascarón que es. **No basta con cambiar la URL del remoto**: son dos repos vivos distintos y el árbol de trabajo quedaría desalineado con la rama que jala | quien toque el repo | Un clon nuevo cuyo `git ls-files` liste `src/App.jsx` |

## Por confirmar (no lo afirmes hasta preguntarlo)

- **¿Cuántas líneas y qué archivos tiene HOY el script desplegado?** No se pudo leer sin credencial. Pregunta exacta a Alejandro: *"¿me abres el editor de Apps Script del portal y me dices cuántos archivos tiene y cuántas líneas el principal?"* La memoria dice 2,022 líneas y un tercer archivo `EditarCampoBoard.js` al 2026-08-27, pero eso ya tiene una semana.
- **¿Sigue activa la propiedad `SEEDS_HABILITADOS`** que bloquea los sembradores en el vivo? No aparece en esta copia local.
- **¿La implementación de producción sigue siendo `AKfycbxoW0hz…`?** El `GET` responde `ok`, pero eso no prueba que sea la única ni la que Alejandro considera oficial.
- **¿Los 16 documentos de Drive siguen en "cualquiera con el enlace"?** ([[codesarrolladores-yod-sistema]]) — incluye contratos. No se verificó hoy.
- **¿Quién es el dueño del vigilante diario?** El pendiente existe en la memoria pero sin nombre asignado.
