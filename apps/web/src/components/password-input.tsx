import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        className={cn(
          "pe-8 [&::-ms-clear]:hidden [&::-ms-reveal]:hidden",
          className,
        )}
      />
      <button
        type="button"
        aria-label={t(visible ? "common.hidePassword" : "common.showPassword")}
        aria-pressed={visible}
        disabled={props.disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setVisible((shown) => !shown)}
        className="absolute inset-y-0 inset-e-0 flex w-8 items-center justify-center text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        {visible ? (
          <EyeOffIcon className="size-3.5" />
        ) : (
          <EyeIcon className="size-3.5" />
        )}
      </button>
    </div>
  );
}
