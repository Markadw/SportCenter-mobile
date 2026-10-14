# Sport Center Mobile

Aplicación móvil para clientes de Sport Center con React Native, Expo SDK 57 y TypeScript. Consume la API existente. El alcance planeado incluye registro, sesión, catálogo público, detalle, carrito, direcciones, checkout, pedidos y perfil.

La metodología es **Mobile-D** y el seguimiento utiliza Kanban en [GitHub Projects](https://github.com/users/Markadw/projects/2). Las historias planeadas no equivalen a funciones implementadas o verificadas.

## Ejecución

Utilizar Node.js 22.20.0 y npm. Las rutas de Expo Router están en `src/app/`.

```bash
npm ci
npm start
```

## Configuración de pruebas

### Tipos definidos en la planeación integrada

La referencia recibida es `Planeacion_Integrada_SportCenter_Mobile.docx`, secciones 10–15. Se aplica a **Markadw/SportCenter-mobile**, ubicación confirmada por el usuario, aunque el documento referencia originalmente un repositorio organizacional distinto. La [matriz completa](tests/plan.json) relaciona siete actividades de prueba, tres pipelines y los nueve grupos CP de historias.

| Actividad del documento | Configuración y ejecución | Estado comprobado |
|---|---|---|
| Unitarias | Jest/jest-expo; `npm run test:unit` | 43 casos de lógica y componentes del código disponible |
| Análisis estático | ESLint y TypeScript; `npm run lint` y `npm run typecheck` | Validaciones correctas; no sustituyen pruebas funcionales |
| Integración | `npm run test:integration` une vistas/contextos/servicios reales con transporte simulado; `npm run test:api` comprueba HTTP real por separado | 4 casos de integración del cliente y 4 de lectura HTTP real aprobados |
| Aceptación | `.maestro/`, `npm run test:acceptance`, Android y revisión manual | Dos flujos preparados; no ejecutados en dispositivo |
| Regresión | `npm run test:regression` reutiliza casos anteriores y nuevos | 47 casos del cliente aprobados; no acredita regresión del sistema completo |
| Rendimiento | k6; `tests/performance/load.js`; medición Android manual separada | Guion inspeccionado correctamente; backend y Android no medidos |
| Esfuerzo o estrés | k6; `tests/performance/stress.js`, con reducción de carga y recuperación | Guion inspeccionado correctamente; carga no ejecutada |

**Conteo:** 47 pruebas del cliente (43 unitarias/componentes y 4 de integración) más 4 HTTP en una suite separada. Regresión reutiliza las mismas 47; no se suman otra vez. La integración HTTP comprobó catálogo público, forma de variantes/precios/stock, detalle por ID y rechazo de perfil sin sesión. Se hicieron únicamente consultas GET, sin crear cuentas, carritos o compras.

#### Pipeline 1 Verificación del cliente móvil

`.github/workflows/ci.yml` ejecuta instalación, lint, tipos, casos del cliente y validación de YAML/perfil APK. El resumen de Actions muestra resultados **por tipo** y distingue los casos aprobados de la configuración pendiente de ejecución. La suite HTTP real se excluye de Jest del cliente. `npm run test:config` comprueba sintaxis y estructura; no ejecuta Android o carga.

#### Pipeline 2 API APK y aceptación

`.github/workflows/api-android.yml` ejecuta la suite HTTP de lectura en PR del propio repositorio y permite ejecución manual con `API_BASE_URL`. En PR utiliza `API_TEST_URL` si está configurada o la API pública indicada en el documento. Se realizan tres consultas GET; no se ejecutan operaciones de escritura o carga. Esta suite permanece separada del pipeline del cliente. El trabajo Android es opcional, solo manual, y necesita un runner propio etiquetado `android`, Maestro/ADB, APK instalado, `APP_ID` y `PRODUCT_NAME` reales. `eas.json` prepara `preview` con distribución interna y APK; antes de compilar se deben configurar el identificador Android y el proyecto/cuenta EAS. No se generó ni instaló una APK en esta configuración.

```bash
# Con API_BASE_URL definido en el entorno:
npm run test:api
# Con APK instalado, APP_ID y PRODUCT_NAME definidos:
npm run test:acceptance
# Tras configurar la identidad Android y EAS:
npx eas-cli@latest build --platform android --profile preview
```

Los workflows manuales deben integrarse a `main` para aparecer con **Run workflow**. Durante el PR las suites pueden ejecutarse localmente; su evidencia se registra por separado.

#### Pipeline 3 Carga esperada y estrés

`.github/workflows/performance.yml` inspecciona ambos guiones con k6 en cada PR. **Ese trabajo no realiza peticiones ni acredita rendimiento.** La medición requiere ejecución manual y `API_BASE_URL`, `ISOLATED_API=true`, `PRODUCT_ID` y `BACKEND_COMMIT`. Se rechazan el Render compartido indicado en el documento y Mercado Pago como objetivos de carga.

```bash
# Con el entorno aislado y sus variables previamente definidos:
npm run test:load
npm run test:stress
```

Los parámetros iniciales son pilotos pequeños: carga de 1 usuario durante 10 segundos y estrés de 1 a 3 usuarios con reducción y recuperación. Deben ajustarse al uso esperado y a la línea base antes de acreditar capacidad. La carga normal acepta `P95_LIMIT_MS`, `ERROR_RATE_LIMIT` y `THRESHOLD_REASON`; sin umbrales justificados el resultado se documenta como línea base. Estrés comprueba recuperación sin imponer automáticamente el mismo P95 a la sobrecarga. Los reportes preservan métricas y el commit del backend. k6 no acredita fluidez móvil.

#### Alcance pendiente y correspondencia con el documento

La matriz conserva CP-01 a CP-09. Registro, activación, renovación de sesión, perfil/logout, carrito persistente, direcciones, pago/tracking e historial requieren sus módulos y contratos. CP-03 y CP-04 siguen parciales: faltan, entre otros, precio desde, selección real de variante, máximo de 99 y aceptación Android. Pasar las pruebas disponibles no cierra esas historias.

El documento estima **60 SP** y asigna QA-001 a pruebas por historia, QA-002 a integración/rendimiento/estrés y QA-003 a sistema/aceptación. El tablero anterior tiene 52 SP y utiliza esos códigos para actividades distintas. Se registra esa diferencia para conciliarla en PLAN-001; esta ampliación configura los tipos de prueba y no reasigna historias ni modifica estimaciones automáticamente.

El registro manual debe incluir caso/HU, tipo, precondiciones, pasos, esperado, obtenido, estado, ejecutor/revisor, commit, build, Android y evidencia. Usar **no ejecutado** cuando falte un recurso; conservar **fallido** para un resultado contrario al criterio.

Jest 29, `jest-expo` compatible con SDK 57 y React Native Testing Library 14. Se fija `test-renderer` en 1.2.0 para usar el reconciliador compatible con React 19.2. La configuración del cliente está en `jest.config.js`; sus pruebas viven en `__tests__/` y `tests/integration/`, fuera de las rutas de navegación. La suite HTTP utiliza `jest.api.config.js` y `tests/api/` por separado.

```bash
npm test              # ejecución única
npm run test:watch    # desarrollo con repetición
npm run test:ci       # pruebas, cobertura y reporte JSON
npm run validate      # lint + TypeScript + pruebas y cobertura
```

Las peticiones HTTP, el router y los iconos nativos se sustituyen por dobles de prueba. Se renderizan las pantallas y el contexto real de productos. Estas pruebas son deterministas y no requieren sesión ni conexión al backend; por ello no certifican el contrato de la API desplegada ni una compra real.

| Referencia | Comprobaciones automatizadas | Archivo |
|---|---|---|
| MOB-004, HU-03, HU-04 | Conversión de respuestas, stock de variantes, catálogo vacío, detalle inexistente y errores de red | `__tests__/productsApi.test.ts` |
| HU-03 | Carga inicial, recuperación al reintentar y conservación de productos ante un error de actualización | `__tests__/ProductsContext.test.tsx` |
| HU-03 | Acceso público, navegación al detalle, carga, error, filtros, ausencia de resultados y páginas de 20 productos | `__tests__/CatalogScreen.test.tsx` |
| HU-03, MOB-004 | Categorías, marcas y deportes: conversión de respuestas, listas vacías y errores de conexión | `__tests__/catalogApi.test.ts` |
| HU-03 | Carga de opciones, filtros combinados, limpieza de selecciones y contador de filtros activos | `__tests__/FiltersContext.test.tsx` |
| HU-04 | Datos del ID seleccionado, producto inexistente, error de conexión, atributos, regreso y límites de cantidad | `__tests__/ProductDetailScreen.test.tsx` |

### Ampliación de pruebas sencillas: 13 de octubre de 2026

Se agregaron **21 casos** a los 22 iniciales: el resultado de esa ampliación fue **6 suites y 43 pruebas aprobadas**. También pasan lint y TypeScript. La cobertura de líneas es **87.11% sobre seis módulos seleccionados**, incluidos ahora `catalogApi` y `FiltersContext`; el alcance de cobertura es más amplio que el del reporte inicial.

| Planeación | Casos adicionales | Resultado esperado |
|---|---|---|
| HU-03 / MOB-004 | 9 casos de categorías, marcas y deportes | Conservar datos para los filtros, aceptar listas vacías y propagar errores de conexión |
| HU-03 | 4 casos del contexto de filtros | Cargar opciones, combinar selecciones, limpiar todo y retirar un filtro sin borrar los demás |
| HU-03 | 4 casos de pantalla de catálogo | Filtrar por categoría específica, combinar los tres filtros, recuperar productos al quitar un filtro y volver a la página 1 si desaparece la página actual |
| HU-04 | 4 casos de detalle | Mostrar descripción y atributos, volver ante producto inexistente y mantener la cantidad entre uno y el stock disponible |

Estos casos amplían QA-003 y la regresión de HU-03/HU-04 conforme a Mobile-D. Se conservan las iteraciones y los 52 SP. Los controles de cantidad reciben etiquetas accesibles para identificarlos como Aumentar/Disminuir cantidad. Comprobar ese selector no certifica la integración del carrito o una compra.

El [reporte de ampliación](evidence/validation-extension-2026-10-13.json) contiene los resultados de cada caso. En GitHub Actions, abrir la ejecución del PR y consultar el resumen **Pruebas de Sport Center Mobile**: muestra el total, el nombre y el resultado de los 43 casos. El paso **Tests and coverage** también presenta los casos individualmente y los reportes completos se conservan como artefactos.

### Evidencia inicial: 13 de octubre de 2026

La validación local pasó con **4 suites y 22 pruebas**, sin snapshots, además de lint y TypeScript. La cobertura de líneas fue **83.33%** sobre los cuatro módulos incluidos en `collectCoverageFrom`; no representa toda la aplicación.

Una prueba reprodujo un defecto real: al seleccionar Fútbol, el catálogo aún mostraba productos de Básquetbol. Se corrigió `CatalogScreen` para aplicar `filters.sportName` junto con categoría y marca. El mismo caso pasa después del cambio. Los resultados locales quedan en `test-results/before-fix.json` y `test-results/jest.json`; el resumen está en `coverage/coverage-summary.json`. Los reportes se excluyen de Git y se regeneran con las pruebas.

### Integración continua: MOB-008

`.github/workflows/ci.yml` instala las dependencias fijadas, ejecuta lint, TypeScript y pruebas en cada Pull Request hacia `main` y cada actualización de `main`. Conserva los reportes como el artefacto `sport-center-mobile-test-evidence` durante 14 días. Una comprobación fallida queda visible en el PR; el workflow por sí solo no configura protección de rama.

El paso **Publish test summary** publica automáticamente la tabla de casos y los resultados del reporte de Jest, incluso cuando hay pruebas fallidas. Si una validación previa impide generar el reporte, el resumen informa esa ausencia.

La [ejecución inicial en GitHub Actions](https://github.com/Markadw/SportCenter-mobile/actions/runs/38477517988) pasó también en Linux: instalación limpia, lint, TypeScript y 22 pruebas. El artefacto se descargó y se verificaron sus resultados. [Resumen de CI](evidence/ci-2026-10-13.json).

## Adecuaciones de planeación

Se conserva la línea base del tablero: Explore, Initialize, seis iteraciones de Productionize, Stabilize, System Test & Fix y RC / Validación interna. Kanban sirve para seguir el trabajo; no cambia Mobile-D.

| Actividad | Adecuación | Evidencia necesaria para terminar |
|---|---|---|
| Configuración de pruebas / MOB-008 | Recuperar esta infraestructura durante I2; pasar a Revisión cuando el PR y las comprobaciones estén disponibles | PR integrado, CI correcto y revisión cruzada |
| HU-03 / I2, 10–14 oct | Incluir filtros, paginación, errores y regresión del defecto por deporte | Pruebas automáticas y validación contra API real |
| HU-04 y HU-09 / I3, 15–19 oct | Incorporar las pruebas de detalle; completar las fechas faltantes de perfil conforme a I3 | Criterios de cada historia verificados por separado |
| HU-05 / I4, 20–24 oct | Corregir la fecha final 24 sep, anterior al inicio, a 24 oct | Carrito integrado, cantidades, totales y pruebas; el botón actual solo registra en consola |
| HU-06 y HU-08 / I5, 25–28 oct | Alinear las fechas de pedidos con su iteración | Direcciones y pedidos reales de la cuenta autenticada |
| HU-07 / I6, 29 oct–2 nov | Probar éxito, rechazo y error; depender del contrato validado en MOB-006 | Confirmación real del backend/pago |
| QA-001 / Stabilize, 3–7 nov | Ejecutar regresión automática y flujos integrados después de las seis iteraciones | Reporte de regresión y defectos registrados |
| QA-002 / System Test & Fix, 8–11 nov | Ejecutar la matriz funcional en Android físico | Modelo, Android, build, resultados, capturas y correcciones |
| REL-001 / RC, 12–15 nov | Validar la build candidata tras QA-001 y QA-002 | Build identificable, instalación y validación interna |

Los puntos de las nueve historias se conservan en **52 SP**. Las estimaciones de tareas técnicas nuevas se validan por la bina mediante Planning Poker. Las fechas expresan planeación y no garantizan que una actividad esté terminada.

### Evidencia de adecuaciones aplicadas

Se verificaron los cambios contra el tablero real. [La captura de datos anterior](evidence/planning-before-2026-10-13.json) y [la posterior](evidence/planning-after-2026-10-13.json) permiten comparar fechas y estados.

- HU-05: finalización corregida de 24 sep a 24 oct.
- HU-08: periodo corregido de 3 oct–7 nov a 25–28 oct, correspondiente a I5.
- HU-09: fechas completadas para 15–19 oct, correspondientes a I3.
- QA-001, QA-002 y REL-001: fechas completadas conforme a las fases de la línea base.
- MOB-008 y [QA-003](https://github.com/Markadw/SportCenter-mobile/issues/26): en Revisión durante I2, vinculados al [PR #28](https://github.com/Markadw/SportCenter-mobile/pull/28).
- [BUG-001](https://github.com/Markadw/SportCenter-mobile/issues/27): defecto real del filtro por deporte, con corrección preparada y estado Revisión.
- [PLAN-001](https://github.com/Markadw/SportCenter-mobile/issues/29): tarea Por hacer para localizar las evidencias y reconciliar estados inconsistentes de actividades cerradas.

### Pruebas durante cada iteración

1. Antes de empezar: revisar criterios, contratos API, datos y dependencias.
2. Durante la implementación: agregar pruebas de éxito y error del flujo real.
3. En cada PR: ejecutar `npm run validate` y solicitar revisión cruzada.
4. Antes de terminar: verificar integración, adjuntar evidencia y registrar Bugs.
5. En Stabilize y System Test & Fix: repetir regresión y validar en dispositivo.

Una historia pasa a **Terminado** cuando cumple sus criterios, tiene evidencia, revisión cruzada e integración. Un issue cerrado y un estado distinto del tablero requieren reconciliar la evidencia; no se deben marcar como terminadas funciones que no fueron verificadas.

### Validaciones pendientes

- MOB-006: comprobar los contratos contra la API real, incluidos autenticación y pago.
- Revisar evidencias y ramas de HU-01/HU-02: los issues estaban cerrados, el tablero indicaba En progreso y las rutas de autenticación no estaban en la versión `main` revisada. Mantener pendiente su validación hasta localizar la entrega.
- Confirmar los estados de MOB-002/MOB-003, también cerrados con En progreso en el tablero.
- Ejecutar QA-001 completo, QA-002 en Android físico y REL-001; las 22 pruebas automáticas de catálogo/detalle no completan esas actividades.
- Verificar cantidades por variante durante HU-05 y persistencia de sesión antes de validar cuenta y compra.

Para pruebas manuales registrar: ID del caso, HU, build/commit, dispositivo, precondiciones, pasos, resultado esperado, resultado obtenido, estado y evidencia. Usar datos de prueba acordados. Actualmente desarrollo y producción apuntan a la misma URL en `src/config/env.ts`; confirmar el ambiente antes de operaciones que creen o modifiquen datos.

## Referencias

- [Configuración oficial de pruebas en Expo](https://docs.expo.dev/develop/unit-testing/)
- [MOB-008: integración continua](https://github.com/Markadw/SportCenter-mobile/issues/18)
- [QA-001: estabilización y regresión](https://github.com/Markadw/SportCenter-mobile/issues/20)
- [QA-002: pruebas en dispositivo físico](https://github.com/Markadw/SportCenter-mobile/issues/21)
