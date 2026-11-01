# Reintentos del mismo candidato Android

El script separado `scripts/eas-candidate.js` sustituye únicamente la creación directa del build. Conserva `test-results/eas-build.json` como array para el download actual de `android-ci.js`. No modifica ese script, EAS, dependencias o workflows al importarse. Las pruebas usan transportes inyectados sin red ni compilaciones. El transporte CLI se ejecuta en el runner Ubuntu del workflow actual.

La identidad propia incluye proyecto, package Android, SHA, perfil preview, API HTTPS efectiva, configuración app/EAS resuelta, lockfile, CLI latest verificada como27.2.0 antes de config y de crear, y una revisión explícita de la configuración remota. Sólo publica su SHA256 en el mensaje del build. Consulta todos los estados, pagina hasta200 resultados (si alcanza el límite bloquea) y valida de nuevo el build elegido con build:view. Espera estados activos hasta30min, con consultas CLI limitadas a120s; errores, cambios de identidad, artefacto inválido o caducado bloquean sin crear sustitutos.

Un build existente sólo se reutiliza con `EAS_REUSE_BUILD_ID` explícito y marca exacta. Un primer intento sin ningún build del proyecto/SHA/perfil puede crear uno; un rerun vacío o un build legado sin marca requiere `EAS_ALLOW_NEW_BUILD=true`. Una marca exacta activa o finalizada exige elegir ese ID, incluso si se autorizó crear. Los estados ERRORED/CANCELED sólo permiten un nuevo intento con autorización explícita y confirmación fresca por build:view. Ningún fallo de consulta activa esa creación.

## Límite de identidad remota

El fingerprint nativo de Expo no demuestra la API JavaScript integrada, y el JSON Build de EAS no contiene toda la configuración efectiva. Los secretos cloud no pueden leerse fuera del servidor. `EAS_CONFIG_REVISION` es una etiqueta pública de revisión, no una prueba criptográfica de ese estado invisible: debe cambiar al modificar variables remotas, imagen/credenciales u otros inputs cloud no reflejados en la configuración resuelta. La reutilización necesita la elección explícita del ID; no se anuncia equivalencia remota íntegra por SHA/fingerprint nativo. Builds previos sin nuestra marca no son reutilizables con este script.

La exclusión entre lookup y creación tampoco es atómica en EAS. La siguiente concurrencia serializa los jobs CI del mismo repositorio/SHA/perfil; no impide una compilación manual externa simultánea. No ejecutar este script como herramienta de builds paralelos fuera de esa exclusión.

## Integración en el workflow

El paso build de .github/workflows/api-android.yml ya invoca este helper después de prepare y TLS. El job serializa repositorio/SHA/perfil sin cancelar una compilación en curso. Los inputs manuales son eas_reuse_build_id y eas_allow_new_build; un reintento por etiqueta puede usar la variable pública EAS_REUSE_BUILD_ID. Un ID de otra candidata bloquea: retirar esa variable al terminar su uso.

EAS_CONFIG_REVISION identifica la revisión declarada de configuración remota y debe actualizarse al cambiar inputs cloud. El script usa npx eas-cli@latest y exige la versión comprobada 27.2.0 antes de resolver configuración y antes de crear un build; una actualización futura requiere revisión, sin fallback silencioso.

El helper informa el ID y los cambios de estado, sin URLs firmadas. Conserva eas-candidate.json incluso durante la espera, para que un timeout no oculte el ID creado. Sólo eas-build.json contiene la respuesta cruda necesaria para descargar; nunca se añade al artefacto. El diagnóstico compacto y la procedencia del APK se conservan en la evidencia Android existente.

No relanzar todos los jobs como forma de solicitar otro APK. Si EAS sigue activo, comprobar ese ID y reutilizarlo expresamente. Un reintento no cambia las comprobaciones de calidad o aceptación y no transforma un build previo en aprobado.
## Fuentes primarias consultadas

- [SDK57](https://docs.expo.dev/versions/v57.0.0/) y [índice Expo](https://docs.expo.dev/llms.txt).
- [CLI build/list/view/config](https://docs.expo.dev/eas/cli/). Ayuda local latest verificada:27.2.0.
- [Metadata BuildFragment](https://github.com/expo/eas-cli/blob/main/packages/eas-cli/src/graphql/types/Build.ts).
- [Precedencia de profile.env](https://github.com/expo/eas-cli/blob/main/packages/eas-cli/src/build/evaluateConfigWithEnvVarsAsync.ts).
- [Visibilidad de variables remotas](https://docs.expo.dev/eas/environment-variables/).

En el estado actual, main no contiene este workflow: no se ofrece workflow_dispatch sólo por existir en develop. La candidata por etiqueta y la variable de reutilización permiten continuar sin alterar main.
