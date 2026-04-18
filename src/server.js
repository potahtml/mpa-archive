#!/usr/bin/env node

import http from 'node:http'
import fs from 'node:fs'

import { unzipSync, zipSync } from 'fflate'

import { contentType } from './lib/contentType.js'
import {
	getRequestPathFromPath,
	getRequestPathWithoutQueryStringFromPath,
} from './lib/url.js'
import { seededRandom } from './lib/seededRandom.js'

console.log()

const cwd = process.cwd()

const timeouts = {}

fs.promises
	.readdir(cwd)
	.then(files => files.map(file => /.zip$/.test(file) && serve(file)))

function serve(zipFile) {
	const domain = zipFile.replace('.zip', '')

	zipFile = cwd + '/' + zipFile

	/** @type {Record<string, Uint8Array>} */
	let files = unzipSync(fs.readFileSync(zipFile))

	const port = seededRandom(1025, 65534, domain)

	const server = http.createServer(async function (req, res) {
		const path = getRequestPathFromPath(req.url)
		const pathNoQuery = getRequestPathWithoutQueryStringFromPath(
			req.url,
		)

		const tryFiles = [
			path, // regular url
			path + '.html', // no extension
			path.replace(/\/+$/, '/index.html'), // urls ending with slash
			path + '/index.html', // main page '/'
			pathNoQuery, //
			pathNoQuery.replace(/\/+$/, '/index.html'),
			pathNoQuery + '/index.html',
		].map(s => s.replace(/^\/+/, ''))

		function serve(file, path, data) {
			res.setHeader('Content-Type', contentType(file))
			res.setHeader('Pragma', 'public')
			res.setHeader('Cache-Control', 'public, max-age=180')

			res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
			res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')

			res.writeHead(200)
			res.end(Buffer.from(data))
			console.log(
				`🍽  ${domain}/${file === path ? path : `${path} -> /${file}`}`,
			)
		}
		function notfound(path) {
			res.setHeader('Content-Type', 'text/plain; charset=utf-8')
			res.setHeader('Pragma', 'public')
			res.setHeader('Cache-Control', 'public, max-age=180')
			res.writeHead(404)
			res.end(`404 Not Found: ${domain}/${path}`)
			console.log(`❌ ${domain}/${path}`)
		}

		for (const file of tryFiles) {
			const entry = files[file]

			if (entry) {
				serve(file, path, entry)
				return
			}
		}

		// index Of
		if (path === '' || path === '/' || path === '/index.html') {
			let content = '<h1>index of ' + domain + '</h1><ul>'
			for (const name of Object.keys(files)) {
				content +=
					'<li><a href="/' +
					name +
					'">' +
					name +
					'</a></li>'
			}
			content += '</ul>'

			res.setHeader('Content-Type', 'text/html; charset=utf-8')
			res.setHeader('Pragma', 'public')
			res.setHeader('Cache-Control', 'public, max-age=180')
			res.writeHead(200)
			res.end(content)
			return
		}

		// 404
		console.log(`🔗 ${domain}/${path}`)

		// fetch it from the server
		fetch(`https://${domain}/${path}`)
			.then(async response => {
				if (response.status >= 400) {
					console.log(`⚠ ${response.status} ${domain}/${path}`)
					notfound(path)
				} else {
					const result = await response.arrayBuffer()
					files[path] = new Uint8Array(result)

					console.log(`✔  ${domain}/${path}`)

					clearTimeout(timeouts[domain])
					timeouts[domain] = setTimeout(() => {
						fs.writeFileSync(zipFile, zipSync(files))
					}, 5000)

					serve(path, path, files[path])
				}
			})
			.catch(e => {
				console.log(e)
				notfound(path)
			})
	})

	server.on('error', () => {})
	server.listen({ host: '0.0.0.0', port })

	console.log(`🖥  http://localhost:${port} for ${domain}\n`)
}
