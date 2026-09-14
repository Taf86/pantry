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
| Bucket Unique Name | `pantry-backups` (il nome è globale, potrebbe servire un suffisso) |
| Files in Bucket are | **Private** |
| Default Encryption | indifferente (vedi sotto) |
| Object Lock | Disable |

Sulla **Default Encryption** (SSE-B2): è gratuita, ma qui non aggiunge niente. Quello che arriva
nel bucket è già un blob `age`, e SSE-B2 usa chiavi che gestisce Backblaze, quindi non protegge
dal rischio realistico — la chiave applicativa che sfugge dalla VPS. Resta una rete di sicurezza a
costo zero contro un errore futuro, il giorno in cui qualcuno caricasse lì un dump non cifrato. Se
la abiliti, fallo **adesso**: vale solo per gli upload successivi, i file già presenti non vengono
ricifrati. Evita invece SSE-C, con chiave fornita da te: sarebbe una seconda chiave da custodire e
da non perdere per proteggere dati già cifrati con la prima.

I primi 10 GB sono gratuiti e non scadono. Qui i dump sono da qualche decina di KB: non li vedrai
mai, quei 10 GB.

### B.1 La lifecycle rule

Sul bucket appena creato, **Lifecycle Settings**: scegli **«Conserva le versioni precedenti per
questo numero di giorni»** e scrivi `30`.

Non serve *«Usa regole personalizzate»*: quel preset corrisponde esattamente a
`daysFromHidingToDeleting = 30` con `daysFromUploadingToHiding` non impostato, che è la regola che
vogliamo. Anzi, è la variante più sicura, perché la casella pericolosa (`Days Till Hide`, vedi
sotto) con il preset non esiste proprio e non può essere riempita per sbaglio.

Non scegliere *«Conserva solo l'ultima versione»*: è lo stesso meccanismo con 1 giorno invece di
30, e lascerebbe una finestra di recupero di 24 ore invece di un mese.

Significa: quando un file viene nascosto, B2 lo cancella davvero 30 giorni dopo. Lo script sulla
VPS *nasconde* i file più vecchi di 30 giorni, non li cancella — **e questo è voluto**. Le
credenziali che stanno sulla VPS non possono distruggere lo storico: nello scenario peggiore, la
macchina compromessa che "cancella i backup", i file restano recuperabili per un altro mese con
`rclone --b2-versions`.

> **Se un giorno passi alle regole personalizzate, `Days Till Hide` deve restare vuoto.** È il
> campo che, se compilato, svuota il bucket: a
> differenza di `Days Till Delete`, agisce *«on all of the copies of the file, even the most
> current version»*. Con `30` lì dentro, un backup verrebbe nascosto al compimento dei 30 giorni e
> cancellato 30 giorni dopo — anche se nel frattempo fosse rimasto l'unico. Lasciandolo vuoto, B2
> non nasconde mai niente di sua iniziativa e cancella solo ciò che abbiamo nascosto noi.

**Perché non esiste una regola «cancella dopo 30 giorni tranne il più recente».** Le lifecycle rule
di B2 ragionano per *nome di file*: garantiscono che «the most current version of a file is always
kept unless it is explicitly deleted», ma qui ogni backup ha un nome suo, quindi ogni file è già la
versione corrente di sé stesso e quella garanzia non dice niente sul bucket nel suo insieme.

La stessa proprietà si ottiene dal lato dello script, che è anche l'unico a nascondere qualcosa:
`backup.sh` esegue la retention **solo dopo** che il dump nuovo è stato caricato e verificato, e
comunque non scende mai sotto `KEEP_MIN` dump (3 di default), qualunque cosa dicano le date. Se il
timer si rompe, lo script non parte e quindi non nasconde niente: il bucket si congela invece di
svuotarsi.

### B.2 La chiave applicativa

Una *application key* è la coppia di credenziali con cui un programma si autentica su B2, distinta
dall'email e password con cui entri tu nel pannello: un **keyID**, corto, che fa da nome utente, e
un **applicationKey**, che è il segreto. Sono i due valori che rclone chiederà alla Fase C.2, e
servono perché la VPS deve poter scrivere nel bucket alle tre di notte senza un essere umano che
digita una password.

