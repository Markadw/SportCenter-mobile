# Pedidos y reseñas Android con servidor QA aislado

Esta comprobación es explícita: `validation/commerce-*`. No usa las cuentas de los secretos Android, no crea otro build y no acredita el APK Preview, AAB de producción ni un teléfono físico.

La composición queda fijada por separado:

- APK Development/Debug `7ccfddc3-4fbd-4c52-aef7-c31587ba2244`, fuente nativa `5dcacd46a24ae54da5300cd394a91c590a9a5825`; SHA256 `ebfb8281ec12359178954255c94cf3e7d70e681d405c9c497fa3b9064d34d1d2` y 263970555 bytes.
- JavaScript servido por Metro desde `8831dfad7fd1b0c696d11f50c79442c5499b7cd2`. El commit posterior de automatización sólo puede modificar la lista exacta de rutas QA/herramientas del runner. Se comprueba que configuración y versiones nativas permanecen iguales a la fuente del Debug.
- Backend real congelado `31ee304d902ec5ec5a9c0fc702eca5e1a531bc16`, sin cambios de código. Gateway y datos sintéticos revisados en `efbed63b1d24cb30883035b4fff9c03490e8fc4a`.

El job exige calidad, TypeScript, pruebas y seguridad; verifica la identidad y el SHA del Debug contra su EAS existente y la evidencia histórica inmutable de `validation/profiles-rc2-v5`. No convierte los resultados históricos en resultados de este recorrido.

## Aislamiento antes de iniciar sesión

Ambas variables `ISOLATED_TEST_ENV=true` y `QA_COMMERCE=true` son obligatorias. Se crea un compose efímero nuevo y se aplica el seed una sola vez. Primero se comprueban los 12 contratos HTTP reales: consumen la reseña A→68 y dejan A→66 para Android. El gateway bloquea rutas de pedidos nuevos, pago, correo, contacto y cambios de dirección. Véase [el ámbito QA](../environment/commerce-README.md).

El runner sólo acepta un dispositivo `emulator-*`, API34, propiedad QEMU y usuario Android 0. Instala el Debug y resuelve su UID mediante Package Manager y `run-as`. Antes de cualquier credencial, instala cadenas propias IPv4/IPv6: sólo permite TCP hacia `10.0.2.2:3011` y `10.0.2.2:8081`, rechaza el resto y exige que aumenten los contadores de rechazo con tráfico del propio UID. También exige respuestas reales de API y Metro desde ese UID. Si faltan root, `owner`, `run-as`, `nc` o cualquiera de estas pruebas, se detiene; no cambia a Render ni usa mocks.

Metro sólo recibe la URL QA explícita y desactiva `.env`. `EXPO_PACKAGER_PROXY_URL` es la opción documentada del CLI para anunciar la URL de Metro; no se inicia un proxy, relay ni túnel. Se comparan la respuesta oficial `/_expo/open` y el manifiesto del SDK57 con el proyecto, paquete y URL exacta. El launcher real se abre mediante el campo de URL y Connect, seguido del onboarding de Expo.

Las credenciales son exclusivamente las sintéticas del seed QA. Maestro se ejecuta bajo un UID Linux dedicado sin salida de red, con ADB loopback permitido. Sus archivos, JUnit, XML y salida permanecen privados y se destruyen; no se suben capturas ni trazas.

## Cuatro controles nativos

| ID | Resultado necesario |
| --- | --- |
| NC01 | A consulta su lista, abre su pedido entregado y ve el seguimiento sintético; la lista no muestra el pedido de B. |
| NC02 | A oculta y restaura el autor existente; ve rechazo de comentario corto y falta de aceptación de términos; publica una sola reseña válida de 66 y comprueba su persistencia y la ausencia del formulario duplicado. |
| NC03 | B ve únicamente su propio pedido y la entrada directa al pedido de A es rechazada. |
| NC04 | B no dispone de formulario de publicación para 68, donde no tiene compra elegible. |

Los textos del detalle y de las reseñas se desplazan a la vista y se comprueban uno por uno. NC01 requiere el estado exclusivo del detalle, su título, el encabezado de seguimiento y ambos eventos; NC02 conserva todas las comprobaciones de validación, términos, confirmación y lectura.

`Actualizar reseñas` ejecuta la lectura GET de la lista y mantiene `ReviewsContent` montado con su bandera local `published`. Observar el comentario en esa lista acredita la lectura posterior a la publicación. El mensaje «Ya publicaste» y la ausencia del compositor acreditan el estado local de la interfaz tras publicar. Este recorrido no acredita un remount de la pantalla ni el rechazo de un duplicado por el servidor; este último se comprueba por separado en IQ09 HTTP real con el producto sintético 68.

Ocultar un autor sólo modifica la preferencia local del emulador. El caso de publicación no se reintenta automáticamente si queda incierto. Las sesiones A y B se cierran en el recorrido normal. Finalmente se detiene el app, se comprueba la ausencia de sus procesos, se eliminan sólo las cadenas propias, se borra/desinstala el paquete y se detienen Metro y el sandbox. Si no se demuestra que el app quedó detenido, no se abre su salida de red retirando reglas. Compose se cierra siempre por el job; las cuentas y compras sintéticas no pertenecen al servidor productivo.

Sólo se conservan durante 14 días `android-commerce-source.json`, `android-commerce.json` y `commerce-api.json`: identidades de fuente, estados, códigos fijos y booleanos. El agregado falla ante cualquier control incompleto, publicación incierta o limpieza no acreditada.

## Límites

Preparar este job y aprobar sus pruebas de lógica no equivale a ejecutarlo. Hasta obtener los informes de una corrida real, los controles nativos permanecen pendientes. Las fixtures acreditan la autorización, lectura y publicación sobre este backend QA; no una transacción real de Mercado Pago, una entrega logística, correos, un permiso de publicación en Google Play o aceptación física del binario final. La UI observa el rechazo de otro dueño; el código HTTP se comprueba por separado entre los 12 contratos.

Fuentes primarias: [Expo SDK57](https://docs.expo.dev/versions/v57.0.0/), [Development builds](https://docs.expo.dev/develop/development-builds/use-development-builds/), [opciones de Expo CLI](https://docs.expo.dev/more/expo-cli/), [red del emulador Android](https://developer.android.com/studio/run/emulator-networking-address), [Network Security Configuration](https://developer.android.com/privacy-and-security/security-config).
