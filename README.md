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

Jest 29, `jest-expo` compatible con SDK 57 y React Native Testing Library 14. La configuración está en `jest.config.js`; las pruebas viven en `__tests__/`, fuera de las rutas de navegación.

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
| HU-04 | Datos del ID seleccionado, producto inexistente, error de conexión y botón deshabilitado si está agotado | `__tests__/ProductDetailScreen.test.tsx` |

### Evidencia inicial: 13 de octubre de 2026

La validación local pasó con **4 suites y 22 pruebas**, sin snapshots, además de lint y TypeScript. La cobertura de líneas fue **83.33%** sobre los cuatro módulos incluidos en `collectCoverageFrom`; no representa toda la aplicación.

Una prueba reprodujo un defecto real: al seleccionar Fútbol, el catálogo aún mostraba productos de Básquetbol. Se corrigió `CatalogScreen` para aplicar `filters.sportName` junto con categoría y marca. El mismo caso pasa después del cambio. Los resultados locales quedan en `test-results/before-fix.json` y `test-results/jest.json`; el resumen está en `coverage/coverage-summary.json`. Los reportes se excluyen de Git y se regeneran con las pruebas.

### Integración continua: MOB-008

`.github/workflows/ci.yml` instala las dependencias fijadas, ejecuta lint, TypeScript y pruebas en cada Pull Request hacia `main` y cada actualización de `main`. Conserva los reportes como el artefacto `sport-center-mobile-test-evidence` durante 14 días. Una comprobación fallida queda visible en el PR; el workflow por sí solo no configura protección de rama.

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
