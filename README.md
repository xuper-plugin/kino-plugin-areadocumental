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

- **Inicio** con cuatro filas: *Recientes*, *Más vistos*, *Por año* y *De la A a la Z* (cada una con «Ver más» y páginas).
- **Búsqueda** por título.
- **Reproducción** del video del sitio (MP4, con la calidad HD cuando la hay) con **subtítulos en español e inglés** y la duración.
  El sitio solo entrega el video a quien lleva la cookie de sesión de su página de reproducción; el plugin se la pasa al reproductor.
- Las carátulas son las del propio sitio, y el icono es el logo del sitio (una cámara de cine sobre una tira de película).

## Límites

- Muchas entradas son capítulos de una serie y salen sueltas, con «Ep N» en el título; no se agrupan en una serie con sus temporadas.
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
