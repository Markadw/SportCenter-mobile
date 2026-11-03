# Backport mantenido del decoder

El patch [decode-uri-component+0.2.2.patch](../patches/decode-uri-component+0.2.2.patch) incorpora el algoritmo oficial de0.5.1 sobre la distribución0.2.2. Se mantienen su identidad npm, export CommonJS callable y normalización legacy de `+` a espacio; `%2B` sigue produciendo un signo más. No se actualizan Expo SDK57, Router ni query-string.

## Procedencia y licencia

- Fuente oficial0.5.1: commit `58ed85f5adc7cfaee5e49e4d52b067f172d0bcb6`, [index.js](https://github.com/SamVerschueren/decode-uri-component/blob/58ed85f5adc7cfaee5e49e4d52b067f172d0bcb6/index.js).
- Los tarballs npm0.2.2 y0.5.1 se verificaron contra su integritySHA512 antes de extraer la fuente. Ambos contienen la misma licencia MIT; su aviso permanece en el paquete y se reproduce al final de este documento.
- [Fix exponencial fa479da](https://github.com/SamVerschueren/decode-uri-component/commit/fa479da): scanner UTF8 que avanza sin recursión y examina como máximo cuatro bytes por secuencia.
- [Fix cuadrático fad01d6](https://github.com/SamVerschueren/decode-uri-component/commit/fad01d6): reemplazo de cada run codificado en una sola pasada, sin volver a recorrer todo el input por cada valor distinto.

| Archivo | SHA256 de bytes LF exactos |
| --- | --- |
| index.js npm0.2.2 original | `3b8ba0a765e1089d11bba9a919d0d8789ecd9a6833ea078d8d9114e1db093863` |
| index.js npm0.5.1 upstream | `6a86ac891edf15c5efa0841ebb31935e3669d58b98318b57d7b08a4530317cb0` |
| index.js0.2.2 parchado | `2a6d60a839e2ca32adaeb002fd4ee840104f0230d7ad62422fa983e55d204267` |
| patches/decode-uri-component+0.2.2.patch | `4de97d5582cf28b475f1a370274de201b6e30c15ae7f32cf051c0ebaf9990c38` |
| license original conservada | `ed7a9a0f74e43951b2520efe1a4349cb9ed5f3dff0b0f268e2e51a4d38df7ea4` |

## Contrato y comprobación

El algoritmo nuevo no reescanea su output. Por ejemplo, `%25C2%zz` produce `%C2%zz`, sin volver a interpretar el porcentaje recién decodificado. Esta semántica de malformados procede del fix upstream; no se promete identidad con todos los resultados del decoder vulnerable anterior. Se conservan los errores TypeError para entradas no string, sin coerción implícita.

La aplicación automática corresponde al postinstall `patch-package --error-on-fail`, con patch-package8.0.1 disponible también al omitir dependencias dev. El patch cambia sólo index.js. .gitattributes conserva finales LF en patches/*.patch tanto en Windows como en CI para mantener sus bytes y huella. Una instalación limpia debe aplicar el patch y pasar el SHA256 esperado; un fallo no debe convertirse en una instalación aprobada. [Uso de patch-package](https://github.com/ds300/patch-package#usage).

La suite [decodeUriComponentSecurity.test.js](../__tests__/decodeUriComponentSecurity.test.js) carga el módulo instalado y la cadena real Router→query-string. Comprueba Unicode, malformados, BOM, tipos, plus y round trips. Antes de llamar al decoder exige su hash parchado. Cada familia adversarial corre sólo en un hijo con otro hashguard, timeout5s y salida acotada; usa tamaños2048/8192/32768 y mide presupuestos lineales de bytes recorridos por replace/decodeURIComponent. No ejecuta el código antiguo en entradas adversariales ni usa comparaciones frágiles de tiempo para aprobar.

El paquete sigue llamándose0.2.2. npm audit seguirá reportando los avisos del decoder/query-string/Router porque evalúa metadatos de versión; no se renombran paquetes ni se altera el informe para esconderlos. Los avisos relevantes son [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) y [GHSA-qr28-fpjm-wq7f](https://github.com/advisories/GHSA-qr28-fpjm-wq7f).

Este cambio modifica JavaScript de la app y requiere nueva aceptación del artefacto correspondiente. Las pruebas Node, la exportación o compilación a bytecode no acreditan ejecución Hermes. El compiler Hermes local no ejecuta `-exec`; la validación runtime queda para la candidata Android. Este documento no afirma que esa aceptación ya haya ocurrido.

## Aviso MIT upstream

```text
The MIT License (MIT)

Copyright (c) 2017, Sam Verschueren <sam.verschueren@gmail.com> (github.com/SamVerschueren)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
