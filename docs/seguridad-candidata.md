# Seguridad y candidata Android

## Matriz de ejecución

| Evento | Comprobaciones |
| --- | --- |
| Push de rama de trabajo sin PR para ese commit | Lint, TypeScript y pruebas del cliente. |
| PR hacia develop | Calidad, HTTP, inspección de guiones de rendimiento y seguridad. APK y Android se omiten. |
| Push/merge a develop | Comprobar el commit integrado; sin repetir APK. |
| Push explícito de tag candidate/android-* | Calidad, HTTP, seguridad, una compilación APK y aceptación Android de ese SHA. Conserva evidencia; no entrega ni publica automáticamente. |
| Entrega hacia main | Conserva la exigencia de Android y las comprobaciones de entrega. No autoriza modificar main. |

La candidata por tag permite trabajar sin incorporar workflows a main. Se crea sólo al congelar la revisión final; no está programada y no genera builds para cada push de una feature. No borrar o mover una etiqueta para relanzar una revisión distinta: cada artefacto debe conservar su procedencia.

## Comprobaciones reales

Seguridad usa npm audit y CodeQL oficial para JavaScript/TypeScript. Un error operativo, un SARIF ausente/inválido o un análisis omitido bloquea la integración. Se bloquean vulnerabilidades críticas de dependencias y hallazgos altos/críticos de SAST; los hallazgos restantes se muestran, no se ocultan ni se corrigen automáticamente con actualizaciones mayores.

Antes de compilar, se comprueban la cadena HTTPS real y los pines configurados de la API. Esto no sustituye una prueba negativa de pinning dentro del binario Android.

Tras descargar el APK del commit esperado, se comprueban su huella SHA256, firma, package, target SDK, debuggable, permisos, ABIs y alineación ZIP/ELF de 16 KB. JADX inspecciona como máximo dos clases nativas de arranque con una versión y SHA256 fijados. Si falta el archivo o una herramienta, el resultado no puede ser aprobado.

El inspector conserva sólo JSON y texto. No sube el APK completo, clases descompiladas, el ZIP de JADX ni almacenes de claves como artefactos diagnósticos. La descarga del APK corresponde al build EAS, cuya procedencia queda en el informe.

## Límites

- La firma comprueba integridad y esquemas, no una identidad comparada con una huella de publicación ya aprobada.
- La comprobación estructural de 16 KB no acredita por sí sola ejecución en un dispositivo de 16 KB.
- JADX acotado no analiza todo el bundle JavaScript/Hermes ni demuestra que R8 impida ingeniería inversa.
- Los IDs nativos de las librerías se clasifican por directorio ABI; la inspección de segmentos no sustituye una ejecución real por arquitectura.
- La aceptación actual con Maestro cubre recorridos públicos. Cuenta, compra y protecciones nuevas requieren casos y credenciales de prueba apropiados.
- La aprobación local de scripts y sus pruebas no significa que ya se haya generado o inspeccionado el APK final.

No se publica en Google Play ni se modifica el backend desde este flujo. La medición de carga sigue limitada a una copia aislada; no se envía estrés al servicio compartido.
