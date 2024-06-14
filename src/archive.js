#!/usr/bin/env node

import os from 'node:os'
import fs from 'node:fs'
import AdmZip from 'adm-zip'

import { crawl, closeBrowser } from './lib/crawl.js'
import { getPathFromURL, removeHash, shortURL } from './lib/url.js'

import { escapeHTML, unescapeHTML } from './lib/html.js'

console.log()

// arguments

const cwd = process.cwd()

const args = process.argv.slice(2)
const uri = args.shift()

const options = {
	originalHTML:
		args.includes('--original-html') || args.includes('--spa'),
	originalURLS:
		args.includes('--original-urls') || args.includes('--spa'),
}

const url = new URL(uri)

const root = url.href
const hostname = url.hostname
const origin = url.origin

// state

const time = Date.now()
const instances = os.cpus().length / 2

function createUrls() {
	return {
		/** @type string[] */
		done: [],
		/** @type string[] */
		queue: [root],
		/** @type string[] */
		links: [],
		/** @type string[] */
		focused: [],

		/** @type string[] */
		errors: [],
		/** @type string[] */
		pending: [],

		/** @type string[] */
		saved: [],
		/** @type string[] */
		httpErrors: [],
	}
}

let urls = createUrls()

const stats = {
	running: 0,
	crawled: 0,
	fetched: 0,
}

// zip file

let zip

const zipFile = `${cwd}/${hostname}.zip`

if (!fs.existsSync(zipFile)) {
	zip = new AdmZip()
	save()
} else {
	zip = new AdmZip(zipFile)
	try {
		urls = JSON.parse(zip.readFile('mpa/state.json')) || urls
	} catch (e) {}
}

urls.errors = []
urls.pending = []

urls.httpErrors = []

function save() {
	zip.addFile('mpa/state.json', JSON.stringify(urls, null, 2))
	zip.writeZip(zipFile)
}

function writeFile(file, body, binary) {
	body = typeof body === 'number' ? body.toString() : body

	zip.addFile(
		file,
		binary ? Buffer.from(body, 'binary') : Buffer.from(body, 'utf8'),
	)
}

// fetch sitemaps

fetch(origin + '/sitemap.txt')
	.then(response => response.text())
	.then(text =>
		text
			.replaceAll('"', '\n')
			.replaceAll("'", '\n')
			.replaceAll(' ', '\n')
			.split('\n')
			.filter(url => url.startsWith(root))
			.forEach(url => urls.queue.push(url)),
	)
	.catch(() => {})

fetch(origin + '/sitemap.xml')
	.then(response => response.text())
	.then(text =>
		text
			.replaceAll('<loc>', '\n')
			.replaceAll('</loc>', '\n')
			.replaceAll('"', '\n')
			.replaceAll("'", '\n')
			.replaceAll(' ', '\n')
			.split('\n')
			.filter(url => url.startsWith(root))
			.forEach(url => urls.queue.push(unescapeHTML(url))),
	)
	.catch(() => {})

// 🕷

function next() {
	while (stats.running < instances) {
		const url = nextPage()
		if (url) {
			stats.running++

			console.log('🍳', shortURL(url))
			urls.pending.push(url)
			stats.crawled++

			crawl(url, onFile, onCrawl, urls, origin)
		} else {
			break
		}
	}

	while (stats.running < instances) {
		const url = nextLink()
		if (url) {
			stats.running++

			console.log('🔗', shortURL(url))
			urls.pending.push(url)
			stats.fetched++

			fetchURL(url)
		} else {
			break
		}
	}

	if (stats.running === 0) {
		closeBrowser()

		sitemap()

		save()

		console.log()

		const elapsed = ((Date.now() - time) / 1000) | 0

		console.log(
			`🍣  ${hostname}.zip

			- ${stats.crawled} pages crawled
			- ${stats.fetched} from fetch
			- ${urls.saved.length} saved files
			- ${urls.done.length} done
			- ${urls.queue.length} queued
			- ${urls.links.length} links
			- ${urls.errors.length} crawl/fetch errors
			- ${urls.httpErrors.length} http errors

			in ${elapsed < 60 ? elapsed + ' seconds' : Math.ceil(elapsed / 60) + '~ minutes'}`
				.split('\n')
				.map(s => s.trim())
				.join('\n'),
		)

		if (urls.httpErrors.length) {
			console.log(
				'\n⚠  HTTP Errors:\n\n' + unique(urls.httpErrors).join('\n'),
			)
		}

		console.log(
			'\nRun `mpa` to serve the crawled pages from the zips',
		)
	}
}

