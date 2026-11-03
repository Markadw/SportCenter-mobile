# Aceptación privada de cuenta en Android

Preparación privada, todavía sin ejecución Linux/Android. Los resultados unitarios del ejecutor no prueban el funcionamiento de una cuenta real. El flujo deberá publicarse únicamente después de revisión y de aprobar calidad/seguridad.

## Artefacto y alcance

Se reutiliza exclusivamente el APK preview `b409ac48-41b0-4292-8e9c-df8153006f71`, fuente `e15671b17615621b29f4bc4bb9c0ccfdf167e657`, SHA256 `092cdbbc6942fe16c941f814a0b581b26c33c8cd658ae5b0015d9c10f947d564`. El productor es `41708999367`, intento 2, aprobado; el primer intento no acredita aceptación.

La automatización se identifica por una etiqueta nueva `validation/account-*`; su SHA es distinto de la fuente del APK. Una guardia acepta sólo las rutas concretas de automatización/documentación revisadas desde F2. Cualquier cambio de app, activos, configuración, paquetes o lockfile exige otra candidata. No se flexibilizan las guardias históricas de otros APK.

El preflight verifica por API GitHub el productor, sus ocho trabajos obligatorios, el intento y el ZIP original `android-evidence` ID `13272237966`, 176634 bytes, SHA256 `dda9576bdc03753f5ba24600b676770592a6915aa1b42792e49b87efdafef07d`. Extrae sólo los JSON de identidad e inspección; no necesita confiar en un nombre de artifact mutable. EAS se consulta únicamente con `build:view` 27.4.0; se exige proyecto, perfil preview terminado, paquete, versión, fuente y mensaje exactos, y se vuelve a comprobar el hash de la descarga. No se construye otra app.

## Cuenta y datos necesarios

- Cuenta de **cliente ya verificada**, dedicada a pruebas y reservada durante la ejecución.
- Credenciales guardadas exclusivamente en Actions como `ANDROID_TEST_EMAIL` y `ANDROID_TEST_PASSWORD`; no copiarlas a chat, YAML, argumentos o artifacts. La validación de contraseña mínima de ocho caracteres corresponde al formulario móvil existente. Se conservan los caracteres especiales/Unicode sin invocar un shell para introducirlos.
- Carrito previamente poblado con al menos un artículo activo y con existencias suficientes. Si está vacío, la prueba se registra bloqueada. No agrega ni elimina productos automáticamente.
- No hace falta dirección guardada: `GET /products/checkout/summary` permite mostrar el resumen y el formulario vacío. La dirección sólo se guarda al confirmar un pedido, acción excluida.

No se realiza un login auxiliar por API. El servicio de sesiones observado puede reutilizar una sesión activa y rotar su refresh token; hacerlo durante la prueba introduciría interferencia en la restauración.

## Siete comprobaciones

| ID | Resultado que se exige |
|---|---|
| AC01 | Inicio de sesión real y pantalla Mi cuenta. Un solo envío del formulario. |
| AC02 | Perfil cargado mediante lectura; el campo Correo coincide en memoria con la cuenta esperada. No se escribe ni pulsa Guardar cambios. |
| AC03 | Carrito cargado y no vacío; no se cambia ninguna cantidad. |
| AC04 | Resumen con dirección, envío y totales. Se observa «Continuar a Mercado Pago» y se detiene antes de pulsarlo. |
| AC05 | `force-stop` y apertura sin borrar datos ni reinstalar; la cuenta se restaura sin introducir otra vez la contraseña. |
| AC06 | Cierre de sesión desde la app y retorno al formulario de acceso. |
| AC07 | Otra apertura sin borrar datos muestra invitado; entrada a carrito exige iniciar sesión y oculta subtotal privado. |

