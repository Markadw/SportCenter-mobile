# Validación nativa del mismo APK c816

El workflow `android-validation.yml` sólo se activa mediante una etiqueta `validation/android-*`. No crea compilaciones EAS, publica en Play ni modifica el código/configuración de la aplicación. Sustituye la prueba 16KB aislada por una ejecución secuencial de todas las comprobaciones nativas que faltan del APK existente.

## Procedencia y fallo histórico

Origen fijo: run `41349708434`, fuente `c8168584e92d620b9cdf75b6d27228128b12bc81`, proyecto público `c608a591-dfad-47d6-98cf-e714e821c269`, perfil `preview`, build `2bf40b15-71fc-41c9-9ad6-bf825096b394`, APK SHA256 `1ac0a14bec648434d8733d64ef817d3e41329fe47e1c6fea843cdda1a7bb814d`.

El run padre conserva su fallo: el inspector anterior no reconoció el formato de certificado de Build Tools 37 y confundió padding RELRO válido con una salida fuera de LOAD. Maestro34 y pinning quedaron omitidos. Ese run no acredita aceptación nativa ni se convierte en verde por esta validación posterior.

Antes de descargar se consulta la API de GitHub: SHA completo/run/repositorio público exactos; último conjunto completo de jobs; calidad, seguridad y HTTP en `success`; pasos de preparación, TLS, EAS y descarga del job Android en `success`. Si Android está fallido se admite únicamente el fallo histórico del paso del inspector. Jobs ambiguos, páginas incompletas, estados omitidos o consultas fallidas bloquean. No hay fallback a otro APK/run.

`artifactSourceCommit` identifica el código de la aplicación y `automationCommit` el nuevo `GITHUB_SHA`. Nunca se sobrescriben `GITHUB_SHA` ni `GITHUB_REF`. El checkout debe descender del SHA fuente y su diff `--name-only --no-renames` sólo admite los 21 archivos exactos de automatización y documentación de `AUTOMATION_FILES`, sin rutas por prefijo. También se rechazan cambios sin commit. Inspector y pinning resuelven de nuevo la prueba de procedencia y el árbol: sólo las etiquetas de validación pueden usar una fuente distinta. Las candidatas originales mantienen `commit == GITHUB_SHA`.

`android-evidence` se descarga por su ID verificado a `RUNNER_TEMP`. `android-build.json` y `eas-candidate.json` deben coincidir con las constantes anteriores y el fingerprint de configuración. La única operación EAS es `npx eas-cli@latest build:view <ID fijo> --json`, con `EXPO_TOKEN` limitado a ese paso y stdout/stderr capturados. Se exige `FINISHED`, plataforma/proyecto/perfil/app/fuente exactos y `message=sport-center-candidate-v1:<fingerprint>`. El enlace firmado permanece sólo en un archivo temporal que se elimina al descargar. El hash binario debe coincidir con el hash fijo anterior y se vuelve a medir antes de las pruebas.

## Comprobaciones nuevas obligatorias

1. Calidad y seguridad reutilizan sus workflows actuales; la criptografía real de las pruebas se instala también en tags `validation/android-*`.
2. El inspector verifica firma, manifiesto/permisos, ABI, ZIP16KB, todos los ELF64 y JADX acotado. La firma admite el formato anterior y `V2 Signer: certificate SHA-256 digest:` de SDK37, siempre con `Verifies`, count y un esquema v2/v3 verdadero; una huella de public key no sirve como certificado.
3. API34 ejecuta los dos flujos públicos Maestro existentes y verifica PID. Su informe identifica fuente y automatización por separado. El éxito no se infiere de la metadata histórica `emulatorApi:34`.
4. API30 usa un AVD nuevo con sistema escribible para el control positivo, rechazo TLS bajo MITM y recuperación del mismo APK. Exige primero el informe API34 actual, preserva la causalidad de certificados y limpia proxy/CA/proceso/archivos antes de cerrar el emulador.
5. API36 usa un tercer AVD nuevo con `system-images;android-36;google_apis_ps16k;x86_64`, revisión 7, canal estable, KVM obligatorio (`-accel on`), `swiftshader`, sin snapshots/caché ni fallback TCG. Antes y después exige `getconf PAGE_SIZE=16384`, ABI x86_64 y API36. También verifica la ABI instalada de la app, desactiva compatibilidad 4KB, exige arranque/PID, los dos casos JUnit sin fallos/omisiones y ausencia de fatales identificados del paquete en el buffer crash limpiado antes del arranque.

La excepción ELF es acotada: un RELRO con padding sólo se admite si comparte inicio con su LOAD dedicado y `LOAD.end <= RELRO.end <= roundUp16KB(LOAD.end)`, sin bytes de otro LOAD escribible dentro del rango protegido. Se mantienen los rechazos de solapamiento, padding fuera de página y RELRO compartido parcialmente alineado. Las fixtures contienen geometría real de las dos ABI de `libandroidx.graphics.path.so`; no simulan una salida de herramienta ni contienen fuentes/CertDN.

La simulación oficial x86_64 comprueba ejecución con páginas 16KB; **no demuestra ejecución nativa ARM64**, todas las pantallas, seguridad completa ni aceptación de Google Play. El control de logcat se limita al buffer crash desde el arranque y eventos que identifican el paquete.

Maestro se fija en 2.12.0 con SHA256 verificado. Sólo se usan catálogo/detalle públicos, sin cuentas, compras ni credenciales privadas. Los tres emuladores son secuenciales y cada action cierra su emulador antes de la fase siguiente; los nombres/targets son diferentes y el runner efímero se elimina al finalizar. El agregado «Resultado de validación nativa» exige resultados reales de calidad, seguridad y pruebas nativas; es distinto del agregado de integración original.

La evidencia se conserva por fallo o `keep_evidence=true` explícito en la candidata de validación: metadata compacta, inspección sin fuentes, JUnit y capturas de UI pública. No se suben APK, tokens, raw EAS JSON, logcat, CertDN ni claves. La descarga contiene el mismo APK una sola vez en `RUNNER_TEMP`.

Comprobación local sin red/builds/emulador:

```text
node node_modules/jest/bin/jest.js --runInBand __tests__/android16k.test.js __tests__/androidSourceContext.test.js __tests__/androidArtifactInspection.test.js __tests__/androidPinning.test.js __tests__/pipelines.test.js
npm run lint
node node_modules/typescript/bin/tsc --noEmit
node scripts/validate-test-configs.js
```

Para incluir criptografía real, `PINNING_TEST_MITMDUMP` debe señalar el ejecutable mitmdump 12.3.1 previamente verificado; el workflow instala y fija la herramienta. Una prueba local omitida por falta de esa variable no acredita ese control.

Fuentes primarias: [AOSP: LOAD y protección GNU_RELRO con page_start/page_end](https://android.googlesource.com/platform/bionic/+/refs/heads/main/linker/linker_phdr.cpp), [apksigner verify](https://developer.android.com/tools/apksigner), [Android: comprobar páginas 16KB](https://developer.android.com/guide/practices/page-sizes), [AOSP: simulación x86_64](https://source.android.com/docs/core/architecture/16kb-page-size/getting-started-cf-x86-64-pgagnostic), [catálogo oficial de imágenes](https://dl.google.com/android/repository/sys-img/google_apis/sys-img2-4.xml), [flags del emulador](https://developer.android.com/studio/run/emulator-commandline), [inputs del action](https://github.com/ReactiveCircus/android-emulator-runner/blob/v2/action.yml), [descarga cross-run](https://github.com/actions/download-artifact/tree/v4), [EAS CLI](https://docs.expo.dev/eas/cli/).