function onFile(url, body, binary, overWrite) {
	urls.done.push(url)

	// removes hash from url
	url = removeHash(url)

	urls.done.push(url)

	const path = getPathFromURL(url, origin)

	if (!urls.saved.includes(path) || overWrite) {
		urls.saved.push(path)

		// do not save the browser generated html
		if (options.originalHTML && overWrite) {
			return
		}

		if (
			!options.originalURLS &&
			(!binary ||
				(!(body instanceof ArrayBuffer) &&
					/(js|jsx|css|html|webmanifest|manifest|html|map)$/.test(
						path,
					)))
		) {
			// make absolute links relative
			body = body.toString().replaceAll(origin, '')
		}

		// get urls of assets from css
		if (path.includes('.css')) {
			for (const match of body
				.toString()
				.matchAll(/url\(([^\)]+)\)/g)) {
				const src = match[1]
					.replace(/^('|")/, '')
					.replace(/('|")$/, '')

				if (!src.startsWith('data:')) {
					if (!src.startsWith('http:')) {
						urls.links.push(new URL(src, origin).href)
					} else {
						urls.links.push(src)
					}
				}
			}
		}

		// save source maps for internal files
		if (
			url.startsWith(origin) &&
			/\.(js|jsx|css)/.test(path) &&
			!path.includes('.map')
		) {
			urls.links.push(url.replace(/\.(jsx|js|css)/, '.$1.map'))
		}

		writeFile(path, body, binary)

		console.log(overWrite ? '🧭' : '✔ ', shortURL(url))

		if (urls.saved.length % 250 === 0) {
			save()
		}
	}
}

async function onCrawl(url, error) {
	stats.running--

	if (error) {
		console.error('🛑 ', url)
		console.error(error)
		urls.errors.push(url)
	}

	next()
}

next()

function nextPage() {
	return (
		urls.queue
			.filter(x => x)
			/** Should crawl from `root` */
			.filter(url => url.startsWith(root))
			.map(url => url.replace(/#.*/, ''))
			.filter(url => !urls.done.includes(url))
			.filter(url => !urls.errors.includes(url))
			.filter(url => !urls.pending.includes(url))[0]
	)
}

function nextLink() {
	return urls.links
		.filter(x => x)
		.filter(url => /^https?:\/\//.test(url))
		.map(url => url.replace(/#.*/, ''))
		.filter(url => !urls.done.includes(url))
		.filter(url => !urls.errors.includes(url))
		.filter(url => !urls.pending.includes(url))
		.filter(url => !urls.queue.includes(url))[0]
}

async function fetchURL(url) {
	onFile(
		url,
		await fetch(url)
			.then(response => response.arrayBuffer())
			.catch(() => {
				console.error('🛑 ', url)
				urls.errors.push(url)
			}),
		true,
	)

	stats.running--

	next()
}

export function sitemap() {
	urls.done = unique(urls.done)
	urls.queue = unique(urls.queue)
	urls.links = unique(urls.links)
	urls.errors = unique(urls.errors)
	urls.pending = unique(urls.pending)
	urls.saved = unique(urls.saved)
	urls.httpErrors = unique(urls.httpErrors)

	const crawled = unique(
		urls.queue.map(url => url.replace(/#.*/, '')),
	).filter(url => url.startsWith(root))

	writeFile('mpa/sitemap.txt', crawled.join('\n'))

	writeFile(
		'mpa/sitemap.xml',
		`<?xml version="1.0" encoding="UTF-8"?>
		<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
		  ${crawled.map(url => `<url><loc>${escapeHTML(url)}</loc></url>`).join('\n')}
		</urlset>`,
	)

	writeFile('mpa/urls.txt', urls.done.join('\n'))
}

function unique(...a) {
	return [...new Set(a.flat(Infinity).filter(x => x))].sort()
}
