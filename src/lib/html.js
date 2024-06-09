export const escapeHTML = (() => {
	const chars = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		"'": '&#39;',
		'"': '&quot;',
	}

	const search = /[&<>'"]/g
	const replace = c => chars[c]

	return function (s) {
		return s.replace(search, replace)
	}
})()

export const unescapeHTML = (() => {
	const chars = {
		'&amp;': '&',
		'&#38;': '&',
		'&lt;': '<',
		'&#60;': '<',
		'&gt;': '>',
		'&#62;': '>',
		'&apos;': "'",
		'&#39;': "'",
		'&quot;': '"',
		'&#34;': '"',
	}

	const search = /&(?:amp|#38|lt|#60|gt|#62|apos|#39|quot|#34);/g
	const replace = c => chars[c]

	return function (s) {
		return s.replace(search, replace)
	}
})()
