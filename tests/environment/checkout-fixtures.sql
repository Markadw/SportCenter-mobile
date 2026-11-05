-- COMPLEMENTO QA LOCAL; no es una migracion del backend ni un esquema productivo.
-- Contrato: backend 31ee304d902ec5ec5a9c0fc702eca5e1a531bc16, checkout
-- sin cupon, tarjeta, webhook, correo, Postalia ni llamadas al proveedor.
-- Aplicar despues de commerce-fixtures.sql, una sola vez en la BD efimera.
-- El runner debe comprobar origen fijado, red interna y ausencia de proveedores.
-- Esta preparacion solo agrega estructura: no crea direcciones, pedidos ni pagos.
-- SET sportcenter.checkout_qa = 'true' debe hacerse en ESTA misma conexion.
BEGIN;

DO $$
DECLARE
  target text;
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
      WHERE id_producto = 66 AND nombre = 'Gorra QA Sport Center')
    OR NOT EXISTS (SELECT 1 FROM core.product_variants
      WHERE id_variante = 131 AND sku = 'QA-66-A')
    OR (SELECT count(*) FROM core.orders
      WHERE id_orden IN (910001, 910002) AND metodo_pago = 'qa_sintetico_sin_pago') <> 2
    OR (SELECT count(*) FROM core.direcciones
      WHERE (id_direccion = 910001 AND id_usuario = 910001)
         OR (id_direccion = 910002 AND id_usuario = 910002)) <> 2 THEN
    RAISE EXCEPTION 'QA_COMMERCE_FIXTURE_REQUIRED';
  END IF;

  -- Rechaza una segunda aplicacion o una estructura desconocida; no la repara.
  IF to_regclass('core.pagos') IS NOT NULL
    OR to_regclass('core.order_status_history') IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'core' AND c.relname LIKE 'checkout\_qa\_%' ESCAPE '\') THEN
    RAISE EXCEPTION 'QA_CHECKOUT_NAMESPACE_NOT_EMPTY';
  END IF;

  FOREACH target IN ARRAY ARRAY[
    'direcciones', 'orders', 'order_items', 'shipments', 'shipment_events',
    'shipping_methods', 'carts', 'cart_items'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'core' AND c.relname = target AND c.relkind = 'r'
        AND pg_get_userbyid(c.relowner) = 'qa_admin') THEN
      RAISE EXCEPTION 'QA_TABLE_OWNER_REQUIRED';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger
      WHERE tgrelid = to_regclass('core.' || target) AND NOT tgisinternal) THEN
      RAISE EXCEPTION 'QA_UNEXPECTED_TRIGGER';
    END IF;
  END LOOP;
END $$;

-- La entidad Orders de 31ee marca estas fechas NOT NULL, pero confirmCheckout
-- inserta fecha_pago = NULL y omite envio/entrega mientras espera el pago.
-- Solo se ajusta la copia QA para representar ese contrato pendiente.
ALTER TABLE core.orders
  ALTER COLUMN fecha_pago DROP NOT NULL,
  ALTER COLUMN fecha_envio DROP NOT NULL,
  ALTER COLUMN fecha_entrega DROP NOT NULL;

ALTER TABLE core.direcciones
  ALTER COLUMN fecha_creacion SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE core.shipments
  ADD COLUMN creado_por integer,
  ADD COLUMN actualizado_por integer,
  ADD COLUMN fecha_creacion timestamp,
  ADD COLUMN fecha_actualizacion timestamp;
ALTER TABLE core.shipment_events
  ADD COLUMN registrado_por integer,
  ALTER COLUMN fecha_evento SET DEFAULT CURRENT_TIMESTAMP;

