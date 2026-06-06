# SETUP.md — Conectar el portal "Co-desarrolladores-Yod"

Hola Alejandro. Esta es la guia para dejar funcionando el backend del portal de control financiero de inversionistas. Es el "motor" que vive en Google y que guarda todos los datos en tu Google Sheet privado.

Hazlo con calma, **un paso a la vez**. No te saltes ningun paso ni hagas dos al mismo tiempo. Si algo no se ve como lo describo aqui, toma una captura de pantalla y mandamela antes de seguir.

> **Tiempo aproximado:** 15 minutos.
> **Lo unico que necesitas tener a la mano:** tu cuenta de Google (la misma con la que se creo el Sheet) y el archivo `apps_script/Code.gs` del proyecto (lo abriremos desde la computadora cuando llegue el momento).

---

## Antes de empezar: que vamos a hacer (en una frase)

Vamos a pegar un programa (el Apps Script) dentro de tu Google Sheet, prenderlo una vez para que cree las pestanas, ponerle tu contrasena de administrador, publicarlo en internet como una "aplicacion web", y por ultimo copiar su direccion (URL) y pegarla en el codigo del portal. Eso es todo.

---

## Paso 1 — Abrir el Google Sheet y entrar al editor de Apps Script

1. Abre tu navegador (Chrome de preferencia) e inicia sesion con tu cuenta de Google (la de Aurum).
2. Copia y pega esta direccion en la barra del navegador y presiona Enter. Es tu Sheet "Co-desarrolladores-Yod":

   ```
   https://docs.google.com/spreadsheets/d/11DiE789WIVqIybKTPapayS5XEWHtcAXUiUA11KBQUQc/edit
   ```

3. Cuando el Sheet abra, ve al menu de arriba y haz clic en **Extensiones**.
4. En el menu que se despliega, haz clic en **Apps Script**.

Se va a abrir una pestana nueva con el editor de codigo. Vas a ver una pantalla con fondo claro y un area con algo de codigo de ejemplo (normalmente dice algo como `function myFunction() {}`).

> **Por que esto:** El Apps Script es el "portero" del portal. Vive pegado a tu Sheet y es el unico que puede leer o escribir tus datos. Asi nadie entra directo a la informacion.

---

## Paso 2 — Borrar el codigo de ejemplo y pegar el nuestro

1. En el editor de Apps Script, haz clic en cualquier parte del area de codigo (el recuadro grande del centro).
2. Selecciona **todo** el texto que haya ahi: presiona las teclas **Ctrl + A** (en Mac es **Cmd + A**).
3. Borra lo seleccionado con la tecla **Suprimir** o **Retroceso**. El recuadro debe quedar vacio.
4. Ahora abre el archivo `apps_script/Code.gs` del proyecto, selecciona TODO su contenido (otra vez **Ctrl + A**) y copialo (**Ctrl + C**).
5. Regresa al editor de Apps Script, haz clic en el recuadro vacio y pega (**Ctrl + V**).
6. Guarda: haz clic en el icono del **disquete** (guardar) que esta arriba, o presiona **Ctrl + S**.

Cuando guardes, en la parte de arriba el nombre del proyecto puede pedirte un nombre; si lo pide, escribe **Co-desarrolladores-Yod** y acepta.

> **Por que esto:** Estamos reemplazando el ejemplo vacio con el programa real que sabe manejar inversionistas, proyectos, inversiones, aportaciones y documentos.

---

## Paso 3 — Ejecutar la funcion `setup()` una sola vez

Esto crea automaticamente las pestanas (hojas) dentro de tu Sheet con sus columnas correctas.

1. En el editor de Apps Script, arriba del codigo hay una barra con un menu desplegable que muestra el nombre de una funcion. Haz clic en ese menu.
2. De la lista, elige **setup**.
3. A la derecha de ese menu, haz clic en el boton **Ejecutar** (tiene un icono de "play" o triangulo).

**La primera vez te va a pedir permisos.** Esto es normal y seguro (es tu propio programa pidiendo permiso para entrar a tu propio Sheet). Sigue esto:

