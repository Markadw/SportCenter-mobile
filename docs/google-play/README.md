# Preparación de Google Play — REL-002

Material para revisar y completar [REL-002, #52](https://github.com/Markadw/SportCenter-mobile/issues/52). No es una declaración enviada a Google ni acredita publicación. La cuenta personal sigue sin crearse, según confirmó el titular. Sus datos legales adicionales permanecen aplazados.

La documentación se prepara desde `develop` `9d71d41f0e4dcfd6bacad2d9d4d1da86b56e4e5b`. No modifica la app, el backend o la base de datos. La moderación y la migración del backend continúan pendientes por decisión del usuario.

## Archivos que se pueden utilizar

| Material | Uso |
| --- | --- |
| [Datos y proveedores](datos-y-proveedores.md) | Contrastar el comportamiento observado con Seguridad de los datos; identificar lo que aún debe confirmar el responsable. |
| [Atención de eliminación](eliminacion-de-cuentas.md) | Preparar un proceso humano verificable; no confundir recibir un folio con borrar una cuenta. |
| [Console y prueba cerrada](console-y-prueba-cerrada.md) | Alta personal, verificaciones, decisiones de distribución y prueba con participantes reales. |
| [Acceso para revisión](acceso-revision.md) | Instrucciones preliminares en inglés; las credenciales se completan sólo en Console. |
| [Ficha en español](ficha-es.json) y [recursos](recursos.json) | Texto y procedencia de imágenes para aprobación antes de subirlas. |
| [Revisión de privacidad existente](../privacy-review.md) | Diferencias detectadas en los documentos del sitio y límites del flujo actual. |

## Archivo candidato identificado

- Paquete: `com.markadw.sportcenter`; versión `1.0.0`; código `1`.
- Fuente de aplicación: `8831dfad7fd1b0c696d11f50c79442c5499b7cd2`.
- Build EAS RC6: `43bcc31d-8297-48e4-b91e-7f37c63d349c`.
- AAB: `68.959.933` bytes; SHA-256 `8fac2e502cd1877d8fd60b7b93e5b42ae85313025dcf1cbed62f4699b8cd693a`.
- [Validación RC6](https://github.com/Markadw/SportCenter-mobile/actions/runs/41890488214): firma, manifiesto y ocho ejecuciones públicas entre API 34 y 36. El APK derivado usa una firma temporal distinta de Play App Signing. No acredita las rutas privadas completas del AAB ni un teléfono ARM64 físico.

Los cambios de QA y documentación posteriores no requieren por sí solos otro AAB. Antes de una entrega se debe comprobar el hash del archivo y que sus entradas productivas siguen correspondiendo a la fuente validada. Un cambio posterior en app, dependencias o configuración puede requerir otra validación.

## Los diecisiete criterios y su estado

Esta preparación no cambia las casillas del tablero. Sólo P07 tiene aprobación técnica; los demás conservan sus pendientes.

| ID | Situación y evidencia que falta |
| --- | --- |
| L01 | Identidad y contacto legales adicionales aplazados. Distinguir titular personal de Console y nombre comercial Sport Center. |
| L02 | Privacidad y términos coherentes, aprobados y publicados en HTTPS. Los HTML existentes son borradores. |
| L03 | Publicar el recurso específico de eliminación y comprobar acceso sin sesión ni app instalada. |
| L04 | Ejecutar y acreditar validación, eliminación o anonimización que corresponda, retención justificada y comunicación del resultado. El procedimiento escrito no lo cumple por sí solo. |
| D01 | Inventario preparado; confirmar proveedores activos, funciones y conservación efectiva. |
| D02 | Contrastar datos de compra/pago con la operación autorizada. La compra real sigue pendiente. |
| D03 | Convertir el inventario confirmado en respuestas finales de Seguridad de los datos, aprobadas por el responsable. |
| D04 | Conciliar permisos, SDKs y tráfico de la versión distribuida, distinguiendo pruebas públicas, privadas y revisión de código. |
| P01 | Crear cuenta personal y completar verificaciones del titular y dispositivo. |
| P02 | Registrar la app y comprobar el identificador en Console; su presencia en el código no reserva el paquete. |
| P03 | Confirmar países y condiciones de distribución. Moneda MXN no determina por sí sola el país legal o los países de distribución. |
| P04 | Completar audiencia, IARC, anuncios y contenido de usuarios conforme a la app real; la moderación efectiva sigue pendiente en #48. |
| P05 | Instrucciones preparadas; reservar cuenta estable y comprobar acceso completo antes de facilitarlo a Google. |
| P06 | Completar aceptación de [#20](https://github.com/Markadw/SportCenter-mobile/issues/20) y [#21](https://github.com/Markadw/SportCenter-mobile/issues/21), incluida compra cuando exista un entorno autorizado. |
| P07 | AAB RC6 aprobado en el alcance técnico indicado arriba; no enviado a Play. |
| P08 | Revisar y aprobar texto e imágenes para la candidata final. |
| P09 | Ejecutar prueba cerrada y obtener la respuesta real a la solicitud de acceso a producción. |

## Orden para continuar

Preparar el alta personal puede avanzar mientras se resuelven los documentos y procesos. El titular realiza el pago, acepta acuerdos y entrega su identidad directamente a Google. Después se registra la app, se completan las declaraciones y el acceso de revisión, se prepara el canal y se ejecutan las pruebas que correspondan. La publicación sigue condicionada a los pendientes funcionales, de privacidad y moderación; documentarlos no los sustituye.

Google exige identificar app o desarrollador y un contacto de privacidad en el aviso. No debe atribuirse a esa política una obligación universal de publicar un domicilio: los datos que exija Console y las obligaciones legales del responsable se verifican por separado. [Política de datos de usuario](https://support.google.com/googleplay/android-developer/answer/10144311?hl=es).
