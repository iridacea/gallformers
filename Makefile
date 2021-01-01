SERVICE_NAME := gallformers
LOCAL_SRC := ${PWD}/prisma
SERVER_SRC := /mnt/gallformers_data/prisma
DST := /usr/src/app/prisma

env:
ifeq (,$(wildcard .env-local))
	$(error You must have an .env-local file to build and run!)
endif

.PHONY: build
build:
	docker-compose build

.PHONY: run-local
run-local:
	docker run -v $(LOCAL_SRC):$(DST) --env-file .env.local --env-file .env.development --name $(SERVICE_NAME) -p 3000:3000 -d $(SERVICE_NAME):latest
	docker start $(SERVICE_NAME)

.PHONY: stop
stop:
	docker stop $(SERVICE_NAME)
	docker rm $(SERVICE_NAME)

.PHONY: restart-local
restart-local: stop run-local

# TODO move to publish to repo - as this is, a manual step of copying the tar to the server is required.
.PHONY: save-image
save-image:
	docker save $(SERVICE_NAME):latest > $(SERVICE_NAME)-docker.tar


##### The rest of this stuff is for the server side.
.PHONY: redeploy-and-run
redeploy-and-run: load-image run

.PHONY: run
run:
	docker run -v $(SERVER_SRC):$(DST) --env-file .env.local --env-file .env.production --name $(SERVICE_NAME) -p 3000:3000 -d $(SERVICE_NAME):latest --restart unless-stopped
	docker start $(SERVICE_NAME)

.PHONY: restart
restart: stop run

# TODO this is not the step we really want, should pull new image from repo
.PHONY: load-image
load-image: stop
	docker load < $(SERVICE_NAME)-docker.tar


# copy the database to the mounted volume
.PHONY: update-database
update-database:
	cp -r prisma /mnt/gallformers_data 


# this is for getting the server setup initially
.PHONY: bootstrap
bootstrap:
	apt-get install haveged
	update-rc.d haveged defaults

	ufw allow 80
	ufw allow 443
	ufw enable

	apt-get install nginx-full
	ln -s nginx/nginx.conf /etc/nginx/conf.d/nginx.conf

	install core
	snap refresh core

	snap install --classic certbot
	ln -s /snap/bin/certbot /usr/bin/certbot	
	
	# gets the certs and installs them changing the nginx configuration
	certbot --nginx

	