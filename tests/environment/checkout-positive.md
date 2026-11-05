# Dirección persistida con preferencia de prueba — HU-06

Este perfil pertenece al repositorio móvil. Usa la misma copia del backend
`31ee304d902ec5ec5a9c0fc702eca5e1a531bc16` y los datos sintéticos ya preparados
para comercio y checkout. No modifica el backend, la web, Render ni la base Neon
compartida. Tampoco realiza pagos.

## Resultado real registrado

La [evidencia saneada de HU-06](../../evidence/hu06-checkout-positive.json)
registra **10 controles HTTP aprobados de 10** sobre el backend fijado y
PostgreSQL efímero con datos sintéticos. Se verificaron con el proveedor la
identidad del vendedor de prueba de México y una preferencia auténtica; no se
utilizó una preferencia simulada ni se ejecutó un pago.

El checkout recibió una sola confirmación y guardó la nueva dirección y el
pedido pendiente. La dirección volvió a aparecer al consultar el resumen y
después de cerrar sesión e iniciar una nueva; se comprobó su vínculo con la
cuenta y el pedido. La otra cuenta mantuvo únicamente sus propias direcciones.
Carrito, existencias y movimientos de inventario quedaron intactos.

Las tres sesiones y la conexión a la base se cerraron. El orquestador confirmó
el cierre del retorno, el túnel y los contenedores/redes propios. El informe no
incluye credenciales, direcciones, IDs externos, URLs temporales ni rutas
privadas. El recurso de preferencia creado en el proveedor no se considera
eliminado por haber retirado el entorno local.

**Alcance:** esto acredita persistencia por HTTP en la composición QA. No se
probó aquí la selección de esa dirección en la interfaz Android, no se hizo
una compra aprobada/rechazada y no se cierra HU-07. Tampoco se acredita paridad
completa con Neon o producción.


## Diferencia respecto a la prueba anterior

[checkout-isolated.cjs](checkout-isolated.cjs) conserva sus seis controles de
rollback, su red interna y la prohibición de proveedores. Su evidencia no se
sobrescribe ni se presenta como guardado positivo.

[checkout-positive.cjs](checkout-positive.cjs) valida el vendedor de prueba
mediante la API del proveedor antes de enviar **una sola confirmación** al
backend. Después consulta la preferencia auténtica y comprueba el COMMIT de
dirección y pedido, con lectura nueva y nueva sesión. No inserta manualmente
una dirección para fabricar el resultado ni representa un pago como aprobado.

## Preparación autorizada

- Credencial de vendedor de prueba de México disponible sólo en el servidor.
  Se valida ID esperado, país `MLM` y etiqueta `test_user`; el prefijo de la
  credencial no demuestra por sí solo el entorno.
- Imágenes QA ya preparadas y fuente fijada. El ejecutor verifica los hashes
  del servicio y DTO del checkout y rechaza bases distintas de `sportcenter_qa`
  en el servicio interno `db`.
- Un retorno HTTPS temporal controlado por la ejecución. La página estática
  no muestra cuentas ni confirma un pago. Sólo se acepta después de comprobar
  la conexión del túnel, DNS y respuesta del servidor propio.
- Un proyecto Docker exclusivo. API y base sólo pertenecen a la red interna;
  no publican puertos. El acceso local de la app se limita a loopback.

[checkout-positive-profile.cjs](checkout-positive-profile.cjs) produce ese
perfil sin incluir el valor de la credencial. El JSON se genera fuera de Git;
Docker recibe `QA_MERCADO_PAGO_ACCESS_TOKEN` del entorno del proceso autorizado.
No cargar el `.env` compartido ni reutilizar sus otras credenciales.

[checkout-positive-network.cjs](checkout-positive-network.cjs) restringe la
salida a identidad y creación/consulta de preferencias. Rechaza `/payments`,
destinos ajenos, túneles CONNECT y redirecciones; verifica TLS y limita cuerpos
y tiempos. El modo proxy sólo arranca dentro del contenedor QA explícito.

## Controles positivos

| Caso | Comprobación |
| --- | --- |
| PA01 | Fuente, base y actores sintéticos reconocidos; no existe un pedido previo de esta prueba. |
| PA02 | Vendedor esperado de prueba y país México comprobados con el proveedor. |
| PA03 | Carrito propio y existencias disponibles antes de confirmar. |
| PA04 | Una confirmación recibida con pedido pendiente; sin reintento automático. |
| PA05 | Preferencia auténtica con vendedor, referencia, moneda, importe y retornos correspondientes. |
| PA06 | Nueva dirección guardada por el checkout y vinculada al usuario y pedido correctos. |
| PA07 | Misma dirección después de cerrar sesión y volver a entrar. |
| PA08 | La otra cuenta conserva sólo sus direcciones. |
| PA09 | Inventario, movimientos y carrito permanecen intactos al crear la preferencia. |
| PA10 | Pedido y pago local siguen pendientes, sin fecha de pago aprobado. |

El informe sólo contiene casos, hashes y estados acotados. Cierra las sesiones
y la conexión, sin exportar contraseñas, tokens, direcciones o respuestas crudas.
El orquestador debe retirar los contenedores y redes propios, cerrar el retorno
y detener el túnel incluso ante un fallo. Una preferencia de prueba es un recurso
del proveedor; destruir el entorno local no la convierte en eliminada.

Ante resultado incierto, conservar el estado sintético para reconciliarlo y
detenerse antes de otra confirmación. Un error posterior a un POST no autoriza
a crear otra preferencia. Los fallos de preparación antes de ese POST se
distinguen de defectos de la aplicación y se conservan en la evidencia privada.

## Validaciones locales del código de prueba

```powershell
npm run lint
npm run typecheck
npm test -- --runTestsByPath __tests__/checkout-positive.test.js __tests__/checkout-positive-network.test.js __tests__/checkout-positive-profile.test.js
npm run test:config
```

Las pruebas de red usan sockets loopback; necesitan que el entorno permita
esa comunicación local. No deben sustituirse por dobles para afirmar que se
ejecutó la aceptación real del proveedor.

## Límites para cerrar las historias

La interfaz real de Expo Web también mostró la dirección creada por el backend:
se seleccionó, ocultó el formulario de dirección nueva, conservó la elección al
volver desde el carrito y permitió reconsultarla después de recargar e iniciar
otra sesión. Se usó exclusivamente el gateway QA con confirmación bloqueada;
no se creó otro pedido desde la interfaz. Esta comprobación utiliza el cliente
móvil compilado para web y no equivale a una ejecución Android. El árbol web no
expuso `aria-checked`; la selección se observó mediante el formulario y el
resaltado, sin afirmar una validación de lector de pantalla.

El resultado HTTP positivo acredita persistencia en esa composición QA,
no paridad completa de Neon/producción ni uso de la dirección en un Android.
Completar la selección y reconsulta del ID en Android antes de cerrar ese
recorrido. El alcance físico sigue en QA-002.

HU-07 requiere comprador de prueba, escenarios aprobado/rechazado, retorno y
sincronización auténtica por el backend; debe comprobar que un pago aprobado
actualiza pedido, stock y carrito una sola vez. No se da por aprobado por
crear la preferencia ni por mostrar la página de retorno.

Referencias: [cuentas de prueba](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences/test-accounts),
[preferencia](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences/create-payment-preference),
[compras de prueba de Preferences API](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences/integration-test/test-purchases),
[retornos](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro-preferences/configure-back-urls).
