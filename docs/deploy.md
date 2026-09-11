# Provisioning della VPS

Runbook per preparare da zero una VPS Netcup con Debian 13 (trixie) a ospitare Pantry.
Da eseguire una sola volta. Ogni fase finisce con una verifica: non passare alla successiva
se non torna.

Ci sono due modi diversi di arrivare alla macchina, e conviene non confonderli:

| dove | come ci arrivi | a cosa serve |
|---|---|---|
| **console VNC** | browser, pannello netcup | soltanto due cose: leggere il fingerprint alla Fase 0, ed essere la via di fuga se ci si chiude fuori. Non si lavora qui: niente copia-incolla e layout di tastiera US |
| **sessione SSH** | `ssh ...` da Git Bash | tutto il resto |

Convenzione dei blocchi in questo documento:

- **[locale]** — su Windows, in Git Bash
- **[vps]** — **nella sessione SSH**, mai nella console VNC
- **[console]** — nella console VNC del pannello

---

## Fase 0 — la via di fuga

Prima di toccare la configurazione SSH, verifica di saper aprire la **console VNC** dal pannello
Netcup (SCP → il tuo server → Console). È l'unico modo per rientrare se ti chiudi fuori da solo,
ed è inutile scoprire come funziona *dopo* essersi chiusi fuori.

Approfittane per leggere il **fingerprint della chiave host**. Netcup non lo mostra nel pannello,
e va preso da un canale che non sia la connessione SSH stessa — altrimenti non verifica niente.
La console VNC è quel canale. Accedi come root (la password non appare mentre la digiti: è
normale) e lancia **[console]**:

```
ssh-keygen -lvf /etc/ssh/ssh_host_ed25519_key.pub
```

`ssh-keygen -l` legge soltanto: non genera nulla, malgrado il nome, e si può rilanciare a volontà.

È la chiave che il client OpenSSH preferirà. Conservala nel password manager; tornerà utile allo
Step 5, dove GitHub Actions ha bisogno di `SSH_KNOWN_HOSTS` per non collegarsi alla cieca.

**Dalla console VNC non si può copiare testo**: VNC trasmette pixel, e la funzione appunti di
noVNC funziona solo in entrata. Ma non serve copiare, serve confrontare — ed è per questo che il
comando qui sopra usa `-v`, che stampa il fingerprint anche come immagine ASCII. Alla Fase 1.3
collegati con `ssh -o VisualHostKey=yes root@<IP>`: confrontare due disegni affiancati è molto
meno soggetto a errori che confrontare due stringhe base64.

Nota anche il layout: la console VNC interpreta i tasti come **US**, mentre la tastiera è
italiana. Se la password di root viene rifiutata ed è sicuramente giusta, è quasi sempre questo:
usa il pannello appunti di noVNC per inviarla, che aggira il problema.

Una volta accettata la chiave, la si rilegge senza console con `ssh-keygen -lv -F <IP>`.

Se un giorno reinstalli la VPS dal pannello, le chiavi host vengono rigenerate e ssh rifiuterà di
connettersi con un avviso allarmante: è corretto, si risolve con `ssh-keygen -R <IP>` e una nuova
verifica.

> `ssh-keyscan` **non** è un modo per verificare il fingerprint: interroga la macchina attraverso
> la rete, cioè lo stesso canale di cui si dovrebbe diffidare. Va bene solo come comodità dopo
> aver verificato via VNC.

---

## Fase 1 — chiave SSH e utente `deploy`

È la fase in cui ci si può chiudere fuori. La regola è una sola: **non chiudere la sessione di
root finché non hai provato, da un secondo terminale, che l'accesso come `deploy` funziona.**

> **Due chiavi diverse, da non confondere.** La chiave letta alla Fase 0 è la **chiave host**:
> appartiene alla VPS, l'ha generata Debian al primo avvio, e serve alla macchina per dimostrare a
> te di essere sé stessa. La chiave che generi qui sotto è la **tua chiave utente**: serve a te per
> dimostrare alla macchina di essere tu. Non coincidono e non devono: sono le due direzioni della
> stessa autenticazione reciproca. La parte pubblica della prima finisce nel tuo `known_hosts`,
> quella della seconda in `authorized_keys` sulla VPS.
>
> Confonde anche il nome del comando: `ssh-keygen -lf <file>` **legge** una chiave esistente
> (`-l` = list), `ssh-keygen -t ed25519 -f <file>` ne **crea** una nuova.

### 1.1 Genera la chiave di amministrazione **[locale]**

```
ssh-keygen -t ed25519 -C "pantry-admin" -f ~/.ssh/pantry_admin
```

