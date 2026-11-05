# Direcciones nuevas en checkout — HU-06

Esta preparación pertenece al repositorio móvil y ejecuta una copia sin cambios
del backend `31ee304d902ec5ec5a9c0fc702eca5e1a531bc16`. No modifica Render,
el repositorio del backend ni sus datos. El resultado histórico de rollback se
conserva; el [cierre de criterios de HU-06](checkout-positive.md#criterios-de-hu-06-acreditados)
combina la persistencia positiva posterior con la comprobación Android.

## Qué se comprueba ahora

`checkout-fixtures.sql` complementa el fixture de comercio existente con las
tablas, columnas, permisos e identificadores que utiliza el checkout sin cupón.
No es una migración productiva: el backend fijado no incluye un esquema SQL
completo con el que acreditar equivalencia de todas las restricciones del servidor.
Su entidad de pedidos exige fechas de pago, envío y entrega, mientras su servicio
crea un pedido pendiente sin esas fechas. El fixture permite esos nulos. La
inspección de metadatos de Neon `db_sportcentertest` confirmó también que sus
columnas `fecha_pago` y `fecha_entrega` permiten NULL; esto no acredita por sí
solo la base utilizada por Render ni todas las restricciones productivas.

`checkout-schema-tests.sql` ejecuta las escrituras con el rol `qa_editor` y revierte
sus datos y posiciones de secuencias al terminar. Comprueba también las columnas
que el servicio utiliza después de crear la preferencia. Es una prueba SQL de
estructura; no invoca el proveedor ni demuestra una compra confirmada.

`checkout-isolated.cjs` llama por HTTP al backend real dentro del contenedor:

1. Consulta la dirección propia y el producto con existencias.
2. Rechaza una dirección de otro usuario sin modificar los datos.
3. Envía una dirección nueva como principal. Sin credenciales, el proveedor
   devuelve el error de configuración esperado.
4. Comprueba que se alcanzaron las inserciones de dirección, pedido y pago local
   mediante sus secuencias PostgreSQL; un error temprano de esquema no cuenta.
5. Compara el contenido completo de las tablas para acreditar el rollback,
   incluida la dirección principal anterior, el carrito y el inventario.
6. Cierra sesión, inicia otra y consulta de nuevo: no debe aparecer una dirección
   que el servidor revirtió. Cierra esa sesión y la conexión a la base.

El resultado conserva `positivePersistencePending: true` incluso si todos estos
controles pasan. No exporta contraseñas, tokens, direcciones ni respuestas crudas.
La [evidencia local acotada](../../evidence/hu06-checkout-rollback.json) registra
este resultado histórico. El guardado positivo posterior tiene evidencia independiente.

## Ejecución aislada

Requiere Docker y la preparación habitual de
[la copia QA](../../README.md#copia-local-del-backend-para-pruebas).
Usar una base efímera nueva, sin otra prueba ejecutándose sobre el mismo compose.

En PowerShell, desde la raíz del repositorio:

```powershell
$env:ISOLATED_TEST_ENV = 'true'
$env:QA_COMMERCE = 'true'
$env:QA_CHECKOUT = 'true'
npm run env:start
node tests/environment/commerce-isolated.cjs seed .
node tests/environment/checkout-isolated.cjs seed
node tests/environment/checkout-isolated.cjs schema-check
node tests/environment/checkout-isolated.cjs check
npm run env:stop
```

Detenerse ante cualquier código de salida distinto de cero y ejecutar siempre
`npm run env:stop` al finalizar. El complemento rechaza una segunda aplicación;
para empezar de nuevo se descarta la base efímera y se prepara otra. El gateway
histórico no habilita checkout: el ejecutor accede exclusivamente al loopback
del contenedor, con red interna, origen fijado y proveedores deshabilitados.
No se añaden nuevos disparadores de Actions ni compilaciones EAS.

## Guardado positivo por HTTP y aceptación móvil pendiente

La [ejecución positiva independiente](checkout-positive.md#resultado-real-registrado)
ya obtuvo **10 de 10 controles aprobados** y tiene
[evidencia propia](../../evidence/hu06-checkout-positive.json). Usó la copia QA,
datos sintéticos y una preferencia auténtica del vendedor de prueba verificado
de México. No contactó la base productiva ni ejecutó un pago.

El servicio guardó dirección y pedido en su transacción y realizó COMMIT
después de crear la preferencia. Se comprobó la dirección con una petición
nueva y otra sesión, su vinculación al usuario y al pedido pendiente, el
aislamiento de la segunda cuenta y la conservación del carrito, stock y
movimientos. Se cerraron sesiones, conexión, retorno, túnel y recursos locales.
[Contrato del backend fijado](https://github.com/AlexisYazir/back-sport/blob/31ee304d902ec5ec5a9c0fc702eca5e1a531bc16/src/modules/products/services/product-checkout.service.ts#L152).

La preparación positiva sigue separada: el ejecutor de rollback anterior
rechaza deliberadamente proveedores y no debe modificarse ni repetirse por
rutina. Sus seis controles históricos conservan su resultado y su límite
original; la evidencia nueva es la que acredita ahora el guardado positivo.

La [comprobación física posterior](checkout-positive.md#comprobación-física-de-dirección--5-de-noviembre-de-2026)
acredita selección, reconsulta y captura del ID desde Android en Debug histórico
con JavaScript actual, sin reenviar la confirmación al backend. Este resultado
HTTP conserva su alcance propio. Los cinco criterios de HU-06 están
acreditados; QA-002 y HU-07 conservan sus pendientes físicos y de pago.

HU-07 ya tiene un [pago aprobado entre cuentas TEST](checkout-payment.md) y nueve
controles de sincronización local: pedido, stock, carrito e idempotencia. La
app en Expo Web mostró el pago confirmado y el nuevo carrito vacío. El caso
separado `OTHE` sigue `in_process` en el proveedor, por lo que el rechazo todavía
no está acreditado. También faltan la notificación automática y el retorno en
Android. Crear una preferencia o volver a la app no confirma un pago.
[Preferencia e inicio de checkout](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences/create-payment-preference).

No se publican las credenciales, el ID externo de la preferencia ni el dominio
temporal utilizado. Retirar los contenedores locales no acredita eliminar la
preferencia del proveedor. La prueba tampoco establece equivalencia de todas
las restricciones del esquema QA con Neon o producción.
