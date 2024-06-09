export function seededRandom(min, max, seed) {
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
