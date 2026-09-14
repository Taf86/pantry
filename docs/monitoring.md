# Monitoraggio

Tre controlli, che coprono tre guasti diversi. Nessuno dei tre sostituisce gli altri.

| controllo | risponde a | dove vive |
|---|---|---|
| **uptime** | "l'applicazione risponde agli utenti?" | UptimeRobot, dall'esterno |
| **dead man's switch** | "il backup sta ancora girando?" | Healthchecks.io, vedi [backup.md](backup.md) |
| **spazio disco** | "fra quanto si ferma tutto da solo?" | timer sulla VPS + Healthchecks.io |

La divisione non è casuale. I primi due sorvegliano **dall'esterno**, perché un controllo che gira
sulla stessa macchina che deve sorvegliare tace proprio quando la macchina muore. Il terzo deve
girare **dentro**, perché lo spazio disco non è osservabile da fuori — ed è il guasto più lento e
più prevedibile dei tre, l'unico che si può prendere prima che accada.

Convenzioni dei blocchi come in [deploy.md](deploy.md).

---

## 1. Uptime **[browser]**

Su [uptimerobot.com](https://uptimerobot.com) (piano gratuito: 50 monitor, intervallo 5 minuti,
5 contatti di allerta), **+ New monitor**:

| campo | valore |
|---|---|
| Monitor type | **Keyword** |
| Friendly name | `pantry — api health` |
| URL | `https://pantry.davidecasadei.com/api/health` |
| Keyword | `"status":"ok"` |
| Keyword type | *exists* — allarme se manca |
| Interval | 5 minuti |

**Keyword e non HTTP(s) semplice**, perché un monitor sul solo codice di risposta qui è
ingannabile. Il [Caddyfile](../Caddyfile) ha il fallback SPA `try_files {path} /index.html`: se il
blocco `handle /api/*` si rompesse o venisse spostato sotto, `/api/health` scivolerebbe nel
fallback e risponderebbe **200 con l'HTML della SPA**. Il monitor resterebbe verde con l'intera API
irraggiungibile.

Così invece si coprono tre livelli con un controllo solo:

| guasto | cosa vede il monitor |
|---|---|
| macchina giù, Caddy giù, TLS scaduto | nessuna risposta |
| API su, database giù | `503`, e comunque niente keyword |
| routing rotto | `200` ma HTML: keyword assente |

Perché la terza riga funzioni, `/api/health` deve dire la verità: interroga davvero il database con
una `select 1`, con timeout di 2 secondi e un risultato in memoria per 5, così l'endpoint —
pubblico e non autenticato — non è una leva per esaurire il pool di connessioni. Vedi
`apps/api/src/server/routes/health.ts`.

> Lo stesso endpoint è usato dallo `HEALTHCHECK` dell'immagine api, quindi da quando dice la verità
> il `--wait` di `ops/deploy.sh` **annulla con rollback** un deploy in cui l'API non riesce a
> parlare col database. Prima sarebbe passato.

La **scadenza del certificato** non è sorvegliabile nel piano gratuito. In pratica, se scade il
monitor va giù comunque perché fallisce l'handshake — ma lo scopri dopo, non prima. Caddy rinnova
30 giorni prima della scadenza, quindi la finestra di rischio è ampia.

---

## 2. Backup

Vedi [backup.md](backup.md), Fase E. In breve: `backup.sh` chiama un URL di Healthchecks.io a ogni
esecuzione, e se la chiamata non arriva entro la finestra è il servizio esterno ad avvisare. Copre
il guasto per **assenza**, che per definizione non produce un log da leggere.

---

## 3. Spazio disco

Il disco pieno è il secondo modo più comune di perdere un database, e l'unico guasto di questa
lista che si vede arrivare. Qui cresce per tre vie: il volume `pgdata`, le immagini Docker vecchie
(`deploy.sh` pota quelle oltre 168 ore, ma solo quando gira) e i log dei container (limitati a
10 MB × 3 per servizio, vedi Fase 3.2 di [deploy.md](deploy.md)).

Si controllano anche gli **inode**, non solo i byte: un filesystem può rifiutarsi di scrivere con
il 40% di spazio libero se ha finito le voci di directory, e `df -h` in quel caso non mostra
niente di strano.

### 3.1 Il check **[browser]**

Su Healthchecks.io, **Add Check**:

| campo | valore |
|---|---|
| Name | `pantry-diskspace` |
| Schedule | **Simple**: period `1 hour` |
| Grace Time | `20 minutes` |

Copia il ping URL.

### 3.2 Lo script **[locale]**

```bash
scp ops/diskspace.sh pantry:/opt/pantry/
ssh pantry "chmod 700 /opt/pantry/diskspace.sh"
scp ops/systemd/pantry-diskspace.service ops/systemd/pantry-diskspace.timer pantry:/tmp/
```

### 3.3 La configurazione **[vps]**

```bash
cat > /opt/pantry/diskspace.env <<'EOF'
HEALTHCHECK_URL=https://hc-ping.com/<uuid>
DISK_THRESHOLD=80
INODE_THRESHOLD=80
EOF

chmod 600 /opt/pantry/diskspace.env
```

L'80% non è un numero magico: è il punto in cui hai ancora giorni di margine per intervenire con
calma, invece di ore. Su un disco da 256 GB significa una cinquantina di gigabyte liberi.

### 3.4 Il timer **[vps]**

```bash
sudo install -m 644 -o root -g root /tmp/pantry-diskspace.service /tmp/pantry-diskspace.timer /etc/systemd/system/
rm -f /tmp/pantry-diskspace.*
sudo systemctl daemon-reload
sudo systemctl enable --now pantry-diskspace.timer
```

### Verifica **[vps]**

Prima il percorso felice:

```bash
sudo systemctl start pantry-diskspace.service
journalctl -u pantry-diskspace.service -n 20 --no-pager
```

Deve elencare i filesystem con le percentuali e finire con `OK:`, e il check su Healthchecks deve
diventare verde.

Poi **provoca un allarme vero**, che è l'unico modo di sapere che l'allarme funziona — abbassa la
soglia, lancia, rimetti a posto:

```bash
sed -i 's/^DISK_THRESHOLD=.*/DISK_THRESHOLD=0/' /opt/pantry/diskspace.env
sudo systemctl start pantry-diskspace.service
sed -i 's/^DISK_THRESHOLD=.*/DISK_THRESHOLD=80/' /opt/pantry/diskspace.env
```

Deve arrivarti l'email, e il corpo deve dire **quale** filesystem e a che percentuale: lo script
manda il dettaglio nel corpo del ping proprio perché un allarme che dice solo "qualcosa non va" ti
costringe comunque a collegarti per capire cosa.

Poi rilancia il servizio per riportare il check al verde.

> Lo script esce con codice 0 anche quando trova un problema. È voluto: l'allarme è già partito
> attraverso Healthchecks, e un'unità rossa in `systemctl --failed` ogni ora sarebbe rumore sopra
> una notifica già arrivata. Il codice diverso da zero resta riservato ai guasti dello script
> stesso, che a loro volta mandano un `/fail`.
