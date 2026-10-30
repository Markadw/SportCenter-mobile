# Comprobación del primer bloque de interfaces móviles

Estado: comprobación básica en Android confirmada por el usuario.

## Comprobación registrada

El usuario confirmó que funciona el recorrido básico de carga inicial, Inicio sin banner, catálogo, selección de variantes, navegación y acceso a la cuenta desde `feature/interfaces-moviles`.

Esta confirmación corresponde a la revisión manual en su teléfono. Las pruebas automatizadas se registran por separado y no sustituyen esa comprobación. Los casos adicionales de conexión interrumpida, texto aumentado, variantes agotadas y apariencia final del splash en una compilación instalada siguen como guía de revisión; no se marcan todos como ejecutados.

## Preparación

Ejecutar en PowerShell, dentro de la copia de trabajo que contiene los cambios:

```powershell
Set-Location 'C:\Users\markz\projects\react_n\sport-center-mobile'
git branch --show-current
npm start -- --clear
```

La rama debe ser `feature/interfaces-moviles`. Abrir desde el QR que muestre esa terminal en la versión de Expo Go compatible con SDK 57. Usar esa rama para comprobar el bloque hasta que su PR se integre en develop.

## Recorrido

1. Abrir la app: aparece la marca mientras termina la primera consulta; después se muestra Inicio. No se establece un tiempo mínimo. El splash nativo definitivo se revisará en una aplicación instalada.
2. Desplazarse por Inicio: comprobar buscador, deportes, productos más recientes y marcas, en ese orden. No debe aparecer el banner ni una petición a `/company/banner` en la terminal.
3. Pulsar una marca o deporte: se abre Catálogo con ese filtro. Limpiarlo permite ver el resto. Regresar a Inicio y seleccionar otra opción no debe conservar una búsqueda anterior.
4. Buscar un producto desde Inicio. El texto debe aparecer en Catálogo y limitar los resultados. Repetir la búsqueda sin acentos y después borrarla. Una consulta sin coincidencias ofrece limpiar.
5. Probar categoría, marca y deporte en Filtros, aplicar y limpiar. Abrir Ordenar productos: probar precio ascendente, descendente, nombre y recientes. Introducir un mínimo mayor que el máximo debe mostrar el error. El rango válido incluye productos cuando alguna variante cumple ambos límites.
6. Si hay más de 20 resultados, pulsar Ver más productos: la lista conserva los anteriores. Abrir un producto y volver con la flecha o el botón Android; se conserva el catálogo, sus filtros y búsqueda.
7. En Detalle, cambiar la combinación de atributos: comprobar conjuntamente precio, fotos y existencias. Para el producto 34, el backend consultado ofrecía Negro/L y Rojo/M con distintos precios y existencias; comparar con la respuesta actual. Una variante agotada no debe tomar las existencias de otra. Compartir debe abrir el diálogo del teléfono con la página del producto correcto.
8. Entrar a Cuenta sin sesión: se ofrecen inicio y registro. Probar el inicio con una cuenta verificada, volver a las pestañas y cerrar sesión. No debe mostrarse información de cuenta después del cierre. La recarga completa continúa perdiendo la sesión, conforme al alcance actual de MOB-005.
9. Probar un arranque sin conexión: al terminar la espera HTTP aparece el estado de error con Reintentar. Recuperar la conexión y reintentar. No debe quedar una pantalla de carga permanente. Una actualización posterior conserva los productos anteriores si falla.
10. Comprobar que el teclado no tape los controles del formulario de precios y que el cierre del modal por atrás en Android funcione. Revisar pantallas estrechas y texto aumentado, especialmente títulos, precios, controles y barra inferior.

## Alcance de las comprobaciones automatizadas

Jest verifica búsqueda, filtros, orden, rango de precio por variante, carga acumulada, cambio de consulta desde Inicio, selección y stock por variante, recuperación de errores, compartir, imágenes fallidas y el fin de la carga inicial. Conserva las pruebas anteriores de autenticación y registro con transporte simulado.

Los guiones Maestro se actualizaron para entrar por la pestaña Catálogo y seguir el orden Descripción → Categoría. No se ejecutaron en un emulador ni se solicitó un APK para esta revisión. El empaquetado de JavaScript Android verifica que Expo resuelva las rutas y módulos; no acredita una prueba física ni una instalación nativa.
