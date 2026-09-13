# Backup e ripristino

Il database di produzione contiene utenti reali e non ha copie. Questo documento chiude il buco:
dump notturno cifrato verso un fornitore terzo, retention, e — la parte che di solito manca — una
**prova di ripristino** che si esegue davvero.

Un backup mai ripristinato è una speranza, non un backup.

Convenzioni dei blocchi, come in [deploy.md](deploy.md):

- **[locale]** — su Windows, in Git Bash
- **[vps]** — nella sessione SSH
- **[browser]** — nel pannello del fornitore

---

## Il modello, in una riga

**La VPS può creare un backup ma non rileggerlo.** La chiave privata `age` non sta sul server: sta
nel password manager e sul laptop. Chi prende la VPS ottiene la possibilità di *scrivere* nuovi
backup, non di leggere quelli vecchi.

Ne discendono tre conseguenze che è bene avere chiare prima di iniziare:

1. La prova di ripristino gira **dal laptop**, che è anche l'unico modo di provare lo scenario che
   conta: la VPS non esiste più.
2. Il dump in chiaro non tocca mai il disco della VPS — `pg_dump` scrive su stdout e `age` cifra
   dentro la pipe.
3. **Se perdi la chiave privata, perdi tutti i backup.** Non c'è recupero, non c'è assistenza da
   chiamare. Va nel password manager prima di essere usata, non dopo.

### Cosa copre e cosa no

