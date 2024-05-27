# Multi-Page Application Archive

Crawls a Multi-Page Application into a zip file. Serve the Multi-Page
Application from the zip file. A MPA archiver. Could be used as a Site
Generator.

## Installation

`npm install -g mpa-archive`

## Crawling

`mpa-archive http://urlhere`

Will create and save the crawled site in `crawl.zip` on `cwd`

- Crawls `http://urlhere` with `cpu/2` threads
- Progress is displayed in the console
- Crawls on site links only
- Intercepts on site requests and saves that too
- Generates `sitemap.txt` and `sitemap.xml`

Once done, it will display a small report and create a zip file named
`crawl.zip` on `cwd`

## Serving

`mpa-server`

Will serve the files from the zip located in the current directory.
Host is `127.0.0.1` with a port seeded to `cwd`
