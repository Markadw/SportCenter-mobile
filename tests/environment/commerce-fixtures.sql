-- QA SINTETICA EXCLUSIVAMENTE. No representa compra, cobro ni entrega real.
-- Aplicar DESPUES del bootstrap/seed existente de QA31ee, mediante buildFixtureSql.
-- Las tablas auxiliares son un esquema minimo derivado de las consultas reales;
-- no constituyen una migracion ni una copia completa del esquema productivo.
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'sportcenter_qa' OR current_user <> 'qa_admin' THEN
    RAISE EXCEPTION 'QA_DATABASE_REQUIRED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM core.products WHERE id_producto=66 AND nombre='Gorra QA Sport Center')
    OR NOT EXISTS (SELECT 1 FROM core.product_variants WHERE id_variante=131 AND sku='QA-66-A')
    OR NOT EXISTS (SELECT 1 FROM core.product_variants WHERE id_variante=135 AND sku='QA-68-A') THEN
    RAISE EXCEPTION 'QA_CATALOG_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM core.users WHERE id_usuario IN (910001,910002)
      OR email IN ('commerce-a@qa.invalid','commerce-b@qa.invalid'))
    OR EXISTS (SELECT 1 FROM core.orders WHERE id_orden IN (910001,910002)) THEN
    RAISE EXCEPTION 'QA_NAMESPACE_NOT_EMPTY';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS core.direcciones (
  id_direccion integer PRIMARY KEY, id_usuario integer NOT NULL,
  alias varchar(50), calle varchar(150), numero varchar(20), colonia varchar(100),
  ciudad varchar(100), estado varchar(100), codigo_postal varchar(10), pais varchar(100),
  principal boolean NOT NULL DEFAULT false, fecha_creacion timestamp DEFAULT timestamp '2000-01-01'
);
CREATE TABLE IF NOT EXISTS core.order_items (
  id_orden integer NOT NULL, id_variante integer NOT NULL, sku varchar(100),
  nombre_producto varchar(255), cantidad integer NOT NULL,
  precio_unitario numeric(10,2) NOT NULL, total numeric(10,2) NOT NULL,
  PRIMARY KEY(id_orden,id_variante)
);
CREATE TABLE IF NOT EXISTS core.shipping_methods (
  id_metodo_envio integer PRIMARY KEY, nombre varchar(100), descripcion text,
  costo_base numeric(10,2), envio_gratis_desde numeric(10,2), dias_min integer, dias_max integer, activo boolean
);
CREATE TABLE IF NOT EXISTS core.shipments (
  id_envio integer PRIMARY KEY, id_orden integer NOT NULL UNIQUE,
  id_metodo_envio integer, estado varchar(100), numero_guia varchar(100), paqueteria varchar(100),
  costo_envio numeric(10,2), fecha_entrega_estimada timestamp, fecha_entrega timestamp,
  codigo_confirmacion_entrega varchar(100), codigo_confirmacion_generado_en timestamp,
  entrega_confirmada_por_usuario boolean, entrega_confirmada_en timestamp,
  entrega_validada_por_empleado boolean, entrega_validada_en timestamp
);
CREATE TABLE IF NOT EXISTS core.shipment_events (
  id_evento integer PRIMARY KEY, id_envio integer NOT NULL, estado varchar(100),
  titulo varchar(150), descripcion text, ubicacion varchar(150), fecha_evento timestamp
);
CREATE TABLE IF NOT EXISTS core.carts (
  id_carrito integer PRIMARY KEY, id_usuario integer NOT NULL, estado varchar(100),
  fecha_creacion timestamp, fecha_actualizacion timestamp
);
CREATE TABLE IF NOT EXISTS core.cart_items (
  id_carrito integer NOT NULL, id_variante integer NOT NULL, cantidad integer NOT NULL,
  precio_unitario numeric(10,2) NOT NULL,
  PRIMARY KEY(id_carrito,id_variante)
);
CREATE TABLE IF NOT EXISTS core.user_payment_methods (
  id_metodo_pago integer PRIMARY KEY, id_usuario integer, alias varchar(100), marca varchar(100),
  titular varchar(100), ultimos4 varchar(4), exp_mes integer, exp_anio integer,
  principal boolean, activo boolean, fecha_creacion timestamp, fecha_actualizacion timestamp
);
INSERT INTO core.users(id_usuario,nombre,"aPaterno","aMaterno",email,telefono,passw,rol,activo,email_verified,telefono_verified,intentos_token)
VALUES (910001,'Cliente QA Uno','Sintetico','Local','commerce-a@qa.invalid',NULL,'__QA_BCRYPT__',1,1,1,0,0),
       (910002,'Cliente QA Dos','Sintetico','Local','commerce-b@qa.invalid',NULL,'__QA_BCRYPT__',1,1,1,0,0);
