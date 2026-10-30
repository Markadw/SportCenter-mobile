# Sport Center Mobile

Aplicación móvil de Sport Center para consultar productos deportivos y acceder a los servicios de la tienda.

Desarrollada con Expo SDK 57, React Native, TypeScript y Expo Router.
Repositorio: [Markadw/SportCenter-mobile](https://github.com/Markadw/SportCenter-mobile).

## Estado del proyecto

El proyecto está en desarrollo. La base disponible incluye carga inicial con la marca Sport Center, navegación inferior, inicio, búsqueda y catálogo con filtros y orden, y detalle de producto por variante con consumo del backend.

El cliente incluye registro, verificación de correo, reenvío e inicio de sesión con control de acceso y sesión en memoria. Las pruebas cubren componentes, servicios y su combinación con transporte simulado, además de contratos HTTP públicos y recorridos públicos Android. Almacenamiento seguro, restauración y renovación de sesión corresponden a MOB-005. Carrito, direcciones, compra/pago, pedidos y gestión del perfil siguen pendientes. El alcance y los responsables se consultan en el [tablero personal](https://github.com/users/Markadw/projects/2).

## Interfaces móviles

El primer bloque de interfaces está en `feature/interfaces-moviles`: Inicio, Catálogo y Cuenta son las pestañas principales. Las URL `/`, `/catalog` y `/account` se mantienen; registro, verificación, login y detalle se abren sobre esas pestañas. Cuenta muestra el acceso al usuario invitado y solo renderiza la vista autenticada si existe sesión.

Inicio muestra el buscador, deportes, productos más recientes y marcas, en ese orden, con opciones de la API. Se retiraron el banner y su consulta al backend. Marca y deporte abren su catálogo filtrado. La búsqueda funciona por nombre, descripción, marca, categoría y deporte, sin distinguir acentos. El catálogo admite orden por precio o nombre y el orden reciente que entrega el servidor, rango de precio y carga acumulada de 20 productos. Volver desde el detalle conserva la búsqueda; una selección nueva desde Inicio comienza otra consulta.

El detalle selecciona una combinación real de atributos; precio, fotos y existencias pertenecen a esa misma variante. Las tarjetas muestran su rango de precios. Compartir abre la herramienta del dispositivo con la URL real del sitio web. Se retiraron los controles de favoritos y el botón de carrito que no realizaban operaciones, junto con las promesas fijas de envío y devolución que no provenían de la API. La acción de compra se incorporará con HU-05 y el contrato del carrito; esta revisión no da por terminada esa historia.

La arquitectura sigue MVVM por funcionalidad: los servicios convierten la respuesta del backend; los modelos de vista de Inicio, Catálogo y Detalle manejan selección, consultas y filtros; las pantallas presentan sus estados. Los proveedores conservan los datos compartidos. El detalle sigue enviando el ID real a la API; la codificación del enlace público se usa únicamente al compartir.

El splash nativo usa el logotipo existente. En JavaScript, la carga inicial espera solo la primera consulta del catálogo, sin demora artificial. Si falla, permite llegar al error con reintento; filtros e imágenes no bloquean la entrada. Una actualización posterior no vuelve a cubrir la app. La apariencia final del splash nativo requiere comprobar una compilación instalada, pues Expo Go no reproduce todos sus detalles.

[Prototipo editable en Figma](https://www.figma.com/design/Ae3JMeVAfcs6ulXI7dpx5k?node-id=5-50). Documenta el primer bloque y sus estados; no sustituye las comprobaciones en el dispositivo. El usuario confirmó el recorrido básico en Android; el alcance y los casos adicionales pendientes están en la [guía de comprobación móvil](tests/manual/interfaces-moviles.md).

Recuperación de contraseña y reseñas se incluyen en el alcance acordado de los siguientes bloques. Google, recomendaciones y Alexa quedan fuera. Las pantallas de perfil y del flujo de compra también están pendientes; este prototipo no acredita su implementación.

## Registro de clientes (HU-01)

El icono de usuario abre Iniciar sesión cuando no hay sesión activa; desde allí, «Crear cuenta» abre el registro. Se solicitan nombre, ambos apellidos, correo, teléfono de 10 dígitos y contraseña con confirmación. Cada contraseña permite mostrar u ocultar su contenido mediante un botón. La contraseña requiere al menos 12 caracteres, mayúscula, minúscula, número y un símbolo admitido por el backend; la ayuda del formulario muestra la lista.

El servicio usa los endpoints públicos POST /users/create-user, /users/verify-email y /users/resend-code. Solo envía los seis campos de registro aceptados; la confirmación de contraseña es local. El contrato se revisó en AlexisYazir/back-sport, commit 31ee304d902ec5ec5a9c0fc702eca5e1a531bc16.

Después del registro se introduce el código recibido por correo. El backend establece vigencia de 24 horas y 3 intentos; reenviar genera un código nuevo. La verificación no inicia sesión. «Ya tengo un código» permite retomar el proceso después de salir de la app o perder la conexión.

Las peticiones tienen un límite de espera de 45 segundos y no se repiten automáticamente. Un timeout puede ocurrir después de que el servidor haya procesado el registro: la pantalla indica revisar el correo antes de reintentar. Se bloquean envíos simultáneos y se cancela la espera al salir de la pantalla. La aplicación no guarda contraseñas ni códigos en almacenamiento y descarta el hash y el código presentes en la respuesta actual del backend.

Jest comprueba validaciones, contrato de envío, errores, registro/verificación/reenvío y concurrencia con transporte simulado; estas pruebas automatizadas no crean cuentas en Render. El usuario confirmó en su Android, mediante Expo Go y la API real, el registro, la recepción del primer correo, el rechazo del código incorrecto, la recepción del reenvío y la verificación de la cuenta. El alcance y las limitaciones de esa comprobación están en [el registro manual](tests/manual/registro-cliente.md). El recorrido manual corresponde a HU-01 antes de incorporar la nueva base. El PR #36 conserva las comprobaciones de registro y su actualización. Tras verificar el correo se puede abrir Iniciar sesión; el registro también permite volver a login mediante «Ya tengo una cuenta».

## Entorno y arranque

Usar Node 22.20.0 o superior compatible con SDK 57 y npm. Desde la carpeta del proyecto:

```powershell
npm ci
npm start
```

Escanear con Expo Go el QR que muestre esa terminal. Mantener el teléfono y la PC en la misma red y la terminal abierta. La dirección de Metro corresponde a la conexión de esa ejecución. Para limpiar su caché: `npm start -- --clear`.

La API predeterminada es https://back-sport-ghxk.onrender.com. Para cambiarla, copiar `.env.example` a `.env.local` y definir `EXPO_PUBLIC_API_URL`. Recargar completamente la aplicación después del cambio. Los valores EXPO_PUBLIC_ son públicos en el bundle; no guardar secretos allí.

Instalar paquetes con `npx expo install <paquete>` para resolver versiones compatibles con el SDK. Las carpetas android/ e ios/ se generan con Expo; la configuración nativa se mantiene mediante app.json y plugins.

## Inicio de sesión

El icono de usuario abre login o Mi cuenta según la sesión. El formulario usa POST /users/login-user, valida correo y contraseña, admite mostrar/ocultar y presenta los errores sin mostrar detalles internos. Mi cuenta confirma la autenticación; la consulta y edición del perfil corresponden a HU-09.

Los tokens permanecen únicamente en memoria. Al cerrar sesión se retira el acceso local y se solicita el cierre al backend; al vencer el acceso también se retira la sesión. Una recarga completa o un nuevo arranque exige volver a entrar. Almacenamiento seguro, restauración y renovación coordinada quedan en MOB-005. Registro, verificación y reenvío se conectan con este flujo desde HU-01.

Las pruebas Android confirmadas y los casos específicos pendientes están en tests/manual/inicio-sesion.md. Las pruebas automatizadas usan transporte simulado; no acreditan una autenticación real en el teléfono.

La prueba `tests/integration/AuthenticationFlow.test.tsx` recorre registro, reenvío, verificación, login y cierre con transporte simulado. No envía correos ni comprueba un teléfono real.

## Verificación

```powershell
npm run validate
npx expo-doctor
```

- `npm run lint`: revisión ESLint del proyecto.
- `npm run typecheck`: comprobación TypeScript sin generar JavaScript.
- `npm run lint:report` y `npm run typecheck:report`: ejecutan los analizadores instalados con la configuración del proyecto y guardan sus informes en `test-results/static-analysis/`.
- `npm run validate`: ejecuta lint, TypeScript, pruebas del cliente con cobertura y validación de configuración; se detiene ante un fallo.

La validación del cliente usa transporte HTTP simulado. No consulta la API desplegada ni ejecuta aceptación Android o carga. El empaquetado de JavaScript tampoco equivale a generar un APK firmado.

### Pruebas

| Comando | Alcance |
| --- | --- |
| `npm test` | Pruebas Jest del cliente |
| `npm run test:unit` | Lógica y componentes en __tests__/ |
| `npm run test:integration` | Integración de vistas, contextos y servicios con transporte simulado |
| `npm run test:ci` | Jest con cobertura y reporte JSON en test-results/ |
| `npm run test:config` | Coherencia de workflows, flujos Maestro, perfil EAS y plan de pruebas |
| `npm run test:api` | Contratos HTTP reales de lectura; requiere API_BASE_URL explícita |
| `npm run env:start` / `npm run env:stop` | Preparar o detener backend y datos sintéticos locales |
| `npm run test:performance -- all` | Referencia, carga y esfuerzo en la copia local |

Para ejecutar las consultas HTTP públicas desde PowerShell:

```powershell
$env:API_BASE_URL = 'https://back-sport-ghxk.onrender.com'
npm run test:api
```

La suite HTTP consulta catálogo, detalle y rechazo del perfil sin sesión; no crea cuentas ni modifica datos. Los resultados de cada ejecución se distinguen de la preparación de sus scripts.

Los PR hacia `develop`, tanto en borrador como listos, exigen lint, TypeScript, pruebas del cliente, contratos HTTP e inspección k6. No generan APK ni ejecutan Android automáticamente. Para comprobar una candidata Android de develop, se puede ejecutar manualmente **Integración y aceptación móvil**, seleccionar la rama `develop` y activar `run_android`. El push posterior a un merge tampoco repite Android. Un fallo de calidad o HTTP bloquea la integración.

Los flujos Maestro de catálogo y detalle siguen disponibles sobre un APK candidato en un emulador Android API 34 de GitHub. Cuando se solicita Android manualmente, deben aprobar tanto la compilación EAS como Maestro. Omitir Android permite continuar el desarrollo, pero no acredita una prueba del APK. Las entregas a main conservan su política de aceptación Android.

Los guiones k6 de rendimiento y estrés requieren una API propia aislada y un commit de backend identificado. No ejecutarlos contra el Render compartido ni servicios de pago. Su inspección no equivale a medir capacidad o aprobar rendimiento.

### Matriz de automatización

| Evento | Rama o destino | Comprobaciones |
| --- | --- | --- |
| Push de trabajo | feature/*, fix/*, chore/*, test/*, release/*, hotfix/* | Calidad si no hay PR para ese commit; con PR se evita repetirla |
| PR en borrador | develop o main | Calidad, contratos HTTP e inspección k6; sin compilar APK |
| PR listo | develop | Calidad, contratos HTTP e inspección k6; sin APK ni Android automáticos |
| PR listo | main | Calidad, contratos HTTP, inspección k6 y compilación/aceptación Android |
| Push integrado, incluido merge | develop | Calidad, contratos HTTP e inspección k6 |
| Push integrado, incluido merge | main | Calidad, contratos HTTP, inspección k6 y compilación/aceptación Android; conserva evidencia |
| Manual | develop, release/* o hotfix/* | Integración; Android opcional sólo en develop y obligatorio en candidatas |
| Medición manual | develop o ramas de trabajo | Referencia, carga y esfuerzo con backend y datos aislados en el runner |

El merge se atiende mediante push a su destino. No se añade un segundo disparador por cierre del PR. El resultado Resultado de integración falla si una etapa obligatoria falla, se cancela o se omite; en `develop` está marcada como requerida para integrar cambios. Los PR verifican la combinación con la base y los pushes verifican el commit de la rama. En una rama con PR abierto pueden aparecer dos eventos de GitHub: el push sólo consulta si el PR se hace cargo y omite el trabajo duplicado. No hay ejecuciones programadas ni reintentos automáticos de Android.

El resumen de calidad incluye versión, código de salida y diagnósticos de ESLint y TypeScript. TypeScript se ejecuta aunque ESLint falle para informar ambos resultados; las pruebas posteriores e integración continúan bloqueadas. Un informe ausente, de otra ejecución o de una etapa omitida se señala explícitamente. Los JSON se incluyen en el mismo `client-evidence`, sin añadir artefactos.

Las ejecuciones ordinarias publican resultados en el resumen y los logs, sin subir informes de pruebas. Se conservan paquetes compactos ante fallos, en PR hacia main, en main, en candidatas manuales y en PR marcados con la etiqueta `evidencia`. La etiqueta `evidencia` conserva informes; en los PR a develop no activa APK ni Android. La entrega interna requiere además una ejecución con Android aprobado. Todos tienen retención de 14 días. Una simple inspección k6 no genera artefactos; una medición real conserva un único paquete con sus JSON y resumen. Los APK permanecen en EAS y no se duplican en los artefactos de GitHub.

Los reportes de GitHub Actions son evidencias de esas ejecuciones; los archivos históricos de evidence/ conservan su fecha y commit originales.

Una candidata con evidencia y aceptación Android aprobada se registra en el entorno `qa-interna` de GitHub después de `Resultado de integración`. La entrega reutiliza el enlace EAS y el SHA256 del mismo APK comprobado; no vuelve a compilarlo. Si una comprobación obligatoria falla o se omite, no se entrega la candidata. Este registro permite una instalación interna; no publica Google Play ni modifica ramas.

```mermaid
flowchart LR
  A[Push de trabajo] --> B[Calidad y pruebas del cliente]
  C[PR a develop o main] --> D[Calidad]
  D --> E[Contratos HTTP compartidos y locales]
  D --> F[Inspección k6]
  E --> G[Entrega o Android manual solicitado: EAS y Maestro]
  F --> G
  E --> H[Resultado de integración]
  F --> H
  G --> H
  H --> I[Candidata con evidencia y Android aprobado: entrega interna]
  J[Medición manual] --> K[Backend y datos aislados]
  K --> L[Referencia, carga y recuperación]
```


### Android comprobado en CI

La [candidata del PR #35](https://github.com/Markadw/SportCenter-mobile/actions/runs/40506781998), sobre `ee736e8`, aprobó 140 pruebas, cuatro contratos por entorno y dos recorridos públicos Android. El APK preview terminó en EAS con el identificador `812e78fa-1511-40c7-89d9-de796a8fba01`. Esta aceptación comprueba catálogo y detalle.

La [validación de la base integrada](https://github.com/Markadw/SportCenter-mobile/actions/runs/40537859651), commit `d5c842a`, aprobó calidad, 140 pruebas, contratos HTTP e inspección k6 después del merge a develop, sin repetir APK ni Android. La comprobación manual de registro se conserva por separado en HU-01.

La [candidata histórica ac6bf53](https://github.com/Markadw/SportCenter-mobile/actions/runs/40453688133) conserva su evidencia de 122 pruebas, cuatro contratos por entorno, dos recorridos Android y entrega interna.

La [validación de la política integrada en develop](https://github.com/Markadw/SportCenter-mobile/actions/runs/40563479112), commit `935725a`, aprobó lint, TypeScript, 141 pruebas, cuatro contratos HTTP por entorno e inspección k6. Resultado de integración aprobó sin APK ni Android. Esa ejecución comprueba la base de automatización; las pruebas de HU-01 y su aceptación manual se mantienen por separado.

El proyecto EAS es `anth.oi/sport-center-mobile` y el paquete Android es `com.markadw.sportcenter`. GitHub tiene configurado `EXPO_TOKEN`; las credenciales de firma se administran en EAS.

Como evidencia histórica, la [revisión de referencia edca463](https://github.com/Markadw/SportCenter-mobile/actions/runs/40435769513) aprobó calidad, 96 pruebas del cliente e infraestructura, cuatro contratos HTTP y dos recorridos Android. Su APK terminó en EAS y fue instalada en el emulador API 34. Estos resultados acreditan el incremento de catálogo y detalle básicos.

- `API_TEST_URL` elige el backend de los contratos y del APK; `API_TEST_PRODUCT_ID` fija el producto HTTP y `ANDROID_TEST_PRODUCT_NAME` el producto de Maestro.
- La preparación comprueba que la API responda y que Android tenga una red validada. Los flujos arrancan con estado limpio.
- EAS debe terminar el APK del commit comprobado. CI verifica procedencia y SHA256 antes de instalarlo.
- `preview` genera APK para distribución interna y `production` prepara AAB. La publicación en Google Play sigue pendiente.
- Las capturas y el informe Maestro se conservan ante fallos o cuando se solicita evidencia de una candidata; el APK permanece en EAS.

### Copia local del backend para pruebas

Requiere Docker Desktop en modo de contenedores Linux, Git y Node. El backend real se fija al commit indicado en `tests/environment/backend-source.json`; la copia descargada queda en `.qa/`, fuera de Git.

```powershell
node scripts/test-environment.js start
$env:API_BASE_URL = 'http://127.0.0.1:3011'
$env:API_PRODUCT_ID = '66'
npm run test:api
node scripts/test-environment.js stop
```

El entorno crea PostgreSQL temporal con 100 productos y 200 variantes sintéticos; el producto conocido es el 66. Al detenerlo se descarta esta base de pruebas y el siguiente arranque la vuelve a preparar. No utiliza datos ni credenciales del servidor compartido.

API, PostgreSQL y k6 comparten una red interna. Una entrada de sólo lectura permite consultar la API desde Windows en `127.0.0.1:3011`. Las lecturas de catálogo y detalle usan los controladores y consultas del backend real. Correo, pagos y funciones que dependan de procedimientos SQL externos no forman parte del alcance comprobado.

El esquema local se crea desde las entidades del backend. Esta preparación pertenece únicamente al entorno aislado; no sustituye las migraciones del servidor desplegado.

### Rendimiento y recuperación comprobados

```powershell
npm run test:performance -- all
npm run env:stop
```

El comando prepara la copia local, reinicia la API antes de cada escenario para separar las ventanas del limitador y guarda los resultados en `test-results/performance/<ejecución>/`. El perfil acordado está en `tests/performance/profile.json`: referencia de un usuario; carga de dos usuarios, P95 menor de 500 ms y cero errores; esfuerzo de hasta ocho usuarios y recuperación en un máximo de 65 segundos. Cada usuario consulta catálogo y detalle, con tres segundos entre iteraciones.

La [medición local del 26 de octubre](evidence/performance-local-2026-10-26.json) obtuvo referencia P95 de **10,08 ms** (20 solicitudes), carga P95 de **8,25 ms** (80 solicitudes, cero errores) y recuperación en **35,91 segundos**. La verificación final obtuvo 12 pares de consultas correctos y cero errores. El esfuerzo activó el límite real de solicitudes: hubo 86 respuestas 429 durante la fase de sobrecarga; también se observaron rechazos mientras se recuperaba la ventana de admisión. El P95 de esfuerzo incluye rechazos y no se compara con el objetivo de carga normal.

Estos resultados corresponden al backend fijado, con 100 productos y 200 variantes sintéticos y los recursos anotados en la evidencia. No miden fluidez Android ni la capacidad del servidor compartido. Los JSON completos de cada medición permanecen fuera de Git; CI los conserva en un solo artefacto por medición. Un fallo de k6 devuelve error y conserva su diagnóstico.

### Documentación de arquitectura

La aplicación usa rutas en `src/app/`, vistas y estado por función en `src/features/`, y acceso HTTP en `src/api/`. Las pruebas del cliente simulan el transporte para comprobar estados y errores; los contratos HTTP comprueban el backend real; Maestro comprueba los dos recorridos básicos sobre el APK.

[DeepWiki del repositorio](https://deepwiki.com/Markadw/SportCenter-mobile) sigue mostrando el índice del commit `f24ccc` de `main`, según la revisión del 26 de octubre. Ese índice aún no documenta este PR. El código, los workflows y este README son la referencia actual; la actualización de DeepWiki queda pendiente de una indexación de la versión integrada. No se modifica `main` para adelantarla.


## Alcance de las historias

Los criterios de HU-03 (#9) y HU-04 (#10) del tablero actual cubren catálogo y detalle públicos con datos reales y manejo de estados. Las acciones de compra se desarrollan en las historias correspondientes y se validan contra sus contratos reales de API.

La matriz `tests/plan.json` referencia las nueve issues vigentes. Los estados del tablero requieren conciliación con las entregas: una issue cerrada o una fecha vencida no sustituye la evidencia de implementación.

## Ramas y revisión

- `main`: versiones terminadas y comprobadas.
- `develop`: integración de tareas aprobadas.
- `feature/<tarea>`, `fix/<tarea>` y `chore/<tarea>`: trabajo con alcance concreto desde develop; PR hacia develop.
- `release/<version>`: opcional para preparar una entrega desde develop; PR a main y reintegración de sus correcciones a develop.
- `hotfix/<problema>`: corrección urgente desde una versión publicada en main; integrar también en develop.

Las versiones de entrega utilizarán SemVer (`MAJOR.MINOR.PATCH`) y tags `vX.Y.Z` sobre versiones revisadas e integradas en `main`.

Cada tarea incluye el código, las pruebas y la configuración que necesita. Las ramas muestran el proyecto completo; los commits y la pestaña Files changed del PR delimitan el trabajo realizado. Si hay dependencias entre tareas, integrar primero la base y después continuar desde develop actualizado.

`develop` exige PR, conversaciones resueltas y el check `Resultado de integración` aprobado y actualizado con la base. La aprobación humana de otro colaborador es opcional, conforme al flujo acordado. La regla también se aplica a administradores e impide force-push y borrado. `main` exige PR, al menos una aprobación de otro colaborador, conversaciones resueltas y `Resultado de integración` aprobado con la base actualizada. La protección se aplica también a administradores y bloquea push forzado y borrado. Configurar esta protección no modifica el contenido de la rama.

## Carpetas

- `src/app/`: rutas y composición de navegación con Expo Router.
- `src/features/`: pantallas, componentes, estado y tipos por función.
- `src/api/`: cliente HTTP, endpoints y conversión de datos.
- `src/config/`: configuración pública del backend.
- `src/components/` y `src/constants/`: componentes y estilos compartidos.
- `assets/`: logo y recursos utilizados por la aplicación y su configuración.

No subir node_modules, cachés, .env locales, reportes generados, claves de firma ni carpetas nativas generadas.

Documentación: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [variables de entorno](https://docs.expo.dev/guides/environment-variables/) y [ESLint](https://docs.expo.dev/guides/using-eslint/).
