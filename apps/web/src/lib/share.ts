export type ShareOutcome = "shared" | "cancelled" | "unsupported" | "failed";

export const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

export const canShare = () => typeof navigator.share === "function";

export const shareLink = async (share: {
  title: string;
  text: string;
  url: string;
}): Promise<ShareOutcome> => {
  if (!canShare()) return "unsupported";
  try {
    await navigator.share({
      title: share.title,
      text: `${share.text}\n${share.url}`,
    });
    return "shared";
  } catch (cause) {
    const name = cause instanceof DOMException ? cause.name : "";
    return name === "AbortError" || name === "NotAllowedError"
      ? "cancelled"
      : "failed";
  }
};

export const mailtoUrl = (mail: {
  to: string;
  subject: string;
  body: string;
}) => {
  const to = encodeURIComponent(mail.to).replace(/%40/g, "@");
  const subject = encodeURIComponent(mail.subject);
  const body = encodeURIComponent(mail.body);
  return `mailto:${to}?subject=${subject}&body=${body}`;
};
