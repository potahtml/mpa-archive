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

fs.promises
	.readdir(cwd)
	.then(files => files.map(file => /.zip$/.test(file) && serve(file)))

function serve(zipFile) {
	const domain = zipFile.replace('.zip', '')

	zipFile = cwd + '/' + zipFile

	const zip = new AdmZip(zipFile)

	const entries = zip.getEntries()

	const port = seededRandom(1025, 65534, zipFile)

	const server = http.createServer(function (req, res) {
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

		for (const file of tryFiles) {
			const entry = entries.find(
				zipEntry => zipEntry.entryName == file,
			)

			if (entry) {
				res.setHeader('Content-Type', contentType(file))
				res.setHeader('Pragma', 'public')
				res.setHeader('Cache-Control', 'public, max-age=180')
				res.writeHead(200)
				res.end(entry.getData())
				console.log(
					`🍽  ${domain}/${file === path ? path : `${path} -> /${file}`}`,
				)
				return
			}
		}

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
		res.setHeader('Content-Type', 'text/plain; charset=utf-8')
		res.setHeader('Pragma', 'public')
		res.setHeader('Cache-Control', 'public, max-age=180')
		res.writeHead(404)
		res.end(`404 Not Found: ${domain}/${path}`)
		console.log(`❌ ${domain}/${path}`)
	})

	server.on('error', () => {})
	server.listen({ host: 'localhost', port })

	console.log(`🖥  http://localhost:${port} for ${domain}\n`)
}
