import mime from 'mime-types'

export function contentType(path) {
	const mimeType = mime.lookup(path)

	switch (mimeType) {
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
			return mimeType + '; charset=utf-8'
		default:
			return mimeType
	}
}
