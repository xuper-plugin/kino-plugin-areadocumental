# Changelog

## 0.2.1

- `telemetry` added: with the person's consent, failed calls send their log lines to Kino's error log.
  / Se agrega `telemetry`: con permiso de la persona, las llamadas que fallan envían sus líneas al registro de errores de Kino.

## 0.2.0

- Uses more of Kino's plugin API: a **section of its own** ("Documentales", tabs novedades, temas, por año and A–Z, and a hero with the
  first title's cover and synopsis), **categories** (24 of the site's 63 topics), **series** (the episodes of "<name> Temporada 2 Ep 4-6"
  become one series item with its season and episodes, listed by the site's own series page), **search inside a "Ver más" page**
  (`scopedSearch`: the site's search restricted to the topic or sorted list), a **page of its own** for a documentary (`details`), a
  **settings form** (group episodes into series, clear the cache), a teal **theme** and the **download** capability. Needs Kino 0.9.55.
  / Aprovecha más la API de Kino: sección propia, 24 categorías por tema, series con sus capítulos, búsqueda dentro de cada lista o tema,
  ficha propia, ajustes, tema turquesa y descargas.

## 0.1.1

- The description names the four rows that exist. The icon is the site's own logo.
  / La descripción nombra las cuatro filas que existen. El icono es el logo del sitio.

## 0.1.0

- First version: four Home rows (recent, most watched, by year, A to Z), search, and playback of the MP4 of each documentary with its
  Spanish and English subtitles and its duration. The site serves the MP4 only to a request that carries the session cookie its
  player page sets, so resolve hands that cookie to the player.
  / Primera versión: cuatro filas de Inicio, búsqueda y reproducción del MP4 de cada documental con sus subtítulos en español e inglés.
