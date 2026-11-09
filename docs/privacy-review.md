# Revisión de privacidad y solicitud de eliminación — Sport Center móvil

## Corte vigente: 8 de noviembre de 2026

La app utiliza el mismo [aviso de privacidad](https://sport-center-sitie.netlify.app/legal/privacy) y los mismos [términos y condiciones](https://sport-center-sitie.netlify.app/legal/terms) publicados por Sport Center. Ambos documentos indican la revisión del **8 de noviembre de 2026**. Se retiran de la pantalla móvil las advertencias sobre contactos incompatibles y domicilio pendiente que correspondían a la revisión anterior.

| Dato común de los documentos oficiales | Valor publicado |
| --- | --- |
| Marca | Sport Center |
| Responsable | Carlos Reyes Mendoza |
| Domicilio | Zacatecas 7, esquina con Velázquez Ibarra E, Centro, 43000 Huejutla de Reyes, Hidalgo, México |
| Correo | sportcentersoporte@gmail.com |
| Teléfono | 7712345678 |
| Horario | lunes a domingo, de 10:00 a 20:00 h |

La fuente web se integró mediante el [PR #11](https://github.com/AlexisYazir/front-sport/pull/11): implementación `6735589a42f4fc0633dd7567928fc26c15171c2b`, `main` `de33a3575dfdd8bed6ff529262ea8111258cc250`. La identidad y la revisión proceden de [`legal-contact.ts` de esa versión](https://github.com/AlexisYazir/front-sport/blob/de33a3575dfdd8bed6ff529262ea8111258cc250/src/app/features/legal/legal-contact.ts).

La comprobación del despliegue identificó `main-AISS42LU.js`, `chunk-355HUATZ.js` para privacidad y `chunk-PKG5NPZK.js` para términos. Playwright abrió ambas URLs de producción en un perfil aislado, sin autenticación, y comprobó los títulos, el responsable y la fecha vigentes: ocho secciones del aviso y nueve de términos, sin notas internas ni desbordamiento horizontal a 390 px. Antes de publicar se revisaron ambas páginas localmente a 1280 y 390 px y sus acciones de impresión. El enlace de entrada a eliminación se comprobó sin iniciar una solicitud. Esta evidencia corresponde a la web; no acredita un APK, AAB ni un recorrido Android.

El [recurso web de eliminación](https://sport-center-sitie.netlify.app/account/delete) y la [sección correspondiente del aviso](https://sport-center-sitie.netlify.app/legal/privacy#eliminar-cuenta) ya existen. El proceso web/API requiere sesión, código exclusivo enviado al correo de la cuenta y confirmación. El aviso explica la conservación y ofrece asistencia por correo cuando no se puede acceder a la cuenta.

La rama `feature/account-deletion-mobile` añade el autoservicio nativo en `/account-deletion`, accesible desde cuenta y perfil para clientes. Reutiliza los endpoints existentes de solicitud, verificación, confirmación y resultado. El código y la autorización permanecen en memoria; el comprobante se guarda antes de confirmar en almacenamiento seguro nativo. El resultado puede recuperarse sin sesión y una confirmación no se reenvía automáticamente. La limpieza de sesión y datos locales se limita a la cuenta que inició la operación.

El formulario público conserva su funcionamiento: envía nombre, correo, asunto y mensaje a `POST /company/contact`, recibe únicamente `id_mensaje` como folio y exige revisión manual. **Ese formulario no ejecuta el autoservicio ni acredita una eliminación.** Sus reglas de reseñas y la alternativa de correo tampoco cambian.

Los archivos `docs/public/privacy.html` y `docs/public/account-deletion.html` ahora redirigen al aviso oficial y a `/account/delete`, con enlaces de respaldo y referencias canónicas. No contienen políticas alternativas ni se presentan como páginas independientes ya desplegadas. Los términos se consultan en su URL oficial.

La incorporación nativa se valida mediante pruebas de cliente y una prueba de su API contra backend y PostgreSQL locales aislados. No acredita un nuevo binario instalado ni aceptación física del flujo. La rama permanece separada de `develop` y `main`. Los pendientes de operación del formulario manual, las declaraciones de la versión distribuida, Play Console y la publicación en Google Play requieren su comprobación correspondiente. La comprobación documental no convierte un folio de atención en una eliminación completada; el recorrido de lectura M02/M03 se conserva en [la guía manual](../tests/manual/compra-cliente.md).

## Historial: revisión del 1 de noviembre de 2026

> Se conserva a continuación el informe anterior con sus hallazgos, limitaciones y pendientes de aquella fecha. Las referencias a contactos incompatibles, domicilio sin confirmar, documentos pendientes de actualización y ausencia de recurso web de eliminación describen ese estado histórico; el corte vigente anterior las sustituye.

Fecha de revisión: 1 de noviembre de 2026. Revisión técnica y de consistencia; no constituye validación legal. No se modificaron el sitio web ni el backend y no se enviaron formularios reales.

### Evidencia del sitio publicado

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

### Resultado implementado

- `/privacy` es pública y enlaza únicamente las rutas oficiales HTTPS verificadas y el contacto designado para la app. Identifica los documentos web como referencias pendientes de actualización.
- Incluye reglas operativas de reseñas, accesibles mediante `/privacy?section=reviews`, y la solicitud mediante `/privacy?section=deletion`. Las reglas aclaran reporte manual y ocultación local reversible por cuenta en almacenamiento seguro nativo; en web sólo memoria; no prometen moderación automática.
- La solicitud requiere nombre, correo de la cuenta y confirmación explícita sin premarcar. Información adicional es opcional. Envía sólo `nombre/email/asunto/mensaje` a `POST /company/contact`; interpreta únicamente `id_mensaje` como folio de recepción. El servicio actual registra un mensaje: **no elimina, desactiva ni verifica la titularidad de una cuenta**.
- No se exige sesión, no se solicita identificación ni contraseña y no se declara eliminación exitosa. La identidad y ejecución requieren atención manual real. Cancelar la espera no garantiza que el servidor no haya recibido el mensaje.
- La alternativa `mailto:sportcentersoporte@gmail.com` prepara un correo que el usuario debe revisar y enviar. Abrir correo no confirma envío, recepción ni eliminación.
- La descripción de sesión corresponde a la integración confirmada por root: nativo conserva sólo refreshToken y sessionId en SecureStore; accessToken vive en memoria; web mantiene sesión en memoria. No se persisten contraseñas u OTP.
- `createNecessaryProcessingReceipt(accepted, timestamp)` es puro: produce versión, fecha y URLs, sin PII ni credenciales. Rechaza aceptación falsa. Root integra la casilla y persistencia local nativa con su módulo de almacenamiento; el helper no escribe ni registra consentimiento en backend. Su alcance es servicio de cuenta necesario, no marketing.
- No se añadieron preferencias publicitarias sin efecto real.

### Publicación en Google Play: pendiente operativo

La [guía oficial de eliminación de cuentas de Google Play](https://support.google.com/googleplay/android-developer/answer/13327111) admite vías como atención por correo o formulario. Requiere una vía dentro de la app y un recurso web funcional que identifique la app/desarrollador y permita solicitar eliminación sin reinstalar la app. La información que se conserve por motivos legítimos debe explicarse. Esto **no convierte un simple formulario en una eliminación cumplida**: debe existir un equipo que valide y ejecute las solicitudes.

El router publicado no contiene una página específica de eliminación. La página genérica de contacto no destaca esa solicitud. Se incluyen borradores locales `docs/public/account-deletion.html` y `docs/public/privacy.html`, con Sport Center como único descriptor del responsable, soporte designado y sin promesas de borrado ni plazos inventados. **No están desplegados y no son URLs válidas para la consola de Google Play.** No se modificó el despliegue actual.

Antes de publicar: Sport Center debe confirmar su domicilio y operador del canal, corregir/unificar aviso, términos y contactos usando el nombre confirmado, determinar datos/plazos reales de conservación, asignar la atención y ejecución de solicitudes, revisar los borradores y desplegar una página HTTPS pública relevante. También debe revisar las declaraciones de datos y proveedores de la app contra su funcionamiento final. Hasta resolver estas diferencias, **no se puede declarar cerrado el requisito de privacidad o la publicación en Play**.

### Verificación técnica

Pruebas sin red ni cuentas reales: validación de campos/confirmación, allowlist de payload/folio, rechazo de respuesta inválida, cancelación y doble envío, correo alternativo y recibo de aceptación limitado. Ejecutar también `tsc --noEmit` y `expo lint .` tras integrar los módulos compartidos.
