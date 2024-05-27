#!/usr/bin/env node

import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

import puppeteer from 'puppeteer'
import AdmZip from 'adm-zip'

const root = (process.argv.slice(2).join('') + '/').replace(
	/\/+$/,
	'/',
)

console.log('\nAbout to crawl', root, '\n')

// creates and writes files to a zip file

const archive = new AdmZip()

process.on('exit', async () => {
	archive.writeZip('crawl.zip')
})

const writeFile = (file, content, binary) => {
	archive.addFile(
		decodeURIComponent(file).replace(/^\//, ''),
		binary
			? Buffer.from(content, 'binary')
			: Buffer.from(content, 'utf8'),
	)
}

function deleteZip() {
	try {
		fs.rmSync('crawl.zip')
	} catch (e) {}
}
deleteZip()

// const

let total = 0

const time = Date.now()
const wait = 250

// saves crawled page

function onPageLoad(url, content) {
	url = !path.basename(url).includes('.')
		? url.replace(/\/$/, '') + '/index.html'
		: url

	writeFile(url, content)
}

// creates sitemap

function onDone(urls) {
	// sitemap.txt

	writeFile(
		'sitemap.txt',
		urls.map(url => root + '' + url).join('\n'),
	)

	// sitemap.xml

	writeFile(
		'sitemap.xml',
		`<?xml version="1.0" encoding="UTF-8"?>
		<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
		  ${urls.map(
				url => `<url>
		    <loc>${root + '' + url}</loc>
		  </url>
		  `,
			)}
		</urlset>`,
	)
}

// state

const urls = [root]
const done = []

function diff(o, t) {
	return o.filter(item => !t.includes(item))
}

// browser instances

const chrome = await puppeteer.launch()
const browsers = []
for (let i = 0; i < os.cpus().length / 2; i++) {
	const page = await chrome.newPage()
	await page.setViewport({ width: 1920, height: 1080 })
	browsers.push({ page, status: 'idle' })
	await page.setRequestInterception(true)
	page.on('request', request => {
		request.continue()
	})
	page.on('requestfinished', async request => {
		const url = request.url()
		const response = request.response()

		let body
		if (request.redirectChain().length === 0) {
			// body can only be access for non-redirect responses
			body = await response.buffer().catch(() => {})
		}

		if (url.startsWith(root) && !done.includes(url) && body) {
			total++
			console.log('✔ ', url.replace(root, ''))

			done.push(url)
			writeFile(url.replace(root, ''), body, true)
		}
	})
}

// 🕷

function crawl() {
	const browser = browsers.find(browser => browser.status === 'idle')
	if (browser) {
		const url = diff(urls, done)[0]
		if (url) {
			const shortURL = url.replace(root, '')

			console.log('🕷 ', shortURL)

			browser.status = 'busy'
			done.push(url)

			const page = browser.page

			page
				.goto(url)
				.then(() => {
					setTimeout(async () => {
						total++

						const hrefs = await page.$$eval('a', as =>
							as.map(a => a.href),
						)
						// const title = await page.evaluate(() => document.title)
						const html = await page.evaluate(
							() => document.documentElement.outerHTML,
						)

						browser.status = 'idle'

						for (let href of hrefs) {
							href = href.replace(/#.*/, '').replace(/\?.*/, '')

							if (href.startsWith(root) && !done.includes(href)) {
								urls.push(href)
								crawl()
							}
						}

						onPageLoad(shortURL, html.replaceAll('"' + root, '"/'))

						console.log('✔ ', shortURL)

						crawl()
					}, wait)
				})
				.catch(() => {
					console.error('\nCrawl failed, is', url, 'up and running?')
					deleteZip()
					process.exit()
				})
		} else {
			if (!browsers.find(browser => browser.status === 'busy')) {
				chrome.close()

				onDone(
					Array.from(new Set(urls.map(url => url.replace(root, '')))),
				)

				console.log(
					'\nCrawled',
					total,
					'pages from',
					root,
					'in',
					((Date.now() - time) / 1000) | 0,
					'seconds into `crawl.zip`',
				)
				console.log(
					'\nRun `mpa-server` to serve the crawled pages from the zip',
				)
			}
		}
	}
}

crawl()