Una falla mantiene el resultado global fallido y los pasos posteriores quedan sin ejecutar. El ejecutor intenta cerrar localmente cualquier sesión iniciada antes de desinstalar su paquete y destruir el entorno. No confunde el cierre local con una prueba independiente de revocación del token en el servidor: la app borra el estado local antes de terminar su petición logout. Un fallo de limpieza no acredita aceptación.

## Privacidad de Maestro 2.12

Esta versión registra el texto introducido y guarda variables/comandos evaluados; también puede generar imágenes y jerarquías al fallar. Por ello no basta con retirar takeScreenshot del YAML.

Se ejecuta con un UID Linux efímero, HOME/XDG/tmp/cwd privados 0700 y entorno hijo permitido explícitamente. Las credenciales se pasan sólo como variables MAESTRO al subproceso que introduce el campo correspondiente. Se excluyen proxies, opciones Java heredadas, tokens GitHub/Expo y el resto del entorno del runner.

`runtime-dir` crea un padre nuevo y dedicado `/tmp/sportcenter-account-XXXXXX`, modo 0711 y propiedad del usuario del runner. Ese modo permite atravesar la ruta conocida, sin listar su contenido. Sólo la distribución pública y fijada de Maestro se instala allí con permisos de lectura/ejecución; cada raíz del UID, HOME, logs y datos de prueba siguen en 0700. No se cambia el modo de RUNNER_TEMP, HOME ni sus ancestros, ni se mueve el raw de EAS o las credenciales a un directorio público.

La identidad del padre (ruta canónica, ausencia de symlink, UID, dispositivo, inode y modo) se registra en un archivo 0600 dentro del control privado 0700. Probe y runtime vuelven a exigir esa identidad; el launcher de Maestro debe resolverse al directorio público de esa misma base, nunca a una instalación anterior dentro de RUNNER_TEMP. Una marca privada impide borrar la base mientras la limpieza del UID no esté confirmada. La eliminación final exige la misma identidad y no usa rutas alternativas si falta la prueba. Ni ese archivo privado ni el directorio base se suben como artifacts.

Antes de suministrar credenciales al proceso Maestro se exigen reglas IPv4/IPv6 del UID al principio de OUTPUT: permiten exclusivamente 127.0.0.1/::1 y rechazan el resto. Se prueba una conexión no loopback rechazada con incremento del contador de la regla y una respuesta real ADB host:version por loopback. Si falta sudo, reglas, aislamiento o ADB, no se empieza el login. El adb server y el emulador conservan su UID original, por lo que la app mantiene su conexión HTTPS al backend.

Primero se ejecuta `probe` sin credenciales, antes de crear una AVD: inicia sólo el servidor ADB, exige las mismas reglas y pruebas TCP, abre `maestro --version` bajo el UID y confirma la limpieza. La última línea no vacía debe ser exactamente 2.12.0; cualquier aviso público previo permanece privado y no se interpreta como instrucción. Si falla, el JSON conserva únicamente códigos de una lista fija, la primera causa y el resultado independiente de limpieza. No conserva mensajes ni salidas de procesos. El runtime repite las comprobaciones con su propio UID; el probe anterior no sustituye esa verificación.

No se depende de la opción `sudo --chdir`: la política de sudo puede prohibirla incluso con sudo sin contraseña. Un wrapper Node fijo, ya bajo el UID destino, cambia al directorio privado validado y ejecuta la herramienta sin shell. Este ajuste elimina esa dependencia de política; no demuestra que fuera la causa de una ejecución anterior.

El alcance del filtro es el tráfico IP directo del proceso con ese UID, no una garantía contra una herramienta maliciosa con control de ADB. El código y los flujos están fijados y revisados, sin ejecutar scripts recibidos del servidor. No se habilita cloud, análisis remoto ni grabación. Se desactiva analytics; no se considera ese opt-out una defensa suficiente por sí mismo.

stdout/stderr, JUnit, comandos, imágenes automáticas y jerarquías permanecen en memoria o almacenamiento privado efímero. El XML Android se guarda temporalmente en un directorio 0700 y se retira tras leerlo. El helper confirma UID sin procesos antes de retirar sus reglas y borra únicamente los directorios que creó. No modifica la app, backend, certificados ni políticas TLS.

