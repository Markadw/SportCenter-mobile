# Seguridad y candidata Android

## Matriz de ejecución

| Evento | Comprobaciones |
| --- | --- |
| Push de rama de trabajo sin PR para ese commit | Lint, TypeScript y pruebas del cliente. |
| PR hacia develop | Calidad, HTTP, inspección de guiones de rendimiento y seguridad. APK y Android se omiten. |
| Push/merge a develop | Comprobar el commit integrado; sin repetir APK. |
| Push explícito de tag candidate/android-* | Calidad, HTTP, seguridad, una compilación APK, aceptación API34 y rechazo controlado API30 con ese mismo APK. Conserva evidencia; no entrega ni publica automáticamente. |
| Entrega hacia main | Conserva la exigencia de Android y las comprobaciones de entrega. No autoriza modificar main. |

La candidata por tag permite trabajar sin incorporar workflows a main. Se crea sólo al congelar la revisión final; no está programada y no genera builds para cada push de una feature. No borrar o mover una etiqueta para relanzar una revisión distinta: cada artefacto debe conservar su procedencia.

## Comprobaciones reales

Seguridad usa npm audit, Semgrep CE 1.183.0 y CodeQL oficial para JavaScript/TypeScript. Semgrep emplea p/ci con severidad ERROR, sin métricas ni subida de código a su plataforma, y una imagen Docker fijada por digest. Sus errores, reglas omitidas, informe ausente o falta de archivos analizados bloquean. Las reglas públicas del registro pueden cambiar; se conserva la versión del motor y el SHA256 del informe, sin afirmar un snapshot inmutable de esas reglas. Un error operativo, un SARIF ausente/inválido o un análisis omitido bloquea la integración. Se bloquean vulnerabilidades críticas de dependencias y hallazgos altos/críticos de SAST; los hallazgos restantes se muestran, no se ocultan ni se corrigen automáticamente con actualizaciones mayores.

Antes de compilar, se comprueban la cadena HTTPS real y los pines configurados de la API. Esto no sustituye una prueba negativa de pinning dentro del binario Android.

Tras descargar el APK del commit esperado, se comprueban su huella SHA256, firma, package, target SDK, debuggable, permisos, ABIs y alineación ZIP/ELF de 16 KB. JADX inspecciona como máximo dos clases nativas de arranque con una versión y SHA256 fijados. Si falta el archivo o una herramienta, el resultado no puede ser aprobado.

El inspector conserva sólo JSON y texto. No sube el APK completo, clases descompiladas, el ZIP de JADX ni almacenes de claves como artefactos diagnósticos. La descarga del APK corresponde al build EAS, cuya procedencia queda en el informe.

## Límites

- La firma comprueba integridad y esquemas, no una identidad comparada con una huella de publicación ya aprobada.
- La comprobación estructural de 16 KB no acredita por sí sola ejecución en un dispositivo de 16 KB.
- JADX acotado no analiza todo el bundle JavaScript/Hermes ni demuestra que R8 impida ingeniería inversa.
- Los IDs nativos de las librerías se clasifican por directorio ABI; la inspección de segmentos no sustituye una ejecución real por arquitectura.
- La aceptación actual con Maestro cubre recorridos públicos. La persona responsable eligió validar cuenta y compra manualmente en su teléfono; no se requieren secretos de cuenta en CI.
- La aprobación local de scripts y sus pruebas no significa que ya se haya generado o inspeccionado el APK final.

No se publica en Google Play ni se modifica el backend desde este flujo. La medición de carga sigue limitada a una copia aislada; no se envía estrés al servicio compartido.

## Ajustes de la candidata

El manifiesto generado de preview aún incluía SYSTEM_ALERT_WINDOW y VIBRATE, aunque el cliente no utiliza superposiciones ni vibración. Se bloquearon desde app.json y el inspector del APK también los rechaza. No se editaron archivos Android nativos a mano. La comprobación del manifiesto final debe volver a realizarse sobre el APK correspondiente.

El lockfile fija follow-redirects 1.16.2 y node-forge 1.4.2 mediante overrides de sus dependencias transitivas, sin añadirlas como dependencias de la app ni cambiar Expo SDK 57. El registro npm confirmó versiones y engines; la auditoría del lockfile bajó de siete a cinco paquetes con severidad alta, con cero críticos. Las cinco altas restantes se conservan en el informe: no se presenta una auditoría sin hallazgos ni se fuerza una migración mayor incompatible.

Se retiraron nueve recursos iniciales de Expo que ya no tenían referencias. Se conservan el logotipo y el icono utilizados por Sport Center.

El piloto API30 comprueba la NSC compilada y exige una imagen HTTPS aceptada por el propio APK con la CA system de prueba, rechazo de la API bajo MITM y recuperación sin proxy. Un fallo TLS aislado no aprueba. Sólo se ejecuta por etiqueta explícita de candidata; no modifica la aplicación ni el backend. Se conserva un informe compacto separado, sin claves de CA ni volcados de tráfico. El resultado nativo sigue pendiente hasta la ejecución real.

La rama predeterminada main todavía no contiene workflows. GitHub exige su presencia allí para ofrecer workflow_dispatch; por eso la ejecución disponible en este cierre utiliza exclusivamente el tag candidate/android-* desde el commit congelado. No se modifica main para habilitar un botón. Los inputs manuales quedan configurados para cuando esa condición se cumpla; un reintento de tag puede indicar EAS_REUSE_BUILD_ID expresamente.