Metti una passphrase e conservala nel password manager. Questa è la *tua* chiave personale: la
chiave che userà la CI sarà un'altra, senza passphrase, generata allo Step 5. Tenerle separate
significa poter revocare quella della CI senza restare fuori dalla macchina.

### 1.2 Alias SSH **[locale]**

In `~/.ssh/config` (crealo se non esiste), sostituendo l'IP:

```
Host pantry
    HostName 203.0.113.10
    User deploy
    IdentityFile ~/.ssh/pantry_admin
    IdentitiesOnly yes
    ServerAliveInterval 30
```

`IdentitiesOnly yes` evita che ssh provi tutte le chiavi che hai in giro prima di quella giusta,
cosa che su un server con `MaxAuthTries` basso porta a un rifiuto poco comprensibile.

Da qui in poi basterà `ssh pantry`.

### 1.3 Primo accesso come root **[locale]**

```
ssh root@203.0.113.10
```

Alla prima connessione ssh mostra il fingerprint della chiave host: **confrontalo con quello del
pannello Netcup** prima di accettare.

### 1.4 Crea l'utente `deploy` **[vps]**

```
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
passwd deploy
```

La password serve **solo per `sudo`**: l'accesso SSH con password verrà disattivato alla 1.7,
quindi non è utilizzabile da remoto per entrare. Conservala nel password manager.

### 1.5 Installa la chiave pubblica **[locale]**

Da un **secondo terminale**, lasciando aperta la sessione di root:

```
cat ~/.ssh/pantry_admin.pub | ssh root@203.0.113.10 \
  "install -d -m 700 -o deploy -g deploy /home/deploy/.ssh \
   && install -m 600 -o deploy -g deploy /dev/stdin /home/deploy/.ssh/authorized_keys"
```

`ssh-copy-id` non va bene qui: dovrebbe autenticarsi *come* `deploy`, che non ha ancora accesso.

### 1.6 Verifica prima di indurire **[locale]**

```
ssh pantry "whoami && id"
```

Deve rispondere `deploy` e mostrarlo nel gruppo `sudo`. **Se non funziona, fermati e risolvi qui**:
la sessione di root è ancora aperta ed è la tua rete di sicurezza.

### 1.7 Indurisci sshd **[vps]**

Debian usa `Include /etc/ssh/sshd_config.d/*.conf`, quindi si aggiunge un file invece di
modificare la configurazione principale — più facile da rileggere e da annullare.

```
cat > /etc/ssh/sshd_config.d/99-pantry.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
EOF

sshd -t && echo "configurazione valida"
systemctl try-restart ssh.socket ssh.service
```

`sshd -t` valida la sintassi **prima** di applicare: è ciò che ti separa da un server che rifiuta
ogni connessione. Non saltarlo.

In Debian 13 sshd è attivato via socket, quindi ogni nuova connessione avvia un processo che
rilegge la configurazione: le modifiche valgono da subito. `try-restart` su entrambe le unità
copre sia il caso socket sia quello a servizio classico.

### Verifica Fase 1 **[locale]**

```
ssh pantry "echo ok"          # deve funzionare
ssh root@203.0.113.10         # deve essere RIFIUTATO
```

Solo ora puoi chiudere la sessione di root.

---

## Fase 2 — sistema

### 2.1 Aggiornamento, fuso orario, hostname **[vps]**

```
sudo apt-get update && sudo apt-get upgrade -y
sudo timedatectl set-timezone Europe/Rome
sudo hostnamectl set-hostname pantry
sudo sed -i '/^127\.0\.1\.1/d' /etc/hosts
printf '127.0.1.1\tpantry\n' | sudo tee -a /etc/hosts
```

Le ultime due righe non sono facoltative: cambiando l'hostname senza aggiornare `/etc/hosts`,
ogni `sudo` successivo stampa `unable to resolve host pantry`. È solo un avviso — `sudo` continua
a funzionare — ma è rumore inutile a ogni comando. Il `127.0.1.1` è la convenzione Debian per dare
un indirizzo di loopback al nome della macchina senza occupare `127.0.0.1`; la riga
`127.0.0.1 localhost` non va toccata.

Questo hostname è puramente cosmetico: non ha rapporto con il `DOMAIN` dell'applicazione né con
l'indirizzo che servirà Caddy.

### 2.2 Swap **[vps]**

```
free -h
df -h /
```

A regime Postgres, Node e Caddy insieme stanno sotto il gigabyte, e le build non avvengono qui:
la VPS scarica immagini già pronte. Quindi su una macchina da 4 GB lo swap **non serve per
capacità**, e saltarlo è legittimo.

