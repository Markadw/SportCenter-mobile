-- Prueba SQL del esquema minimo QA; NO llama confirmCheckout ni Mercado Pago.
-- Los datos sinteticos de este archivo se revierten al terminar.
-- El runner debe exigir ON_ERROR_STOP/propagar cualquier error y cerrar la BD.
BEGIN;

DO $$
DECLARE
  target record;
  sequence_name text;
  sequence_last bigint;
  sequence_called boolean;
BEGIN
  IF current_database() <> 'sportcenter_qa' OR current_user <> 'qa_admin' THEN
    RAISE EXCEPTION 'QA_DATABASE_REQUIRED';
  END IF;
  IF current_setting('sportcenter.checkout_qa', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'QA_CHECKOUT_OPT_IN_REQUIRED';
  END IF;
  IF (SELECT count(*) FROM core.users
      WHERE (id_usuario = 910001 AND email = 'commerce-a@qa.invalid')
         OR (id_usuario = 910002 AND email = 'commerce-b@qa.invalid')) <> 2
    OR NOT EXISTS (SELECT 1 FROM core.products
      WHERE id_producto = 66 AND nombre = 'Gorra QA Sport Center') THEN
    RAISE EXCEPTION 'QA_COMMERCE_FIXTURE_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'core' AND table_name = 'orders'
      AND column_name IN ('fecha_pago', 'fecha_envio', 'fecha_entrega')
      AND is_nullable <> 'YES') THEN
    RAISE EXCEPTION 'QA_PENDING_DATES_MUST_ALLOW_NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM core.direcciones WHERE id_direccion >= 920001)
    OR EXISTS (SELECT 1 FROM core.orders WHERE id_orden >= 920001)
    OR EXISTS (SELECT 1 FROM core.shipments WHERE id_envio >= 920001)
    OR EXISTS (SELECT 1 FROM core.shipment_events WHERE id_evento >= 920001)
    OR EXISTS (SELECT 1 FROM core.pagos)
    OR EXISTS (SELECT 1 FROM core.order_status_history) THEN
    RAISE EXCEPTION 'QA_CHECKOUT_TEST_NAMESPACE_NOT_EMPTY';
  END IF;

  FOR target IN SELECT * FROM (VALUES
    ('direcciones', 'id_direccion'), ('orders', 'id_orden'),
    ('shipments', 'id_envio'), ('shipment_events', 'id_evento'), ('pagos', 'id_pago')
  ) AS targets(table_name, column_name) LOOP
    sequence_name := pg_get_serial_sequence('core.' || target.table_name, target.column_name);
    IF sequence_name IS NULL OR NOT has_sequence_privilege('qa_editor', sequence_name, 'USAGE')
      OR NOT has_sequence_privilege('qa_editor', sequence_name, 'SELECT') THEN
      RAISE EXCEPTION 'QA_OWNED_SEQUENCE_OR_EDITOR_GRANT_REQUIRED';
    END IF;
    -- Un restart transaccional previo evita consumir la secuencia del fixture
    -- cuando el ROLLBACK final revierte estas inserciones de comprobacion.
    EXECUTE format('SELECT last_value, is_called FROM %s', sequence_name::regclass)
      INTO sequence_last, sequence_called;
    EXECUTE format('ALTER SEQUENCE %s RESTART WITH %s', sequence_name::regclass,
      sequence_last + CASE WHEN sequence_called THEN 1 ELSE 0 END);
  END LOOP;
END $$;

-- Usa el mismo rol con el que el servicio escribe, no privilegios de admin.
SET LOCAL ROLE qa_editor;

DO $$
DECLARE
  address_id integer;
  order_id integer;
  shipment_id integer;
  event_id integer;
  payment_id integer;
  summary_address_id integer;
