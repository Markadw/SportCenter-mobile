# Debug y AAB de una fuente congelada

Esta comprobación se activa únicamente mediante una etiqueta inmutable `validation/profiles-*`. Amplía el auxiliar del segundo pipeline; no añade otro pipeline principal, no se programa y no crea builds EAS. No modifica main, el backend ni datos de cuentas.

Fuente de aplicación: `5dcacd46a24ae54da5300cd394a91c590a9a5825`. La revisión de automatización se conserva por separado; debe descender de esa fuente y sólo cambiar las rutas exactas declaradas en el auditor. Las comprobaciones del commit integrado deben haber aprobado en la ejecución `41557906330`.

| Perfil | Build EAS existente | SHA256 del artefacto |
| --- | --- | --- |
| development (APK Debug) | `7ccfddc3-4fbd-4c52-aef7-c31587ba2244` | `ebfb8281ec12359178954255c94cf3e7d70e681d405c9c497fa3b9064d34d1d2` |
| production (AAB) | `31b3eefb-72db-4757-87aa-1e458dd73e52` | `acf7d113a2a093211f3f990ac5d2b26ef5ff5ba37bc7a6efb9fe230fa05fd91b` |

La consulta EAS exige FINISHED, plataforma, proyecto, package, perfil, commit, versión y mensaje exactos. El token sólo existe en el paso build:view. La descarga acepta HTTPS y debe coincidir con la huella congelada; URLs firmadas y respuestas crudas permanecen temporales.

Debug debe ser depurable; production no. El manifiesto Debug declara usesCleartextTraffic=true, pero su minSdk24 y NSC explícita hacen que la política de tráfico resida en la NSC. Se comprueba desde el recurso compilado: base/API sin HTTP, trust system y dos pines; sólo los cuatro hosts de desarrollo previstos admiten HTTP. Release exige además el flag false y ninguna excepción Metro. La precedencia de la NSC está [documentada por Android](https://developer.android.com/guide/topics/manifest/application-element#usesCleartextTraffic).

SYSTEM_ALERT_WINDOW pertenece al manifiesto debug de React Native; CHANGE_WIFI_MULTICAST_STATE pertenece al launcher debug de Expo. Se registran como permisos exclusivos de desarrollo y se rechazan en release; no se describen como funciones de Sport Center.

Command-line Tools23 y sus dos JAR fijados decodifican manifiesto y NSC. Build Tools37 verifica firma y alineación. Bundletool1.18.3 se verifica por SHA256 contra su release oficial. El AAB se valida con bundletool y jarsigner antes de generar un APK universal con una llave temporal exclusiva de la prueba. Se conserva la relación AAB SHA256 → APK derivado SHA256 y su certificado de prueba; esa firma no es la identidad de Play App Signing.

En API34 x86_64 se instala Debug y se inicia Metro en loopback con adb reverse. Los dos recorridos públicos abren expresamente la URL del development client después de limpiar su estado, para no confundir el launcher con la aplicación. Al terminar se detienen únicamente los procesos propios, se retira el reverse y se desinstala Debug. Después se instala el derivado release y se ejecutan los mismos recorridos con Metro detenido y sin reverse.

En una AVD nueva API36 x86_64 google_apis_ps16k se exige una página real de 16384 bytes antes y después, se desactiva la compatibilidad de 4 KB y se ejecuta el derivado release. Es una simulación oficial x86_64; no acredita ejecución ARM64 nativa. Cada fase registra resultados separados, proceso y crash buffer acotado. Un fallo o una omisión requerida bloquea el agregado.

La evidencia conserva sólo JSON, JUnit y capturas públicas durante 14 días. No conserva APK/AAB/APKs, claves, contraseñas, URLs firmadas, tráfico, logcat o logs crudos. La prueba física aplazada, las rutas privadas, los pagos y la revisión de Google Play quedan fuera de esta comprobación.
