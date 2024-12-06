watch: install
	NODE_ENV=development node build.mjs&
	cd src && python3 server.py

install:
	npm install

build: install
	NODE_ENV=production node build.mjs
	cp -r resources/* dist/