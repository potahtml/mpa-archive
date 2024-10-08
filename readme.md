# Multi-Page Application Archive

Crawls a Multi-Page Application into a zip file. Serve the Multi-Page
Application from the zip file. A MPA archiver. Could be used as a Site
Generator.

## Installation

`npm install -g mpa-archive`

## Usage

### Crawling

`mpa http://example.net`

Will crawl the url recursively and save it in `example.net.zip`. Once
done, it will display a report and can serve the files from the zip.

#### SPA mode

The original idea is to save the HTML generated by JavaScript, to
allow search engines index the content of a website that uses
JavaScript. This has the undesired result that some applications,
specially SPA may not work. To save the original HTML instead of the
rendered HTML you can use the `--spa` option, which will save the
original HTML and avoid re-writing links.

`mpa https://example.net --spa`

### Serving

`mpa`

Will create a server for each zip file on the current directory. binds
to `0.0.0.0` (it can be opened in `localhost`) the `port` is random
but seeded to the zip file name, so it remains the same.

## Features

- It uses headless puppeteer
- Crawls `http://example.net` with `cpu count / 2` threads
- Progress is displayed in the console
- Fetches `urls.txt` , `sitemap.txt` and `sitemap.xml` as a seed point
- It serializes Custom Elements too
- Reports HTTP status codes different than 200, 304, 204, 206
- Crawls on site urls only but will `fetch` external resources
- Intercepts site resources and saves that too
- Generates `mpa/sitemap.txt` and `mpa/sitemap.xml`
- Saves site sourcemaps
- Can resume if process exit, save checkpoint every 250 urls
- When serving what has been crawled, if an url is not found it will
  fetch it from source and update the zip
- domain blacklist
  https://github.com/potahtml/mpa-archive/blob/master/src/lib/blacklist.js
- downloads are saved via `fetch` requests

## Legends

- 🍳 a `url` has been opened in a tab for crawling
- 🧽 `a` link on page has been focused (for when js modules are
  preloaded/loaded on focus)
- ⚠ response headers contains a status code differently than 200,
  304, 204, 206
- 🧭 the `document.documentElement.outerHTML` has been saved
- ✔ the response of a `fetch` request has been saved, or the response
  body of a request made by the tab has been saved
- 🔗 a `fetch` request has been fired
- 🛑🍳 the opened tab gave an error (it retries with via a `fetch`
  request)
- 🛑🔗 a fetch request gave en error

## To Consider

- save it in an incremental compression format, that doesnt require
  re-compressing the whole file when it changes, maybe already does
  that?
- urls to externals resources are not re-written to be local
  resources, if this is done then stuff loaded from the root will
  break
- it should maybe crawl the site by clicking the links instead of
  opening a full tab
- crawl updates