El artifact público contiene **únicamente** `android-account-source.json` y `android-account.json`: IDs, SHA, estados, códigos fijos y limpieza. No lleva capturas, XML, JUnit, logcat, mensajes de excepciones, datos de perfil, nombres de productos, direcciones, correo, contraseña, tokens ni URLs firmadas.

## Contrato del workflow auxiliar

Se conserva el auxiliar `android-validation.yml`, con job aislado para `validation/account-*` y gate final que exige calidad, seguridad y aceptación propia.

1. `prepare`, con GITHUB_TOKEN de sólo lectura: fuente, productor y evidencia.
2. `npm ci` del lock; no contiene credenciales de la cuenta.
3. `view`, exclusivamente con EXPO_TOKEN; raw privado.
4. `download`, sin credenciales de cuenta; APK/hash fijo. `runtime-dir` crea y registra su padre dedicado, publicando sólo ACCOUNT_SANDBOX_PARENT para los pasos siguientes.
5. Maestro 2.12.0/hash ya establecido se extrae únicamente bajo ACCOUNT_SANDBOX_PARENT/maestro-account y su bin se añade al PATH; los metadatos y ZIP pueden permanecer en el control privado. Se exige el ADB del SDK existente. `kvm` usa `PINNING_EPHEMERAL_AVD=true` en runner efímero.
6. `probe` sin credenciales: servidor ADB, aislamiento Linux real, versión fijada del CLI bajo el UID y limpieza. No instala APK, inicia emulador, ejecuta flujos de Maestro ni usa la cuenta. Si aprueba, agrega esa evidencia booleana al JSON de procedencia existente; si falla, publica un resultado fallido con los siete casos sin ejecutar.
7. AVD API34 x86_64 nueva, sin Metro, sin reverse ni paquete previo. Únicamente este paso recibe los dos secretos de cuenta y ejecuta `runtime`.
8. `finish` exige siete controles y las tres limpiezas. `summary` sólo publica estados permitidos.
9. `cleanup` siempre; upload de las dos rutas JSON exactas, retención 14 días. No carpetas ni patrones que puedan incluir raw.

No acredita dispositivo físico, pagos, creación de pedidos, publicación en Play, modificación de perfil/dirección ni registro/verificación por correo.

## Fuentes primarias revisadas

- [Maestro variables de entorno](https://github.com/mobile-dev-inc/Maestro/blob/0df4cf3c8cad946e0494f462c6ce4987145cd36f/maestro-orchestra-models/src/main/java/maestro/orchestra/util/Env.kt#L107).
- [Maestro registro de inputText](https://github.com/mobile-dev-inc/Maestro/blob/0df4cf3c8cad946e0494f462c6ce4987145cd36f/maestro-client/src/main/java/maestro/Maestro.kt#L586).
- [Maestro ErrorReporter](https://github.com/mobile-dev-inc/Maestro/blob/0df4cf3c8cad946e0494f462c6ce4987145cd36f/maestro-cli/src/main/java/maestro/cli/util/ErrorReporter.kt#L16).
- [Maestro transporte Android/ADB](https://github.com/mobile-dev-inc/Maestro/blob/0df4cf3c8cad946e0494f462c6ce4987145cd36f/maestro-client/src/main/java/maestro/android/AndroidDeviceConnection.kt#L353).
- [Netfilter owner](https://ipset.netfilter.org/iptables-extensions.man.html).

Contrato móvil comprobado en `src/api/cartApi.ts`, `src/api/checkoutApi.ts`, `src/features/checkout/screens/CheckoutScreen.tsx`, pantallas de cuenta/perfil e implementación de sesión. El backend se consultó sólo en lectura; la evidencia final será la ejecución real de la app, no la suposición de que el servicio desplegado coincide con una copia de QA.
