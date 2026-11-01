# Perfil: MVVM, Repository y Factory

`ProfileScreen` presenta el estado y delega las acciones a `useProfileViewModel`. El ViewModel mantiene el borrador, la validación y el estado de las solicitudes; usa el contrato `get`/`update` de `profileApi`.

`ProfileRepository` define ese puerto tipado. `createProfileRepository(transport)` construye una instancia con un transporte `get`/`patch` inyectado. Cada instancia utiliza exclusivamente su transporte, lo que permite probar escenarios y respuestas sin Axios global ni red. `src/api/profileApi.ts` compone el singleton real con `axiosClient`, de modo que los consumidores conservan su API.

El adaptador valida respuestas de tipo `unknown`, admite `null` sólo en correo y teléfono y devuelve los cinco campos editables. Las actualizaciones normalizan y validan un DTO con esos mismos campos; no añaden identificadores, roles ni datos internos. El cambio de patrón no modifica endpoints ni contrato del servidor.