Vale comunque 1 GB come valvola di sicurezza, per come cambia il modo in cui il sistema fallisce:
senza swap un picco fa intervenire l'OOM killer, che uccide di netto un processo — e Postgres,
avendo tipicamente la memoria residente più grande, è un candidato naturale. Con un po' di swap si
ottiene un rallentamento invece di un database ammazzato. Con `swappiness=10` in condizioni normali
resta a zero.

Su macchine da 2 GB o meno, invece, mettine 2 GB e non discutere.

```
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
sudo sysctl -w vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf
```

`swappiness=10` dice al kernel di usare lo swap solo quando serve davvero, invece di spostarci
pagine attive per abitudine.

### 2.3 Aggiornamenti di sicurezza automatici **[vps]**

```
sudo apt-get install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 2.4 Firewall **[vps]**

L'ordine conta: **prima si permette la 22, poi si abilita**. Invertirlo chiude la porta da cui sei
entrato.

```
sudo apt-get install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Si installa ufw **prima** di Docker: abilitarlo dopo rimescola le catene iptables che Docker ha già
inserito, e servirebbe un riavvio del demone.

> **Da sapere:** le porte pubblicate da Docker **scavalcano ufw**, perché Docker inserisce le
> proprie regole nella catena `DOCKER-USER`, valutata prima. Qui non è un problema — l'unico
> servizio che pubblica porte è Caddy sulla 80 e sulla 443, che vogliamo aperte, mentre `api` e
> `db` non ne pubblicano nessuna. Ma tienilo presente il giorno in cui aggiungi un `ports:` a
> qualcosa: `ufw deny` non lo fermerebbe.

### Verifica Fase 2 **[vps]**

```
sudo ufw status verbose      # deny incoming, con 22/80/443 aperte
free -h                      # swap presente se l'hai creato
timedatectl                  # fuso orario corretto
```

---

## Fase 3 — Docker

### 3.1 Repository ufficiale **[vps]**

Non `docker.io` di Debian: è più vecchio e non include il plugin `compose` nella versione che ci
serve.

```
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

`$VERSION_CODENAME` si risolve in `trixie`, che il repository Docker pubblica.

### 3.2 Rotazione dei log **[vps]**

Senza questo i log dei container crescono senza limite finché il disco si riempie — che è il
secondo modo più comune di perdere un database.

```
sudo mkdir -p /etc/docker
cat <<'EOF' | sudo tee /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
EOF
sudo systemctl restart docker
```

Il `docker-compose.yml` ripete la stessa impostazione per servizio: questa è la rete di sicurezza
per qualunque container avviato a mano.

### 3.3 `deploy` nel gruppo docker **[vps]**

```
sudo usermod -aG docker deploy
```

Serve perché la CI possa lanciare `docker compose` senza `sudo`. Da sapere: **appartenere al gruppo
`docker` equivale a essere root**, perché con un container si può montare l'intero filesystem. Non
è una falla di questa configurazione, è come funziona Docker; conta nel decidere chi mettere in
quel gruppo.

Il cambio di gruppo vale dal login successivo: esci e rientra.

### Verifica Fase 3 **[locale]**

```
ssh pantry "docker run --rm hello-world && docker compose version && docker info --format '{{.LoggingDriver}}'"
```

---

## Fase 4 — la cartella dell'applicazione

### 4.1 `/opt/pantry` **[vps]**

```
sudo install -d -o deploy -g deploy -m 755 /opt/pantry
```

### 4.2 DNS e certificati

Il dominio sta su Cloudflare. DNS → Records → Add record:

| campo | valore |
|---|---|
| Type | `A` |
| Name | `pantry` |
| IPv4 | l'IP della VPS |
| Proxy status | **DNS only** — nuvola **grigia** |
| TTL | Auto |

**Perché grigia e non arancione.** Con il proxy attivo Cloudflare termina il TLS al proprio bordo,
e questo rompe l'emissione dei certificati: TLS-ALPN-01 non arriva mai all'origine, e HTTP-01
funziona solo a patto che *Always Use HTTPS* non intercetti la richiesta di validazione. La strada
solida dietro proxy è DNS-01, che richiede un Caddy compilato con il plugin `caddy-dns/cloudflare`,
cioè costruire una propria immagine invece di usare quella ufficiale. In più `trusted_proxies
static private_ranges` nel Caddyfile non copre gli intervalli di Cloudflare, quindi si perderebbero
gli IP reali dei client. Con la nuvola grigia Caddy parla direttamente con Let's Encrypt e non c'è
nessun pezzo intermedio da diagnosticare. Si rinuncia a nascondere l'IP e alla protezione DDoS:
per un'app a inviti è un buon scambio, ed è reversibile.

**Niente record AAAA** finché non hai verificato che l'IPv6 della VPS risponda davvero: Let's
Encrypt preferisce IPv6 quando esiste, e un AAAA che non funziona fa fallire la validazione con un
errore incomprensibile.

Verifica **[locale]** che il DNS risponda con l'IP della VPS — se torna un `104.x` o `172.67.x` la
nuvola è ancora arancione:

```
nslookup pantry.davidecasadei.com 8.8.8.8
```

### 4.3 Il file dei segreti **[vps]**

Genera i segreti sulla macchina, così non passano dagli appunti:

```
openssl rand -base64 32   # POSTGRES_PASSWORD
openssl rand -base64 32   # BETTER_AUTH_SECRET
```

Poi crea `/opt/pantry/.env` partendo da `.env.example` del repository. **`chmod 600`**, di
proprietà di `deploy`, scritto a mano una volta sola: nessuna automazione lo tocca mai.

```
chmod 600 /opt/pantry/.env
ls -l /opt/pantry/.env      # -rw------- deploy deploy
```

I valori che legano l'applicazione al dominio:

```
DOMAIN=pantry.davidecasadei.com
CADDY_SITE_ADDRESS=pantry.davidecasadei.com
HTTP_PORT=80
HTTPS_PORT=443
NODE_ENV=production
EXTRA_ORIGINS=
```

`DOMAIN` va **senza schema**: l'API ci costruisce sopra `https://...`, che diventa il `baseURL` di
Better Auth e l'unica origin accettata. `CADDY_SITE_ADDRESS` con l'hostname nudo dice a Caddy di
ascoltare su 80 e 443, ottenere il certificato e redirigere HTTP su HTTPS. `EXTRA_ORIGINS` resta
vuoto: in produzione SPA e API stanno sulla stessa origin.

