# Icone

Sorgenti vettoriali delle icone PWA. I PNG in `public/` sono generati da qui e
versionati, così la build non ha bisogno di un rasterizzatore.

- `icon.svg` — icona `any`, quadrata piena. Niente angoli trasparenti: i launcher
  Android e iOS applicano già la loro maschera, e chi non la applica renderebbe
  bianco il canale alfa.
- `maskable-icon.svg` — icona `maskable`: stesso glifo, con il margine di
  sicurezza del 20% che Android si riserva di ritagliare.
- `../public/favicon.svg` — solo per la scheda del browser, con gli angoli
  arrotondati, da cui esce anche `favicon-32x32.png`.

Per rigenerare i PNG dopo aver modificato un SVG (sharp non è una dipendenza del
progetto, si usa una tantum). I PNG del launcher vanno appiattiti su `#18181b`,
senza canale alfa:

```bash
pnpm dlx sharp-cli -i icons/icon.svg -o public/pwa-192x192.png resize 192 192 -- flatten --background "#18181b"
```
