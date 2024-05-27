# Multi-Page Application Archive

Crawls a Multi-Page Application into a zip file. Serve the Multi-Page
Application from the zip file. A MPA archiver. Could be used as a Site
Generator.

## Installation

`npm install -g mpa-archive`

## Crawling

`mpa-archive http://urlhere`

This will start crawling `http://urlhere` with `cpu/2` threads.
Progress will be displayed in the console. Besides crawling on site
links, it will also intercept request and save that too. Once done it
will display a small report and create a zip file on `cwd` named
`crawl.zip`.

## Serving

`mpa-server`

This will serve the files from the zip file on `127.0.0.1` with a port
seeded to the `cwd`
