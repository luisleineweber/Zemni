import type { SVGProps } from "react";

type IconSize = "xs" | "sm" | "md" | "lg";
type IconProps = Omit<SVGProps<SVGSVGElement>, "width" | "height"> & {
  size?: IconSize | number;
  title?: string;
};

const ICON_SIZE_MAP = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
} as const;

const DEFAULT_ICON_SIZE: IconSize = "lg";
const DEFAULT_STROKE_WIDTH = 2;

function getIconSize(size: IconProps["size"]): number {
  if (typeof size === "number") return size;
  return ICON_SIZE_MAP[size ?? DEFAULT_ICON_SIZE];
}

function BaseIcon({
  size,
  title,
  children,
  ...props
}: IconProps): JSX.Element {
  const pixelSize = getIconSize(size);
  const isDecorative = !title && !props["aria-label"] && !props["aria-labelledby"];

  return (
    <svg
      width={pixelSize}
      height={pixelSize}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={DEFAULT_STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={isDecorative ? "true" : undefined}
      role={isDecorative ? undefined : "img"}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function IconMenu(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <path d="M3 12h18M3 6h18M3 18h18" />
    </BaseIcon>
  );
}

export function IconX(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </BaseIcon>
  );
}

export function IconSun(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </BaseIcon>
  );
}

export function IconMoon(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </BaseIcon>
  );
}

export function IconCopy(props: IconProps): JSX.Element {
  return (
    <BaseIcon size="md" {...props}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </BaseIcon>
  );
}

export function IconCheck(props: IconProps): JSX.Element {
  return (
    <BaseIcon size="md" {...props}>
      <path d="M20 6 9 17l-5-5" />
    </BaseIcon>
  );
}

export function IconEdit(props: IconProps): JSX.Element {
  return (
    <BaseIcon size="md" {...props}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </BaseIcon>
  );
}

export function IconChevron(props: IconProps): JSX.Element {
  return (
    <BaseIcon size="sm" {...props}>
      <path d="M6 9l6 6 6-6" />
    </BaseIcon>
  );
}

export function IconClose(props: IconProps): JSX.Element {
  return (
    <BaseIcon size="xs" {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </BaseIcon>
  );
}

export function IconSettings(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65-2-3.46-2.49 1a7.6 7.6 0 0 0-1.69-.98L15 3.25h-4l-.36 2.68c-.6.24-1.16.57-1.69.98l-2.49-1-2 3.46 2.11 1.65a7.93 7.93 0 0 0 0 1.96l-2.11 1.65 2 3.46 2.49-1c.52.41 1.09.74 1.69.98l.36 2.68h4l.36-2.68c.6-.24 1.16-.57 1.69-.98l2.49 1 2-3.46-2.11-1.65Z" />
    </BaseIcon>
  );
}

export function IconFolder(props: IconProps): JSX.Element {
  return (
    <BaseIcon {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    </BaseIcon>
  );
}

export function IconLock(props: IconProps): JSX.Element {
  return (
    <BaseIcon size="sm" {...props}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </BaseIcon>
  );
}
