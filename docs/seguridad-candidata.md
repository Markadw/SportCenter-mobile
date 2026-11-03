# Seguridad y candidata Android

## Matriz de ejecución

| Evento | Comprobaciones |
| --- | --- |
| Push de rama de trabajo sin PR para ese commit | Lint, TypeScript y pruebas del cliente. |
| PR hacia develop | Calidad, HTTP, inspección de guiones de rendimiento y seguridad. APK y Android se omiten. |
| Push/merge a develop | Comprobar el commit integrado; sin repetir APK. |
| Push explícito de tag candidate/android-* | Calidad, HTTP, seguridad, una compilación APK, aceptación API34 y rechazo controlado API30 con ese mismo APK. Conserva evidencia; no entrega ni publica automáticamente. |
| Push explícito de tag validation/android-* | Auxiliar del segundo pipeline: calidad, seguridad, procedencia e inspección del APK existente, aceptación API34, rechazo controlado API30 y ejecución de 16 KB simulados en API36 x86_64; sin compilar otro APK. |
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

El lockfile fija follow-redirects 1.16.2 y node-forge 1.4.2 mediante overrides de sus dependencias transitivas, sin añadirlas como dependencias de la app ni cambiar Expo SDK 57. El registro npm confirmó versiones y engines; la auditoría del lockfile bajó de siete a cinco paquetes con severidad alta, con cero críticos. Aquel corte conservó cinco alertas altas. La revisión de dependencias de SDK 57 descrita abajo reduce las altas a tres; los resultados históricos conservan su alcance.

Se retiraron nueve recursos iniciales de Expo que ya no tenían referencias. Se conservan el logotipo y el icono utilizados por Sport Center.

El piloto API30 comprueba la NSC compilada y exige una imagen HTTPS aceptada por el propio APK con la CA system de prueba, rechazo de la API bajo MITM y recuperación sin proxy. Un fallo TLS aislado no aprueba. Sólo se ejecuta por etiqueta explícita candidate/android-* o validation/android-*; no modifica la aplicación ni el backend. Se conserva un informe compacto separado, sin claves de CA ni volcados de tráfico. La aprobación exige la ejecución real de todos sus controles.

La rama predeterminada main todavía no contiene workflows. GitHub exige su presencia allí para ofrecer workflow_dispatch; por eso se usan etiquetas explícitas candidate/android-* o validation/android-* desde revisiones congeladas. La segunda activa android-validation.yml como auxiliar del segundo de los tres pipelines principales: exige la fuente y SHA256 del mismo APK, distingue la revisión de automatización y conserva el resultado histórico de la candidata. Véase [la guía de validación nativa](../tests/manual/android-16k.md). No se modifica main para habilitar un botón. Los inputs manuales quedan configurados para cuando esa condición se cumpla; un reintento de tag puede indicar EAS_REUSE_BUILD_ID expresamente.
## Revisión de dependencias en Expo SDK 57

La auditoría del lock anterior registró cinco alertas altas y cero críticas. Se originaban en dos dependencias: Zod y decode-uri-component; los avisos de @expo/cli, expo-router y query-string se heredaban de esas cadenas. Con el ajuste actual quedan tres altas y cero críticas, además de 43 moderadas y seis bajas. No se cambiaron los umbrales del pipeline ni se excluyeron paquetes de la auditoría.

| Cadena | Cambio y resultado |
| --- | --- |
| @expo/cli → Zod | Se fija Zod 4.6.6 mediante override y lock con integridad npm. Corrige GHSA-mrhx-c7xc-m3w5 y desaparece el aviso alto heredado del CLI. El CLI conserva otras alertas moderadas de su árbol. |
| expo-router → query-string → decode-uri-component | Se conservan Router 57.0.29, query-string 7.1.3 y decoder 0.2.2. Sus tres avisos altos siguen pendientes. El decoder corregido 0.5.1 es ESM; query-string 7 espera una función CommonJS. Actualizar query-string a 9.5.x tampoco es un reemplazo directo: Router 57 usa un namespace con parse/stringify y esa versión sólo exporta default. La prueba aislada produjo TypeError; no se conservó ese cambio incompatible. |

Un backport del decoder que conserve CommonJS es otra alternativa técnica, pero supone mantener un parche y su aplicación en las instalaciones, probar entradas adversariales y validar Hermes en una candidata nueva. No se incluyó en esta actualización de versiones. Su versión seguiría siendo 0.2.2 y npm audit conservaría los avisos; no se debe cambiar la identidad del paquete para aparentar que desaparecieron.

Zod 4.6.6 queda fuera del rango ^3.25.76 declarado por CLI 57.0.32. Este override se evalúa como ajuste transitorio del proyecto, no como parche oficial publicado de Expo. Los consumidores actuales de ESLint admiten Zod 4. Se comprueban los esquemas reales de plugins, outputs y comandos MCP del CLI, entradas válidas e inválidas, error.issues, el formateador de ESLint, resolución de versiones por consumidor, configuración Expo y empaquetado Android. La regresión permanece en __tests__/expoDependencyCompatibility.test.js. El servidor MCP opcional no está instalado ni habilitado; no se afirma una validación de su transporte completo.

Expo 57.0.31, Router 57.0.29, React y React Native se mantienen. El diff del lock cambia únicamente Zod; una instalación limpia comprueba las versiones fijadas, incluidos los overrides anteriores de follow-redirects y node-forge. La exportación de JavaScript no genera un APK ni acredita una nueva aceptación en teléfono. Los APK/AAB anteriores conservan su fuente y sus resultados; una entrega posterior debe corresponder al lock final revisado.

Expo ya tiene un cambio oficial que retira Zod del CLI, pero todavía figura como Unpublished para SDK 57. Cuando exista una versión compatible publicada, se debe revisar la retirada del override con las mismas comprobaciones.

Fuentes: [aviso de Zod](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [decoder: complejidad cuadrática](https://github.com/advisories/GHSA-qr28-fpjm-wq7f), [decoder: decodificación exponencial](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr), [cambio oficial del CLI](https://github.com/expo/expo/pull/52599) y [changelog SDK 57](https://github.com/expo/expo/blob/sdk-57/packages/@expo/cli/CHANGELOG.md).
