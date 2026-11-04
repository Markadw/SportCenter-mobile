# Validación del AAB RC6 — ejecución pública aprobada

La fuente de app es `8831dfad7fd1b0c696d11f50c79442c5499b7cd2`. El AAB de producción `43bcc31d-8297-48e4-b91e-7f37c63d349c`, perfil `production`, mide 68959933 bytes y tiene SHA256 `8fac2e502cd1877d8fd60b7b93e5b42ae85313025dcf1cbed62f4699b8cd693a`. El recibo real `config/android-release-validation.json` fija esa identidad, versión `1.0.0`, código `1` y aplicación `com.markadw.sportcenter`.

El [run Release 41890488214](https://github.com/Markadw/SportCenter-mobile/actions/runs/41890488214), intento 1, terminó aprobado. Usó el tag `validation/release-rc6-v1` y automatización `9d13b4134eff39bdbee058826cb2652ce38ffed5`. Calidad, seguridad, ejecución AAB y agregado `Resultado de Release AAB` aprobaron. El tag conserva ese SHA; actualizar el PR con develop no cambia esta evidencia histórica ni acredita automáticamente otro SHA de automatización.

Los JSON y JUnit reales acreditan cuatro casos públicos por entorno, ocho ejecuciones aprobadas y ninguna omitida:

| Caso | API34 | API36, 16 KiB |
| --- | --- | --- |
| CP-03: catálogo público | Aprobado | Aprobado |
| CP-04: detalle de producto | Aprobado | Aprobado |
| L01: entrada nativa con búsqueda Unicode y signo + | Aprobado | Aprobado |
| L02: URI malformada con retorno seguro al catálogo | Aprobado | Aprobado |

Ambas AVDs x86_64 ejecutaron el APK derivado sin Metro, sin aplicación previa ni reverse de desarrollo. El proceso siguió activo y no se detectó cierre fatal del paquete en el buffer observado. API36 registró páginas de 16384 bytes antes y después, con compatibilidad de 4 KB desactivada. La inspección verificó manifiesto sin depuración, target SDK 36/min SDK 24, política compilada sin cleartext de base ni hosts Metro, alineación ZIP y las 44 bibliotecas de 64 bits con alineación LOAD mínima de 16384. La inspección compilada y la ejecución son evidencias distintas.

La firma del archivo AAB se verificó y su certificado público coincide con el AAB RC5 íntegro: SHA256 `cdb510562d8480785383bd3f988bc19bd296c66ae4f8c54160eb2d9ef48a35ee`. El APK derivado utiliza una clave temporal exclusiva de validación; su firma también se verificó. Ninguna de estas comprobaciones acredita la identidad futura de Play App Signing. No se exportó el keystore.

Los dos preflights de 12 GiB aprobaron. Tras los cuatro casos API34 y con su limpieza de app aprobada, `cleanup-avd34` comprobó ausencia de dispositivos ADB y procesos emulator/QEMU. Eliminó únicamente la AVD propia `profiles-release34` mediante Command-line Tools23 (`delete avd --name profiles-release34`) y acreditó ausencia de su carpeta y descriptor. API36 comenzó después de esa prueba y del nuevo preflight. La limpieza de la app en API34/API36 y la limpieza de temporales aprobaron; JUnit y capturas públicas se conservaron. El helper de disco sólo admite la VM Linux efímera de GitHub y rutas fijas sin symlinks; no se ejecutó limpieza en el equipo local.

El artifact `android-release-evidence`, ID `13353502749`, mide 519994 bytes; su SHA256 `6c040218acda9ea6516f7c7892d16c45c7fb9d93c9c163801a3efb6c6c313ffb` coincide con el digest de GitHub. Se verificaron sus JSON/JUnit, fuentes, hash y recibo. El artifact contiene únicamente los informes, resumen y capturas públicas permitidos; no incluye AAB/APK, claves, credenciales o logcat.

El [productor Preview 41860689069](https://github.com/Markadw/SportCenter-mobile/actions/runs/41860689069/attempts/2), intento 2, aprobó sus ocho trabajos obligatorios para la misma fuente de app, incluidos APK/API34 y TLS/API30. Su agregado histórico se llama `Resultado de integración`. Esa evidencia pertenece al Preview y es distinta de las ocho ejecuciones del AAB Release. Se rechazan intentos 1/3 y cualquier fallback a RC5. La allowlist histórica del sourceguard no se amplía para aceptar los archivos QA de la nueva base develop.

La actualización de la rama pasó lint, TypeScript y configuración. La suite global y la ejecución complementaria de la suite con mitmproxy12.3.1 real consolidan 2010 controles locales únicos aprobados, sin omisiones pendientes. Las 263 comprobaciones de la suite complementaria incluyen controles ya presentes en la global; no se suman como 263 controles nuevos. Estas pruebas locales tampoco sustituyen la ejecución nativa anterior.

El alcance aprobado es público y sobre emuladores x86_64. No acredita ARM64 físico, cuenta privada del APK derivado, formularios de correo, pedidos, reseñas o pago con Mercado Pago. Sus pruebas se registran por separado. Identidad/documentos legales finales, Console, acceso de revisión y publicación siguen pendientes. RC5 y Debug conservan sus tags, fuentes, binarios y resultados históricos.