4. Aparece una ventana **"Se requiere autorizacion"**. Haz clic en **Revisar permisos**.
5. Elige tu cuenta de Google (la de Aurum).
6. Es posible que aparezca una pantalla que dice **"Google no ha verificado esta aplicacion"**. No te asustes: es porque la app es tuya y nueva. Haz clic en el texto pequeno **Configuracion avanzada** (o "Avanzado").
7. Luego haz clic en **Ir a Co-desarrolladores-Yod (no seguro)**.
8. En la siguiente pantalla, haz clic en **Permitir**.

Despues de permitir, el programa se ejecuta. Espera unos segundos. Abajo del editor veras un mensaje de **"Ejecucion finalizada"** (sin errores en rojo).

**Verificar que funciono:**

9. Regresa a la pestana de tu Google Sheet.
10. Hasta abajo deben aparecer **5 pestanas nuevas**: **Inversionistas**, **Proyectos**, **Inversiones**, **Aportaciones** y **Documentos**, cada una con sus columnas en la primera fila.

Si ves esas 5 pestanas con encabezados, vas perfecto.

> **Por que esto:** `setup()` prepara la "base de datos" (las hojas y columnas) para que el portal tenga donde guardar todo. Solo se corre una vez.

---

## Paso 4 — Poner tu contrasena de administrador

Aqui defines la clave con la que TU vas a entrar al portal como administrador. **Nunca se escribe en el codigo**: vive guardada de forma privada dentro del Apps Script.

1. Regresa a la pestana del editor de Apps Script.
2. En la columna de la izquierda, haz clic en el icono de **engrane** (Configuracion del proyecto).
3. Baja hasta la seccion **Propiedades del script** (Script Properties).
4. Ahi debe aparecer ya una propiedad llamada **ADMIN_PASS** con el valor **cambia-esta-clave**.
5. Haz clic en el lapiz (**Editar**) de esa propiedad.
6. Borra `cambia-esta-clave` y escribe **tu** contrasena fuerte. Recomendaciones:
   - Minimo 10 caracteres.
   - Mezcla mayusculas, minusculas, numeros y un simbolo (ejemplo de estilo, NO la uses tal cual: `Aurum$2026Yod!`).
   - **No** uses contrasenas que ya usas en otros lados.
7. Haz clic en **Guardar propiedades del script**.

**Importante:** Esta es la contrasena que vas a teclear cada vez que entres al portal como "Soy del equipo". Apuntala en un lugar seguro (tu gestor de contrasenas). Si la pierdes, regresas aqui y la cambias.

> **Por que esto:** El portal es una pagina publica, pero los datos no. La barrera real es esta contrasena: el Apps Script la compara en cada accion y, si no coincide, no entrega ni guarda nada. Por eso **jamas** debe escribirse en el codigo del repositorio (que es publico).

---

## Paso 5 — Publicar el Apps Script como "aplicacion web"

Ahora vamos a poner el motor en linea para que el portal pueda hablarle.

1. En el editor de Apps Script, arriba a la derecha, haz clic en el boton azul **Implementar** (Deploy).
2. En el menu que aparece, haz clic en **Nueva implementacion**.
3. Veras un icono de engrane junto a "Seleccionar tipo". Haz clic en ese engrane y elige **Aplicacion web**.
4. Se abre un formulario. Llenalo asi, **exactamente**:
   - **Descripcion:** escribe algo simple como `Portal Co-desarrolladores v1` (es solo una nota tuya).
   - **Ejecutar como:** elige **Yo (tu correo)**.
   - **Quien tiene acceso:** elige **Cualquier usuario** (sin la palabra "Google"; debe decir solo "Cualquier usuario").
