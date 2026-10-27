# Sport Center Mobile

Aplicación móvil de Sport Center para consultar productos deportivos y acceder a los servicios de la tienda.

Desarrollada con Expo SDK 57, React Native, TypeScript y Expo Router.
Repositorio: [Markadw/SportCenter-mobile](https://github.com/Markadw/SportCenter-mobile).

## Estado del proyecto

El proyecto está en desarrollo. La base disponible incluye inicio, catálogo, filtros por categoría y marca, y detalle de producto con consumo del backend.

La infraestructura de pruebas cubre lógica, componentes e integración del cliente con transporte simulado. El cliente incorpora registro de cuenta, verificación del correo y reenvío del código. El inicio de sesión permanece pendiente de integración. Selección completa de variantes, carrito, direcciones, compra/pago, historial y gestión de datos personales forman parte del desarrollo pendiente.

## Registro de clientes (HU-01)

El icono de usuario abre el registro. Se solicitan nombre, ambos apellidos, correo, teléfono de 10 dígitos y contraseña con confirmación. Cada contraseña permite mostrar u ocultar su contenido mediante un botón. La contraseña requiere al menos 12 caracteres, mayúscula, minúscula, número y un símbolo admitido por el backend; la ayuda del formulario muestra la lista.

El servicio usa los endpoints públicos POST /users/create-user, /users/verify-email y /users/resend-code. Solo envía los seis campos de registro aceptados; la confirmación de contraseña es local. El contrato se revisó en AlexisYazir/back-sport, commit 31ee304d902ec5ec5a9c0fc702eca5e1a531bc16.

Después del registro se introduce el código recibido por correo. El backend establece vigencia de 24 horas y 3 intentos; reenviar genera un código nuevo. La verificación no inicia sesión. «Ya tengo un código» permite retomar el proceso después de salir de la app o perder la conexión.

Las peticiones tienen un límite de espera de 45 segundos y no se repiten automáticamente. Un timeout puede ocurrir después de que el servidor haya procesado el registro: la pantalla indica revisar el correo antes de reintentar. Se bloquean envíos simultáneos y se cancela la espera al salir de la pantalla. La aplicación no guarda contraseñas ni códigos en almacenamiento y descarta el hash y el código presentes en la respuesta actual del backend.

Jest comprueba validaciones, contrato de envío, errores, registro/verificación/reenvío y concurrencia con transporte simulado; estas pruebas automatizadas no crean cuentas en Render. El 2026-10-27 el usuario confirmó en su Android, mediante Expo Go y la API real, el registro, la recepción del primer correo, el rechazo del código incorrecto, la recepción del reenvío y la verificación de la cuenta. El alcance y las limitaciones de esa comprobación están en [el registro manual](tests/manual/registro-cliente.md). La revisión e integración de HU-01 en GitHub siguen pendientes.

## Entorno y arranque

Usar Node 22.20.0 o superior compatible con SDK 57 y npm. Desde la carpeta del proyecto:

```powershell
npm ci
npm start
```

Escanear con Expo Go el QR que muestre esa terminal. Mantener el teléfono y la PC en la misma red y la terminal abierta. La dirección de Metro corresponde a la conexión de esa ejecución. Para limpiar su caché: `npm start -- --clear`.

La API predeterminada es https://back-sport-ghxk.onrender.com. Para cambiarla, copiar `.env.example` a `.env.local` y definir `EXPO_PUBLIC_API_URL`. Recargar completamente la aplicación después del cambio. Los valores EXPO_PUBLIC_ son públicos en el bundle; no guardar secretos allí.

Instalar paquetes con `npx expo install <paquete>` para resolver versiones compatibles con el SDK. Las carpetas android/ e ios/ se generan con Expo; la configuración nativa se mantiene mediante app.json y plugins.

## Verificación

```powershell
npm run validate
npx expo-doctor
```

- `npm run lint`: revisión ESLint del proyecto.
- `npm run typecheck`: comprobación TypeScript sin generar JavaScript.
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

Para ejecutar las consultas HTTP públicas desde PowerShell:

```powershell
$env:API_BASE_URL = 'https://back-sport-ghxk.onrender.com'
npm run test:api
```

La suite HTTP consulta catálogo, detalle y rechazo del perfil sin sesión; no crea cuentas ni modifica datos. Los resultados de cada ejecución se distinguen de la preparación de sus scripts.

Los flujos Maestro de catálogo y detalle requieren APK instalado, ADB, Maestro y los valores APP_ID/PRODUCT_NAME. En GitHub, la aceptación Android se habilita manualmente y depende de las pruebas HTTP y de la calidad del cliente aprobadas.

Los guiones k6 de rendimiento y estrés requieren una API propia aislada y un commit de backend identificado. No ejecutarlos contra el Render compartido ni servicios de pago. Su inspección no equivale a medir capacidad o aprobar rendimiento.

Los workflows revisan PR y cambios en develop/main. Los reportes de GitHub Actions son evidencias de esas ejecuciones; los archivos históricos de evidence/ conservan su fecha y commit originales.

eas.json define preview (APK interno) y production (AAB). Generar una compilación requiere vincular Expo, confirmar identificadores y credenciales de firma; la presencia del perfil no acredita un APK construido.

## Ramas y revisión

- `main`: versiones terminadas y comprobadas.
- `develop`: integración de tareas aprobadas.
- `feature/<tarea>`, `fix/<tarea>` y `chore/<tarea>`: trabajo con alcance concreto desde develop; PR hacia develop.
- `release/<version>`: opcional para preparar una entrega desde develop; PR a main y reintegración de sus correcciones a develop.
- `hotfix/<problema>`: corrección urgente desde una versión publicada en main; integrar también en develop.

Cada tarea incluye el código, las pruebas y la configuración que necesita. Las ramas muestran el proyecto completo; los commits y la pestaña Files changed del PR delimitan el trabajo realizado. Si hay dependencias entre tareas, integrar primero la base y después continuar desde develop actualizado.

Las protecciones de main y develop todavía deben configurarse en GitHub para exigir PR y verificaciones. Documentar el flujo no bloquea por sí solo los pushes directos.

## Carpetas

- `src/app/`: rutas y composición de navegación con Expo Router.
- `src/features/`: pantallas, componentes, estado y tipos por función.
- `src/api/`: cliente HTTP, endpoints y conversión de datos.
- `src/config/`: configuración pública del backend.
- `src/components/` y `src/constants/`: componentes y estilos compartidos.
- `assets/`: logo y recursos utilizados por la aplicación y su configuración.

No subir node_modules, cachés, .env locales, reportes generados, claves de firma ni carpetas nativas generadas.

Documentación: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [variables de entorno](https://docs.expo.dev/guides/environment-variables/) y [ESLint](https://docs.expo.dev/guides/using-eslint/).
