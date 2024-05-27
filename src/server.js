#!/usr/bin/env node

import mime from 'mime-types'
import http from 'node:http'
import AdmZip from 'adm-zip'
import path from 'node:path'

function contentType(mime) {
	switch (mime) {
		case 'application/jsx':
		case 'text/jsx':
		case 'application/javascript':
		case 'text/javascript':
			return 'application/javascript; charset=utf-8'
		case 'application/json':
		case 'text/json':
		case 'text/html':
		case 'text/xml':
		case 'text/css':
		case 'text/plain':
		case 'image/svg+xml':
			return mime + '; charset=utf-8'
		default:
			return mime
	}
}

function _decodeURIComponent(a) {
	try {
		return decodeURIComponent(a)
	} catch (e) {
		console.log(a)
		return a
	}
}

const zip = new AdmZip('crawl.zip')
const zipEntries = zip.getEntries()

const port = seeded_random(1025, 65534, path.resolve('.'))

http
	.createServer(function (req, res) {
		function serve(file, content) {
			const mimeType = mime.lookup(file)
			res.setHeader('Content-Type', contentType(mimeType))
			res.writeHead(200)
			res.end(content)
			console.log('🍽 ', file)
		}

		const file =
			_decodeURIComponent(
				req.url.replace(/^\//, '').replace(/\?.*/, ''),
			) || 'index.html'

		let found = false
		function find(file) {
			zipEntries.forEach(function (zipEntry) {
				// console.log(zipEntry.entryName)
				if (zipEntry.entryName == file) {
					found = true
					serve(file, zipEntry.getData())
				}
			})
		}

		find(file)

		if (!found) {
			// try with /index.html
			find(file + '/index.html')

			if (!found) {
				console.log('❌', file)
				res.setHeader('Content-Type', 'text/plain; charset=utf-8')
				res.writeHead(404)
				res.end('404 File not found: ' + file)
			}
		}
	})
	.listen({ host: '127.0.0.1', port })

console.log('\nServer Running on http://127.0.0.1:' + port + '\n')

function seeded_random(min, max, seed) {
	seed = xmur3(seed)()

	seed = (seed * 9301 + 49297) % 233280
	let rnd = seed / 233280

	return (min + rnd * (max - min)) | 0
}

function xmur3(str) {
	for (var i = 0, h = 1779033703 ^ str.length; i < str.length; i++)
		(h = Math.imul(h ^ str.charCodeAt(i), 3432918353)),
			(h = (h << 13) | (h >>> 19))
	return function () {
		h = Math.imul(h ^ (h >>> 16), 2246822507)
		h = Math.imul(h ^ (h >>> 13), 3266489909)
		return (h ^= h >>> 16) >>> 0
	}
}
