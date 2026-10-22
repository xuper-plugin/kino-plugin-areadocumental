# Area Documental para Kino

Plugin de [Kino](https://github.com/kinotvapp/kino-light) para ver los **documentales en español** de
[area-documental.com](https://www.area-documental.com/): más de 2.000, de naturaleza, historia, ciencia, cultura, arte y más.

> Plugin no oficial. El catálogo y los videos pertenecen a area-documental.com; este plugin solo los lista y abre dentro de Kino.

## Instalar

En Kino: **Ajustes ▸ Plugins ▸ Agregar**, y pega:

```
xuper-plugin/kino-plugin-areadocumental
```

## Qué trae

- **Una sección propia** («Documentales», en Inicio en el teléfono y en la barra lateral en la TV) con cuatro pestañas: *Novedades*,
  *Temas* (una fila por tema), *Por año* y *De la A a la Z*, y un destacado con la carátula y la sinopsis del primero.
- **Inicio** con cuatro filas: *Recientes*, *Más vistos*, *Por año* y *De la A a la Z*, cada una con «Ver más» y páginas.
- **Categorías**: 24 de los 63 temas del sitio (Historia, Ciencia, Naturaleza, Arte, Cultura, Tecnología, Medicina, Biografías…), cada
  uno con su lista por páginas.
- **Series**: los capítulos sueltos del sitio («Vikingos Temporada 2 Ep 4-6») se agrupan en una serie con su temporada y sus capítulos.
- **Búsqueda** por título, y también **dentro de un tema o de una lista** («Buscar en esta categoría» usa la búsqueda del sitio).
- **Ficha** propia de cada documental (sinopsis, año, duración) y **reproducción** del video del sitio (MP4, HD cuando la hay) con
  **subtítulos en español e inglés**. El sitio solo entrega el video a quien lleva la cookie de sesión de su página de reproducción;
  el plugin se la pasa al reproductor. También se puede **descargar**.
- **Ajustes ▸ Area Documental**: agrupar o no los capítulos en series, y vaciar la caché.
- Las carátulas son las del propio sitio, y el icono es el logo del sitio (una cámara de cine sobre una tira de película).

## Límites

- Una serie sin «Ep N» en el título de sus capítulos (como *Cosmos*) sale como documentales sueltos.
- Cada temporada es una serie aparte, porque así las lista el sitio («Vikingos Temporada 1» y «Vikingos Temporada 2»).
- El sitio muestra los resultados de cinco en cinco.
- Si el sitio no abre la sesión del video, Kino lo dice («Prueba de nuevo») en vez de mostrar un video que no carga.

## Desarrollo

```
npm test            # pruebas sin red
npm run validate    # valida el manifiesto con el kit
node sdk/run.mjs ./plugin.js home
node sdk/run.mjs ./plugin.js resolve 'p:Helvetica'
```

Licencia Apache-2.0 (ver `LICENSE` y `NOTICE`).