Nel menu a sinistra, sotto Buckets, c'è **Application Keys**. Lì dentro esiste già una **Master
Application Key**: quella **non va usata**. Ha accesso completo all'account, a tutti i bucket
presenti e futuri, e non è limitabile — metterla su un server significa che chi prende il server
prende tutto Backblaze.

**Add a New Application Key**:

| campo | valore |
|---|---|
| Name of Key | `pantry-vps` |
| Allow access to Bucket | `pantry-backups` — **non** "All" |
| Type of Access | Read and Write |
| il resto | lascialo com'è |

`keyID` e `applicationKey` compaiono **una volta sola**, in una schermata che non si riapre. Mettili
subito nel password manager, entrambi: se li perdi si cancella la chiave e se ne fa un'altra, non è
un dramma, ma è tempo buttato.

Limitare la chiave a un bucket solo conta: è la differenza fra "la VPS può scrivere qui" e "la VPS
ha in mano tutto il tuo account Backblaze". E il nome `pantry-vps` non è decorativo: il giorno in
cui vorrai revocare l'accesso a quella macchina, è quello che ti dice quale chiave cancellare senza
romperne altre.

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
chmod 600 "$(rclone config file | tail -1)"
```

Il path si chiede a rclone invece di scriverlo a mano: quel file contiene l'`applicationKey` in
chiaro ed è l'unico segreto dell'intera catena che vive sulla VPS.

Il backend nativo `b2` invece di `s3`: una riga di configurazione invece di endpoint e regione, e
supporta il versioning che serve alla lifecycle rule della Fase B.1.

Verifica che il bucket risponda (vuoto: non stampa niente, ma non deve dare errore):

```bash
rclone lsf offsite:pantry-backups/
```

Indirizzare il bucket per nome invece di `rclone lsd offsite:`: con una chiave ristretta a un solo
bucket l'elenco di *tutti* i bucket è una richiesta che l'account non ha il permesso di fare, e un
errore lì direbbe soltanto che la restrizione funziona.

### C.3 Gli script **[locale]**

```bash
scp ops/backup.sh pantry:/opt/pantry/
ssh pantry "chmod 700 /opt/pantry/backup.sh"
scp ops/systemd/pantry-backup.* pantry:/tmp/
```

### C.4 La configurazione **[locale]**

`AGE_RECIPIENT` è la chiave **pubblica** della Fase A — la stringa che inizia per `age1`, non il
contenuto del file `.key`. Si scrive dal laptop, pescandola dal file invece di ricopiarla a mano:
è lunga, e una lettera sbagliata produce un backup che nessuno potrà mai rileggere.

L'heredoc **non** è quotato, quindi la sostituzione avviene qui e sulla VPS arriva il valore:

```bash
ssh pantry "cat > /opt/pantry/backup.env && chmod 600 /opt/pantry/backup.env" <<EOF
AGE_RECIPIENT=$(grep -o 'age1[a-z0-9]*' ~/.secrets/pantry-backup.key | head -1)
RCLONE_REMOTE=offsite:pantry-backups/db
LOCAL_KEEP_DAYS=7
REMOTE_KEEP_DAYS=30
KEEP_MIN=3
HEALTHCHECK_URL=
EOF
```

Poi controlla **[vps]** che la prima riga contenga una chiave vera e non una riga vuota:

```bash
cat /opt/pantry/backup.env
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

### C.6 Cosa succede a un riavvio

Niente da rifare a mano, ma è utile sapere *perché*:

| | |
|---|---|
| **Docker** | riparte da solo: il pacchetto `docker-ce` abilita `docker.service` all'installazione |
| **i container** | ripartono per via di `restart: unless-stopped` nel compose — ma **non** quelli che avevi fermato tu a mano prima del riavvio: è la differenza con `always` |
| **il timer** | resta abilitato, il collegamento in `timers.target` è su disco; e `Persistent=true` recupera il backup se la macchina era spenta alle 03:17 |

