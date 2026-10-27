# HU-02 · Inicio de sesión

Referencia: https://github.com/Markadw/SportCenter-mobile/issues/8
Rama: feature/inicio-sesion, desde develop 509a050188cc4cc9c9a4b432473f107d69bab4ee.
Contrato revisado: AlexisYazir/back-sport, commit 31ee304d902ec5ec5a9c0fc702eca5e1a531bc16.

## Contrato y alcance

- POST /users/login-user recibe email y passw. El correo se normaliza; la contraseña se conserva exactamente.
- El backend admite login desde ocho caracteres, sin exigir de nuevo las reglas de registro.
- Devuelve accessToken, refreshToken, sessionId, accessTokenExpiresIn (15m) y refreshTokenExpiresIn (7d).
- POST /users/logout usa Authorization: Bearer con el access token.
- Las credenciales no se guardan en el contexto ni se registran. Los tokens permanecen en memoria.
- El vencimiento o un 401 de una solicitud con el token vigente retiran el acceso privado.
- MOB-005 conserva como pendientes almacenamiento seguro, restauración y renovación coordinada de sesión. Reiniciar o recargar completamente la app requiere iniciar sesión de nuevo.
- La pantalla Mi cuenta confirma la sesión; la consulta y edición del perfil corresponden a HU-09.
- HU-01 está en otro PR; esta rama permite entrar con una cuenta existente y verificada.

## Pruebas automatizadas del cliente

Jest y React Native Testing Library comprueban el formulario, API y sesión con transporte HTTP simulado. No crean cuentas ni ejecutan login contra Render. Se comprueban validaciones, contraseña visible/oculta, errores, doble envío, cancelación, respuesta incompleta, cierre, vencimiento, cambio de cuenta y rechazo de acceso privado sin sesión.

Las pruebas de componentes sustituyen la navegación. Expo Router SDK 57 y React Native Testing Library 14 tienen una limitación de compatibilidad en renderRouter; no se presentan estas pruebas como aceptación del navegador o del teléfono. Se conserva la configuración de dependencias existente.

## Pruebas del cliente

- ESLint: aprobado (`npm run lint`).
- TypeScript: aprobado (`npm run typecheck`).
- Jest: 98 pruebas aprobadas en 11 suites, con transporte simulado y sin solicitudes de escritura a Render.
- Configuración de pruebas: aprobada (`npm run test:config`).
- Exportación de JavaScript para Android: aprobada con Expo SDK 57. No equivale a APK, EAS Build ni aceptación en teléfono.
- Base de implementación: develop 509a050188cc4cc9c9a4b432473f107d69bab4ee. Pendientes revisión e integración.

## Pruebas en Android

Ejecutor: usuario (Markadw). Resultado informado por el usuario y contrastado con los logs compartidos. No se adjuntaron capturas ni se indicó la versión exacta de Android o Expo Go.

| Prueba | Resultado | Evidencia |
|---|---|---|
| Inicio de sesión con cuenta verificada | Aprobada | Confirmación del usuario y HTTP 201 en /users/login-user |
| Navegación durante la sesión | Aprobada | Confirmación del usuario; catálogo y detalle con HTTP 200 |
| Cierre de sesión | Aprobada | Confirmación del usuario y HTTP 201 en /users/logout |
| Recarga de la aplicación | Aprobada | Confirmación del usuario, conforme al alcance de sesión en memoria |
| Rechazo de solicitudes de login | Observado | HTTP 400 en /users/login-user, seguido de intentos exitosos con HTTP 201 |
| Ajuste del aviso amarillo | Aprobada | El usuario confirmó que ya no aparece el aviso y que inicio y cierre siguen funcionando |

### Avisos observados

- El interceptor usaba console.warn para rechazos HTTP 400 de autenticación; Expo los presentaba en LogBox. Se ajusta su nivel a informativo para los rechazos previstos, conservando el error para el formulario y las advertencias de fallos de servidor o red. El usuario confirmó la ausencia del aviso amarillo y el funcionamiento de inicio y cierre después del ajuste.
- Se compartió también un aviso de /users/create-user. Esta rama no contiene llamadas de registro; el fragmento de terminal compartido no muestra una solicitud actual a esa ruta. No se atribuye a HU-02 ni se declara resuelto su origen sin reproducirlo.
- Could not open editor corresponde al intento de abrir código desde Expo. No impidió el login ni el cierre de sesión.

### Comprobaciones específicas pendientes

- Entrada directa a /account sin sesión y después del cierre: no confirmada en Android.
- Vencimiento natural de sesión: no confirmado en Android; cubierto con reloj controlado en las pruebas del cliente.
- Cuenta propia sin verificar: caso no confirmado en Android; cubierto con transporte simulado.

## Pasos de reproducción

Desde PowerShell, en C:\Users\markz\projects\react_n\sport-center-mobile:

```powershell
git branch --show-current
npm start -- --clear
```

La rama debe ser feature/inicio-sesion. Escanear únicamente el QR de esa terminal con Expo Go compatible con SDK 57. Si hay otro Metro abierto, detenerlo para evitar revisar otra carpeta o rama.

1. Abrir inicio, catálogo y detalle sin sesión: deben seguir disponibles.
2. Pulsar el icono de usuario: abre Iniciar sesión.
3. Enviar campos vacíos y luego correo inválido/contraseña corta: aparecen mensajes sin iniciar una petición.
4. Mostrar y ocultar contraseña: cambia la visibilidad, conserva el valor.
5. Usar credenciales incorrectas: mensaje controlado, sin permitir acceso a Mi cuenta. No agotar intentos de una cuenta ajena.
6. Si se dispone de una cuenta propia no verificada, comprobar el aviso correspondiente. No crear datos adicionales solo para esta prueba.
7. Iniciar con una cuenta propia verificada: abre Mi cuenta. No compartir contraseña ni tokens en capturas.
8. Volver al catálogo, pulsar Inicio y usar el icono de usuario: regresa a Mi cuenta.
9. Cerrar sesión: vuelve a login, limpia los campos y retira el acceso privado. Volver atrás no debe recuperar una sesión cerrada.
10. Probar entrada directa a /account sin sesión y después de cerrarla: no muestra la cuenta privada. En web usar http://localhost:8081/account; en Android usar el enlace de desarrollo correspondiente a esa ejecución, sin inventar una dirección de Metro.
11. Volver a entrar y recargar completamente: solicita iniciar sesión de nuevo, conforme al alcance en memoria de HU-02.
12. Comprobar teclado, botón Atrás y recarga sin errores. La expiración normal de acceso ocurre a los 15 minutos; confirmar la retirada del acceso si se realiza ese caso.

Registrar ejecutor, revisión/build, Android/Expo Go cuando se conozcan, resultado por paso y evidencia sin información sensible. No incluir fechas ni horas. No marcar aprobado un caso que no se ejecutó.