BEGIN
  IF current_user <> 'qa_editor' THEN
    RAISE EXCEPTION 'QA_EDITOR_REQUIRED';
  END IF;

  -- Mismas columnas y defaults que createAddress del servicio fijado.
  UPDATE core.direcciones SET principal = false WHERE id_usuario = 910001;
  INSERT INTO core.direcciones (
    id_usuario, alias, calle, numero, colonia, ciudad, estado, codigo_postal, pais, principal
  ) VALUES (
    910001, 'Direccion QA transaccional', 'Calle sintetica QA', NULL, NULL,
    'Ciudad QA', 'Estado QA', '00000', 'Mexico', true
  ) RETURNING id_direccion INTO address_id;
  IF address_id < 920001 OR NOT EXISTS (SELECT 1 FROM core.direcciones
    WHERE id_direccion = address_id AND id_usuario = 910001 AND principal
      AND fecha_creacion = CURRENT_TIMESTAMP) THEN
    RAISE EXCEPTION 'QA_ADDRESS_DEFAULTS_FAILED';
  END IF;
  SELECT id_direccion INTO summary_address_id FROM core.direcciones
    WHERE id_usuario = 910001 ORDER BY principal DESC, fecha_creacion DESC LIMIT 1;
  IF summary_address_id <> address_id
    OR EXISTS (SELECT 1 FROM core.direcciones WHERE id_usuario = 910002 AND id_direccion = address_id)
    OR NOT EXISTS (SELECT 1 FROM core.direcciones WHERE id_direccion = 910002 AND principal)
    OR EXISTS (SELECT 1 FROM core.direcciones WHERE id_direccion = 910001 AND principal) THEN
    RAISE EXCEPTION 'QA_ADDRESS_OWNER_OR_PRINCIPAL_FAILED';
  END IF;

  -- Contrato de INSERT de confirmCheckout, antes de crear la preferencia.
  INSERT INTO core.orders (
    id_usuario, id_direccion_envio, estado, subtotal, descuento, total,
    metodo_pago, fecha_pago, fecha_creacion
  ) VALUES (910001, address_id, 'pendiente_pago', 166, 0, 166,
    'mercado_pago', NULL, CURRENT_TIMESTAMP) RETURNING id_orden INTO order_id;
  IF order_id < 920001 OR NOT EXISTS (SELECT 1 FROM core.orders WHERE id_orden = order_id
    AND fecha_pago IS NULL AND fecha_envio IS NULL AND fecha_entrega IS NULL) THEN
    RAISE EXCEPTION 'QA_PENDING_ORDER_DEFAULTS_FAILED';
  END IF;
  INSERT INTO core.order_items (
    id_orden, id_variante, nombre_producto, sku, cantidad, precio_unitario, total
  ) VALUES (order_id, 131, 'Gorra QA Sport Center', 'QA-66-A', 1, 166, 166);
  INSERT INTO core.pagos (
    id_orden, proveedor_pago, referencia_externa, monto, estado, fecha_creacion
  ) VALUES (order_id, 'mercado_pago', 'QA-SCHEMA-NOT-A-PREFERENCE', 166, 'pendiente', CURRENT_TIMESTAMP)
    RETURNING id_pago INTO payment_id;

  -- Estructura de escrituras posteriores a createPreference. Esto es SQL QA;
  -- NO declara que un proveedor aprobo una preferencia o un pago.
  INSERT INTO core.shipments (
    id_orden, id_metodo_envio, estado, costo_envio, fecha_entrega_estimada,
    creado_por, actualizado_por, fecha_creacion, fecha_actualizacion
  ) VALUES (order_id, 910001, 'pendiente', 0, CURRENT_TIMESTAMP + (2 * INTERVAL '1 day'),
    910001, 910001, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) RETURNING id_envio INTO shipment_id;
  INSERT INTO core.shipment_events (
    id_envio, estado, titulo, descripcion, registrado_por
  ) VALUES (shipment_id, 'pendiente', 'Pedido recibido', 'Evento sintetico de esquema QA.', 910001)
    RETURNING id_evento INTO event_id;
  INSERT INTO core.order_status_history (
    id_orden, estado_anterior, estado_nuevo, comentario, cambiado_por
  ) VALUES (order_id, NULL, 'pendiente_pago', 'Prueba SQL QA, no pago real.', 910001);

  IF payment_id < 920001 OR shipment_id < 920001 OR event_id < 920001
    OR NOT EXISTS (SELECT 1 FROM core.pagos WHERE id_pago = payment_id
      AND id_orden = order_id AND estado = 'pendiente' AND monto = 166)
    OR NOT EXISTS (SELECT 1 FROM core.shipments WHERE id_envio = shipment_id
      AND creado_por = 910001 AND actualizado_por = 910001
      AND fecha_creacion = CURRENT_TIMESTAMP AND fecha_actualizacion = CURRENT_TIMESTAMP)
    OR NOT EXISTS (SELECT 1 FROM core.shipment_events WHERE id_evento = event_id
      AND registrado_por = 910001 AND fecha_evento = CURRENT_TIMESTAMP)
    OR NOT EXISTS (SELECT 1 FROM core.order_status_history WHERE id_orden = order_id
      AND estado_anterior IS NULL AND estado_nuevo = 'pendiente_pago' AND cambiado_por = 910001)
    OR NOT has_table_privilege('qa_reader', 'core.pagos', 'SELECT')
    OR NOT has_table_privilege('qa_backup', 'core.order_status_history', 'SELECT') THEN
    RAISE EXCEPTION 'QA_CHECKOUT_WRITE_CONTRACT_FAILED';
  END IF;
END $$;

SELECT 'QA_CHECKOUT_SCHEMA_ONLY_PASSED' AS result;
ROLLBACK;
