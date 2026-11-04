# Comercio con datos sintéticos aislados

Esta prueba usa el backend real fijado en `31ee304d902ec5ec5a9c0fc702eca5e1a531bc16`, PostgreSQL efímero y el catálogo sintético existente. No ejecuta pagos, preferencias, webhooks, correos ni operaciones de Render. Los pedidos entregados y sus fechas son fixtures, no compras o entregas reales.

`commerce-fixtures.sql` agrega ocho tablas auxiliares mínimas derivadas de las consultas del servicio fijado: direcciones, items, envío/eventos, carrito y métodos de pago vacíos. No es una migración del backend ni acredita paridad de constraints productivos. Se ejecuta después del bootstrap existente, exige `sportcenter_qa`, `qa_admin`, marcadores QA y namespace vacío; no borra filas ni modifica inventario.

El gateway conserva GET/HEAD por defecto. Sólo con `ISOLATED_TEST_ENV=true` y `QA_COMMERCE=true` admite las rutas exactas de login/logout/refresh/reseñas y consultas de pedidos/resumen. El origen web permitido es únicamente `http://localhost:4200`; el upstream es fijo `api:3000`, con cuerpos y respuestas acotados. Confirmación, proveedor, contacto, staff, inventario y otras mutaciones siguen bloqueados.

Tras iniciar el entorno con `QA_COMMERCE=true`, usar `node tests/environment/commerce-isolated.cjs seed <raíz-repo>` una vez y `check <raíz-repo>` con ambas flags. No arrancan Docker por sí mismos. El reporte sólo contiene estados y códigos, sin JWT ni datos de usuario. Ambos logouts deben confirmarse antes de UI. A/producto68 queda para HTTP; A/producto66 para UI; B tiene reseña66 para ocultar/restaurar. El formulario de dirección puede validar datos y seleccionar dirección existente, pero confirmar/persistir una nueva dirección está bloqueado.

El job HTTP existente habilita comercio sólo en un paso después de DAST: recrea únicamente access, aplica seed una vez y ejecuta check. El runner espera catálogo QA listo mediante GET antes del login; nunca repite POST automáticamente. El teardown always existente apaga la copia incluso ante fallo. `commerce-api.json` se conserva en el mismo artefacto `api-evidence`.

Ejecución local verificada: doce contratos HTTP aprobados y ambos logout confirmados. UI web local: listas propias de dos cuentas sin mostrar pedido ajeno, detalle/timeline, lectura/ocultar/restaurar autor, validación y publicación sintética con respuesta201, resumen y selección de dirección existente. Dirección vacía/CP inválido no enviaron confirmación. El primer GET de carrito reveló que faltaba `cart_items.precio_unitario`; se completó únicamente el esquema QA desde el SELECT real de `product-cart.service.ts:222-225`, y GET carrito aprobó. La fixture fuente ya incluye esa columna.

Se observó una limitación de accesibilidad web: el checkbox cambia visualmente y bloquea publicar hasta aceptar, pero el mapeo actual no emite aria-checked. No se modificó la app en esta prueba. No se acreditan reporte/atención humana, dirección nueva persistida, pago/entrega reales ni Android a partir de esta evidencia web.

La evidencia de HTTP y UI local se registra separada de Android, Mercado Pago y producción. Destruir únicamente el compose de QA al terminar; no reutilizar estas cuentas sintéticas fuera del entorno.
