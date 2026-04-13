'use client';

import { usePathname } from 'next/navigation';

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Keying on pathname causes React to unmount/remount this node on navigation,
  // which re-triggers the CSS animation for a smooth page-enter effect.
  return (
    <div key={pathname} className="animate-page-enter h-full">
      {children}
    </div>
  );
}
