#!/usr/bin/env node

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import fs from 'node:fs'
import os from 'node:os'

import { closeBrowser, crawl } from './lib/crawl.js'
import { getPathFromURL, removeHash, shortURL } from './lib/url.js'

import { blacklist } from './lib/blacklist.js'
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

/** @type {Record<string, Uint8Array>} */
let files = {}

const zipFile = `${cwd}/${hostname}.zip`

if (fs.existsSync(zipFile)) {
	try {
		files = unzipSync(fs.readFileSync(zipFile))
		urls =
			JSON.parse(strFromU8(files['mpa/state.json'])) || urls
	} catch (e) {}
} else {
	save()
}

urls.errors = []
urls.pending = []

urls.httpErrors = []

function save() {
	files['mpa/state.json'] = strToU8(JSON.stringify(urls, null, 2))
	fs.writeFileSync(zipFile, zipSync(files))
}

function writeFile(file, body, binary) {
	body = typeof body === 'number' ? body.toString() : body

	if (body === undefined) return

	if (typeof body === 'string') {
		files[file] = strToU8(body)
	} else if (body instanceof Uint8Array) {
		files[file] = body
	} else if (body instanceof ArrayBuffer) {
		files[file] = new Uint8Array(body)
	} else {
		files[file] = strToU8(String(body))
	}
}

// fetch sitemaps

fetch(origin + '/urls.txt')
	.then(response => response.text())
	.then(text =>
		text
			.trim()
			.split('\n')
			.map(url => url.trim())
			.filter(url => url.startsWith('/'))
			.map(url => origin + url)
			.forEach(url => urls.links.push(url)),
	)
	.catch(() => {})

fetch(origin + '/sitemap.txt')
	.then(response => response.text())
	.then(text =>
		text
			.trim()
			.split('\n')
			.map(url => url.trim())
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
		// when terminating, the browser sometimes errors when node exits
		process.on('exit', () => {})
		process.on('error', () => {})
		process.on('unhandledRejection', (reason, p) => {})
		process.on('uncaughtException', error => {})
	}
}

function onFile(url, body, binary, overWrite) {
	urls.done.push(url)

	// removes hash from url
	url = removeHash(url)

	urls.done.push(url)

	const path = getPathFromURL(url, origin)

	if (body === undefined) {
		// console.error('🛑 `undefined` body', url)
		return
	}

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
			!path.includes('.map') &&
			!path.includes('.json')
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
		if (String(error).includes('Navigation timeout')) {
			console.error('🛑🍳 ', 'Navigation timeout', url)
		} else {
			console.error('🛑🍳 ', url)
			console.error(error)
		}
		urls.errors.push(url)

		// try again via fetch on crawl error
		stats.running++

		console.log('🔗', shortURL(url))
		urls.pending.push(url)
		stats.fetched++

		fetchURL(url, true)
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
			.filter(url => !urls.pending.includes(url))
			.filter(url => {
				try {
					return !blacklist.includes(new URL(url).origin)
				} catch (e) {
					return false
				}
			})[0]
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
		.filter(url => !urls.queue.includes(url))
		.filter(url => {
			try {
				return !blacklist.includes(new URL(url).origin)
			} catch (e) {
				return false
			}
		})[0]
}

async function fetchURL(url, overWrite) {
	onFile(
		url,
		await fetch(url)
			.then(response => response.arrayBuffer())
			.catch(() => {
				console.error('🛑🔗 ', url)
				urls.errors.push(url)
			}),
		true,
		overWrite,
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

	writeFile(
		'mpa/sitemap.txt',
		crawled.join('\n').replaceAll(origin, ''),
	)

	writeFile(
		'mpa/sitemap.xml',
		`<?xml version="1.0" encoding="UTF-8"?>
		<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
		  ${crawled.map(url => `<url><loc>${escapeHTML(url).replace(origin, '')}</loc></url>`).join('\n')}
		</urlset>`,
	)

	writeFile('mpa/urls.txt', urls.done.join('\n'))
}

function unique(...a) {
	return [...new Set(a.flat(Infinity).filter(x => x))].sort()
}