Proprio quel recupero apre una corsa: systemd sa aspettare `docker.service`, ma "il demone è
partito" non vuol dire "`pantry-db` accetta connessioni". Per questo `backup.sh` non controlla lo
stato del container una volta sola: aspetta fino a `DB_WAIT_SECS` (300 di default) che Postgres
risponda. Fallire un backup che sarebbe riuscito trenta secondi dopo significherebbe mandare un
allarme falso, e gli allarmi falsi insegnano a ignorare quelli veri.

L'unica prova vera resta riavviare davvero, in un momento tranquillo:

```bash
sudo reboot
```

e dopo un minuto, da locale:

```bash
ssh pantry "docker ps --filter name=pantry --format '{{.Names}}\t{{.Status}}' && systemctl is-enabled docker pantry-backup.timer && systemctl list-timers pantry-backup.timer --no-pager"
```

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
rclone lsl offsite:pantry-backups/db
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
RCLONE_REMOTE=offsite:pantry-backups/db
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
| 2026-09-14 | `20260914T074753Z` | superata | prima prova, sul primo backup prodotto. 6 tabelle, conteggi identici |

Prossima prevista: **dicembre 2026**.

---

## Fase E — l'avviso quando il backup smette

Tutto quello che precede protegge dalla perdita dei dati, non dal **silenzio**: se il timer
smettesse di partire — unità disabilitata da un aggiornamento, container rinominato, chiave B2
revocata — non se ne accorgerebbe nessuno fino alla prossima prova trimestrale. È il guasto per
*assenza*, e per definizione non produce un log da leggere.

Lo copre un dead man's switch: `backup.sh` chiama un URL esterno a ogni esecuzione, e se la
chiamata non arriva è il servizio esterno ad avvisare. Il piano gratuito di
[Healthchecks.io](https://healthchecks.io) copre 20 check; a noi ne serve uno.

### E.1 Il check **[browser]**

Crea un account, poi **Add Check**:

| campo | valore |
|---|---|
| Name | `pantry-backup` |
| Schedule | **Cron**: `17 3 * * *`, timezone `Europe/Rome` |
| Grace Time | `1 hour` |

La grace time non è generosità: il timer ha `RandomizedDelaySec=15m`, quindi l'esecuzione può
iniziare fino alle 03:32, e `Persistent=true` può farla partire ancora più tardi dopo un riavvio.
Un'ora copre entrambi senza produrre falsi allarmi.

Copia il **ping URL** (`https://hc-ping.com/<uuid>`).

> È un segreto debole: chi lo conosce può solo *fingere* che il backup sia andato bene, non leggere
> niente. Sta in `/opt/pantry/backup.env`, che è già `chmod 600`, e non in un file versionato.

### E.2 Collegarlo **[locale]**

```bash
ssh pantry "sed -i 's|^HEALTHCHECK_URL=.*|HEALTHCHECK_URL=https://hc-ping.com/<uuid>|' /opt/pantry/backup.env && grep HEALTHCHECK /opt/pantry/backup.env"
```

Lo script manda `/start` all'inizio, l'URL nudo alla riuscita e `/fail` a ogni uscita con errore —
compresi i casi in cui muore prima, per esempio se il database non risponde entro `DB_WAIT_SECS`.

### Verifica Fase E

Prima il percorso felice **[vps]**:

```bash
sudo systemctl start pantry-backup.service
```

La dashboard deve passare a verde e mostrare la durata dell'esecuzione.

Poi — e questa è la parte che di solito si salta — **verifica che l'avviso arrivi davvero**. Un
canale di notifica mai provato ha esattamente lo stesso difetto di un backup mai ripristinato:

```bash
curl -fsS https://hc-ping.com/<uuid>/fail
```

Deve arrivarti l'email entro pochi secondi. Se non arriva, controlla il canale in
**Integrations**: il problema è lì, e scoprirlo adesso costa un minuto invece di un incidente.
Poi rilancia il backup per riportare il check al verde.

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
rclone lsl offsite:pantry-backups/db --b2-versions
rclone copy offsite:pantry-backups/db . --b2-versions --include "pantry-<data>*"
```
