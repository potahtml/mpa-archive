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

const writeFile = (file, content, binary) => {
	content = binary
		? Buffer.from(content, 'binary')
		: Buffer.from(content, 'utf8')

	if (/(js|css|txt|html|webmanifest|manifest|\/)$/.test(file)) {
		content = content.toString().replaceAll(root, '/')
	}
	archive.addFile(
		decodeURIComponent(file)
			.replace(/^\//, '')
			.replace(/#.*/, '')
			.replace(/\?.*/, ''),
		content,
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
const wait = 1500

// saves crawled page

function onPageLoad(url, content) {
	url = !path.basename(url).includes('.')
		? url.replace(/\/$/, '') + '/index.html'
		: url

	writeFile(url, content)
}

// creates sitemap

function onDone(urls) {
	writeFile('sitemap.txt', urls.map(url => root + url).join('\n'))

	writeFile(
		'sitemap.xml',
		`<?xml version="1.0" encoding="UTF-8"?>
		<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
		  ${urls.map(
				url => `<url>
		    <loc>${root + url}</loc>
		  </url>
		  `,
			)}
		</urlset>`,
	)

	writeFile(
		'urls.txt',
		done.filter(url => url.startsWith(root)).join('\n'),
	)
}

// state

const urls = [root]
const done = []

function diff(o, t) {
	return o.filter(item => !t.includes(item))
}

// browser instances

const numInstances = os.cpus().length / 2

const chrome = await puppeteer.launch()

const browsers = []
for (let i = 0; i < numInstances; i++) {
	const page = await chrome.newPage()

	await page.setViewport({ width: 1920, height: 1080 })
	browsers.push({ page, status: 'idle' })

	// await page.setCacheEnabled(false)
	await page.setBypassServiceWorker(true)
	await page.setRequestInterception(true)
	await interceptAllTrafficForPageUsingFetch(page.target())

	page.on('request', async request => {
		await request.continue()
	})
	page.on('requestfinished', async request => {
		const url = request.url()
		const response = request.response()

		const body = await response.buffer().catch(() => {})

		saveRequest(url, body)
	})
}

chrome.on('targetcreated', async target => {
	await interceptAllTrafficForPageUsingFetch(target)
})
chrome.on('targetchanged', async target => {
	await interceptAllTrafficForPageUsingFetch(target)
})

async function interceptAllTrafficForPageUsingFetch(target) {
	const client = await target.createCDPSession()
	await client.send('Network.enable')
	await client.send('Network.setBypassServiceWorker', {
		bypass: true,
	})

	await client
		.send('Fetch.enable', {
			patterns: [
				{
					urlPattern: '*',
					requestStage: 'Response',
				},
			],
		})
		.catch(() => {})

	await client.on('Network.requestWillBeSent', async event => {
		await fetchURL(event.request.url)
	})

	await client.on(
		'Fetch.requestPaused',
		async ({ requestId, request }) => {
			const { url } = request
			await fetchURL(url)
			await client.send('Fetch.continueRequest', {
				requestId,
			})
		},
	)
}

function saveRequest(url, body) {
	if (url.startsWith(root) && !done.includes(url) && body) {
		total++
		console.log('✔ ', url.replace(root, ''))

		done.push(url)
		writeFile(url.replace(root, ''), body, true)
	} else {
		if (url.startsWith(root) && !done.includes(url)) {
			console.log('🤿', url.replace(root, ''))
		}
	}
}

async function fetchURL(url) {
	if (url.startsWith(root) && !done.includes(url)) {
		saveRequest(
			url,
			await fetch(url).then(response => response.arrayBuffer()),
		)
	}
}

// 🕷

let shutdown = false

async function crawl() {
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
				.goto(url, { waitUntil: 'networkidle0' })
				.then(() => {
					setTimeout(async () => {
						total++

						await page.bringToFront()

						await page.focus('body')

						const hrefs = await page.$$eval('[href]', as =>
							as.map(a => a.href),
						)

						const src = await page.$$eval('[src]', as =>
							as.map(a => a.src),
						)

						// const title = await page.evaluate(() => document.title)
						const html = await page.evaluate(
							() => document.documentElement.outerHTML,
						)

						const fetches = chrome
							.targets()
							.map(target => target.url())
							.map(url => fetchURL(url))

						await Promise.all(fetches)

						for (let href of hrefs) {
							href = href.replace(/#.*/, '').replace(/\?.*/, '')
							if (href.startsWith(root) && !done.includes(href)) {
								urls.push(href)
							}
						}

						for (let href of src) {
							if (href.startsWith(root) && !done.includes(href)) {
								urls.push(href)
							}
						}

						onPageLoad(shortURL, html)

						browser.status = 'idle'

						console.log('✔ ', shortURL)

						for (let i = 0; i < numInstances; i++) {
							crawl()
						}
					}, wait)
				})
				.catch(e => {
					console.error('\nCrawl failed, is', url, 'up and running?')
					console.error(e)
					deleteZip()
					process.exit()
				})
		} else {
			if (!browsers.find(browser => browser.status === 'busy')) {
				setTimeout(async () => {
					if (!shutdown) {
						shutdown = true
						await chrome.close()

						onDone(
							Array.from(
								new Set(urls.map(url => url.replace(root, ''))),
							),
						)

						archive.writeZip('crawl.zip')

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

						import('./server.js')
					}
				}, 5000)
			}
		}
	}
}

crawl()
