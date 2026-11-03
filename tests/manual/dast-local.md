# Seguridad HTTP de la copia aislada

Este control dinámico comprueba seis casos de lectura contra el backend real fijado en `tests/environment/backend-source.json`, con la base y productos sintéticos del entorno Docker. Su alcance es finito: no es una auditoría de todas las rutas del backend desplegado ni una certificación de ausencia de vulnerabilidades.

| Caso | Petición y resultado exigido |
| --- | --- |
| D01 | Detalle del producto sintético 66: HTTP 200 y ese identificador. Es el control positivo del servicio. |
| D02 | Perfil sin sesión: HTTP 401/403. |
| D03 | Perfil con Bearer de formato incorrecto: HTTP 401/403. |
| D04 | Perfil con JWT sintético sin firma (`alg: none`): HTTP 401/403. No se usa una cuenta real. |
| D05 | Consulta de reseñas con identificador no numérico: HTTP 400. |
| D06 | La misma ruta con una cadena SQL breve en el identificador: HTTP 400. Comprueba el rechazo de ese parámetro; no demuestra ausencia de inyección SQL en otras rutas. |

Cada respuesta debe ser JSON limitado a 64 KiB, sin los campos sensibles o detalles internos conocidos que busca el control. Estos patrones detectan ejemplos concretos, no toda posible fuga de datos. El runner envía únicamente los seis GET predefinidos, uno por vez, con un máximo de cinco segundos por petición y sin seguir redirecciones. No acepta una URL alternativa, cookies, credenciales reales ni peticiones de escritura. No llama a registro, correo, recuperación, pagos o compras.

El gateway de QA conserva el enlace de Compose `127.0.0.1:3011`; sólo reenvía `Accept` y un `Authorization: Bearer` limitado a 2048 caracteres. Antes descartaba el Bearer: eso habría convertido una prueba de token inválido en otra prueba de ausencia de sesión. El destino interno sigue siendo `api:3000` y los únicos métodos son GET/HEAD. Este ajuste pertenece a la configuración de pruebas de la app; no modifica el repositorio del backend ni Render.

Con el entorno local ya preparado y sus contratos aprobados, ejecutar:

```powershell
$env:API_BASE_URL = 'http://127.0.0.1:3011'
$env:ISOLATED_DAST = 'true'
# GITHUB_SHA lo aporta Actions. Fuera de CI debe identificar la revisión móvil examinada.
node scripts/dast-local.js
```

El runner exige la procedencia recién generada en `test-results/local-environment.json`, la revisión del backend fijada, el producto 66 y la semilla esperada. Guarda `test-results/security/dast-local.json` y un resumen; publica sólo IDs de casos, códigos HTTP, motivos normalizados y el alcance. Nunca conserva cuerpos, encabezados de autorización, JWT ni errores crudos. Un caso fallido, una precondición ausente o un resultado incompleto produce salida distinta de cero. La limpieza del entorno sigue siendo obligatoria aunque falle.

En CI este paso debe ir después de los contratos locales y antes de compilar la candidata; el job API debe fallar si falla el control. Los informes compactos se pueden conservar con el artefacto HTTP existente durante 14 días. El análisis estático Semgrep/CodeQL conserva su función independiente. La validación nativa TLS tiene su propio APK, fuente y resultado; no se sustituye por estas peticiones HTTP locales.

Las regresiones del runner usan respuestas controladas y prueban sus límites, decisiones y saneamiento. No equivalen a la ejecución real del backend Docker: esa ejecución debe aparecer con su propio resultado CI. Persisten como pendientes los recorridos privados y físicos aplazados por el usuario, la autorización entre cuentas distintas, el almacenamiento del dispositivo y la publicación en Play.
