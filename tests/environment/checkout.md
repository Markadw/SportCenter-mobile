# Direcciones nuevas en checkout — HU-06

Esta preparación pertenece al repositorio móvil y ejecuta una copia sin cambios
del backend `31ee304d902ec5ec5a9c0fc702eca5e1a531bc16`. No modifica Render,
el repositorio del backend ni sus datos. La historia permanece en **Pruebas**.

## Qué se comprueba ahora

`checkout-fixtures.sql` complementa el fixture de comercio existente con las
tablas, columnas, permisos e identificadores que utiliza el checkout sin cupón.
No es una migración productiva: el backend fijado no incluye un esquema SQL
completo con el que acreditar equivalencia de todas las restricciones del servidor.
Su entidad de pedidos exige fechas de pago, envío y entrega, mientras su servicio
crea un pedido pendiente sin esas fechas; únicamente la copia QA permite esos nulos.

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
este resultado y distingue expresamente el guardado positivo todavía no ejecutado.

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

## Qué falta para aprobar el guardado positivo

El servicio guarda dirección y pedido en una transacción, pero sólo hace COMMIT
después de crear una preferencia auténtica de Mercado Pago. Sin ella hace ROLLBACK.
[Contrato del backend fijado](https://github.com/AlexisYazir/back-sport/blob/31ee304d902ec5ec5a9c0fc702eca5e1a531bc16/src/modules/products/services/product-checkout.service.ts#L152).

La ejecución positiva necesita una configuración separada; el ejecutor anterior
rechaza deliberadamente cualquier credencial de proveedor. No basta con añadir
un token a su compose ni con insertar una dirección manualmente.

1. El responsable de la integración debe facilitar por un canal secreto una
   credencial del **vendedor de prueba de México** y su ID, identificados en el
   panel de Prueba de la aplicación. `APP_USR` no distingue por sí solo producción
   de prueba. [Cuentas de prueba](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences/test-accounts),
   [compartir credenciales de prueba](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences/additional-content/credentials).
2. Configurar únicamente esa copia QA, con base sintética y retornos/notificación
   HTTPS de un entorno bajo control del proyecto. Mercado Pago rechaza HTTP;
   no deben usarse los callbacks de Render compartido ni asumir que un dominio
   ficticio será aceptado. [Requisito de URLs](https://www.mercadopago.com.mx/developers/es/news/2024/11/14/We-have-updated-the-Preference-API).
3. Verificar identidad de prueba, país y vendedor esperado antes de permitir
   la salida controlada al proveedor. La credencial queda sólo en servidor,
   nunca en código móvil, reportes o parámetros públicos.
4. Con el usuario y carrito sintéticos, enviar una sola confirmación por la API
   real con una dirección nueva. Comprobar preferencia, vendedor y pedido
   pendiente. No reintentar automáticamente una escritura de resultado incierto.
5. Consultar el resumen con una petición nueva y luego con una sesión nueva:
   debe devolver el mismo ID y los campos de la dirección. Otro usuario no debe
   recibirla. Seleccionarla en la app y comprobar el envío de su ID.
6. Comprobar que no se pagó, no se descontó inventario y el carrito continúa
   intacto. Cerrar sesiones y descartar el entorno temporal.

Crear la preferencia y detenerse antes de abrir Checkout permite comprobar HU-06
sin pagar. No acredita los estados aprobado/rechazado de HU-07 ni sus notificaciones.
[Separación entre preferencia e inicio de Checkout](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences/create-payment-preference).
