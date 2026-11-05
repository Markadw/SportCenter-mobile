-- COMPLEMENTO QA PARA REANUDAR UNA RECONCILIACION; NO ES MIGRACION PRODUCTIVA.
-- Fuente: backend31ee, product-checkout.service.ts:1402-1618,1659-1821,1984-2087.
-- No hay DDL de estas tablas en ese repositorio. Se deriva SOLO el contrato SQL
-- utilizado: no se inventan PK, FK, indices ni defaults productivos; la generacion de ID de carrito es SOLO QA.
-- Aplicar DESPUES de checkout-fixtures.sql y del pedido pendiente sintetico920001.
-- No recrea, reinicia ni actualiza filas de pedidos, pagos, existencias, movimientos o carrito.
-- Requiere ON_ERROR_STOP y dos opt-ins EN ESTA conexion:
-- SET sportcenter.checkout_payment_qa = 'true';
-- SET sportcenter.checkout_payment_context = 'verified-test-accounts';
-- El orquestador debe acreditar vendedor/comprador/pago de prueba ANTES del opt-in.
BEGIN;
DO $$
DECLARE
  required record;
  sequence_name text;
BEGIN
  IF current_database() <> 'sportcenter_qa' OR current_user <> 'qa_admin' THEN
    RAISE EXCEPTION 'QA_DATABASE_REQUIRED';
  END IF;
  IF current_setting('sportcenter.checkout_payment_qa', true) IS DISTINCT FROM 'true'
    OR current_setting('sportcenter.checkout_payment_context', true) IS DISTINCT FROM 'verified-test-accounts' THEN
    RAISE EXCEPTION 'QA_PAYMENT_TEST_CONTEXT_REQUIRED';
  END IF;
  IF to_regclass('core.order_discounts') IS NOT NULL THEN
    RAISE EXCEPTION 'QA_PAYMENT_COMPLEMENT_ALREADY_PRESENT';
  END IF;
  IF (SELECT count(*) FROM core.users
    WHERE (id_usuario=910001 AND email='commerce-a@qa.invalid')
       OR (id_usuario=910002 AND email='commerce-b@qa.invalid')) <> 2
    OR NOT EXISTS (SELECT 1 FROM core.products WHERE id_producto=66 AND nombre='Gorra QA Sport Center')
    OR NOT EXISTS (SELECT 1 FROM core.product_variants WHERE id_variante=131 AND id_producto=66 AND sku='QA-66-A') THEN
    RAISE EXCEPTION 'QA_COMMERCE_FIXTURE_REQUIRED';
  END IF;

  -- Todas las columnas alcanzadas por aprobacion y su resumen de correo.
  -- Un contrato diferente falla; no se altera ni se intenta reparar silenciosamente.
  FOR required IN SELECT * FROM (VALUES
    ('orders','id_orden','integer'), ('orders','id_usuario','integer'),
    ('orders','estado','character varying'), ('orders','total','numeric'),
    ('orders','fecha_pago','timestamp without time zone'), ('orders','fecha_creacion','timestamp without time zone'),
    ('pagos','id_pago','integer'), ('pagos','id_orden','integer'),
    ('pagos','proveedor_pago','text'), ('pagos','referencia_externa','text'),
    ('pagos','monto','numeric'), ('pagos','estado','character varying'),
    ('order_items','id_orden','integer'), ('order_items','id_variante','integer'),
    ('order_items','cantidad','integer'), ('order_items','nombre_producto','character varying'),
    ('order_items','precio_unitario','numeric'), ('order_items','total','numeric'),
    ('inventory','id_variante','integer'), ('inventory','stock_actual','integer'), ('inventory','costo_promedio','numeric'),
    ('inventory_movements','id_movimiento','integer'), ('inventory_movements','id_variante','integer'),
    ('inventory_movements','tipo','character varying'), ('inventory_movements','cantidad','integer'),
    ('inventory_movements','costo_unitario','numeric'), ('inventory_movements','referencia_tipo','character varying'),
    ('inventory_movements','referencia_id','integer'),
    ('carts','id_carrito','integer'), ('carts','id_usuario','integer'), ('carts','estado','character varying'),
    ('carts','fecha_creacion','timestamp without time zone'), ('carts','fecha_actualizacion','timestamp without time zone'),
    ('cart_items','id_carrito','integer'), ('cart_items','id_variante','integer'), ('cart_items','cantidad','integer'),
    ('order_status_history','id_orden','integer'), ('order_status_history','estado_anterior','character varying'),
    ('order_status_history','estado_nuevo','character varying'), ('order_status_history','comentario','text'),
    ('order_status_history','cambiado_por','integer'),
    ('shipments','id_orden','integer'), ('shipments','estado','character varying'),
    ('shipments','numero_guia','character varying'), ('shipments','paqueteria','character varying'),
    ('users','id_usuario','integer'), ('users','nombre','character varying'), ('users','aPaterno','character varying'),
    ('users','aMaterno','character varying'), ('users','email','character varying'),
    ('product_variants','id_variante','integer'), ('product_variants','id_producto','integer'),
    ('products','id_producto','integer'), ('products','nombre','character varying')
  ) AS contract(table_name,column_name,data_type) LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema='core' AND c.table_name=required.table_name
        AND c.column_name=required.column_name AND c.data_type=required.data_type)
      OR NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='core' AND c.relname=required.table_name AND c.relkind='r'
          AND pg_get_userbyid(c.relowner)='qa_admin')
      OR NOT has_table_privilege('qa_editor','core.' || required.table_name,'SELECT') THEN
      RAISE EXCEPTION 'QA_PAYMENT_EXISTING_SCHEMA_OR_GRANT_MISMATCH';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM core.orders o JOIN core.pagos p ON p.id_orden=o.id_orden
    WHERE o.id_orden=920001 AND o.id_usuario=910001 AND o.metodo_pago='mercado_pago'
      AND o.estado='pendiente_pago' AND o.fecha_pago IS NULL AND o.total>0
      AND p.proveedor_pago='mercado_pago' AND p.estado='pendiente' AND p.monto=o.total
      AND p.referencia_externa LIKE 'SC-ORDER-920001-%') <> 1
    OR (SELECT count(*) FROM core.order_items WHERE id_orden=920001) <> 1
    OR NOT EXISTS (SELECT 1 FROM core.order_items WHERE id_orden=920001 AND id_variante=131 AND cantidad=1)
    OR NOT EXISTS (SELECT 1 FROM core.carts WHERE id_carrito=910001 AND id_usuario=910001 AND estado='activo')
    OR (SELECT count(*) FROM core.cart_items WHERE id_carrito=910001) <> 1
    OR NOT EXISTS (SELECT 1 FROM core.cart_items WHERE id_carrito=910001 AND id_variante=131 AND cantidad=1)
    OR NOT EXISTS (SELECT 1 FROM core.inventory WHERE id_variante=131 AND stock_actual>=1)
    OR EXISTS (SELECT 1 FROM core.inventory_movements WHERE referencia_tipo='orden' AND referencia_id=920001) THEN
    RAISE EXCEPTION 'QA_PAYMENT_PENDING_RESUME_STATE_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='core' AND NOT t.tgisinternal
      AND c.relname IN ('orders','pagos','order_items','inventory','inventory_movements',
        'carts','cart_items','order_status_history')) THEN
    RAISE EXCEPTION 'QA_PAYMENT_UNEXPECTED_TRIGGER';
  END IF;
  sequence_name := pg_get_serial_sequence('core.inventory_movements','id_movimiento');
  IF sequence_name IS NULL OR NOT has_sequence_privilege('qa_editor',sequence_name,'USAGE') THEN
    RAISE EXCEPTION 'QA_PAYMENT_MOVEMENT_SEQUENCE_REQUIRED';
  END IF;
