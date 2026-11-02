# Piloto nativo de rechazo bajo MITM — candidata Android

Estado: implementación del piloto y pruebas controladas; **sin ejecución nativa acreditada**. No sustituye la aceptación API34 ni los recorridos manuales del usuario en su teléfono. No ejecuta EAS ni crea un APK; no requiere cuentas, credenciales de aplicación ni escrituras al backend.

## Contrato y límites

El consumidor debe reutilizar el APK exacto del job API34, sus outputs build_id/commit/apk_sha256 y la misma URL de descarga. El runner vuelve a calcular SHA256 antes y después. Sólo admite refs/tags/candidate/android-* y PINNING_CANDIDATE=true; rechaza branch, otra compilación o metadatos incoherentes.

El job nuevo usa AVD efímero system-images;android-30;default;x86_64, revisión11, con -writable-system y sin snapshots compartidos. La revisión, API, ABI y tag default se verifican desde source.properties; la presencia de com.android.vending sigue bloqueando el piloto. Preflight exige userdebug, API30, x86_64, qemu, adbd root y ausencia de Play Store. Nunca opera contra un serial de dispositivo físico. Se comprueba minSdk del APK real; no se cambia minSdk ni se hace otro build.

La CA pública se instala sólo en /system/etc/security/cacerts del AVD mediante el procedimiento documentado para API29/30. El nombre usa subject_hash_old, se evita sobrescribir una CA existente y se verifica el hash de la copia. CA privada, configuración, eventos detallados, XML UI y log del proxy viven sólo en temporales privados del runner. El informe durable contiene controles, identificación del APK y contadores; no contiene tráfico, claves, cabeceras, cuerpos ni credenciales. La limpieza retira el proxy y la CA propia; el action debe destruir también el AVD al finalizar, incluso si el job se cancela.

El runner consulta la NSC **compilada**, no sólo el plugin: resuelve el ID de networkSecurityConfig contra resources.arsc y exige un único recurso XML default antes de leer su ruta compilada real con apkanalyzer23 verificado. El preflight estático ocurre antes del primer AVD. Sólo acepta la forma release actual: base system-only, dominio API exacto, dos o más pines iguales a config/security-pins.json, sin bypass ni vencimiento del pin-set. Una referencia incoherente bloquea el piloto; nunca se sustituye por el XML fuente.

API34 se conserva. Android14 prefiere el almacén APEX de Conscrypt y hay namespaces de zygote; un remount de /system no demuestra que ese APK acepte la CA. No se añade un montaje experimental de APEX a la aceptación existente.

## Controles obligatorios

