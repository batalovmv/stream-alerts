interface BadgeProps {
  variant: 'green' | 'red' | 'gray' | 'accent';
  children: React.ReactNode;
}

const variantClasses = {
  green: 'badge-green',
  red: 'badge-red',
  gray: 'badge-gray',
  accent: 'badge bg-accent/20 text-accent-light',
};

export function Badge({ variant, children }: BadgeProps) {
  return <span className={variantClasses[variant]}>{children}</span>;
}