| | |
|---|---|
| **RPO** (dati che puoi perdere) | fino a 24 ore: il dump è notturno |
| **RTO** (tempo per tornare su) | minuti, se la VPS c'è; il tempo di rifare [deploy.md](deploy.md) se non c'è |
| **copre** | database cancellato, migrazione sbagliata, disco corrotto, VPS persa, account netcup chiuso |
| **non copre** | i volumi `caddy_data` (certificati: Let's Encrypt li riemette da solo) e i segreti in `/opt/pantry/.env`, che stanno nel password manager |

Gli snapshot netcup restano utili come "annulla" prima di un `apt upgrade` rischioso, ma **non sono
un backup**: vivono sullo stesso storage della VPS e spariscono insieme a lei.

---

## Fase A — la chiave **[locale]**

Installa `age` su Windows:

```bash
winget install FiloSottile.age
```

Chiudi e riapri Git Bash, poi verifica che siano nel PATH:

```bash
age --version && age-keygen --version
```

Genera la coppia di chiavi. **Sul laptop, non sulla VPS**: è la differenza fra una chiave privata
che non ha mai toccato il server e una che ci è passata.

```bash
mkdir -p ~/.secrets && chmod 700 ~/.secrets
age-keygen -o ~/.secrets/pantry-backup.key
```

Il comando stampa la **chiave pubblica** (`age1...`): è il destinatario, non è un segreto, e andrà
sulla VPS. Il file `pantry-backup.key` contiene la **chiave privata**.

```bash
chmod 600 ~/.secrets/pantry-backup.key
cat ~/.secrets/pantry-backup.key
```

Copia **tutto il contenuto del file** in una voce dedicata del password manager, chiamata in modo
che fra tre anni si capisca (`Pantry — chiave privata dei backup`). Il laptop può rompersi: se
quella chiave esiste in un posto solo, i backup valgono zero.

### Verifica Fase A **[locale]**

```bash
echo prova | age -r "$(grep -o 'age1[a-z0-9]*' ~/.secrets/pantry-backup.key | head -1)" | age -d -i ~/.secrets/pantry-backup.key
```

Deve stampare `prova`. Se stampa quello, cifratura e decifratura funzionano con quella coppia.

---

## Fase B — il bucket **[browser]**

Su [backblaze.com](https://www.backblaze.com/cloud-storage): crea un account, poi
**B2 Cloud Storage → Buckets → Create a Bucket**.

| campo | valore |
|---|---|
| Bucket Unique Name | `pantry-backups-<qualcosa-di-tuo>` (il nome è globale) |
| Files in Bucket are | **Private** |
| Default Encryption | Disable — cifriamo già noi, e con una chiave che Backblaze non ha |
| Object Lock | Disable |

I primi 10 GB sono gratuiti e non scadono. Qui i dump sono da qualche decina di KB: non li vedrai
mai, quei 10 GB.

### B.1 La lifecycle rule

Sul bucket appena creato: **Lifecycle Settings → Use custom lifecycle rules**.

| campo | valore |
|---|---|
| File Path | (vuoto: tutto il bucket) |
| Days Till Hide | (vuoto) |
| Days Till Delete | `30` |

Significa: quando un file viene nascosto, B2 lo cancella davvero 30 giorni dopo. Lo script sulla
VPS *nasconde* i file più vecchi di 30 giorni, non li cancella — **e questo è voluto**. Le
credenziali che stanno sulla VPS non possono distruggere lo storico: nello scenario peggiore, la
macchina compromessa che "cancella i backup", i file restano recuperabili per un altro mese con
`rclone --b2-versions`.

### B.2 La chiave applicativa

**Application Keys → Add a New Application Key**:

| campo | valore |
|---|---|
| Name of Key | `pantry-vps` |
| Allow access to Bucket | **solo il bucket appena creato** |
| Type of Access | Read and Write |

`keyID` e `applicationKey` compaiono **una volta sola**. Mettili subito nel password manager: se li
perdi si rigenera la chiave, non è un dramma, ma è tempo buttato.

Limitare la chiave a un bucket solo conta: è la differenza fra "la VPS può scrivere qui" e "la VPS
ha in mano tutto il tuo account Backblaze".

---

## Fase C — la VPS

### C.1 Strumenti **[vps]**

```bash
sudo apt-get update && sudo apt-get install -y age rclone
age --version && rclone version
```

### C.2 Il remote rclone **[vps]**

Da fare come utente `deploy`, **senza `sudo`**: il timer gira come `deploy` e cerca la
configurazione nella sua home.

```bash
rclone config create offsite b2 account "<keyID>" key "<applicationKey>"
chmod 600 ~/.config/rclone/rclone.conf
```

Il backend nativo `b2` invece di `s3`: una riga di configurazione invece di endpoint e regione, e
supporta il versioning che serve alla lifecycle rule della Fase B.1.

Verifica che veda il bucket, e che non veda nient'altro:

```bash
rclone lsd offsite:
```

### C.3 Gli script **[locale]**

```bash
scp ops/backup.sh pantry:/opt/pantry/
ssh pantry "chmod 700 /opt/pantry/backup.sh"
scp ops/systemd/pantry-backup.* pantry:/tmp/
```

### C.4 La configurazione **[vps]**

`AGE_RECIPIENT` è la chiave **pubblica** della Fase A — quella che inizia per `age1`, non il
contenuto del file `.key`.

```bash
cat > /opt/pantry/backup.env <<'EOF'
AGE_RECIPIENT=age1...
RCLONE_REMOTE=offsite:pantry-backups-<il tuo>/db
LOCAL_KEEP_DAYS=7
REMOTE_KEEP_DAYS=30
HEALTHCHECK_URL=
EOF

chmod 600 /opt/pantry/backup.env
```

Le due retention sono diverse di proposito: la copia locale di 7 giorni serve a rimettere in piedi
il database in trenta secondi senza passare dalla rete, quella remota di 30 giorni serve al giorno
in cui la macchina non c'è più.

`HEALTHCHECK_URL` si lascia vuoto per ora: lo riempiremo con l'URL di
[Healthchecks.io](https://healthchecks.io) insieme al monitoraggio. Quando c'è, lo script segnala
inizio, fine e fallimento — ed è l'unica cosa che ti avvisa del guasto più insidioso di tutti, il
backup che **smette di partire** senza che nessuno se ne accorga.

### C.5 Il timer **[vps]**

```bash
sudo install -m 644 -o root -g root /tmp/pantry-backup.service /etc/systemd/system/
sudo install -m 644 -o root -g root /tmp/pantry-backup.timer /etc/systemd/system/
rm -f /tmp/pantry-backup.*
sudo systemctl daemon-reload
sudo systemctl enable --now pantry-backup.timer
```

Un timer systemd invece di cron: i log finiscono nel journal insieme a tutto il resto invece che in
una mail che nessuno legge, `Persistent=true` recupera l'esecuzione se la VPS era spenta all'ora
prevista, e `systemctl list-timers` risponde alla domanda "quando è partito l'ultimo?" senza
interpretare una crontab.

### Verifica Fase C **[vps]**

```bash
systemctl list-timers pantry-backup.timer
```

Deve mostrare la prossima esecuzione. Ora forza un backup subito, senza aspettare la notte:

```bash
sudo systemctl start pantry-backup.service
journalctl -u pantry-backup.service --since "5 minutes ago" --no-pager
```

Il log deve finire con `OK: pantry-<data>.dump.age (<n> byte), 1 dump off-site`. Poi:

```bash
ls -l /opt/pantry/backups/
rclone lsl offsite:pantry-backups-<il tuo>/db
```

Due file per ogni backup — il dump e il manifest — locali e remoti, stesse dimensioni.

> Il manifest contiene il conteggio riga per riga di ogni tabella al momento del dump, la versione
> di Postgres e lo sha256 del dump. È il metro di paragone della prova di ripristino: senza, il
> confronto "sono tornati indietro tutti i dati?" non avrebbe un termine con cui confrontarsi.

---

## Fase D — la prova di ripristino **[locale]**

Questa è la fase che rende reale tutto il resto. Gira **sul laptop**, scarica l'ultimo backup da
Backblaze, lo decifra con la chiave del password manager, lo ripristina in un container Postgres di
scarto, confronta i conteggi riga con il manifest e poi cancella tutto.

Serve Docker Desktop avviato, più `rclone` e `age`:

```bash
winget install Rclone.Rclone
```

Configura il remote anche qui — con la **stessa** chiave applicativa della Fase B.2 — e la
configurazione della prova:

```bash
rclone config create offsite b2 account "<keyID>" key "<applicationKey>"

mkdir -p ~/.config/pantry
cat > ~/.config/pantry/restore-drill.env <<EOF
RCLONE_REMOTE=offsite:pantry-backups-<il tuo>/db
AGE_IDENTITY=$HOME/.secrets/pantry-backup.key
EOF
```

Poi, dalla radice del repository:

```bash
./ops/restore-drill.sh
```

Alla fine stampa una tabella così:

```
  tabella                               al dump  ripristinate   esito
  --------------------------------------------------------------------------
  drizzle.__drizzle_migrations                1             1   ok
  public.accounts                             3             3   ok
  public.invites                              1             1   ok
  public.sessions                             2             2   ok
  public.users                                3             3   ok
  public.verifications                        0             0   ok
```

Lo script esce con codice diverso da zero se `pg_restore` fallisce, se lo sha256 non corrisponde, se
manca la tabella delle migrazioni, o se anche un solo conteggio è diverso. Il container di scarto e
i file temporanei vengono rimossi in ogni caso, anche se qualcosa va storto.

Per provare un backup preciso invece dell'ultimo: `./ops/restore-drill.sh 20260911T031700Z`.

### Registro delle prove

Da rifare **ogni trimestre** e dopo ogni migrazione che cambia lo schema in modo non banale. Una
riga per prova, aggiunta qui e committata: è la sola cosa che, fra sei mesi, distingue "il backup
funziona" da "il backup funzionava quando l'abbiamo scritto".

| data | backup provato | esito | note |
|---|---|---|---|
| | | | |

---

## Quando serve davvero: ripristinare la produzione

La prova della Fase D ripristina in un container di scarto. Rimettere i dati **in produzione** è
un'altra procedura, e si fa a testa fredda leggendo queste righe, non improvvisando.

### Caso 1 — la VPS c'è, il database è da rimettere a posto

Prima si ferma `api`: sta aperto sul database e al riavvio esegue le migrazioni. Rifarlo mentre il
ripristino è a metà è il modo più rapido di trasformare un incidente in due.

**[vps]**

```bash
cd /opt/pantry
docker compose --env-file .env --env-file .env.tag stop api
```

Se il backup che ti serve è ancora nella copia locale, il giro dal laptop si salta — ma serve
comunque la chiave privata per decifrare, quindi il dump passa di lì. **[locale]**, dalla cartella
che contiene il file `.age`:

```bash
age -d -i ~/.secrets/pantry-backup.key pantry-<data>.dump.age \
  | ssh pantry 'docker exec -i pantry-db sh -c "cat > /tmp/restore.dump"'
```

Poi **[vps]**:

```bash
docker exec pantry-db sh -c 'dropdb -U "$POSTGRES_USER" --force "$POSTGRES_DB" \
  && createdb -U "$POSTGRES_USER" -O "$POSTGRES_USER" "$POSTGRES_DB"'

docker exec pantry-db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --no-owner --exit-on-error /tmp/restore.dump'

docker exec pantry-db rm -f /tmp/restore.dump

docker compose --env-file .env --env-file .env.tag start api
docker compose --env-file .env --env-file .env.tag logs --tail 50 api
```

Il dump contiene anche `drizzle.__drizzle_migrations`, quindi le migrazioni al boot di `api` vedono
lo schema già alla versione giusta e non fanno niente. È il comportamento voluto: se invece
provassero a rigirare, vorrebbe dire che quel dump è più vecchio del codice attualmente
deployato — in quel caso fai anche un rollback del `TAG` allo SHA di allora, come descritto in
[deploy.md](deploy.md).

### Caso 2 — la VPS non c'è più

1. Rifai [deploy.md](deploy.md) dalla Fase 0 alla Fase 4 su una macchina nuova. I segreti di
   `/opt/pantry/.env` — `POSTGRES_PASSWORD` e `BETTER_AUTH_SECRET` — vanno ripresi **identici** dal
   password manager: rigenerare `BETTER_AUTH_SECRET` invaliderebbe tutte le sessioni.
2. Deploya l'ultimo SHA buono: `ssh -i ~/.ssh/pantry_ci deploy@<nuovo-IP> <sha>`.
3. Applica il Caso 1 per rimettere i dati.
4. Aggiorna il record DNS su Cloudflare con il nuovo IP. Caddy riemette i certificati da solo.

### Se un backup è stato nascosto dalla retention

Entro 30 giorni dalla sparizione è ancora lì, come versione nascosta:

```bash
rclone lsl offsite:pantry-backups-<il tuo>/db --b2-versions
rclone copy offsite:pantry-backups-<il tuo>/db . --b2-versions --include "pantry-<data>*"
```