-- Ids generados para las tres tablas auxiliares. Si una columna ya tiene una
-- secuencia propia, se conserva su nombre/opciones; otro default se rechaza.
-- ALTER SEQUENCE RESTART, a diferencia de setval(), revierte con la transaccion.
DO $$
DECLARE
  target record;
  sequence_name text;
  existing_default text;
  highest_id bigint;
  sequence_last bigint;
  sequence_called boolean;
  restart_at bigint;
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('direcciones', 'id_direccion', 'checkout_qa_direcciones_id_seq'),
    ('shipments', 'id_envio', 'checkout_qa_shipments_id_seq'),
    ('shipment_events', 'id_evento', 'checkout_qa_shipment_events_id_seq'),
    ('orders', 'id_orden', NULL)
  ) AS targets(table_name, column_name, qa_sequence) LOOP
    sequence_name := pg_get_serial_sequence('core.' || target.table_name, target.column_name);
    IF sequence_name IS NULL THEN
      IF target.qa_sequence IS NULL THEN
        RAISE EXCEPTION 'QA_ORM_ORDER_SEQUENCE_REQUIRED';
      END IF;
      SELECT pg_get_expr(d.adbin, d.adrelid) INTO existing_default
      FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
      WHERE d.adrelid = to_regclass('core.' || target.table_name) AND a.attname = target.column_name;
      IF existing_default IS NOT NULL THEN
        RAISE EXCEPTION 'QA_UNEXPECTED_ID_DEFAULT';
      END IF;
      EXECUTE format('CREATE SEQUENCE core.%I AS integer START WITH 920001', target.qa_sequence);
      EXECUTE format('ALTER SEQUENCE core.%I OWNED BY core.%I.%I',
        target.qa_sequence, target.table_name, target.column_name);
      sequence_name := 'core.' || target.qa_sequence;
      EXECUTE format('ALTER TABLE core.%I ALTER COLUMN %I SET DEFAULT nextval(%L::regclass)',
        target.table_name, target.column_name, sequence_name);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_sequence s JOIN pg_class c ON c.oid = s.seqrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE s.seqrelid = sequence_name::regclass AND n.nspname = 'core'
        AND pg_get_userbyid(c.relowner) = 'qa_admin' AND s.seqincrement = 1
        AND NOT s.seqcycle AND s.seqmax = 2147483647) THEN
      RAISE EXCEPTION 'QA_SEQUENCE_OWNER_OR_RANGE_REQUIRED';
    END IF;
    EXECUTE format('SELECT coalesce(max(%I), 0) FROM core.%I', target.column_name, target.table_name)
      INTO highest_id;
    EXECUTE format('SELECT last_value, is_called FROM %s', sequence_name::regclass)
      INTO sequence_last, sequence_called;
    restart_at := greatest(920001, highest_id + 1,
      sequence_last + CASE WHEN sequence_called THEN 1 ELSE 0 END);
    IF restart_at > 2147483647 THEN
      RAISE EXCEPTION 'QA_SEQUENCE_RANGE_EXHAUSTED';
    END IF;
    EXECUTE format('ALTER SEQUENCE %s RESTART WITH %s', sequence_name::regclass, restart_at);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO qa_editor', sequence_name::regclass);
  END LOOP;
END $$;

-- Solo las columnas consultadas/escritas por el servicio fijado. No se agregan
-- constraints de negocio, relaciones ni columnas de produccion desconocidas.
CREATE SEQUENCE core.checkout_qa_pagos_id_seq AS integer START WITH 920001;
CREATE TABLE core.pagos (
  id_pago integer PRIMARY KEY DEFAULT nextval('core.checkout_qa_pagos_id_seq'::regclass),
  id_orden integer NOT NULL,
  proveedor_pago text NOT NULL,
  referencia_externa text NOT NULL,
  monto numeric(10,2) NOT NULL,
  estado varchar(100) NOT NULL,
  fecha_creacion timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER SEQUENCE core.checkout_qa_pagos_id_seq OWNED BY core.pagos.id_pago;
GRANT USAGE, SELECT ON SEQUENCE core.checkout_qa_pagos_id_seq TO qa_editor;

CREATE TABLE core.order_status_history (
  id_orden integer NOT NULL,
  estado_anterior varchar(100),
  estado_nuevo varchar(100) NOT NULL,
  comentario text,
  cambiado_por integer
);
GRANT SELECT, INSERT, UPDATE, DELETE ON core.pagos, core.order_status_history TO qa_editor;
GRANT SELECT ON core.pagos, core.order_status_history TO qa_reader, qa_backup;

COMMIT;
