import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[transform,background-color,box-shadow,color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-toxic/60 focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:pointer-events-none disabled:opacity-45 active:translate-y-px",
  {
    variants: {
      variant: {
        primary:
          "bg-toxic text-ink shadow-[0_1px_0_rgba(0,0,0,0.08)] hover:bg-toxic-hot",
        secondary: "bg-ink text-paper hover:bg-graphite",
        ghost: "bg-transparent text-ink hover:bg-ink/5",
        outline:
          "border border-ink/15 bg-surface text-ink hover:border-ink/35 hover:bg-paper",
        danger: "bg-roast text-paper hover:bg-roast/90",
      },
      size: {
        sm: "h-9 px-3.5 text-sm",
        md: "h-11 px-5 text-base",
        lg: "h-12 px-6 text-base min-h-12",
        xl: "h-14 px-8 text-lg min-h-14",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type ButtonBase = VariantProps<typeof buttonVariants> & {
  className?: string;
};

export type ButtonProps = ButtonBase &
  (
    | (React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined })
    | (React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string })
  );

export function Button({ className, variant, size, ...props }: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);

  if ("href" in props && props.href) {
    const { href, ...rest } = props;
    return <Link href={href} className={classes} {...rest} />;
  }

  const buttonProps = props as React.ButtonHTMLAttributes<HTMLButtonElement>;
  return <button type="button" className={classes} {...buttonProps} />;
}
