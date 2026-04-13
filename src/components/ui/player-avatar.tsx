import Image from 'next/image';

// Zinc-shade shimmer for dark theme — encodes as a base64 blurDataURL
function shimmerSvg(w: number, h: number) {
  return `<svg width="${w}" height="${h}" version="1.1" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g">
      <stop stop-color="#27272a" offset="20%" />
      <stop stop-color="#3f3f46" offset="50%" />
      <stop stop-color="#27272a" offset="70%" />
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="#27272a" />
  <rect width="${w}" height="${h}" fill="url(#g)">
    <animate attributeName="x" from="-${w}" to="${w}" dur="1s" repeatCount="indefinite" />
  </rect>
</svg>`;
}

function toBase64(str: string) {
  return typeof window === 'undefined'
    ? Buffer.from(str).toString('base64')
    : window.btoa(str);
}

function blurDataUrl(w: number, h: number) {
  return `data:image/svg+xml;base64,${toBase64(shimmerSvg(w, h))}`;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface PlayerAvatarProps {
  photoUrl?: string | null;
  name: string;
  /** Pixel size — the avatar is always square. Defaults to 48. */
  size?: 48 | 64 | 80;
  className?: string;
}

const sizeMap = {
  48: { tailwind: 'h-12 w-12', text: 'text-sm' },
  64: { tailwind: 'h-16 w-16', text: 'text-lg' },
  80: { tailwind: 'h-20 w-20', text: 'text-2xl' },
} as const;

/**
 * Circular player/coach avatar.
 *
 * When a photo URL is present it renders a Next.js <Image> with a zinc
 * shimmer blur placeholder so there's no layout shift and no blank flash
 * while the avatar loads.  Falls back to orange-tinted initials.
 */
export function PlayerAvatar({ photoUrl, name, size = 48, className = '' }: PlayerAvatarProps) {
  const { tailwind, text } = sizeMap[size];

  if (photoUrl) {
    return (
      <Image
        src={photoUrl}
        alt={name}
        width={size}
        height={size}
        className={`rounded-full object-cover ring-2 ring-zinc-700 ${tailwind} ${className}`}
        placeholder="blur"
        blurDataURL={blurDataUrl(size, size)}
        sizes={`${size}px`}
      />
    );
  }

  return (
    <div
      className={`flex ${tailwind} items-center justify-center rounded-full bg-orange-500/20 ${text} font-bold text-orange-400 ring-2 ring-zinc-700 ${className}`}
    >
      {getInitials(name)}
    </div>
  );
}
