INSERT INTO core.marcas (id_marca,nombre,imagen) VALUES (1,'Sport Center QA','') ON CONFLICT DO NOTHING;
INSERT INTO core.categories (id_categoria,nombre,id_padre) VALUES (1,'Accesorios',NULL),(2,'Gorras',1) ON CONFLICT DO NOTHING;
INSERT INTO core.deportes (id_deporte,nombre) VALUES (1,'Running') ON CONFLICT DO NOTHING;
INSERT INTO core.products (id_producto,nombre,descripcion,id_categoria,id_marca,activo,fecha_creacion,fecha_actualizacion)
SELECT n,CASE WHEN n=66 THEN 'Gorra QA Sport Center' ELSE 'Producto QA '||n END,
  'Producto sintético reproducible para integración y carga local.',2,1,true,
  CASE WHEN n=66 THEN timestamp '2026-01-02' ELSE timestamp '2026-01-01' + n*interval '1 minute' END,
  timestamp '2026-01-01'
FROM generate_series(1,100) n ON CONFLICT DO NOTHING;
INSERT INTO core.product_variants (id_variante,id_producto,sku,precio,imagenes,atributos)
SELECT n*2-1,n,'QA-'||n||'-A',100+n,'[]'::jsonb,'{"Color":"Azul","Talla":"S"}'::jsonb FROM generate_series(1,100) n
UNION ALL
SELECT n*2,n,'QA-'||n||'-B',110+n,'[]'::jsonb,'{"Color":"Negro","Talla":"M"}'::jsonb FROM generate_series(1,100) n
ON CONFLICT DO NOTHING;
INSERT INTO core.inventory (id_inventory,id_variante,stock_actual,costo_promedio)
SELECT n,n,20,75 FROM generate_series(1,200) n ON CONFLICT DO NOTHING;
INSERT INTO core.product_deportes (id_producto,id_deporte)
SELECT n,1 FROM generate_series(1,100) n ON CONFLICT DO NOTHING;
