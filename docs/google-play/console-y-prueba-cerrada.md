# Preparar Play Console personal y la prueba cerrada

**Estado: preparación. La cuenta de Play Console todavía no está creada.** Esta guía no acredita pagos, verificaciones, testers inscritos, pruebas en Google Play ni aprobación para publicar.

## 1. Alta de la cuenta: lo realiza su titular

La planificación usa una cuenta **personal**, según lo acordado. Su titular debe ser una persona real mayor de 18 años, con acceso a su cuenta de Google y a un medio de pago admitido. En el registro debe leer y aceptar el Acuerdo de Distribución y pagar la cuota única de **25 USD**. Google puede solicitar identificación y documentación a su nombre. Estos datos y el pago se proporcionan directamente a Google; no se guardan en GitHub ni se envían por el chat. [Registro oficial](https://support.google.com/googleplay/android-developer/answer/6112435?hl=es)

El nombre público del desarrollador puede ser distinto de su nombre legal. **Sport Center es la marca de la app; no sustituye la identidad legal del titular personal.** El perfil de pagos, nombre y domicilio reales deben corresponder a quien se registra. Google verifica también los contactos y muestra parte de esa información en Play; el titular debe revisar qué se hará público antes de confirmar. El correo de soporte de la app es `sportcentersoporte@gmail.com`; no se presupone que sea la cuenta propietaria de Google. [Datos de la cuenta](https://support.google.com/googleplay/android-developer/answer/13628312?hl=es)

Los datos legales que se dejaron pendientes siguen pendientes. Esta guía no los inventa ni los toma del aviso anterior del sitio.

## 2. Verificación del teléfono

Tras crear la cuenta, el propietario debe completar la tarea de verificación de dispositivo desde Play Console. Debe usar la app móvil Play Console con la misma cuenta propietaria y un teléfono Android **físico, sin root y con Android 10 o posterior**. Un emulador o haber probado Sport Center en Expo no completa este trámite. Seguir el QR y las instrucciones que muestre la consola. [Verificación oficial](https://support.google.com/googleplay/android-developer/answer/14316361?hl=es)

## 3. Decisiones que deben aprobarse antes de configurar la app

Podemos preparar textos y evidencias, pero no elegir estas respuestas por el titular:

| Decisión | Qué revisar | Estado |
| --- | --- | --- |
| Países y regiones de distribución | Dónde puede utilizarse y atenderse realmente Sport Center. Revisar también los países de la prueba cerrada; la disponibilidad se basa en el país de la cuenta de Play del usuario. | Pendiente de aprobación |
| Audiencia y edades | Público al que está dirigida la experiencia real. No seleccionar menores ni excluirlos sólo para simplificar el formulario. | Pendiente de aprobación |
| Anuncios | Comprobar la app final y sus SDKs antes de responder si contiene anuncios. | Pendiente de revisión y aprobación |
| Clasificación IARC | Responder el cuestionario según funciones y contenido reales, incluidas las reseñas. La clasificación la calcula el cuestionario; no se elige un resultado deseado. | Pendiente de completar en Console |
| Ficha y datos de contacto | Aprobar nombre, descripciones, categoría, imágenes, soporte y enlaces definitivos de privacidad/eliminación. | Pendiente de aprobación |

Consultar [distribución por países](https://support.google.com/googleplay/android-developer/answer/7550024?hl=es), [contenido y declaraciones de la app](https://support.google.com/googleplay/android-developer/answer/9859455?hl=es) y [clasificación de contenido](https://support.google.com/googleplay/android-developer/answer/9859655?hl=es). Los enlaces públicos de privacidad y eliminación deben funcionar antes de presentarlos; un borrador local no es una URL publicada.

## 4. Separar prueba interna y prueba cerrada

| Canal | Para qué lo usaremos | Qué acredita |
| --- | --- | --- |
| Interna | Instalar primero el paquete candidato, detectar fallos de arranque y comprobar enlaces, cuenta y navegación con un grupo pequeño. | Comprobaciones iniciales; no sustituye el requisito de prueba cerrada. |
| Cerrada | Distribuir la candidata a testers reales seleccionados y reunir resultados y correcciones. | Puede cumplir el requisito previo de una cuenta personal nueva si se mantienen las condiciones de Google. |

El titular configura cada canal en Play Console, añade los testers y comparte su enlace de incorporación. Los correos y la lista real se administran de forma privada, fuera de este repositorio. Las pruebas locales y un APK distribuido por otro medio no cuentan como inscripción en el canal cerrado de Google Play. [Configurar canales](https://support.google.com/googleplay/android-developer/answer/9845334?hl=es)

## 5. Condición de 12 testers y 14 días continuos

Para esta cuenta personal nueva, Google exige una prueba cerrada con **al menos 12 testers inscritos continuamente durante los 14 días anteriores a solicitar acceso a producción**. Si una persona sale y vuelve a inscribirse, su periodo debe volver a ser consecutivo. No basta con añadir correos a una lista: deben incorporarse mediante el recorrido de Google Play y probar la app.

Después se solicita acceso a producción y se responde sobre las pruebas, el feedback y la preparación de la app. **Cumplir los 14 días no publica la app ni garantiza la aprobación.** Google puede pedir más pruebas. Comprobar la elegibilidad real en Console; no fijamos una fecha de cierre mientras no exista esa inscripción. [Requisito oficial vigente](https://support.google.com/googleplay/android-developer/answer/14151465?hl=es)

## 6. Recorrido propuesto para recoger resultados útiles

Cada tester debe comprobar las funciones disponibles en su versión y comunicar lo que ocurre, sin marcar como correcto lo que no pudo revisar:

1. Instalar desde el canal de Play indicado, abrir, cerrar y volver a abrir.
2. Explorar catálogo, filtros, detalle y variantes; revisar carga y avisos cuando falte conexión.
3. Comprobar registro/verificación o acceso con su cuenta de prueba, perfil, restauración de sesión y cierre.
4. Revisar carrito y resumen con datos de prueba autorizados. No confirmar pedidos ni pagos reales como parte de este guion.
5. Abrir privacidad y la vía para solicitar eliminación. Verificar que se entiende la diferencia entre enviar una solicitud y eliminar efectivamente una cuenta; no enviar solicitudes reales de borrado sólo para rellenar el registro.
6. Comunicar fallos o dificultades. Si hay una corrección, instalar la versión correspondiente y repetir el caso afectado.

Este es nuestro guion de seguimiento, no una lista adicional de exigencias de Google. Los casos que necesiten datos o permisos no disponibles se registran como pendientes.

### Plantilla de seguimiento sin datos personales

La correspondencia entre alias y personas, sus correos, las fechas reales de inscripción y las capturas completas de Console se conservan en un registro privado. En Git sólo pueden añadirse resultados sanitizados como éstos; las filas siguientes son **plantillas vacías**, no participantes acreditados.

| Alias de tester | Canal y versión probados | Caso | Resultado observado | Incidencia/corrección | Reprueba | Evidencia sanitizada |
| --- | --- | --- | --- | --- | --- | --- |
| Por asignar a una persona real | Pendiente | Pendiente | Sin ejecutar | Pendiente | Sin ejecutar | Pendiente |

| Comprobación de la prueba cerrada | Resultado real |
| --- | --- |
| Canal y versión activos | Pendiente |
| Número de personas con inscripción continua acreditada por Console | Pendiente; no informado |
| Condición de 12 testers durante 14 días continuos | No acreditada |
| Feedback recibido y casos repetidos | Pendiente |
| Solicitud de acceso a producción | No presentada |
| Respuesta de Google | Pendiente; sin aprobación |

Ejemplo **ficticio** de cómo documentar feedback: «Al volver al catálogo se pierde el filtro de marca». Registrar versión, pasos, resultado esperado y observado; vincular la incidencia cuando exista; describir la corrección y anotar la reprueba únicamente después de ejecutarla. Este ejemplo no cuenta como fallo encontrado ni prueba realizada.

## 7. Antes de solicitar revisión o acceso a producción

Preparar una cuenta de demostración operativa para el revisor, con acceso reutilizable desde cualquier ubicación e instrucciones en inglés. No depender de un código temporal que el revisor no pueda obtener. Sus credenciales se introducen de forma privada en Console, nunca en este documento. [Acceso para revisión](https://support.google.com/googleplay/android-developer/answer/15748846?hl=es)

El titular revisa las tareas pendientes de Console, el resultado de las pruebas y las declaraciones de la app. No se presenta Data safety como «sin recopilación» sin comprobar los datos y SDKs reales. Preparar el inventario y el borrador no equivale a haber enviado el formulario. [Seguridad de los datos](https://support.google.com/googleplay/android-developer/answer/10787469?hl=es)

Podemos avanzar ahora con guion, textos, recursos de ficha, inventario de datos e instrucciones de acceso. El alta, pago, verificaciones, decisiones finales, inscripción real y solicitud de publicación quedan para el titular en Console. Esta preparación no cierra por sí sola REL-002 ni autoriza publicar.
