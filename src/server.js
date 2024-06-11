#!/usr/bin/env node

import http from 'node:http'
import fs from 'node:fs'

import AdmZip from 'adm-zip'

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

	let zip = new AdmZip(zipFile)

	let entries = zip.getEntries()

	const port = seededRandom(1025, 65534, zipFile)

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
			const entry = entries.find(
				zipEntry => zipEntry.entryName == file,
			)

			if (entry) {
				serve(file, path, entry.getData().slice(0))

				return
			}
		}

		// index Of
		if (path === '' || path === '/' || path === '/index.html') {
			let content = '<h1>index of ' + domain + '</h1><ul>'
			for (let entry of entries) {
				content +=
					'<li><a href="/' +
					entry.entryName +
					'">' +
					entry.entryName +
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
					zip.addFile(path, Buffer.from(result.slice(0), 'binary'))

					console.log(`✔  ${domain}/${path}`)

					clearTimeout(timeouts[domain])
					timeouts[domain] = setTimeout(() => {
						zip.writeZip(zipFile)
						// if we dont reopen it then it crashes with `getEntries`
						zip = new AdmZip(zipFile)
						entries = zip.getEntries()
					}, 5000)

					serve(path, path, result.slice(0))
				}
			})
			.catch(e => {
				console.log(e)
				notfound(path)
			})
	})

	server.on('error', () => {})
	server.listen({ host: 'localhost', port })

	console.log(`🖥  http://localhost:${port} for ${domain}\n`)
}