1. **Positivo desde el propio APK.** App sin datos/caché previos; API en passthrough end-to-end mediante ClientHello.ignore_connection. Únicamente http2.mlstatic.com se intercepta para la imagen del catálogo. Se exige nombre de producto público visible, petición real de imagen 2xx no vacía con content-type image/* y TLS aceptado por el cliente en la misma conexión, firmado por la CA instalada. No basta el CONNECT, una petición desde curl/navegador o una imagen en caché.
2. **Negativo.** Se detiene el proceso del APK y se reinicia el proxy conservando esa misma CA; así se eliminan túneles y sesiones TLS del control. Ahora sólo se intercepta la API exacta. Se exige nuevo ClientHello, upstream TLS válido, certificado presentado con SAN/fechas/firma CA válidos y SPKI de hoja/CA diferentes de todos los pines, rechazo del cliente y error UI «No se pudo cargar el catálogo» con «Reintentar». HTTP API descifrado, aceptación TLS del API, passthrough accidental o fallo upstream contradicen el resultado y fallan. Si por error se alcanza HTTP API, el addon lo corta antes de reenviarlo; no permite mutaciones.
3. **Recuperación.** Se quita el proxy, se reinicia la app limpia y debe volver a mostrar el producto público desde su servicio.
4. **Resultado acotado.** Sólo todos los controles juntos producen passed_controlled_native_rejection. tls_failed_client aislado jamás aprueba. Este estado acredita rechazo nativo diferencial con CA aceptada en el control, respaldado por NSC compilada; no dice que se haya capturado una excepción nativa concreta. nativePinExceptionCaptured permanece false en este piloto; no se fabrica un mensaje «Pin verification failed».

El nombre PRODUCT_NAME actual y el host se cotejaron con el catálogo público disponible: «Gorra negra para de la marca alo» y http2.mlstatic.com. Son controles de disponibilidad sujetos a cambios; un redirect a otro host, respuesta 403, ausencia del producto o caché que impida el control deben bloquear el piloto, sin convertirlos en aprobado ni cambiar dominios automáticamente. El runner no inicia sesión y pm clear sólo afecta al paquete instalado en ese AVD nuevo.

## Herramienta fijada

- Versión: mitmproxy 12.3.1, standalone Linux x86_64.
- Fuente: https://downloads.mitmproxy.org/12.3.1/mitmproxy-12.3.1-linux-x86_64.tar.gz
- SHA256: f7b4237f5702f6cd21357fe6e4680a7e905f8f9b816b872230d018ea696c34d5
- Corroboración de versión: https://github.com/mitmproxy/mitmproxy/releases/tag/v12.3.1
- El hash se calculó por streaming HTTPS del binario oficial; no se encontró un checksum separado publicado por el mantenedor. Es un pin de la descarga revisada, no una afirmación de firma o atestación independiente.
- El instalador valida SHA256 antes de extraer o ejecutar, limita entradas del tar y comprueba --version. No instala una dependencia de la app ni utiliza pip/paquetes flotantes.

## Integración en la candidata

El job pinning de .github/workflows/api-android.yml consume la procedencia y el APK ya aceptado por el job android en API34. Descarga android-evidence y el mismo binario, y coteja ID EAS, commit y SHA256 antes de operar. No crea otro build.

La matriz activa el piloto sólo en tags candidate/android-*. El job usa API30 AOSP default x86_64 revisión11, -writable-system, sin snapshots, herramientas verificadas y un AVD efímero. Resultado de integración exige su éxito en esa candidata; no se ejecuta ni se acredita automáticamente en los PR ordinarios a develop.

Sólo android-pinning.json se conserva como evidencia adicional compacta. La CA, su clave, la configuración del proxy y los volcados temporales no se publican. Un error de preparación o ausencia del informe no se convierte en aprobado.
## Verificación local y fuentes

Pruebas aisladas del verificador cubren identidad del APK/tag, política compilada, exclusión de dispositivos físicos, controles incompletos, CA/SAN/firma o pines no válidos, upstream fallido, API aceptada, caché/otra conexión, evidencia de otra ejecución y UI ambigua. Se verifican sintaxis de JS/Python/Bash, ESLint scoped y TypeScript. No son un reemplazo de la ejecución del runner.

- Android NSC y overridePins: https://developer.android.com/privacy-and-security/security-config
- CA system API29/30, hash_old y remount: https://docs.mitmproxy.org/stable/howto/install-system-trusted-ca-android/
- ClientHello ignore_connection: https://docs.mitmproxy.org/stable/api/mitmproxy/tls.html
- Eventos TLS de cliente y upstream: https://docs.mitmproxy.org/stable/api/events.html
- apkanalyzer XML compilado: https://developer.android.com/tools/apkanalyzer
- Almacén de Conscrypt en Android14: https://source.android.com/docs/core/ota/modular-system/conscrypt


## Correcciones previas al primer piloto

Se sustituyó pm path por pm list packages para comprobar ausencia de Play Store: en API30, path devuelve1 cuando no existe el paquete. La colisión de CA se consulta como una única expresión para el shell remoto de adb, sin segundo sh -c sin comillas. Cada lectura UI borra el dump anterior y exige confirmación de escritura y hierarchy completa; un timeout de idle/root de UI Automator que devuelva0 se reintenta sin consumir XML viejo.

En mitmproxy12.3.1, ScriptLoader precede a TlsConfig. Un observer registrado mediante addons.add al quedar listo el proxy observa tls_start_client después de TlsConfig y obtiene el certificado local de TlsData.ssl_conn.get_certificate(as_cryptography=True). Conserva sólo identidad del objeto SSL y hashes/validación en memoria; el fallo posterior debe corresponder al mismo objeto y hoja. El verificador exige orden upstream TLS→certificado preparado→rechazo, y una categoría de alerta de certificado. Un cierre genérico o error de protocolo queda inconcluso. No se leen claves de sesión ni se publican errores TLS crudos.

La hoja generada por dummy_cert12.3.1 omite BasicConstraints. Esa ausencia se trata como hoja no CA según RFC5280; no basta para aprobar: siguen siendo obligatorios SAN, fechas de hoja/CA, firma contra la CA exacta, issuer, EKU servidor, CA BasicConstraints=true y ausencia de SPKI pinned. Client.mitmcert no se usa como sustituto del certificado configurado en la conexión SSL.

La suite Node contiene66 casos (42 controles previos y24 regresiones XML). El último es opt-in con PINNING_TEST_MITMDUMP apuntando a la distribución standalone12.3.1 verificada: ejecuta TLSConfig, OpenSSL y cryptography reales, sin backend, EAS o tráfico de aplicación, y comprueba19 condiciones positivas/negativas. Sin herramienta se informa como omitido, nunca como criptografía ejecutada. Comando: PINNING_TEST_MITMDUMP=/ruta/a/mitmdump npm test -- --watch=false --runTestsByPath __tests__/androidPinning.test.js. Esto no acredita todavía el recorrido nativo del APK sobre el AVD.

Fuentes exactas: [PackageManager API30](https://github.com/aosp-mirror/platform_frameworks_base/blob/android-11.0.0_r48/services/core/java/com/android/server/pm/PackageManagerShellCommand.java), [UI dump API30](https://github.com/aosp-mirror/platform_frameworks_base/blob/android-11.0.0_r48/cmds/uiautomator/cmds/uiautomator/src/com/android/commands/uiautomator/DumpCommand.java), [TLSConfig12.3.1](https://github.com/mitmproxy/mitmproxy/blob/v12.3.1/mitmproxy/addons/tlsconfig.py), [generación de certificados12.3.1](https://github.com/mitmproxy/mitmproxy/blob/v12.3.1/mitmproxy/certs.py), [get_certificate PyOpenSSL24.3](https://github.com/pyca/pyopenssl/blob/24.3.0/src/OpenSSL/SSL.py), [RFC5280§4.2.1.9](https://www.rfc-editor.org/rfc/rfc5280#section-4.2.1.9).

El lector de XML compilado rechaza comentarios, DTD, entidades declaradas y CDATA en lugar de eliminarlos. Sólo consume una declaración XML1.0 inicial mediante match+slice; el manifiesto se analiza como árbol y exige un único application directo, conservando atributos generales del manifiesto separados de la política NSC estricta. Esta corrección requiere confirmar de nuevo CodeQL sobre el siguiente SHA; la aprobación local no modifica el resultado del tag anterior.

La imagen AOSP está publicada en el [catálogo oficial](https://dl.google.com/android/repository/sys-img/android/sys-img2-1.xml); Android documenta [root en AOSP sin apps Google](https://developer.android.com/studio/run/managing-avds#system-images). El cambio de imagen no acredita todavía el control TLS nativo: deben pasar de nuevo todas las guardias y los controles causales con el mismo APK.
