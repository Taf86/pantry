// Default import: see the note in src/services/push/webpush.ts.
import webpush from "web-push";

const main = (): void => {
  const { publicKey, privateKey } = webpush.generateVAPIDKeys();

  process.stdout.write(
    [
      "VAPID_PUBLIC_KEY=" + publicKey,
      "VAPID_PRIVATE_KEY=" + privateKey,
      "",
      "# Put both in /opt/pantry/.env (chmod 600) and in the password manager.",
      "# Rotating them unsubscribes every device: see docs/secrets.md.",
      "",
    ].join("\n"),
  );
};

main();
