import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const ArrowLeftIcon = (props: IconProps) => (
  <IconBase {...props}><path d="m15 18-6-6 6-6" /></IconBase>
);
export const ArrowRightIcon = (props: IconProps) => (
  <IconBase {...props}><path d="m9 18 6-6-6-6" /></IconBase>
);
export const ReloadIcon = (props: IconProps) => (
  <IconBase {...props}><path d="M20 11a8.1 8.1 0 1 0-2.2 5.6" /><path d="M20 4v7h-7" /></IconBase>
);
export const CameraIcon = (props: IconProps) => (
  <IconBase {...props}><path d="M14.5 5 13 3H8L6.5 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-5.5Z" /><circle cx="10.5" cy="12.5" r="3.5" /></IconBase>
);
export const MonitorIcon = (props: IconProps) => (
  <IconBase {...props}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></IconBase>
);
export const PhoneIcon = (props: IconProps) => (
  <IconBase {...props}><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></IconBase>
);
export const SaveIcon = (props: IconProps) => (
  <IconBase {...props}><path d="M5 3h12l2 2v16H5V3Z" /><path d="M8 3v6h8V3M8 21v-8h8v8" /></IconBase>
);
export const CopyIcon = (props: IconProps) => (
  <IconBase {...props}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></IconBase>
);
export const SlidersIcon = (props: IconProps) => (
  <IconBase {...props}><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" /><path d="M1 14h6M9 8h6M17 16h6" /></IconBase>
);
export const SparklesIcon = (props: IconProps) => (
  <IconBase {...props}><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z" /><path d="m19 14 .8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14ZM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14Z" /></IconBase>
);
export const GlobeIcon = (props: IconProps) => (
  <IconBase {...props}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></IconBase>
);
export const CheckIcon = (props: IconProps) => (
  <IconBase {...props}><path d="m5 12 4 4L19 6" /></IconBase>
);
export const XIcon = (props: IconProps) => (
  <IconBase {...props}><path d="m6 6 12 12M18 6 6 18" /></IconBase>
);
export const AlertIcon = (props: IconProps) => (
  <IconBase {...props}><path d="M10.3 3.7 2.5 17.2A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.8L13.7 3.7a2 2 0 0 0-3.4 0Z" /><path d="M12 8v5M12 17h.01" /></IconBase>
);
export const ChevronDownIcon = (props: IconProps) => (
  <IconBase {...props}><path d="m6 9 6 6 6-6" /></IconBase>
);
export const TrashIcon = (props: IconProps) => (
  <IconBase {...props}><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" /></IconBase>
);
export const WrenchIcon = (props: IconProps) => (
  <IconBase {...props}><path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5L20 16.4a2.1 2.1 0 1 1-3 3l-7.7-7.7" /></IconBase>
);
