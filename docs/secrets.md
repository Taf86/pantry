# Segreti fuori dal repository

Due reti, a due distanze diverse dal danno.

| rete | ferma | dove |
|---|---|---|
| **hook di pre-commit** | il commit non nasce proprio | il tuo laptop |
| **push protection** | il commit non arriva su GitHub | lato server |

Servono entrambe, perché la prima si può aggirare (`--no-verify`, un clone senza setup, un altro
computer) e la seconda arriva troppo tardi per essere comoda: blocca il push quando il segreto è
già nella tua storia locale e va tolto da lì.

Qui il rischio non è teorico: `apps/api/.env` esiste sul disco con credenziali di produzione, e a
tenerlo fuori dalle immagini Docker c'è solo `.dockerignore`.

---

## 1. L'hook

### Installazione **[locale]**

```bash
winget install Gitleaks.Gitleaks
```

Su macOS `brew install gitleaks`, su Linux i binari stanno nelle
[release](https://github.com/gitleaks/gitleaks/releases).

L'hook in sé non va installato: chi clona non deve ricordarsi di niente, deve solo avere gitleaks.
Il meccanismo, che non è ovvio leggendo i file:

| pezzo | ruolo |
|---|---|
| `.githooks/pre-commit` | l'hook, versionato come qualsiasi altro file |
| `"prepare"` in `package.json` | nome **riservato** del ciclo di vita npm/pnpm: viene eseguito da solo dopo ogni `pnpm install` nella radice. Nessuno lo invoca |
| `scripts/setup-hooks.mjs` | esegue `git config core.hooksPath .githooks`, cioè scrive una riga in `.git/config`. Esce senza fare niente se `.git` non c'è — serve al build Docker, che copia solo i manifest — e ignora un git assente, perché non deve mai far fallire l'install |

Serve perché git esegue gli hook da `.git/hooks`, che **non** è versionato e non viaggia con un
clone. Né lo fa la configurazione: se un repository potesse impostare da sé `core.hooksPath`,
clonarlo basterebbe a eseguire codice scelto da chi l'ha scritto. Da qui il passo locale esplicito,
che `prepare` rende automatico solo *dopo* che hai deciso di fidarti abbastanza da installarne le
dipendenze.

Se gitleaks manca, **l'hook blocca il commit** invece di saltare il controllo. È deliberato: un
controllo che si disattiva da solo in silenzio è peggio che non averlo, perché dà la stessa
tranquillità senza fare niente.

### Verifica **[locale]**

```bash
git config core.hooksPath        # deve rispondere .githooks
gitleaks version                 # 8.30.1 o più recente
```

Poi provalo davvero, che è l'unico modo di sapere che funziona:

```bash
printf 'const k = "sk_live_%s";\n' "$(head -c 18 /dev/urandom | base64 | tr -d '/+=')" > leak-test.ts
git add leak-test.ts && git commit -m "prova"
```

La chiave finta viene **generata** invece che scritta qui, e non è un vezzo: con il valore in
chiaro nel documento, la push protection di GitHub bloccava il push del file che spiega come
proteggersi. `gitleaks:allow` non serviva a niente, perché GitHub non usa gitleaks — vedi il § 2.
Così nel repository resta solo il prefisso `sk_live_`, che non fa scattare niente, e il file
generato contiene comunque un token che gitleaks riconosce (regola `stripe-access-token`).

Il commit deve essere **rifiutato**, indicando regola, file e riga con il segreto redatto. Poi:

```bash
git restore --staged leak-test.ts && rm leak-test.ts
```

### Quando scatta

Il segreto è ancora solo in stage: togli il valore, `git add`, ricommitta.

Se invece ti accorgi che è già in un commit **locale**, non basta cancellarlo in un commit
successivo — resta nella storia. Va riscritta (`git commit --amend` se è l'ultimo, `git rebase -i`
se è più indietro) **prima** di pushare.

E se è già stato pushato:

> **Il segreto è compromesso. Va ruotato, non nascosto.** Riscrivere la storia non serve a niente
> da solo: il valore è transitato su GitHub, sta nei fork, nelle cache, nelle notifiche via email e
> nei mirror. Prima si genera il nuovo segreto e si mette in servizio, poi semmai si pulisce la
> storia. L'ordine conta.

---

## 2. Push protection **[browser]**

Su GitHub, nel repository: **Settings → Code security** (nelle versioni recenti dell'interfaccia
può chiamarsi *Advanced Security*). Attiva **Secret scanning** e, sotto, **Push protection**.

Sui repository pubblici sono gratuite. Da quel momento GitHub rifiuta un push che contiene un
segreto riconosciuto, e per farlo passare serve una motivazione esplicita registrata nel log.

Copre un caso che l'hook non può coprire: il push fatto da un altro computer, da un clone senza
setup, o con `--no-verify`.

---

## 3. La storia

Un hook protegge i commit futuri, non quelli già fatti. La storia si scansiona a parte:

```bash
docker run --rm -v "$(pwd -W):/repo" ghcr.io/gitleaks/gitleaks:latest git /repo --redact --no-banner --verbose
```

Fatto il 14/09/2026 su 41 commit: tre reperti, tutti verificati a mano e tutti falsi positivi —
valori di esempio che si chiamano letteralmente `segreto-solo-per-lo-sviluppo-…`,
`segreto-solo-per-la-ci-…` e una fixture di test. Sono archiviati in
[`.gitleaksignore`](../.gitleaksignore), con il perché accanto a ciascuno.

Quel file non serve all'hook — le modifiche in stage non contengono più quei reperti. Serve perché
la prossima scansione della storia torni pulita: se restituisse sempre tre risultati noti, il
giorno in cui ne comparisse un quarto non se ne accorgerebbe nessuno.

Vale la pena rifarla dopo ogni import di codice da fuori.
