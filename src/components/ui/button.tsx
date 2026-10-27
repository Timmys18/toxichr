import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "thr-btn",
  {
    variants: {
      variant: {
        primary: "thr-btn-tox",
        secondary: "thr-btn-white",
        ghost: "thr-btn-ghost",
        outline: "thr-btn-line",
        danger: "thr-btn-danger",
      },
      size: {
        sm: "thr-btn-sm",
        md: "thr-btn-md",
        lg: "thr-btn-lg",
        xl: "thr-btn-xl",
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