5. Haz clic en **Implementar**.
6. Si te vuelve a pedir autorizar permisos, repite lo del Paso 3 (Revisar permisos → tu cuenta → Avanzado → Ir a... → Permitir).
7. Al terminar aparece una ventana de exito con una **URL de la aplicacion web** que termina en **/exec**. Se ve mas o menos asi:

   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```

8. Haz clic en **Copiar** (junto a esa URL). **No cierres** esta ventana todavia; o si la cierras, no pasa nada, pero asegurate de haber copiado la URL.

> **Por que "Ejecutar como: Yo" y "Acceso: Cualquier usuario":** "Como yo" hace que el programa use TUS permisos para entrar al Sheet. "Cualquier usuario" permite que el portal le mande peticiones desde el navegador. La seguridad real sigue siendo tu contrasena de administrador, no quien pueda tocar la puerta.

---

## Paso 6 — Pegar la URL en el codigo del portal (App.jsx)

Esto conecta el portal (lo que ven los usuarios) con el motor (el Apps Script).

1. Abre el archivo `src/App.jsx` del proyecto.
2. Cerca del inicio del archivo busca una linea que dice **APPS_SCRIPT_URL** (es una constante que guarda la direccion del motor). Se ve parecido a esto:

   ```js
   const APPS_SCRIPT_URL = "PEGA_AQUI_TU_URL";
   ```

3. Reemplaza el texto que esta entre comillas por la URL que copiaste en el Paso 5 (la que termina en **/exec**). Debe quedar asi (con tu URL real):

   ```js
   const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycb.../exec";
   ```

4. Guarda el archivo.
5. Sube el cambio (haz `git push` a la rama `main`, o pideme que lo haga contigo). GitHub Actions compila y publica el portal solo; en uno o dos minutos queda en linea.

**Probar que todo conecta:**

6. Abre el portal en tu navegador, elige **Soy del equipo**, y entra con la contrasena que pusiste en el Paso 4. Si entras y ves el Dashboard, ya quedo todo conectado.

> **Por que esto:** El portal no sabe a donde mandar las peticiones hasta que le pegas la URL del motor. Esa URL **no es un secreto** (es solo una direccion, como la de un sitio web), por eso si la puede vivir en el codigo.

---

## Paso 7 — REGLA DE ORO (leelo, esto evita el dolor de cabeza mas comun)

Cada vez que en el futuro hagas una **Nueva implementacion** del Apps Script, Google genera una **URL nueva** y la anterior deja de servir. Si eso pasa, el portal "se desconecta" (verias errores al cargar o guardar).

**Si vuelves a desplegar el Apps Script:**

1. Copia la **URL nueva** (la que termina en `/exec`) de la nueva implementacion.
2. Pegala en `src/App.jsx` en la constante **APPS_SCRIPT_URL** (igual que en el Paso 6).
3. Guarda y sube el cambio (`git push`).

> **Truco para no desconectarte:** Cuando solo quieras actualizar el codigo del Apps Script sin cambiar la URL, en lugar de "Nueva implementacion" usa **Implementar → Gestionar implementaciones**, elige la que ya tienes, dale al **lapiz (Editar)**, en "Version" elige **Nueva version** y guarda. Asi se actualiza el motor pero **conservas la misma URL** y no tienes que tocar nada en el codigo.

---

## Nota de seguridad (importante, leela)

- El **codigo del portal es publico** (cualquiera puede verlo en GitHub), pero **tus datos NO**: viven solo en tu Google Sheet privado, al que unicamente el Apps Script (con tus permisos) puede entrar.
- La unica barrera real es el **login**: el Apps Script exige tu contrasena de administrador en cada accion. Sin ella, no entrega ni guarda nada.
- **Nunca** escribas contrasenas ni datos sensibles dentro del codigo (ni en `App.jsx`, ni en `CLAUDE.md`, ni en ningun archivo del repositorio). Tu contrasena de administrador vive SOLO en las "Propiedades del script" (Paso 4), nunca en el repositorio.
- Los datos bancarios (cuenta, CLABE) y los datos de contacto solo se le muestran al administrador y, mas adelante (Fase 2), a cada inversionista pero unicamente lo que le corresponde a el. Nadie ve los datos de otro.

---

## Si algo sale mal (rapido)

- **No aparecen las 5 pestanas:** vuelve al Paso 3 y corre `setup()` otra vez; revisa que abajo del editor diga "Ejecucion finalizada" y no un error en rojo. Mandame captura del error si lo hay.
- **El portal dice error de conexion / no carga datos:** casi siempre es la URL. Revisa que la URL en `App.jsx` sea la correcta y termine en `/exec`. Si volviste a desplegar, aplica la **Regla de oro** (Paso 7).
- **No me deja entrar como admin:** confirma que estas escribiendo exactamente la contrasena del Paso 4 (cuidado con mayusculas y espacios). Si la olvidaste, cambiala en Propiedades del script.

Cuando termines el Paso 6 y logres entrar al Dashboard, avisame y seguimos con la carga del ejemplo "Casa Alysa" y Hugo Meave. Vas muy bien.
