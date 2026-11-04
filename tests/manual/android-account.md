# Aceptación de cuenta en Android

## Evidencia vigente y nueva candidata

La [ejecución histórica F2](https://github.com/Markadw/SportCenter-mobile/actions/runs/41774275494) aprobó siete controles de sesión y cuatro comprobaciones de lectura. Se conserva esa evidencia con su propio APK; no acredita la corrección posterior del carrito.

La candidata `candidate/android-rc5` incorpora la corrección del carrito del [PR #60](https://github.com/Markadw/SportCenter-mobile/pull/60), fuente `8e8a6da3fedbb61057efaa7fe30b6923b6195595`. Su [productor](https://github.com/Markadw/SportCenter-mobile/actions/runs/41810909053) y la [ejecución de cuenta v3](https://github.com/Markadw/SportCenter-mobile/actions/runs/41821737397) están aprobados. La compilación se solicita una vez; la prueba de cuenta sólo descarga el mismo APK y verifica su fuente, build y SHA256 exactos.

Los valores completos de procedencia están fijados en `SOURCE` de `scripts/android-account.cjs`. Se verifican el productor y su intento, todos sus trabajos exigidos, el ID y digest del artifact original y los JSON de inspección. EAS se consulta con `build:view` 27.4.0, sin construir otra app. Una guardia acepta sólo las rutas concretas de automatización y documentación revisadas desde la fuente del APK. Un cambio de aplicación, activos, configuración, paquetes o lockfile exige otra candidata.

## Cuenta reservada y restauración

`ANDROID_TEST_EMAIL` y `ANDROID_TEST_PASSWORD` se leen del entorno dedicado `android-private-qa`, autorizado para esta prueba y limitado a etiquetas `validation/account-*`. Sus valores pertenecen a una cuenta QA aislada y verificada. Los secretos originales del repositorio se conservan intactos. Las credenciales llegan únicamente al runtime privado. La cuenta debe estar verificada y reservada durante toda la ejecución. El perfil debe tener sus cinco campos válidos y normalizados. El carrito debe contener una variante activa, con nombre no ambiguo, cantidad de 1 a 98 y existencias para una unidad adicional. Su precio guardado debe coincidir con el precio actual. Una condición incumplida bloquea la prueba antes de escribir datos.

Un chequeo API previo captura en memoria el perfil y el carrito dentro de una única sesión auxiliar y confirma su logout antes de abrir la app. No se guarda la línea base en artifacts. La prueba modifica sólo el Nombre y una línea del carrito; comprueba los valores mediante la interfaz y vuelve a leerlos después de cerrar y abrir la app. Conserva los demás campos y líneas.

Al finalizar, la app cierra sesión y se detiene. Sólo después de comprobar que su proceso ya no existe se permite una nueva sesión API para verificar la restauración. Si hace falta restaurar un cambio conocido, se comprueba primero su estado previo y se realiza como máximo una escritura; un POST aditivo con respuesta incierta nunca se repite a ciegas. Esta recuperación no convierte en aprobado un caso que falló en la interfaz. Si otros datos cambiaron o no se confirmó la restauración, el resultado falla.

El servidor no proporciona compare-and-swap ni impide que otra persona use simultáneamente la cuenta. Por ello debe permanecer reservada. Una interrupción abrupta del runner puede impedir recuperar su línea base privada; no se promete una reversión que no se observó.

## Casos obligatorios

| ID | Comprobación |
| --- | --- |
| AC01 | Login real; campos coincidentes en memoria, Mostrar/Ocultar y acceso a Mi cuenta. |
| AC02 | Lectura del perfil de la misma cuenta. |
| AC03 | Lectura del carrito con productos. |
| AC04 | Resumen, dirección, envío y totales, deteniéndose antes de continuar a Mercado Pago. |
| AC05 | Restauración de sesión tras detener y abrir la app sin borrar datos. |
| AC06 | Cierre de sesión y formulario de acceso. |
| AC07 | Nueva apertura como invitado y protección de carrito. |
| RO01 | Lista propia de pedidos; se registra expresamente si está vacía. |
| RO02 | Entrada directa a perfil después del logout exige iniciar sesión. |
| RO03 | Entrada directa a checkout después del logout exige iniciar sesión. |
| RO04 | Privacidad y sus controles visibles como invitado, sin enviar solicitudes. |
| MU01 | Guardar temporalmente sólo el Nombre mediante la interfaz. |
| MU02 | Releer el Nombre tras arranque frío, restaurarlo y comprobar en otro arranque los cinco campos originales. |
| MU03 | Aumentar una unidad, comprobar persistencia en frío y volver a la cantidad original. |
| MU04 | Retirar sólo la línea elegida y reponer la misma variante y cantidad mediante la interfaz. |
| MU05 | Confirmar mediante lectura final que perfil y carrito completos coinciden con la línea base, con logout auxiliar confirmado. |

No se suman ejecuciones antiguas a estos dieciséis casos distintos. La aprobación exige todos los casos, las observaciones de interfaz, la restauración y las limpiezas. Un paso no ejecutado no se presenta como aprobado. Una lista vacía no acredita detalle o seguimiento de pedidos.

## Evidencia privada y límites

Maestro puede registrar texto introducido, imágenes y jerarquías incluso al fallar. Se ejecuta dentro del aislamiento Linux existente, con herramientas y argumentos permitidos, credenciales en memoria y temporales privados. No se incluyen tokens de GitHub o Expo en ese proceso. Sólo se añade `MAESTRO_ACCOUNT_FIELD_VALUE` para introducir el Nombre original sin exponerlo por argumentos de shell; no es un secreto nuevo de GitHub.

El artifact conserva exclusivamente `android-account-source.json` y `android-account.json`, con identidades de binario, IDs de casos, estados, códigos fijos y booleanos. No contiene correos, nombres, contraseñas, OTP, tokens, productos, cantidades, direcciones, volcados UI ni capturas privadas. Un error no publica su cuerpo o texto original.

El logout local y la confirmación HTTP auxiliar se documentan por separado. No se acredita una comprobación independiente de revocación de tokens en el servidor. Tampoco se acreditan aquí pedido, pago, persistencia de dirección, publicación de reseña, correo o dispositivo físico.

## Correo real: evidencia separada

Se completó por HTTPS y buzón propio la secuencia registro, rechazo de un código incorrecto, reenvío, verificación, solicitud de recuperación y cambio de contraseña. Se usaron los códigos recibidos en los mensajes nuevos, nunca los datos internos de la respuesta de registro. El acceso y cierre después de verificar y después de cambiar la contraseña recibieron confirmación. La cuenta es una fixture aislada; no se cambió la cuenta reservada de Android ni se crearon pedidos o pagos.

Es una comprobación HTTP real con correo real. No se presenta como recorrido nativo de esos formularios. La prueba adicional de interfaz web, cuando esté ejecutada, se identifica por separado.

## Datos de la primera ejecución RC5

La [ejecución v1](https://github.com/Markadw/SportCenter-mobile/actions/runs/41814484621) se detuvo en el chequeo previo con `FIXTURE_STOCK`: el carrito no ofrecía margen para aumentar una unidad. El login y logout auxiliar recibieron 201; no se abrió la interfaz ni se intentaron cambios. No se acredita ninguno de los casos no ejecutados. La cuenta QA aislada prepara una única variante con al menos tres existencias y mantiene una unidad como línea base reservada. La siguiente ejecución debe demostrar sus propios resultados.

La [ejecución v2](https://github.com/Markadw/SportCenter-mobile/actions/runs/41817509395) aprobó login y lectura del perfil. El desplazamiento del ejecutor agotó la búsqueda antes de pulsar Guardar; no envió cambios de perfil ni carrito y confirmó la limpieza. La localización de los controles de perfil utiliza ahora `scrollUntilVisible` de Maestro, dirección explícita y validación posterior estricta del XML. Se mantienen todas las comparaciones y requisitos de aceptación.

## Resultado RC5 aprobado

La [ejecución v3](https://github.com/Markadw/SportCenter-mobile/actions/runs/41821737397), automatización `625ab15b48cbe2906b16e92949a20775135b753b`, aprobó los dieciséis casos y sus cinco cambios reversibles. Nombre y carrito persistieron después de detener/abrir la app y volvieron a la línea base original. Los demás campos/líneas permanecieron intactos; no hubo mutación incierta o cambio concurrente. Las cuatro limpiezas fueron confirmadas. Login/logout auxiliar: HTTP 201.

El artifact `13316764661`, 1709 bytes, SHA256 `79715632da771ad516d32a2f41f66dd1b9e29aeb567cad87d6223dd23ead963e`, contiene exactamente los dos JSON saneados. Pedidos mostró una lista vacía: no acredita detalle/seguimiento, compra/pago, publicación de reseña ni dispositivo físico. Los fallos v1/v2 anteriores se conservan con su propio alcance.
