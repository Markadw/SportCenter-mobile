# Revisión de privacidad y solicitud de eliminación — Sport Center móvil

Fecha de revisión: 1 de noviembre de 2026. Revisión técnica y de consistencia; no constituye validación legal. No se modificaron el sitio web ni el backend y no se enviaron formularios reales.

## Evidencia del sitio publicado

Se verificaron mediante GET HTTPS las páginas [aviso existente](https://sport-center-sitie.netlify.app/legal/privacy) y [términos existentes](https://sport-center-sitie.netlify.app/legal/terms): ambas respondieron 200 sin redirección. Son rutas de una SPA: el 200 del HTML por sí solo no demuestra contenido. También se comprobó el router del bundle `main-K3FUMMAH.js` y se leyeron los recursos publicados `chunk-F5OLPQIY.js` (aviso) y `chunk-MQWCEG2F.js` (términos), ambos HTTP 200. No hubo navegador controlable disponible, por lo que no se afirma una verificación visual del render.

El [código público del aviso](https://github.com/AlexisYazir/front-sport/blob/main/src/app/features/legal/privacy/privacy.ts) y el [de términos](https://github.com/AlexisYazir/front-sport/blob/main/src/app/features/legal/terms/terms.html) corroboran el contenido. Repositorio consultado en `60dd2a75bca471db7268bc2978926697bae55682`; no se escribió en él. La fuente determinante para enlaces y contenido fue el despliegue HTTP real.

| Tema | Aviso publicado | Términos publicados |
| --- | --- | --- |
| Fecha indicada | 26/09/2025 | 25/09/2025 |
| Identificación | Sport Center; pie Sport 2222 | Sport Center; razón sportcenter S.A. de C.V.; otra mención Sport 2222 |
| Correo | support@sportcenter.com.mx; exclusión publicitaria en privacidad@sportcenter.com.mx | support@sport.com.mx |
| Dominio en el texto | www.sport2222.com.mx | www.sportcenter.com.mx |
| Domicilio y teléfono | Av. Revolución 120, Centro, Huejutla de Reyes, Hidalgo; (789) 123 4567 | Mismos datos |

El usuario confirmó **Sport Center** como responsable de esta app, sin una razón social adicional, y designó **sportcentersoporte@gmail.com** como soporte. No coincide con ninguno de los correos publicados. No se verificó control de los otros dominios, correos, domicilio o teléfono. No se adopta la razón social adicional ni el domicilio de las referencias web como datos confirmados de esta app. El domicilio del responsable sigue pendiente.

El aviso agrupa publicidad y prospección entre finalidades necesarias y coloca gestionar compras/ventas entre opcionales; esa clasificación debe revisarse. Describe ARCO y revocación con requisitos documentales y respuesta de 20 días hábiles, y cookies/web beacons del sitio. No se extrapolan automáticamente esas declaraciones a la app ni se inventan plazos de conservación. Los términos contemplan apartados, cancelaciones y métodos de pago que deben contrastarse con la operación móvil efectiva.

## Resultado implementado

- `/privacy` es pública y enlaza únicamente las rutas oficiales HTTPS verificadas y el contacto designado para la app. Identifica los documentos web como referencias pendientes de actualización.
- Incluye reglas operativas de reseñas, accesibles mediante `/privacy?section=reviews`, y la solicitud mediante `/privacy?section=deletion`. Las reglas aclaran reporte manual y ocultación local reversible por cuenta en almacenamiento seguro nativo; en web sólo memoria; no prometen moderación automática.
- La solicitud requiere nombre, correo de la cuenta y confirmación explícita sin premarcar. Información adicional es opcional. Envía sólo `nombre/email/asunto/mensaje` a `POST /company/contact`; interpreta únicamente `id_mensaje` como folio de recepción. El servicio actual registra un mensaje: **no elimina, desactiva ni verifica la titularidad de una cuenta**.
- No se exige sesión, no se solicita identificación ni contraseña y no se declara eliminación exitosa. La identidad y ejecución requieren atención manual real. Cancelar la espera no garantiza que el servidor no haya recibido el mensaje.
- La alternativa `mailto:sportcentersoporte@gmail.com` prepara un correo que el usuario debe revisar y enviar. Abrir correo no confirma envío, recepción ni eliminación.
- La descripción de sesión corresponde a la integración confirmada por root: nativo conserva sólo refreshToken y sessionId en SecureStore; accessToken vive en memoria; web mantiene sesión en memoria. No se persisten contraseñas u OTP.
- `createNecessaryProcessingReceipt(accepted, timestamp)` es puro: produce versión, fecha y URLs, sin PII ni credenciales. Rechaza aceptación falsa. Root integra la casilla y persistencia local nativa con su módulo de almacenamiento; el helper no escribe ni registra consentimiento en backend. Su alcance es servicio de cuenta necesario, no marketing.
- No se añadieron preferencias publicitarias sin efecto real.

## Publicación en Google Play: pendiente operativo

La [guía oficial de eliminación de cuentas de Google Play](https://support.google.com/googleplay/android-developer/answer/13327111) admite vías como atención por correo o formulario. Requiere una vía dentro de la app y un recurso web funcional que identifique la app/desarrollador y permita solicitar eliminación sin reinstalar la app. La información que se conserve por motivos legítimos debe explicarse. Esto **no convierte un simple formulario en una eliminación cumplida**: debe existir un equipo que valide y ejecute las solicitudes.

El router publicado no contiene una página específica de eliminación. La página genérica de contacto no destaca esa solicitud. Se incluyen borradores locales `docs/public/account-deletion.html` y `docs/public/privacy.html`, con Sport Center como único descriptor del responsable, soporte designado y sin promesas de borrado ni plazos inventados. **No están desplegados y no son URLs válidas para la consola de Google Play.** No se modificó el despliegue actual.

Antes de publicar: Sport Center debe confirmar su domicilio y operador del canal, corregir/unificar aviso, términos y contactos usando el nombre confirmado, determinar datos/plazos reales de conservación, asignar la atención y ejecución de solicitudes, revisar los borradores y desplegar una página HTTPS pública relevante. También debe revisar las declaraciones de datos y proveedores de la app contra su funcionamiento final. Hasta resolver estas diferencias, **no se puede declarar cerrado el requisito de privacidad o la publicación en Play**.

## Verificación técnica

Pruebas sin red ni cuentas reales: validación de campos/confirmación, allowlist de payload/folio, rechazo de respuesta inválida, cancelación y doble envío, correo alternativo y recibo de aceptación limitado. Ejecutar también `tsc --noEmit` y `expo lint .` tras integrar los módulos compartidos.
