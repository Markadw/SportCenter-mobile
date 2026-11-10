// Contenido íntegro de los documentos legales del sitio web de Sport Center.
// Fuente: front-sport, src/app/features/legal/{terms,privacy}/*.html (revisión del 8 de noviembre de 2026).
// Los valores dinámicos de la web se resuelven con el mismo LEGAL_CONTACT. Al actualizar la web, actualizar aquí.
import { LEGAL_CONTACT as L } from "../privacy/legalContact";
import { PRIVACY_LINKS } from "../privacy/config";

/** Texto simple, negrita o enlace. `href` admite rutas internas (/...), anclas (#...) y URLs externas. */
export type LegalInline = string | { bold: string } | { link: string; href: string };
export type LegalBlock = { paragraph: LegalInline[] } | { list: LegalInline[][] };
export interface LegalSection { id?: string; title: string; blocks: LegalBlock[] }
export interface LegalDocument {
  title: string; meta: string; headerLink?: { link: string; href: string };
  sections: LegalSection[]; footer: { note: string; links: { link: string; href: string }[] };
}

const CONTACT_MAILTO = "mailto:" + L.email;
const DELETION_MAILTO = CONTACT_MAILTO + "?subject=" + encodeURIComponent("Solicitud de eliminación de cuenta y datos · Sport Center");

