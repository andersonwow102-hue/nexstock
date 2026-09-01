const PATHS = {
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
  filter: <><path d="M4 6h16M7 12h10M10 18h4" /><circle cx="7" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></>,
  moon: <path d="M20 15.2A8 8 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" />,
  ledger: <><path d="M5 3.5h12a2 2 0 0 1 2 2v15H7a2 2 0 0 1-2-2v-15Z" /><path d="M8 3.5v17M11 8h5M11 12h5M11 16h3" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
  deploy: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 19h14" /></>,
  tag: <><path d="M3.5 5.5v6l8.5 8.5 8-8-8.5-8.5h-6a2 2 0 0 0-2 2Z" /><circle cx="8" cy="8" r="1.25" /></>,
  printer: <><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M7 14h10v7H7z" /></>,
  play: <><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4V8Z" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  arrow: <path d="M5 12h14M14 7l5 5-5 5" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  box: <><path d="m4 7 8-4 8 4v10l-8 4-8-4V7Z" /><path d="m4 7 8 4 8-4M12 11v10" /></>,
  shield: <><path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
  alert: <><path d="M12 3 22 20H2L12 3Z" /><path d="M12 9v5M12 17.5v.5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
  keyboard: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M6 10h2M10 10h2M14 10h2M18 10h.1M6 14h8M16 14h2" /></>,
  qr: <><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v4h-2zM14 18h4v2h-4z" /></>,
};

export default function Icon({ name, size = 18, strokeWidth = 1.7, className = "" }) {
  return (
    <svg
      aria-hidden="true"
      className={`pv-icon ${className}`}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
    >
      {PATHS[name] || PATHS.info}
    </svg>
  );
}

