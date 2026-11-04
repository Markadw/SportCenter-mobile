# Validación del AAB de producción RC5

La fuente de la app está congelada en `8e8a6da3fedbb61057efaa7fe30b6923b6195595`. La revisión de automatización se identifica por separado mediante una etiqueta `validation/release-*`; sólo permite el diff explícito de guiones y documentación revisados. Cambiar código de la app, activos, configuración nativa, dependencias o parches exige otro binario y recibo.

## Procedencia real

- Proyecto Expo: `c608a591-dfad-47d6-98cf-e714e821c269`; Android: `com.markadw.sportcenter`.
- Perfil `production`, Android App Bundle, versión `1.0.0`, código `1` y API HTTPS de SportCenter.
- Build EAS terminado: `c55fd545-cff4-4758-a5be-5bc583b85589`.
- AAB: 68959777 bytes, SHA256 `db53be0e836ff939e56a74607115ee79e482a6fd537a933ff7b0d6bcc7b54f36`.
- Mensaje EAS: `sport-center-production-v1:8e8a6da3fedbb61057efaa7fe30b6923b6195595`.

El recibo `config/android-release-validation.json` registra valores medidos del archivo descargado, sin campos provisionales. Se generó un único build con EAS CLI 27.4.0, sin auto-submit y con credenciales de firma congeladas. El ejecutor de validación consulta y descarga exclusivamente ese ID; no crea builds.

El [productor Preview RC5](https://github.com/Markadw/SportCenter-mobile/actions/runs/41810909053), intento 1, corresponde exactamente al evento push y la etiqueta `candidate/android-rc5`, workflow `api-android.yml` y la misma fuente `8e8a6da`. La guardia exige ocho trabajos únicos aprobados: matriz, calidad, seguridad, contratos HTTP, inspección de guiones, APK/API34, rechazo TLS/API30 y resultado. No acepta el SHA del merge como identidad del binario ni omisiones de Android/TLS.

## Comprobaciones del AAB

El modo `production-release-only` verifica origen, integridad, firma y configuración del AAB y deriva un APK universal con una clave temporal de validación. Bundletool 1.18.3, decoder23 y Build Tools37 tienen versiones e integridad fijadas. El resultado debe conservar la relación de hashes AAB→APK; la clave temporal se elimina y su firma no se presenta como Play App Signing.

El APK derivado se ejecuta sin Metro en AVDs nuevas API34 y API36 x86_64. Cada AVD prueba catálogo, detalle y dos entradas nativas: búsqueda con Unicode/`+` y URI malformada que debe volver al catálogo sin consulta residual. Son cuatro casos repetidos en dos entornos, ocho ejecuciones. Se exige JUnit coherente, proceso correcto, ausencia de fallos fatales y limpieza confirmada.

API36 usa la imagen de páginas de 16 KB, comprueba `PAGE_SIZE=16384` antes y después y desactiva compatibilidad de 4 KB. Los 4096M de RAM son la configuración del emulador; no acreditan poca memoria ni hardware ARM64 físico. Un fallo de limpieza bloquea las fases siguientes y el agregado conserva cualquier fallo.

La [validación RC5](https://github.com/Markadw/SportCenter-mobile/actions/runs/41825217994), etiqueta `validation/release-rc5-v1` y automatización `55abb893cce4d868192724838e251dee755deae6`, aprobó inspección y las ocho ejecuciones. API36 confirmó 16384 bytes antes y después con compatibilidad desactivada. Ambas AVD mantuvieron el proceso sin fallos fatales y confirmaron su limpieza. El artifact `13320530258`, 521503 bytes, SHA256 `7df6d3f0b9889755cc80c79c113912474bf035aab2f5ed152c52f2285d47b72f`, conserva esa evidencia.

Sólo se publican los JSON, resumen, JUnit y capturas públicas permitidos, durante 14 días. El AAB, APK, claves, URLs firmadas, XML y logcat crudos no se suben como artifacts. El token Expo sólo llega a la consulta EAS; el token GitHub de lectura sólo a la comprobación del productor.

## Alcance separado e histórico

La [aceptación de cuenta RC5 en Preview](https://github.com/Markadw/SportCenter-mobile/actions/runs/41821737397) aprobó dieciséis controles, incluidos perfil/carrito con persistencia y restauración. Ese resultado identifica su propio APK, no una ejecución privada del APK derivado de este AAB.

F2 conserva su [validación histórica](https://github.com/Markadw/SportCenter-mobile/actions/runs/41727765066), fuente `e15671b17615621b29f4bc4bb9c0ccfdf167e657` y AAB `2e902741-6bfd-4171-a336-2a784ae41f58`, SHA256 `7ffe6560cf3eddb41f5a595c2073cc1e5a3e07e27ffc695e18d3eb6a0635a253`. El Debug anterior conserva también su propia fuente y evidencia; no se reconstruye ni se atribuye a RC5.

La validación no acredita pago, pedido con contenido/seguimiento, publicación de reseña, prueba física, documentación legal definitiva ni publicación en Google Play. Esas comprobaciones mantienen sus requisitos y evidencias independientes.

La integración posterior incorpora las pruebas de cuenta ya aprobadas en develop y su documentación. Se comprobó que el árbol `src` y todos los cambios de integración corresponden exclusivamente a rutas de pruebas/documentación revisadas. Los tags históricos de validación y la fuente del binario permanecen inmutables; no se repite la compilación ni se atribuye a la revisión de documentación una ejecución nativa distinta.
