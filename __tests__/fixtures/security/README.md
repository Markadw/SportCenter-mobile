# Fixture CodeQL SARIF sin fuentes

Proyección mínima de la estructura recuperada por GET `/repos/Markadw/SportCenter-mobile/code-scanning/analyses/2072527667` con `Accept: application/sarif+json`, correspondiente a PR44, run 41338418973, job 124943087563. El análisis real informó cero resultados y 103 reglas en la extensión de consultas.

Se conservaron nombres/versiones de componentes públicos CodeQL, la ausencia de `rules` en el driver y extensiones auxiliares, `results: []` y una sola metadata real de regla crítica para comprobar referencias y umbrales. Se excluyeron código, ubicaciones, datos del repositorio, descripciones y metadatos auxiliares. No es una copia del informe completo ni evidencia independiente de ejecución.

El fixture valida contra el esquema oficial [SARIF 2.1.0 de OASIS](https://docs.oasis-open.org/sarif/sarif/v2.1.0/cos02/schemas/sarif-schema-2.1.0.json). `toolComponent.rules` es opcional y su valor por defecto es `[]` (§3.19.23). El gate sigue exigiendo resultados explícitos y analyze exitoso; una referencia sin metadata o `rules` presente con tipo incorrecto permanece inválida.

El SARIF completo recuperado por GitHub API se mantiene fuera del repositorio. Es un subconjunto enriquecido por GitHub y su extensión `codeql-action/pr-diff-range` contiene un `properties.tags` que no es array, por lo que esa representación completa no pasa la validación íntegra del esquema OASIS. Este cambio se limita a la variación válida de `rules`; no afirma conformidad completa del documento devuelto por la API ni aprueba el workflow histórico.