### 4.4 Il compose **[locale]**

```
scp docker-compose.yml pantry:/opt/pantry/
```

Il `docker-compose.yml` è versionato nel repository ed è l'unico file che si ricopia quando cambia.
`Caddyfile` e `Dockerfile` **non** vanno sulla VPS: sono cotti nelle immagini.

### Verifica Fase 4 **[locale]**

```
ssh pantry "ls -l /opt/pantry && cd /opt/pantry && docker compose config >/dev/null && echo 'compose valido'"
```

Il `docker compose config` fallisce se manca una variabile in `.env`, che è esattamente lo scopo
della sintassi `${VAR:?}`.

---

## Operazioni correnti

**Deploy.** Merge su `main`. Il workflow costruisce, pubblica su GHCR con tag uguale allo SHA del
commit, e lancia il deploy via SSH. Nient'altro da fare.

**Rollback.** Le immagini precedenti sono già su GHCR, quindi la via più rapida non passa dalla CI:

```
ssh -i ~/.ssh/pantry_ci deploy@<IP> <sha-precedente>
```

La chiave della CI è vincolata a `ci-deploy.sh`, che accetta solo uno SHA di 40 caratteri
minuscoli, scrive `.env.tag` e lancia `deploy.sh`. Sono pochi secondi contro i minuti di una
ricostruzione. Se quello SHA non è più su GHCR il pull fallisce e **non viene toccato nulla**.

In alternativa, `workflow_dispatch` sul ref desiderato: ricostruisce da zero, più lento ma non
richiede di ricordare lo SHA.

> Il rollback riporta indietro il **codice, non lo schema del database**. È il motivo per cui le
> migrazioni devono essere solo additive: mai `DROP COLUMN` in un rilascio da cui si deve poter
> tornare indietro.

**Log.**

```
ssh pantry "cd /opt/pantry && docker compose --env-file .env --env-file .env.tag logs -f --tail 100"
```

I due `--env-file` servono sempre: `TAG` vive solo in `.env.tag`, e senza il secondo file compose
si ferma su `${TAG:?}`.

**Cosa gira adesso.**

```
ssh pantry "docker ps --filter name=pantry --format '{{.Names}}\t{{.Image}}\t{{.Status}}'"
```

**Nuovo utente.** Dal backoffice `/admin/users`, che genera il link di invito. Lo script
`seed:admin:remote` serve solo a creare il *primo* amministratore su un database vuoto.

---

## Cosa resta

Lo Step 4 sceglie l'hostname, fa il primo deploy e crea il primo utente amministratore.
Lo Step 5 sostituisce il deploy manuale con GitHub Actions.