END $$;

-- ensureActiveCart31ee omite SOLO el PK; no existe entidad Cart ni DDL
-- productivo versionado que indique su secuencia. Este generador es SOLO QA.
-- Las filas, secuencias existentes y posiciones se conservan.
DO $$
DECLARE
  sequence_name text;
  existing_default text;
  identity_kind text;
  maximum_id bigint;
  next_id bigint;
  sequence_last bigint;
  sequence_called boolean;
BEGIN
  LOCK TABLE core.carts IN ACCESS EXCLUSIVE MODE;
  IF current_database()<>'sportcenter_qa' OR current_user<>'qa_admin'
    OR NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='core' AND c.relname='carts' AND c.relkind='r'
        AND pg_get_userbyid(c.relowner)='qa_admin') THEN
    RAISE EXCEPTION 'QA_CART_DEFAULT_TARGET_REQUIRED';
  END IF;
  SELECT pg_get_serial_sequence('core.carts','id_carrito') INTO sequence_name;
  SELECT pg_get_expr(d.adbin,d.adrelid),a.attidentity::text INTO existing_default,identity_kind
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='core.carts'::regclass AND a.attname='id_carrito' AND NOT a.attisdropped
      AND a.atttypid='integer'::regtype AND a.attnotnull;
  IF NOT FOUND THEN RAISE EXCEPTION 'QA_CART_INTEGER_PK_REQUIRED'; END IF;
  SELECT COALESCE(max(id_carrito),0) INTO maximum_id FROM core.carts;
  IF sequence_name IS NULL THEN
    IF existing_default IS NOT NULL OR identity_kind<>''
      OR to_regclass('core.checkout_qa_carts_id_seq') IS NOT NULL THEN
      RAISE EXCEPTION 'QA_CART_UNKNOWN_DEFAULT_OR_SEQUENCE';
    END IF;
    next_id := greatest(920001,maximum_id+1);
    IF next_id>2147483647 THEN RAISE EXCEPTION 'QA_CART_ID_RANGE_EXHAUSTED'; END IF;
    EXECUTE format('CREATE SEQUENCE core.checkout_qa_carts_id_seq AS integer START WITH %s',next_id);
    ALTER SEQUENCE core.checkout_qa_carts_id_seq OWNED BY core.carts.id_carrito;
    ALTER TABLE core.carts ALTER COLUMN id_carrito SET DEFAULT nextval('core.checkout_qa_carts_id_seq'::regclass);
    sequence_name := 'core.checkout_qa_carts_id_seq';
  ELSE
    IF NOT EXISTS (SELECT 1 FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE s.seqrelid=sequence_name::regclass
        AND n.nspname='core' AND pg_get_userbyid(c.relowner)='qa_admin'
        AND s.seqtypid='integer'::regtype AND s.seqincrement=1 AND s.seqcache=1 AND NOT s.seqcycle
        AND s.seqmax=2147483647) THEN
      RAISE EXCEPTION 'QA_CART_SEQUENCE_METADATA_MISMATCH';
    END IF;
    IF identity_kind='' AND existing_default IS DISTINCT FROM format('nextval(%L::regclass)',sequence_name::regclass::text) THEN
      RAISE EXCEPTION 'QA_CART_EXISTING_DEFAULT_MISMATCH';
    END IF;
    EXECUTE format('SELECT last_value,is_called FROM %s',sequence_name::regclass) INTO sequence_last,sequence_called;
    next_id := sequence_last + CASE WHEN sequence_called THEN 1 ELSE 0 END;
    IF next_id<=maximum_id OR next_id>2147483647 THEN
      RAISE EXCEPTION 'QA_CART_EXISTING_SEQUENCE_NOT_AHEAD';
    END IF;
  END IF;
  EXECUTE format('GRANT USAGE,SELECT ON SEQUENCE %s TO qa_editor',sequence_name::regclass);
