import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-fire text-on-fire",
  secondary: "bg-surface-sunk text-ink",
  ghost: "bg-transparent text-ink shadow-[inset_0_0_0_1.5px_var(--line-strong)]",
  danger: "bg-transparent text-danger shadow-[inset_0_0_0_1.5px_var(--danger)]",
};

export function buttonClass(variant: Variant = "primary", size: "md" | "sm" = "md", extra = "") {
  const sizes = size === "sm" ? "h-9 px-3.5 text-sm" : "h-12 px-5.5 text-base";
  return `inline-flex items-center justify-center gap-2 rounded-full font-semibold lowercase transition-transform active:scale-[.97] disabled:opacity-40 disabled:pointer-events-none ${sizes} ${variants[variant]} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "md" | "sm" }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}
