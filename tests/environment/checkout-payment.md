# Compra con cuentas de prueba — HU-07

La comprobación utiliza el cliente móvil de `54552a8`, la fuente del backend
`31ee304d902ec5ec5a9c0fc702eca5e1a531bc16` sin modificaciones y PostgreSQL
efímero con cuentas, producto y carrito sintéticos. No acredita el esquema ni
la configuración del servidor compartido.

## Resultado aprobado

La [evidencia del pago aprobado](../../evidence/hu07-test-payment-approved.json)
registra nueve controles aprobados: identidad y referencia del pago, estado del
pedido, una sola salida de inventario, conversión y limpieza del carrito y
repetición del mismo ID sin duplicar efectos. El pago se obtuvo en Checkout Pro
con comprador y vendedor de prueba y la tarjeta oficial para el caso `APRO`.
El verificador no creó pagos por API ni fabricó su estado.

La app compilada para Expo Web consultó ese pedido al iniciar una nueva sesión
y mostró «Pago confirmado». Al volver al carrito mostró «Tu carrito está vacío».
El cliente leyó el estado del backend; no recibió una aprobación insertada por
SQL ni se cambió su código para mostrar el resultado.

## Contexto del proveedor y límites de la evidencia

La consulta autenticada devolvió `live_mode=true`. Se conserva como fallida la
comprobación inicial que exigía `false`; no se cambió ese dato ni se declaró una
validación de sandbox. La verificación adicional identifica el contexto de
cuentas TEST por separado: vendedor con etiqueta `test_user`, comprador creado
mediante el endpoint oficial de usuarios de prueba, consulta pública del mismo
ID y país y coincidencia del pagador, cobrador, importe, moneda, referencia y
metadatos del pago. La API pública del comprador no expuso `tags`; el recibo de
creación cifrado constituye su evidencia de origen, no ese campo ausente.

El ID auténtico se notificó de forma controlada al webhook del backend interno.
Por ello se acredita **reconciliación local**, no entrega automática de una
notificación del proveedor, comprobación de su firma, correo de confirmación
ni retorno nativo Android. No se publicó la API ni su webhook.

## Correcciones de la copia QA

El primer intento de sincronización se revirtió porque faltaba
`core.order_discounts`. La consulta posterior confirmó pedido y pago pendientes,
stock conservado y ausencia de movimientos. Se conservó ese intento y se restauró
su respaldo para continuar con **el mismo pago**, sin otra compra.

El [complemento de esquema QA](checkout-payment-fixtures.sql) crea esa tabla
vacía para el escenario sin cupón y completa la generación del ID del nuevo
carrito que el backend abre después de convertir el anterior. Valida entorno,
actores y pedido, rechaza estructuras desconocidas y comprueba las consultas
mediante `EXPLAIN` sin `ANALYZE`. No reinicia secuencias existentes ni prepara
por SQL un pedido pagado. Los fixtures históricos se conservan.

El archivo completo final también se aplicó correctamente sobre la copia
pendiente separada. Su hash y las comprobaciones SQL quedan registrados en la
evidencia; no es una migración productiva ni acredita promociones.

## Caso de rechazo separado

La [evidencia del caso OTHE](../../evidence/hu07-test-payment-rejected.json)
conserva una preferencia y referencia distintas de las del aprobado. Tras una
única pulsación de pago con tarjeta oficial y titular `OTHE`, el proveedor pidió
validar el comprador y después mostró procesamiento diferido. Tres reconsultas
autenticadas del mismo pago devolvieron `in_process / deferred_retry`. Cada una
realizó un GET y cero POST; los tres recibos privados se conservan. La tercera
reconsulta no inició QA ni volvió a comprobar el estado local.

**El rechazo no está aprobado como prueba.** El estado local documentado proviene
del respaldo QA: pedido y pago pendientes, stock y carrito intactos. Las
reconsultas del proveedor no volvieron a comprobar ese estado local. No se
repitió el pago ni se envió un webhook para imponer un rechazo. El ID y la
referencia permanecen fuera de Git. Falta el resultado definitivo del mismo
pago; no crear otra preferencia para sustituirlo.

Los entornos, el servidor de retorno, los túneles y Metro se retiran al concluir;
los respaldos sintéticos y el acceso cifrado del comprador se conservan. Apagar
QA no elimina ni cancela los recursos ya creados en el proveedor.

Referencias: [cuentas TEST de Checkout Pro](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences/test-accounts),
[ambiente y credenciales de prueba](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences/configure-development-enviroment),
[usuarios TEST y código de acceso documentado](https://developers.mercadolibre.com.mx/es_ar/preguntas-y-respuestas/realiza-pruebas),
[tarjetas y resultados de prueba](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences/integration-test/test-purchases),
[consulta de pagos](https://www.mercadopago.com.mx/developers/es/reference/online-payments/checkout-pro-preferences/overview).