INSERT INTO core.direcciones(id_direccion,id_usuario,alias,calle,numero,colonia,ciudad,estado,codigo_postal,pais,principal) VALUES
 (910001,910001,'QA sintetica A','Calle de prueba A','1','Colonia QA','Ciudad QA','Estado QA','00000','Mexico',true),
 (910002,910002,'QA sintetica B','Calle de prueba B','2','Colonia QA','Ciudad QA','Estado QA','00000','Mexico',true);
INSERT INTO core.shipping_methods VALUES(910001,'Envio sintetico QA','No representa servicio de paqueteria real',0,NULL,1,2,true);
INSERT INTO core.carts VALUES (910001,910001,'activo','2000-01-01','2000-01-01'),(910002,910002,'activo','2000-01-01','2000-01-01');
INSERT INTO core.cart_items VALUES (910001,131,1,166);
INSERT INTO core.orders(id_orden,id_usuario,id_direccion_envio,estado,subtotal,descuento,total,metodo_pago,fecha_pago,fecha_envio,fecha_entrega,fecha_creacion)
VALUES (910001,910001,910001,'entregado',334,0,334,'qa_sintetico_sin_pago','2000-01-01','2000-01-02','2000-01-03','2000-01-01'),
       (910002,910002,910002,'entregado',166,0,166,'qa_sintetico_sin_pago','2000-01-01','2000-01-02','2000-01-03','2000-01-01');
INSERT INTO core.order_items VALUES
 (910001,131,'QA-66-A','Gorra QA Sport Center',1,166,166),
 (910001,135,'QA-68-A','Producto QA 68',1,168,168),
 (910002,131,'QA-66-A','Gorra QA Sport Center',1,166,166);
INSERT INTO core.shipments VALUES
 (910001,910001,910001,'entregado','QA-SINTETICA-A','QA sin transportista real',0,'2000-01-03','2000-01-03','QA-NOT-A-REAL-CODE','2000-01-02',true,'2000-01-03',true,'2000-01-03'),
 (910002,910002,910001,'entregado','QA-SINTETICA-B','QA sin transportista real',0,'2000-01-03','2000-01-03','QA-NOT-A-REAL-CODE','2000-01-02',true,'2000-01-03',true,'2000-01-03');
INSERT INTO core.shipment_events VALUES
 (910001,910001,'en_transito','Evento sintetico QA','Fixture de seguimiento, no logistica real','Ubicacion QA','2000-01-02'),
 (910002,910001,'entregado','Entrega sintetica QA','Estado cargado por fixture, no entrega real','Ubicacion QA','2000-01-03'),
 (910003,910002,'entregado','Entrega sintetica QA','Estado cargado por fixture, no entrega real','Ubicacion QA','2000-01-03');
INSERT INTO core.reviews(id_producto,id_usuario,calificacion,comentario)
VALUES (66,910002,5,'Resena sintetica QA para comprobar lectura y elegibilidad.');
COMMIT;
