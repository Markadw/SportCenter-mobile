# Atención de solicitudes de eliminación

Procedimiento propuesto para Sport Center. No acredita que exista un operador disponible, que una cuenta se haya eliminado o que los plazos estén aprobados. Esos puntos siguen pendientes. El trabajo de base de datos está aplazado; no se ejecuta ningún borrado desde esta preparación.

## Lo que ya hace la app

Desde «Mi cuenta» se puede abrir «Solicitar eliminación de cuenta» incluso sin sesión. El formulario público pide nombre, correo de la cuenta, confirmación y detalles opcionales. Envía un mensaje a atención y recibe un folio. El correo alternativo prepara un mensaje que la persona debe enviar.

Un folio acredita recepción del mensaje. No verifica identidad, desactiva sesiones ni elimina datos. Cerrar sesión y desactivar una cuenta tampoco equivalen a eliminarla.

## Proceso propuesto para atención

| Paso | Acción del operador autorizado | Evidencia mínima, conservada en un sistema privado |
| --- | --- | --- |
| Recibir | Localizar la petición, asignar responsable y acusar recibo. | Folio, canal, estado y persona o rol que atiende. |
| Verificar | Comprobar control del correo de la cuenta o utilizar un mecanismo seguro alternativo aprobado. Recibir un mensaje con un correo escrito no demuestra titularidad. | Resultado de verificación y método utilizado, sin guardar códigos. |
| Delimitar | Identificar los datos vinculados y separar lo que deba conservarse por una razón válida. | Alcance aprobado y, para cada excepción, fundamento, acceso permitido y plazo real. |
| Ejecutar | Una persona con autorización y herramientas adecuadas elimina o anonimiza irreversiblemente lo correspondiente y revoca el acceso. | Operación realizada, sistemas afectados y resultado. Una instrucción SQL genérica no sustituye revisar relaciones y obligaciones. |
| Comprobar | Verificar que la cuenta ya no permite acceder y que los datos afectados no aparecen en perfil, reseñas, mensajes u otros sistemas según el alcance aprobado. | Comprobaciones posteriores y excepciones justificadas. |
| Comunicar | Informar al solicitante del resultado, de lo retenido y de cómo consultar el seguimiento. | Resultado comunicado; no marcar «completado» antes de ejecutar y comprobar. |

La lista de datos a revisar incluye cuenta y perfil, sesiones, carrito, direcciones, pedidos/pagos, reseñas, mensajes de atención, archivos, registros y copias de respaldo. Esta lista no autoriza a borrar pedidos o registros sujetos a conservación. Los proveedores deben intervenir cuando corresponda; quitar una fila del usuario no demuestra eliminación de todas las copias.

Ante identidad no verificada, solicitud duplicada, error técnico o una retención pendiente de decidir, registrar el estado y explicar el siguiente paso. El estado debe describir lo ocurrido, sin afirmar éxito.

## Condiciones que deben aprobarse antes de operar

- Asignar el rol que recibe, quién tiene autorización de ejecución y un canal de escalamiento.
- Confirmar método de verificación y herramienta administrativa disponible. No solicitar contraseñas ni códigos de acceso por correo.
- Definir datos y plazos de retención efectivos, incluyendo proveedores, logs y respaldos; no inventar días para llenar el documento.
- Confirmar tiempos de respuesta y comunicación, compatibles con las obligaciones aplicables.
- Guardar la evidencia con acceso limitado y su propia política de conservación. No publicar correos, expedientes ni datos de prueba en el repositorio.

## Recurso web

Existe un [borrador de página específica](../public/account-deletion.html). Debe publicarse en una URL HTTPS pública y específica, identificar Sport Center y permitir iniciar la solicitud sin sesión ni reinstalar la app. Esa URL todavía no está confirmada y no debe introducirse como definitiva en Console.

La página final explicará cómo solicitar cuenta y datos asociados, qué se conserva y por qué, y las expectativas reales de atención. La app y Console deben dirigir al recurso correcto; no usar una URL genérica de inicio o un archivo local como sustituto.

## Prueba de aceptación pendiente

Preparar una cuenta sintética propia en un entorno autorizado. Iniciar la petición desde la app y comprobar por separado la vía web sin sesión. Verificar titularidad, ejecutar el alcance aprobado, comprobar acceso y datos posteriores y comunicar el resultado. Usar una cuenta adicional para demostrar que otras personas no resultan afectadas. Registrar los resultados con identificadores saneados; la prueba no se da por realizada al redactar estos pasos.

## Respuestas propuestas, para completar al operar

**Recepción:** «Recibimos tu solicitud de eliminación de cuenta y datos de Sport Center, folio […]. Primero verificaremos que puedas solicitarla. Esta recepción todavía no confirma la eliminación. Te indicaremos el siguiente paso mediante el canal acordado».

**Resultado:** «Terminamos la atención del folio […]. Acción realizada: […]. Datos eliminados o anonimizados: […]. Datos conservados, motivo y plazo: […]. Estado del acceso a la cuenta: […]. Para seguimiento, escribe a sportcentersoporte@gmail.com».

No enviar plantillas con huecos ni usarlas para afirmar una operación que no ocurrió.

Google admite atención humana, pero exige una solicitud accesible y su cumplimiento real. [Requisitos de eliminación](https://support.google.com/googleplay/android-developer/answer/13327111?hl=es). La política de privacidad debe explicar eliminación y conservación. [Datos de usuario](https://support.google.com/googleplay/android-developer/answer/10144311?hl=es).
