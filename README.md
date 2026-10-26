# Sport Center Mobile

Aplicación móvil de Sport Center para consultar productos deportivos y acceder a los servicios de la tienda.

Desarrollada con Expo SDK 57, React Native, TypeScript y Expo Router.
Repositorio: [Markadw/SportCenter-mobile](https://github.com/Markadw/SportCenter-mobile).

## Estado del proyecto

El proyecto está en desarrollo. La base disponible incluye inicio, catálogo, filtros por categoría y marca, y detalle de producto con consumo del backend.

La infraestructura de pruebas cubre lógica, componentes e integración del cliente con transporte simulado. Autenticación permanece pendiente de integración. Selección completa de variantes, carrito, direcciones, compra/pago, historial y gestión de datos personales forman parte del desarrollo pendiente.

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

Los flujos Maestro de catálogo y detalle se ejecutan sobre un APK candidato en un emulador Android API 34 de GitHub. Los PR a develop/main y las comprobaciones de main exigen aceptación; después de un merge a develop se ejecuta regresión del cliente y HTTP sin repetir Android. La ejecución manual permite incluir Android en develop. Un fallo de calidad o HTTP impide compilar y ejecutar aceptación.

Los guiones k6 de rendimiento y estrés requieren una API propia aislada y un commit de backend identificado. No ejecutarlos contra el Render compartido ni servicios de pago. Su inspección no equivale a medir capacidad o aprobar rendimiento.

### Matriz de automatización

| Evento | Rama o destino | Comprobaciones |
| --- | --- | --- |
| Push de trabajo | feature/*, fix/*, chore/*, test/*, release/*, hotfix/* | Lint, TypeScript, unitarias/componentes, integración simulada, regresión y configuración |
| PR | develop o main | Calidad, contratos HTTP, inspección k6 y compilación/aceptación Android |
| Push integrado, incluido merge | develop | Calidad, contratos HTTP e inspección k6 |
| Push integrado, incluido merge | main | Calidad, contratos HTTP, inspección k6 y compilación/aceptación Android; conserva evidencia |
| Manual | develop, release/* o hotfix/* | Integración; Android opcional sólo en develop y obligatorio en candidatas |
| Medición manual | develop o release/* | Carga o estrés contra API aislada confirmada |

El merge se atiende mediante push a su destino. No se añade un segundo disparador por cierre del PR. El resultado Resultado de integración falla si una etapa obligatoria falla, se cancela o se omite; marcarla como requerida en GitHub sigue pendiente de configurar. Los PR verifican la combinación con la base y los pushes verifican el commit de la rama.

Las ejecuciones ordinarias publican resultados en el resumen y los logs, sin subir informes de pruebas. Se conservan paquetes compactos ante fallos, en PR hacia main, en main y en candidatas manuales. Todos tienen retención de 14 días. Una simple inspección k6 no genera artefactos; una medición real conserva su JSON. Los APK permanecen en EAS y no se duplican en los artefactos de GitHub.

Los reportes de GitHub Actions son evidencias de esas ejecuciones; los archivos históricos de evidence/ conservan su fecha y commit originales.

### Configuración pendiente de Android en CI

- Vincular app.json a un proyecto EAS mediante extra.eas.projectId y definir android.package.
- Configurar el secreto EXPO_TOKEN en GitHub y las credenciales de firma Android en EAS.
- Definir ANDROID_TEST_PRODUCT_NAME con un producto conocido del entorno de pruebas.
- API_TEST_URL selecciona el backend HTTP y el incorporado al APK; API_TEST_PRODUCT_ID permite fijar el producto del contrato HTTP. La preparación sólo ajusta el perfil preview en la copia de CI para usar la misma API.
- EAS debe terminar el APK del mismo commit; CI verifica su procedencia, calcula SHA256, lo instala y ejecuta Maestro 2.12.0. La descarga de Maestro verifica el checksum de su versión.
- Si faltan precondiciones, Android falla antes de solicitar el build. Esta configuración todavía necesita comprobarse en GitHub con credenciales y un APK real.
- El entorno HTTP con datos sembrados y reiniciables sigue pendiente. La suite actual conserva el primer producto como alternativa cuando no se fija un ID.
- Estos workflows no publican en Google Play ni certifican rendimiento por inspeccionar guiones; la promoción y sus evidencias de medición se preparan por separado.

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