export const TERMS: LegalDocument = {
  title: `Términos y condiciones de ${L.brand}`,
  meta: `Versión del documento: ${L.revisionLabel}`,
  sections: [
    { title: `1. Alcance e identificación`, blocks: [
      { paragraph: [`Estos términos regulan las compras de productos de ${L.brand}, así como el uso de sus servicios y cuentas de cliente. Cada compra se rige por las condiciones informadas antes de su confirmación y por la legislación mexicana aplicable.`] },
      { list: [
        [{ bold: `Marca:` }, ` ${L.brand}.`],
        [{ bold: `Responsable de la venta:` }, ` ${L.owner}.`],
        [{ bold: `Domicilio de contacto y reclamaciones:` }, ` ${L.address}.`],
        [{ bold: `Contacto:` }, ` `, { link: `${L.email}`, href: CONTACT_MAILTO }, `.`],
        [{ bold: `Teléfono:` }, ` `, { link: `${L.phone}`, href: L.phoneHref }, `.`],
        [{ bold: `Horario de atención:` }, ` ${L.hours}.`],
        [{ bold: `Sitio:` }, ` `, { link: `${L.website}`, href: L.website }, `.`],
      ] },
    ] },
    { title: `2. Productos, precios y pedido`, blocks: [
      { paragraph: [`Antes de comprar, revise la descripción, talla, color, cantidad, precio y disponibilidad del producto elegido. El precio y las existencias pueden variar entre presentaciones. Conserve su comprobante y la información de su pedido para cualquier aclaración.`] },
      { paragraph: [`Antes de confirmar la compra, se informan el precio, el costo de envío y cualquier otro cargo aplicable, junto con el importe total. Las promociones se sujetan a las condiciones y la vigencia indicadas al ofrecerlas.`] },
      { paragraph: [`Los medios de pago disponibles se indican al realizar el pedido. El plazo de entrega comienza a contar una vez confirmado el pago, como se explica en el apartado siguiente.`] },
    ] },
    { title: `3. Cobertura, envío y entrega`, blocks: [
      { paragraph: [`Las entregas se realizan únicamente en las zonas locales de Huejutla de Reyes, Hidalgo, incluidas en nuestra cobertura. El plazo estimado es de 2 a 5 días hábiles, a partir del día hábil siguiente a la confirmación del pago.`] },
      { paragraph: [`El costo de envío se determina de acuerdo con la ubicación de entrega y se informa antes de confirmar la compra. Para consultar cobertura o atender una incidencia, escriba a `, { link: `${L.email}`, href: CONTACT_MAILTO }, `.`] },
    ] },
    { title: `4. Cambios y devoluciones`, blocks: [
      { paragraph: [`Puede solicitar un cambio voluntario dentro de los 15 días naturales siguientes a la recepción del producto. El artículo debe estar sin uso, limpio y con sus etiquetas, y debe presentar el comprobante de compra.`] },
      { paragraph: [`Si recibe un producto defectuoso o diferente al solicitado, contáctenos para atender la reclamación y aplicar la solución que corresponda conforme a la ley y a la garantía. Los requisitos del cambio voluntario no limitan estos derechos.`] },
      { paragraph: [`Para solicitar atención, escriba a `, { link: `${L.email}`, href: CONTACT_MAILTO }, ` e indique la referencia del pedido, el producto y el motivo de la solicitud.`] },
      { paragraph: [`Le indicaremos cómo entregar o enviar el artículo y, en su caso, los costos aplicables antes de continuar el trámite, respetando los derechos que le correspondan.`] },
    ] },
    { title: `5. Cancelaciones y reembolsos`, blocks: [
      { paragraph: [`Puede solicitar la cancelación de su pedido antes de su despacho a través de los medios de contacto indicados en este documento. Esta opción se suma a los derechos legales de cancelación, revocación y reclamación que correspondan.`] },
      { paragraph: [`En las ventas a distancia sujetas a este derecho, puede revocar su consentimiento dentro de los 5 días hábiles siguientes a la entrega del producto o a la firma del contrato, lo que ocurra después. Se reintegra el precio pagado; los gastos de flete y seguro corresponden a la persona consumidora conforme a la ley. Esta regla de gastos no limita los derechos por defectos, productos incorrectos o incumplimientos.`] },
      { paragraph: [`Los reembolsos procedentes se realizan por el medio de pago original, salvo que acepte expresamente otro, y se confirman al cliente. La gestión administrativa toma hasta 5 días hábiles, sin ampliar los plazos legalmente exigibles. El tiempo que el banco o proveedor del medio de pago tarde en reflejar el importe es independiente de esta gestión.`] },
      { paragraph: [`${L.brand} no ofrece apartados.`] },
    ] },
    { title: `6. Garantías y reclamaciones`, blocks: [
      { paragraph: [`Cuando un producto se ofrezca con garantía, su duración será de al menos 90 días desde la entrega. Se respetará cualquier plazo superior ofrecido para ese producto o exigido por la ley.`] },
      { paragraph: [`La póliza se entrega por escrito e indica su cobertura, duración, condiciones y los medios y lugares de atención, sin reducir los derechos legales. Para iniciar una reclamación, escriba a `, { link: `${L.email}`, href: CONTACT_MAILTO }, ` con la referencia del pedido y la descripción del problema.`] },
      { paragraph: [`Puede presentar su reclamación en el domicilio y los medios de contacto indicados en el primer apartado, además de los lugares señalados en la póliza correspondiente.`] },
      { paragraph: [`Los derechos de revocación, garantía y reclamación se rigen por la `, { link: `Ley Federal de Protección al Consumidor`, href: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPC.pdf' }, `.`] },
    ] },
    { title: `7. Atención y derechos de la persona consumidora`, blocks: [
      { paragraph: [`Puede acudir a `, { link: `PROFECO`, href: 'https://www.gob.mx/profeco' }, ` para orientación o para presentar una reclamación. Estos términos no limitan los derechos de la persona consumidora ni las responsabilidades legalmente exigibles a ${L.brand}.`] },
    ] },
    { title: `8. Cuenta de cliente y privacidad`, blocks: [
      { paragraph: [`Al utilizar una cuenta, proporcione información correcta y mantenga sus credenciales de acceso bajo resguardo. Si detecta un acceso que no reconoce, comuníquese con nosotros.`] },
      { paragraph: [`Una vez completada, la eliminación de la cuenta es irreversible y no cancela automáticamente los pedidos en curso. Para atender un pedido o solicitar su cancelación, utilice los medios de contacto indicados en este documento. El tratamiento y la conservación de los datos, así como el ejercicio de sus derechos, se explican en el `, { link: `Aviso de Privacidad`, href: '/legal/privacy' }, `.`] },
    ] },
    { title: `9. Actualizaciones`, blocks: [
      { paragraph: [`Las actualizaciones de estos términos se publican con su fecha de revisión. Cada compra conserva las condiciones que se informaron al confirmarla; las versiones posteriores no las modifican retroactivamente ni afectan los derechos reconocidos por la ley.`] },
    ] },
  ],
  footer: { note: `© ${L.brand}`, links: [{ link: `Aviso de Privacidad`, href: '/legal/privacy' }] },
};

export const PRIVACY: LegalDocument = {
  title: `Aviso de privacidad de ${L.brand}`,
  meta: `Última actualización: ${L.revisionLabel}.`,
  headerLink: { link: `Eliminación de cuenta y datos personales`, href: '#eliminar-cuenta' },
  sections: [
    { title: `1. Responsable del tratamiento`, blocks: [
      { paragraph: [`${L.owner}, titular de ${L.brand}, con domicilio en ${L.address}, es responsable del tratamiento de los datos personales recabados para la atención a clientes, la venta de productos y la prestación de los servicios de Sport Center.`] },
      { paragraph: [`Para asuntos relacionados con sus datos personales, puede comunicarse con la Administración de Sport Center al correo `, { link: `${L.email}`, href: CONTACT_MAILTO }, ` o al teléfono `, { link: `${L.phone}`, href: L.phoneHref }, `. El horario de atención es ${L.hours}.`] },
    ] },
    { title: `2. Datos personales y finalidades`, blocks: [
      { paragraph: [`Sport Center trata los datos necesarios para las operaciones y servicios que el cliente solicita:`] },
      { list: [
        [{ bold: `Identificación y contacto:` }, ` nombre, apellidos, correo electrónico, teléfono e identificador de cuenta, para registrar y administrar la cuenta, identificar al cliente y atender sus comunicaciones.`],
        [{ bold: `Acceso y seguridad:` }, ` credenciales, códigos de verificación, identificadores de sesión y datos técnicos de conexión, como dirección IP e información del dispositivo, para autenticar el acceso, recuperar la cuenta y prevenir usos no autorizados.`],
        [{ bold: `Compras y entregas:` }, ` productos, cantidades, carrito, direcciones, datos del destinatario, referencias de pago, importes e historial de pedidos, para gestionar ventas, pagos, entregas, cambios, devoluciones y reclamaciones.`],
        [{ bold: `Contenido y atención:` }, ` reseñas, valoraciones, reportes, mensajes y solicitudes relacionadas con datos personales, para publicar el contenido solicitado, atender incidencias y dar seguimiento a las gestiones del cliente. Las reseñas pueden mostrar el nombre del autor junto al contenido publicado.`],
        [{ bold: `Preferencias de uso:` }, ` búsquedas, preferencias y constancias de operaciones o aceptación de documentos, para conservar las opciones elegidas y facilitar el uso de los servicios.`],
      ] },
      { paragraph: [`Estas finalidades permiten mantener la relación con el cliente y cumplir las obligaciones derivadas de ella. La falta de los datos necesarios puede impedir la prestación del servicio solicitado.`] },
      { paragraph: [`Sport Center no solicita datos personales sensibles para estas finalidades. Se recomienda no incluirlos en reseñas, mensajes ni otros campos de texto libre.`] },
      { paragraph: [`Actualmente no se utilizan los datos personales de los clientes para campañas publicitarias. Los correos de verificación, confirmación y seguimiento son comunicaciones necesarias para la operación del servicio. Cualquier finalidad promocional posterior se informará previamente y se recabará el consentimiento que corresponda.`] },
    ] },
    { title: `3. Almacenamiento, ubicación y recursos externos`, blocks: [
      { paragraph: [`Los servicios digitales utilizan cookies y almacenamiento local para mantener sesiones, recordar preferencias y búsquedas, conservar constancias y permitir la recuperación de ciertas acciones. También pueden guardar contenido público para su consulta sin conexión. Estas opciones se administran desde la configuración del navegador o dispositivo; su eliminación puede cerrar la sesión o restablecer preferencias.`] },
      { paragraph: [`Cuando el cliente utiliza una opción de ubicación, las coordenadas se obtienen con su autorización para facilitar la captura de direcciones, mostrar mapas o consultar indicaciones. El permiso puede rechazarse o revocarse desde la configuración correspondiente, y la dirección puede proporcionarse manualmente.`] },
      { paragraph: [`La carga de recursos de identidad, tipografías, imágenes y mapas genera conexiones con sus proveedores, que reciben los datos técnicos necesarios para entregarlos. Al utilizar una función de mapas o indicaciones con ubicación, también se transmiten las coordenadas necesarias para esa consulta.`] },
    ] },
    { title: `4. Proveedores y comunicación de datos`, blocks: [
      { paragraph: [`Sport Center utiliza proveedores que intervienen en las siguientes funciones:`] },
      { list: [
        [{ bold: `Netlify y Render:` }, ` alojamiento y operación de los servicios digitales.`],
        [{ bold: `Neon:` }, ` almacenamiento de la base de datos.`],
        [{ bold: `Cloudflare:` }, ` almacenamiento de respaldos y constancias de eliminación.`],
        [{ bold: `Brevo:` }, ` envío de correos operativos.`],
        [{ bold: `Cloudinary:` }, ` almacenamiento y entrega de imágenes.`],
        [{ bold: `Mercado Pago:` }, ` procesamiento de pagos y comunicación de referencias y estados de las operaciones. Los datos introducidos en su propio proceso de pago son tratados por ese proveedor.`],
        [{ bold: `Google y MapTiler:` }, ` servicios de identidad, tipografías, mapas e indicaciones, según el recurso o la función utilizada.`],
      ] },
      { paragraph: [`Cada proveedor recibe los datos necesarios para su función. La información de entrega se comunica únicamente en la medida necesaria para atender el pedido. Los datos también podrán comunicarse a una autoridad cuando exista una obligación legal. Si una transferencia requiere consentimiento, éste se solicitará antes de realizarla.`] },
      { paragraph: [`Algunos proveedores pueden tratar información fuera de México. Su intervención se limita a los fines del servicio y a las obligaciones de protección de datos que correspondan.`] },
    ] },
    { title: `5. Conservación y protección`, blocks: [
      { paragraph: [`Los datos de cuenta, contacto y direcciones se conservan mientras sean necesarios para la relación con el cliente. Cuando dejan de ser necesarios, se eliminan o anonimizan, salvo que deban conservarse para cumplir una obligación o atender una operación pendiente.`] },
      { paragraph: [`Los pedidos, pagos, devoluciones y comprobantes se conservan durante los periodos necesarios para cumplir obligaciones comerciales, fiscales y legales y atender reclamaciones. Su acceso y uso se limitan a esas finalidades. Las reseñas, mensajes y constancias de atención se eliminan o disocian cuando ya no deban conservarse.`] },
      { paragraph: [`Los registros de seguridad y las constancias de eliminación se utilizan para proteger el servicio, atender incidencias y evitar la reactivación de cuentas eliminadas. Los respaldos se destinan a la recuperación y continuidad del servicio; las eliminaciones confirmadas se respetan al restaurar la información.`] },
      { paragraph: [`Sport Center aplica controles de acceso, verificación de identidad y conexiones cifradas para proteger los datos personales. El acceso se limita al personal autorizado y a los proveedores que lo requieren para cumplir sus funciones.`] },
    ] },
    { id: 'eliminar-cuenta', title: `6. Eliminación de cuenta y datos personales`, blocks: [
      { paragraph: [`La eliminación puede solicitarse mediante la opción `, { link: `Eliminar mi cuenta`, href: '/account-deletion' }, `. El procedimiento requiere iniciar sesión, verificar la identidad con un código exclusivo de seis dígitos enviado al correo de la cuenta y confirmar la solicitud después de revisar sus consecuencias.`] },
      { paragraph: [`El proceso invalida el acceso y las sesiones de la cuenta y elimina o anonimiza los datos personales que ya no deban conservarse. Los registros sujetos a una obligación de conservación permanecen protegidos y con acceso restringido.`] },
      { paragraph: [`Cuando existen pedidos, pagos o devoluciones pendientes, o una situación que exige revisión, la Administración atiende el caso. El seguimiento indica si la eliminación está completada o requiere atención y el resultado se comunica por correo. Enviar o verificar el código no acredita por sí solo la eliminación.`] },
      { paragraph: [`La eliminación completada es irreversible respecto de la cuenta anterior. Un registro posterior crea una cuenta nueva y no recupera automáticamente los datos ni el historial eliminados. La solicitud de eliminación no cancela pedidos ni inicia reembolsos.`] },
      { paragraph: [`Si no puede acceder a su cuenta o necesita asistencia, puede escribir a `, { link: `${L.email}`, href: DELETION_MAILTO }, ` con el asunto «Solicitud de eliminación de cuenta y datos». La Administración verificará la titularidad antes de tramitarla; no envíe contraseñas ni códigos de acceso.`] },
    ] },
    { title: `7. Derechos sobre sus datos personales`, blocks: [
      { paragraph: [`El titular puede solicitar acceso, rectificación, cancelación u oposición al tratamiento de sus datos, revocar su consentimiento o limitar su uso o divulgación. La Administración de Sport Center atiende estas solicitudes en `, { link: `${L.email}`, href: CONTACT_MAILTO }, `.`] },
      { paragraph: [`La solicitud debe indicar nombre, medio para recibir respuesta, derecho que se desea ejercer y datos que permitan localizar la información. Para una rectificación, debe señalarse la modificación solicitada y su soporte. La Administración indicará un medio adecuado para acreditar la identidad o representación; no adjunte documentos de identidad al mensaje inicial.`] },
      { paragraph: [`Las solicitudes de acceso, rectificación, cancelación u oposición se resuelven en un máximo de 20 días hábiles desde su recepción. Si proceden, se hacen efectivas dentro de los 15 días hábiles siguientes a la respuesta. Los plazos pueden ampliarse una sola vez por igual periodo cuando exista justificación, que será comunicada al titular.`] },
      { paragraph: [`La revocación y la limitación se atienden conforme a la finalidad del tratamiento y las obligaciones aplicables. Cuando sea necesario conservar determinados registros, se informará el motivo y el criterio de conservación correspondiente.`] },
      { paragraph: [`Para conocer el marco aplicable, puede consultar la `, { link: `Ley Federal de Protección de Datos Personales en Posesión de los Particulares`, href: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf' }, `.`] },
    ] },
    { title: `8. Actualizaciones del aviso`, blocks: [
      { paragraph: [`Las modificaciones se publicarán en esta misma página, identificadas con su fecha de actualización. Cuando un cambio requiera un nuevo consentimiento, éste se solicitará antes de aplicar el tratamiento correspondiente.`] },
      { paragraph: [`Este aviso se encuentra disponible en `, { link: `${L.website}/legal/privacy`, href: `${L.website}/legal/privacy` }, `.`] },
    ] },
  ],
  footer: { note: `© ${L.brand}`, links: [{ link: `Términos y condiciones`, href: '/legal/terms' }, { link: `Contacto`, href: PRIVACY_LINKS.contact }, { link: `Correo de atención`, href: CONTACT_MAILTO }] },
};
