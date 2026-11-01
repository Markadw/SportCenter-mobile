# Comprobación de cuenta, recuperación, pedidos y reseñas

## Alcance comprobado

Pruebas del cliente con Jest y navegador Chromium a 390 × 844, con transporte HTTP completamente simulado. Las respuestas usan el formato revisado del backend. No se crearon cuentas, enviaron correos, publicaron reseñas ni tramitaron solicitudes reales durante esta comprobación.

| Recorrido | Resultado observado |
| --- | --- |
| Cuenta invitada → login → cuenta | Abre el formulario y muestra las opciones privadas sólo tras confirmar sesión. |
| Perfil: primer GET falla, reintento y guardado | Explica el error, recupera el formulario y confirma la respuesta del PATCH. |
| Mis pedidos → detalle | Presenta importe, productos y seguimiento del pedido propio. |
| Pedido → reseñas | Abre las opiniones y comprueba elegibilidad antes de ofrecer publicación. |
| Ocultar y restaurar autor | Filtra la lista, mantiene el resumen total y permite restaurar. En web indica que el cambio sólo vive en memoria. |
| Publicar sin aceptar reglas | Bloquea el envío y explica la aceptación necesaria. |
| Publicar aceptando reglas | Confirma la respuesta controlada y evita una segunda publicación desde el mismo formulario. |
| Reportar reseña | Presenta folio de recepción y aclara que no se retiró contenido automáticamente. |
| Recargar web y entrar directamente a perfil | Redirige al login: las credenciales web no se conservan en almacenamiento persistente. |
| Recuperar contraseña | Pasa de correo a código/nueva contraseña, muestra espera de reenvío y confirma el cambio controlado. |

`npm run validate`: ESLint, TypeScript, 472 pruebas en 42 suites y configuración aprobados. Este resultado corresponde al bloque de cuenta antes de incorporar compra y los nuevos controles de seguridad CI.

## Comprobaciones pendientes con Android y servicios reales

1. Instalar la candidata propia correspondiente al commit que se valide. Expo Go no acredita sus pines, permisos ni almacenamiento de la app compilada.
2. Usar una cuenta de prueba verificada: consultar y editar perfil; salir, volver a entrar y comprobar que se conservaron los cambios del servidor.
3. Solicitar recuperación con un correo controlado, rechazar código incorrecto y confirmar el código recibido junto con la nueva contraseña. Comprobar login con esa contraseña.
4. Consultar pedidos de la cuenta y su seguimiento. Una lista vacía no significa que se haya confirmado un pago.
5. En una cuenta con compra entregada, comprobar elegibilidad y publicación. En una cuenta sin compra entregada debe impedirla el servidor.
6. Ocultar un autor, cerrar y abrir la app, restaurarlo y comprobar aislamiento con otra cuenta y con invitado.
7. Comprobar reporte y solicitud de eliminación únicamente si el responsable autoriza y atiende los mensajes. El folio confirma recepción, no ejecución de una eliminación.
8. Comprobar teclado, tamaño de letra, lector de pantalla y botones de retroceso. Registrar cualquier incidencia y repetir sólo el caso afectado tras corregirlo.

No se da por terminada privacidad ni publicación: faltan datos legales confirmados, avisos coherentes y operación efectiva de atención/eliminación/moderación. Véase `docs/privacy-review.md`.
