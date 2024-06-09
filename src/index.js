#!/usr/bin/env node

process.argv.slice(2).join('').trim()
	? import('./archive.js')
	: import('./server.js')