END $$;


-- applyPromotionRedemptionOnApproval consulta SIEMPRE order_discounts, aun sin cupon.
-- El escenario reservado no contiene descuentos: la tabla queda vacia.
CREATE TABLE core.order_discounts (
  id_orden integer NOT NULL,
  id_promocion integer,
  codigo text,
  descripcion text,
  monto numeric(10,2) NOT NULL
);
-- No se crean tablas de promociones: el escenario no tiene cupon/descuento y
-- el helper no entra en su bucle de canjes. Esta tabla debe permanecer vacia.
REVOKE ALL ON core.order_discounts FROM PUBLIC;
REVOKE UPDATE,DELETE ON core.order_discounts FROM qa_editor;
GRANT SELECT ON core.order_discounts TO qa_editor,qa_reader,qa_backup;

-- EXPLAIN sin ANALYZE resuelve tablas, columnas y permisos; NO ejecuta DML.
-- Se cubren las consultas posteriores al fallo, sin procesar el pago por SQL.
SET LOCAL ROLE qa_editor;
EXPLAIN SELECT p.id_pago,p.id_orden,p.estado,o.estado,o.id_usuario
  FROM core.pagos p JOIN core.orders o ON o.id_orden=p.id_orden
  WHERE p.proveedor_pago='mercado_pago' AND p.referencia_externa='QA-CONTRACT-ONLY' LIMIT 1 FOR UPDATE;
