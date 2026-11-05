# Comercio con datos sintéticos aislados

Esta prueba usa el backend real fijado en `31ee304d902ec5ec5a9c0fc702eca5e1a531bc16`, PostgreSQL efímero y el catálogo sintético existente. No ejecuta pagos, preferencias, webhooks, correos ni operaciones de Render. Los pedidos entregados y sus fechas son fixtures, no compras o entregas reales.

`commerce-fixtures.sql` agrega ocho tablas auxiliares mínimas derivadas de las consultas del servicio fijado: direcciones, items, envío/eventos, carrito y métodos de pago vacíos. No es una migración del backend ni acredita paridad de constraints productivos. Se ejecuta después del bootstrap existente, exige `sportcenter_qa`, `qa_admin`, marcadores QA y namespace vacío; no borra filas ni modifica inventario.

El gateway conserva GET/HEAD por defecto. Sólo con `ISOLATED_TEST_ENV=true` y `QA_COMMERCE=true` admite las rutas exactas de login/logout/refresh/reseñas y consultas de pedidos/resumen. El origen web permitido es únicamente `http://localhost:4200`; el upstream es fijo `api:3000`, con cuerpos y respuestas acotados. Confirmación, proveedor, contacto, staff, inventario y otras mutaciones siguen bloqueados.

Tras iniciar el entorno con `QA_COMMERCE=true`, usar `node tests/environment/commerce-isolated.cjs seed <raíz-repo>` una vez y `check <raíz-repo>` con ambas flags. No arrancan Docker por sí mismos. El reporte sólo contiene estados y códigos, sin JWT ni datos de usuario. Ambos logouts deben confirmarse antes de UI. A/producto68 queda para HTTP; A/producto66 para UI; B tiene reseña66 para ocultar/restaurar. El formulario de dirección puede validar datos y seleccionar dirección existente, pero confirmar/persistir una nueva dirección está bloqueado.

El job HTTP existente habilita comercio sólo en un paso después de DAST: recrea únicamente access, aplica seed una vez y ejecuta check. El runner espera catálogo QA listo mediante GET antes del login; nunca repite POST automáticamente. El teardown always existente apaga la copia incluso ante fallo. `commerce-api.json` se conserva en el mismo artefacto `api-evidence`.

Ejecución local verificada: doce contratos HTTP aprobados y ambos logout confirmados. UI web local: listas propias de dos cuentas sin mostrar pedido ajeno, detalle/timeline, lectura/ocultar/restaurar autor, validación y publicación sintética con respuesta201, resumen y selección de dirección existente. Dirección vacía/CP inválido no enviaron confirmación. El primer GET de carrito reveló que faltaba `cart_items.precio_unitario`; se completó únicamente el esquema QA desde el SELECT real de `product-cart.service.ts:222-225`, y GET carrito aprobó. La fixture fuente ya incluye esa columna.

Se observó una limitación de accesibilidad web: el checkbox cambia visualmente y bloquea publicar hasta aceptar, pero el mapeo actual no emite aria-checked. No se modificó la app en esta prueba. No se acreditan reporte/atención humana, dirección nueva persistida, pago/entrega reales ni Android a partir de esta evidencia web.

La evidencia de HTTP y UI local se registra separada de Android, Mercado Pago y producción. Destruir únicamente el compose de QA al terminar; no reutilizar estas cuentas sintéticas fuera del entorno.

## Recibo de reporte de reseña

El mismo job HTTP ejecuta después de los doce contratos `review-report-isolated.cjs`, con las tres flags `ISOLATED_TEST_ENV=true`, `QA_COMMERCE=true` y `QA_REVIEW_REPORT=true`. El runner transmite su prueba por stdin a `node -` dentro del contenedor API existente; no publica puertos, no modifica el gateway, no inicia otro servidor y no modifica el backend. El único destino HTTP es `127.0.0.1:3000/company/contact` dentro de esa copia. Contacto permanece bloqueado desde el gateway exterior.

Antes de escribir exige el checkout limpio del backend fijado, compose interno, URLs de la base `sportcenter_qa`, ausencia de credenciales de proveedores, seis fuentes congeladas del módulo de contacto/validaciones, tabla `public.contact_messages` existente y vacía, ausencia de triggers propios y la reseña sintética B/producto66. No crea otra tabla ni elimina filas. La tabla real la sincroniza el bootstrap existente.

Se envían exactamente tres POST sin reintentos: correo inválido, mensaje con tipo inválido y un reporte válido con los mismos cuatro campos que la app. Los dos inválidos deben responder400 sin crear mensajes. El válido debe responder201 con folio entero positivo; una consulta directa confirma que sólo hay una fila con el contenido exacto, `leido=false`, `respondido=false` y sin lector/respondedor. No se consulta GET contacto por ID porque marcaría el mensaje como leído. El servicio fijado únicamente crea y guarda el mensaje; no envía correo.

`review-report-api.json` contiene cuatro estados, flags y limpieza de conexión; no incluye folio, correo, texto del reporte ni respuestas del servidor. Se agrega al artefacto HTTP existente únicamente bajo su política habitual de evidencia/fallo; no crea artefactos de éxito adicionales. `commerce-api.json` conserva sus doce controles. Una respuesta perdida tras el POST queda como escritura incierta y falla sin repetirla. El teardown obligatorio destruye la copia efímera. Este recibo no acredita moderación humana, retiro de contenido, Android ni atención del reporte en producción; esos puntos conservan su estado pendiente.
