# Icone

Sorgenti vettoriali delle icone PWA. I PNG in `public/` sono generati da qui e
versionati, così la build non ha bisogno di un rasterizzatore.

- `public/favicon.svg` — icona `any`: quadrato arrotondato, usata anche come favicon.
- `maskable-icon.svg` — icona `maskable`: stesso glifo ma a tutto campo e con il
  margine di sicurezza del 20% richiesto da Android, che ritaglia l'icona a piacere.

Per rigenerare i PNG dopo aver modificato un SVG (sharp non è una dipendenza del
progetto, si usa una tantum):

```bash
pnpm dlx sharp-cli --input public/favicon.svg --output public/pwa-192x192.png resize 192 192
pnpm dlx sharp-cli --input public/favicon.svg --output public/pwa-512x512.png resize 512 512
pnpm dlx sharp-cli --input public/favicon.svg --output public/apple-touch-icon-180x180.png resize 180 180
pnpm dlx sharp-cli --input icons/maskable-icon.svg --output public/maskable-icon-512x512.png resize 512 512
```
