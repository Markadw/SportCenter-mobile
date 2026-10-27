# HU-01: comprobación con correo y Android

Estado: recorrido de registro, rechazo de código incorrecto, reenvío y verificación aprobado en Android, según confirmación del usuario el 2026-10-27. La prueba manual usa la API real; Jest mantiene transporte simulado.

Usar una cuenta y un teléfono de prueba autorizados; la API predeterminada es el Render compartido. No hacer registro masivo ni carga. No incluir contraseñas o códigos completos en capturas.

1. Iniciar la app con npm start desde PowerShell y abrir el QR de esa terminal con Expo Go.
2. En el inicio, pulsar el icono de usuario. Revisar desplazamiento del formulario y acceso al botón con el teclado abierto. Comprobar que contraseña y confirmación empiezan ocultas y que cada botón Mostrar/Ocultar funciona de forma independiente sin cambiar el texto.
3. Enviar vacío: aparecen errores y no sale una petición. Probar teléfono incompleto, contraseña fuera de las reglas y confirmación diferente.
4. Registrar los datos autorizados: se abre «Verificar correo», con correo normalizado y código vacío. Confirmar recepción del correo.
5. Escribir un código incorrecto una vez: se muestran los intentos restantes indicados por el servidor.
6. Pulsar «Reenviar código» una vez: comprobar recepción de un código nuevo y vaciado del campo. Usar únicamente el último código recibido.
7. Verificar con ese código: aparece «Cuenta verificada». Volver a la tienda; no debe crearse una sesión automáticamente.
8. Salir y volver a registro: «Ya tengo un código» abre verificación y permite introducir el correo si no está disponible.
9. Probar desconexión sin repetir registros indiscriminadamente: se informa que no pudo confirmarse el resultado y permite revisar el correo antes de reintentar.
10. Volver a catálogo y detalle: comprobar que mantienen su funcionamiento.

Registrar fecha, responsable, commit, versión de Android, resultado y evidencia antes de aprobar HU-01. La expiración de 24 horas y el agotamiento de intentos están cubiertos como respuestas simuladas; para aceptación real requieren cuentas controladas o un entorno de pruebas.


## Resultado manual del 2026-10-27

- Caso: CP-01-ANDROID-01 / HU-01.
- Ejecutor: usuario, en su propio teléfono Android.
- Entorno: Expo Go compatible con SDK 57 y backend https://back-sport-ghxk.onrender.com.
- Rama: feature/registro-cliente.
- Versión probada: cambios locales de HU-01 sin commit, sobre la base 509a050188cc4cc9c9a4b432473f107d69bab4ee. El commit de HU-01 está pendiente de creación.
- Modelo del teléfono, versión de Android y versión exacta de Expo Go: no informados.
- Evidencia: confirmaciones textuales del usuario en esta conversación. No se adjuntaron capturas del recorrido completado ni se guardan correo, teléfono, contraseña o códigos.
- Revisión del commit y del PR: pendiente.

| Comprobación | Resultado confirmado por el usuario |
| --- | --- |
| Validaciones del formulario | Funcionan, según confirmación anterior; sin desglose manual por campo. |
| Controles Mostrar/Ocultar | El usuario confirmó que aparecen ambos botones. Su funcionamiento independiente también está cubierto por Jest. |
| Registro y primer correo | Se abrió «Verificar correo» y llegó el primer código. |
| Código incorrecto | Se rechazó el código incorrecto. |
| Reenvío | Llegó el correo con el código reenviado. |
| Verificación | La cuenta quedó verificada después del reenvío. |

Confirmaciones principales:

> listo, se abrió Verificar correo y ya llegó el código.

> listo, se rechazó el código incorrecto, llegó el reenvío y la cuenta quedó verificada.

El vaciado del campo después del reenvío, la cantidad exacta de intentos restantes y el regreso al catálogo no se confirmaron por separado en la respuesta final del usuario. El vaciado y la navegación están cubiertos por pruebas automatizadas con transporte simulado. La expiración de 24 horas, el agotamiento de intentos, la desconexión y la concurrencia tampoco se declaran comprobados en el teléfono; tienen cobertura simulada.

Esta evidencia acredita el recorrido manual descrito en Expo Go. No acredita una compilación APK independiente ni una ejecución automática de Maestro. HU-01 conserva pendiente su revisión e integración en GitHub.
