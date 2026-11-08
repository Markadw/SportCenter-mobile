# Eliminación de cuenta y atención de solicitudes

La rama `feature/account-deletion-mobile` incorpora el autoservicio nativo con los mismos endpoints de eliminación utilizados por la web. Este documento distingue ese flujo de la alternativa de atención manual. Su incorporación al código no acredita que se haya distribuido un nuevo APK o publicado una versión en Google Play.

## Lo que ya hace la app

Los clientes autenticados pueden entrar en «Eliminar cuenta» desde «Mi cuenta» o «Mi perfil». El proceso solicita un código exclusivo de seis dígitos al correo de identidad de la cuenta, verifica ese código y muestra las consecuencias antes de exigir una confirmación explícita. Solo la respuesta `completed` acredita la eliminación completada; los estados pendientes, de atención, de error o de resultado desconocido se presentan de forma diferenciada.

Antes de confirmar se guarda un comprobante en almacenamiento seguro nativo. Permite consultar el resultado después del cierre de sesión o de un reinicio. Una respuesta perdida no repite la confirmación. La sesión y los datos locales de la cuenta se limpian sin cerrar una cuenta diferente que haya iniciado sesión posteriormente.

Como invitado se conserva «Solicitar eliminación de cuenta» y el formulario público de «Privacidad y términos». Pide nombre, correo de la cuenta, confirmación y detalles opcionales, envía un mensaje a atención y recibe un folio. El correo alternativo prepara un mensaje que la persona debe enviar.

El folio de ese formulario manual acredita únicamente recepción del mensaje. No verifica identidad, desactiva sesiones ni elimina datos. Cerrar sesión y desactivar una cuenta tampoco equivalen a eliminarla.

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

El recurso oficial es [Eliminar mi cuenta](https://sport-center-sitie.netlify.app/account/delete). El [aviso de privacidad, sección de eliminación](https://sport-center-sitie.netlify.app/legal/privacy#eliminar-cuenta), explica el proceso, la conservación y el correo de asistencia si no se puede acceder a la cuenta. Los documentos publicados el 8 de noviembre de 2026 identifican a Carlos Reyes Mendoza como responsable de Sport Center y usan `sportcentersoporte@gmail.com` como contacto.

La vía web y el autoservicio nativo requieren iniciar sesión, verificar un código enviado al correo de identidad de la cuenta y confirmar la solicitud. El formulario de atención manual continúa disponible como alternativa; recibir su folio no ejecuta la eliminación. Los archivos de `docs/public/` redirigen a los recursos oficiales para evitar políticas divergentes. Incorporar las URLs en Console y comprobar el recorrido aplicable a la versión distribuida sigue pendiente.

## Prueba de aceptación pendiente

Preparar una cuenta sintética propia en un entorno autorizado. Iniciar la petición desde la app y comprobar por separado la vía web sin sesión. Verificar titularidad, ejecutar el alcance aprobado, comprobar acceso y datos posteriores y comunicar el resultado. Usar una cuenta adicional para demostrar que otras personas no resultan afectadas. Registrar los resultados con identificadores saneados; la prueba no se da por realizada al redactar estos pasos.

## Respuestas propuestas, para completar al operar

**Recepción:** «Recibimos tu solicitud de eliminación de cuenta y datos de Sport Center, folio […]. Primero verificaremos que puedas solicitarla. Esta recepción todavía no confirma la eliminación. Te indicaremos el siguiente paso mediante el canal acordado».

**Resultado:** «Terminamos la atención del folio […]. Acción realizada: […]. Datos eliminados o anonimizados: […]. Datos conservados, motivo y plazo: […]. Estado del acceso a la cuenta: […]. Para seguimiento, escribe a sportcentersoporte@gmail.com».

No enviar plantillas con huecos ni usarlas para afirmar una operación que no ocurrió.

Google admite atención humana, pero exige una solicitud accesible y su cumplimiento real. [Requisitos de eliminación](https://support.google.com/googleplay/android-developer/answer/13327111?hl=es). La política de privacidad debe explicar eliminación y conservación. [Datos de usuario](https://support.google.com/googleplay/android-developer/answer/10144311?hl=es).