EXPLAIN UPDATE core.pagos SET estado='aprobado' WHERE id_pago=0;
EXPLAIN SELECT oi.id_variante,oi.cantidad,oi.nombre_producto,COALESCE(i.costo_promedio,oi.precio_unitario,0)
  FROM core.order_items oi LEFT JOIN core.inventory i ON i.id_variante=oi.id_variante WHERE oi.id_orden=920001;
EXPLAIN UPDATE core.inventory SET stock_actual=stock_actual-1 WHERE id_variante=131 AND stock_actual>=1 RETURNING stock_actual;
EXPLAIN INSERT INTO core.inventory_movements(id_variante,tipo,cantidad,costo_unitario,referencia_tipo,referencia_id)
  VALUES(131,'salida',1,0,'orden',920001);
EXPLAIN UPDATE core.orders SET estado='pendiente',fecha_pago=COALESCE(fecha_pago,CURRENT_TIMESTAMP) WHERE id_orden=920001;
EXPLAIN SELECT id_promocion,codigo,monto FROM core.order_discounts WHERE id_orden=920001 AND id_promocion IS NOT NULL;
EXPLAIN INSERT INTO core.carts(id_usuario,estado,fecha_creacion,fecha_actualizacion)
  VALUES(910001,'activo',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  RETURNING id_carrito,id_usuario,estado,fecha_creacion,fecha_actualizacion;
EXPLAIN SELECT id_carrito FROM core.carts WHERE id_usuario=910001 AND LOWER(TRIM(estado))='activo'
  ORDER BY fecha_actualizacion DESC NULLS LAST,fecha_creacion DESC LIMIT 1 FOR UPDATE;
EXPLAIN SELECT column_name FROM information_schema.columns WHERE table_schema='core'
  AND table_name='cart_items' AND column_name IN ('id_carrito','id_cart');
EXPLAIN DELETE FROM core.cart_items WHERE id_carrito=910001 AND id_variante=131 AND cantidad<=1;
EXPLAIN UPDATE core.cart_items SET cantidad=cantidad-1 WHERE id_carrito=910001 AND id_variante=131 AND cantidad>1;
EXPLAIN SELECT COUNT(*)::int FROM core.cart_items WHERE id_carrito=910001;
EXPLAIN UPDATE core.carts SET estado='convertido',fecha_actualizacion=CURRENT_TIMESTAMP WHERE id_carrito=910001;
EXPLAIN INSERT INTO core.order_status_history(id_orden,estado_anterior,estado_nuevo,comentario,cambiado_por)
  VALUES(920001,'pendiente_pago','pendiente','QA-CONTRACT-ONLY',910001);
SET LOCAL ROLE qa_reader;
EXPLAIN SELECT o.id_orden,o.total,o.estado,o.fecha_creacion,s.estado,s.numero_guia,s.paqueteria,
  COALESCE(NULLIF(TRIM(CONCAT_WS(' ',u.nombre,u."aPaterno",u."aMaterno")),''),'Cliente'),u.email,
  COALESCE(items.items,'[]'::jsonb)
  FROM core.orders o JOIN core.users u ON u.id_usuario=o.id_usuario
  LEFT JOIN core.shipments s ON s.id_orden=o.id_orden
  LEFT JOIN LATERAL(SELECT jsonb_agg(jsonb_build_object('producto',COALESCE(oi.nombre_producto,p.nombre),
    'cantidad',oi.cantidad,'total',oi.total) ORDER BY oi.id_variante) AS items
    FROM core.order_items oi LEFT JOIN core.product_variants pv ON pv.id_variante=oi.id_variante
    LEFT JOIN core.products p ON p.id_producto=pv.id_producto WHERE oi.id_orden=o.id_orden) items ON true
  WHERE o.id_orden=920001 LIMIT 1;
RESET ROLE;
SELECT 'QA_CHECKOUT_PAYMENT_FIXTURES_PREPARED_NO_PAYMENT_EXECUTED' AS result;
COMMIT;
