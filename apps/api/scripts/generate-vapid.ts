import { generateVAPIDKeys } from "web-push";

const main = (): void => {
  const { publicKey, privateKey } = generateVAPIDKeys();

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
