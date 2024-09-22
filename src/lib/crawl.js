import puppeteer from 'puppeteer'
import { shortURL } from './url.js'

const wait = 2000

const chrome = await puppeteer.launch({
	headless: true,
	args: [
		'--ash-no-nudges',
		'--deny-permission-prompts',
		'--disable-background-timer-throttling',
		'--disable-backgrounding-occluded-windows',
		'--disable-client-side-phishing-detection',
		'--disable-default-apps',
		'--disable-extensions',
		'--disable-features=TranslateUI,Translate,InfiniteSessionRestore',
		'--disable-infobars',
		'--disable-ipc-flooding-protection',
		'--disable-notifications',
		'--disable-renderer-backgrounding',
		'--disable-session-crashed-bubble',
		'--ignore-certificate-errors',
		'--mute-audio',
		'--no-default-browser-check',
		'--no-first-run',
		'--start-maximized',
	],
	protocolTimeout: 300_000,
	userDataDir: './chrome',
	defaultViewport: null,
})

export async function crawl(url, onFile, onCrawl, urls, origin) {
	// create new tab
	const page = await chrome.newPage()

	// settings
	await Promise.all([
		page.setBypassServiceWorker(true),
		page.setRequestInterception(true),
		page.setCacheEnabled(true),
	])

	// to try to catch as many links as possible
	const client = await page.createCDPSession()
	await client
		.send('Fetch.enable', {
			patterns: [
				{
					urlPattern: '*',
					requestStage: 'Request',
				},
			],
		})
		.catch(noop)

	await client.on(
		'Fetch.requestPaused',
		async ({ requestId, request }) => {
			urls.links.push(request.url)
			await client
				.send('Fetch.continueRequest', {
					requestId,
				})
				.catch(noop)
		},
	)

	await client.send('Network.enable').catch(noop)
	await client
		.send('Network.setBypassServiceWorker', {
			bypass: true,
		})
		.catch(noop)
	await client.on('Network.requestWillBeSent', async event => {
		urls.links.push(event.request.url)
	})

	// listeners
	page.on('request', request => {
		urls.links.push(request.url())
		request.continue()
	})
	page.on('response', request => {
		urls.links.push(request.url())
	})

	page.on('requestfinished', async request => {
		const url = request.url()

		if (!urls.done.includes(url)) {
			urls.links.push(url)

			const response = request.response()
			const headers = response.headers()
			const status = response.status()
			const body = await response.buffer().catch(noop)

			const binary = isBinary(request.resourceType())

			if (
				status !== 200 &&
				status !== 304 &&
				status !== 204 &&
				status !== 206
			) {
				console.log(
					'⚠ ',
					status +
						' ' +
						url +
						(headers.location ? ' -> ' + headers.location : ''),
				)
				urls.httpErrors.push(
					status +
						' ' +
						url +
						(headers.location ? ' -> ' + headers.location : ''),
				)
			}

			// response has no body when the response is a redirect
			body && onFile(url, body, binary)
		}
	})

	// focus page
	focus(page)

	// load
	async function onLoad(error) {
		await focus(page)

		await parseLinks(page, urls)

		await sleep(wait)

		await focus(page)

		const html = await evaluate(
			page,
			() => '<!DOCTYPE html>\n' + document.documentElement.outerHTML,
		)

		onFile(url, html, false, true)

		const pageURL = page.url()

		// for redirects, save with new url
		if (url !== pageURL) {
			onFile(pageURL, html, false, true)
		}

		await parseLinks(page, urls)

		// hover and focus links for modern websites that preload on hover
		const links = await page.$$('a')
		for (const link of links) {
			const href = String(
				await page.evaluate(link => link.href, link),
			).replace(/#.*/, '')

			if (!urls.focused.includes(href) && href.startsWith(origin)) {
				urls.focused.push(href)

				console.error('🧽', shortURL(href))

				await focus(page)
				await link.hover().catch(noop)
				await link.focus().catch(noop)
				await sleep(500)
			}
		}

		closeTab(page)

		onCrawl(url, error)
	}

	// load page
	page
		.goto(url, { waitUntil: 'networkidle0' })
		.then(() => onLoad())
		.catch(error => onLoad(error))
}

function parseLinks(page, urls) {
	chrome.targets().forEach(r => urls.links.push(r.url()))
	page.workers().forEach(r => urls.links.push(r.url()))
	page.frames().forEach(r => urls.queue.push(r.url()))

	const addLinks = r => r.forEach(url => urls.links.push(url))
	const addQueue = r => r.forEach(url => urls.queue.push(url))

	return Promise.all([
		evaluate(page, () =>
			window.performance.getEntries().map(r => r.name),
		).then(addLinks),
		query(page, 'a', r => r.map(r => r.href)).then(addQueue),
		query(page, '[href]', r => r.map(r => r.href)).then(addLinks),
		query(page, '[src]', r => r.map(r => r.src)).then(addLinks),
	])
}

// utils

async function focus(page) {
	await page.bringToFront().catch(onError())

	return Promise.all([
		page.evaluate(() => window.focus()).catch(noop),
		page.focus('body').catch(noop),
	])
}
function query(page, query, cb) {
	return page.$$eval(query, cb).catch(onError())
}
function evaluate(page, cb) {
	return page.evaluate(cb).catch(onError())
}
function closeTab(page) {
	page.close({ runBeforeUnload: false })
}
export function closeBrowser() {
	return chrome.close().catch(onError())
}

function noop() {}

function sleep(time) {
	return new Promise(resolve => setTimeout(resolve, time))
}

function onError() {
	const stack = new Error().stack
	return e => {
		console.log('------------------------------')
		console.log(String(e))
		console.log(stack)
		console.log('------------------------------')
	}
}

function isBinary(type) {
	switch (type) {
		case 'document':
		case 'stylesheet':
		case 'manifest':
		case 'script':
			return false
		default:
			return true
	}
}
