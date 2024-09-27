function _decodeURIComponent(a) {
	try {
		return decodeURIComponent(a)
	} catch (e) {
		console.warn('warn: decodeURIComponent failed', a)
		return a
	}
}

export function getRequestPathFromPath(path) {
	path = new URL('http://localhost' + path)

	return (
		_decodeURIComponent(path.pathname).replace(/^\/+/, '') +
		path.search.replace(/\?$/, '')
	)
}
export function getRequestPathWithoutQueryStringFromPath(path) {
	path = new URL('http://localhost' + path)

	return _decodeURIComponent(path.pathname).replace(/^\/+/, '')
}

let unamed = 0

export function getPathFromURL(path, origin) {
	if (!path.startsWith('http')) {
		return 'unamed/' + unamed++ + '-' + Date.now()
	}

	const url = new URL(path)

	// decode path name,
	path = _decodeURIComponent(url.pathname) + url.search

	// add index.html
	path = path.replace(/\/+$/, '/index.html')

	if (/\/[^/\.]+$/.test(path)) {
		path = path + '.html'
	}

	// remove slash
	path = path.replace(/^\//, '')

	// external domain
	if (origin !== url.origin) {
		path = url.origin.replace(/^https?:\/+/, '') + '/' + path
	}

	return path
}

export function removeHash(link) {
	try {
		link = new URL(link).href
		if (link.startsWith('http')) {
			/**
			 * It only replaces the hash # on http uris because data uris
			 * may contain hashes when these are svg
			 */
			return link.replace(/#.*/, '')
		}
		return link
	} catch (e) {
		return link
	}
}

export function shortURL(s = '') {
	return s.startsWith('http')
		? s.replace(/#.*$/, '')
		: s.length > 80
			? s.slice(0, 80) + '…'
			: s
}
