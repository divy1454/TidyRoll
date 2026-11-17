// Small illustrated "prints" for the start screen (drawn here, no stock photos).

const svg = (w, h, body) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">${body}</svg>`)}`;

export const PRINTS = [
  { label: 'Sunset over the sea', src: svg(120, 90, `
    <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6b26b"/><stop offset=".65" stop-color="#e8735a"/><stop offset="1" stop-color="#b8486a"/></linearGradient></defs>
    <rect width="120" height="56" fill="url(#s)"/><circle cx="60" cy="52" r="15" fill="#ffd27a"/>
    <rect y="56" width="120" height="34" fill="#2e4a6b"/><g fill="#ffd27a" opacity=".8"><rect x="50" y="60" width="20" height="2"/><rect x="45" y="66" width="30" height="2"/><rect x="53" y="72" width="14" height="2"/></g>`) },
  { label: 'Mountains', src: svg(120, 90, `
    <rect width="120" height="90" fill="#9cc3e4"/><path d="M-5 75 L35 22 L60 55 L82 30 L125 78 Z" fill="#5d6f86"/>
    <path d="M35 22 L44 34 L38 31 L31 36 Z M82 30 L91 40 L85 38 L78 41 Z" fill="#f4f6f8"/><rect y="70" width="120" height="20" fill="#6f9a5a"/>`) },
  { label: 'City at night', src: svg(90, 120, `
    <rect width="90" height="120" fill="#1d2440"/><circle cx="68" cy="22" r="8" fill="#f1e4b3"/>
    <g fill="#2f3a5e"><rect x="4" y="55" width="22" height="65"/><rect x="30" y="40" width="18" height="80"/><rect x="52" y="62" width="34" height="58"/></g>
    <g fill="#ffcf6b"><rect x="9" y="62" width="4" height="5"/><rect x="17" y="74" width="4" height="5"/><rect x="34" y="50" width="4" height="5"/><rect x="40" y="66" width="4" height="5"/><rect x="58" y="70" width="4" height="5"/><rect x="72" y="70" width="4" height="5"/><rect x="65" y="84" width="4" height="5"/><rect x="9" y="90" width="4" height="5"/></g>`) },
  { label: 'Lunch', src: svg(100, 100, `
    <rect width="100" height="100" fill="#a8714a"/><g stroke="#94603c" stroke-width="2"><line x1="0" y1="25" x2="100" y2="25"/><line x1="0" y1="55" x2="100" y2="55"/><line x1="0" y1="82" x2="100" y2="82"/></g>
    <circle cx="50" cy="50" r="34" fill="#f3efe7"/><circle cx="50" cy="50" r="26" fill="#e9e2d4"/>
    <circle cx="42" cy="44" r="9" fill="#e2a23b"/><circle cx="58" cy="47" r="7" fill="#6aa04b"/><circle cx="50" cy="60" r="8" fill="#c8513a"/>`) },
  { label: 'A dog', src: svg(100, 120, `
    <rect width="100" height="120" fill="#7fb7b0"/><ellipse cx="50" cy="118" rx="44" ry="30" fill="#c9884f"/>
    <circle cx="50" cy="62" r="27" fill="#d99c5f"/><ellipse cx="27" cy="52" rx="9" ry="18" fill="#8a5a33" transform="rotate(18 27 52)"/>
    <ellipse cx="73" cy="52" rx="9" ry="18" fill="#8a5a33" transform="rotate(-18 73 52)"/><ellipse cx="50" cy="74" rx="12" ry="9" fill="#f0d2a8"/>
    <circle cx="50" cy="69" r="4" fill="#2d1f17"/><circle cx="41" cy="57" r="3" fill="#2d1f17"/><circle cx="59" cy="57" r="3" fill="#2d1f17"/>`) },
  { label: 'Beach', src: svg(120, 90, `
    <rect width="120" height="90" fill="#bfe2ef"/><rect y="48" width="120" height="16" fill="#3f93b4"/><rect y="62" width="120" height="28" fill="#ecd6a5"/>
    <path d="M86 88 Q84 60 92 34" stroke="#7a5534" stroke-width="4" fill="none"/>
    <g fill="#3d7d45"><path d="M92 34 Q76 26 66 34 Q80 30 92 36Z"/><path d="M92 34 Q104 22 116 28 Q102 28 93 37Z"/><path d="M92 34 Q90 18 98 12 Q94 24 94 35Z"/></g>`) },
  { label: 'Friends', src: svg(120, 90, `
    <rect width="120" height="90" fill="#f0c86a"/><circle cx="44" cy="34" r="12" fill="#8b5a3c"/><rect x="28" y="48" width="32" height="44" rx="12" fill="#3f6ea6"/>
    <circle cx="78" cy="38" r="11" fill="#e2b18c"/><rect x="63" y="51" width="30" height="40" rx="12" fill="#c8513a"/><circle cx="44" cy="31" r="12" fill="#3a2a22" opacity=".35"/>`) },
  { label: 'Coffee', src: svg(100, 100, `
    <rect width="100" height="100" fill="#d9cdbb"/><circle cx="50" cy="50" r="30" fill="#f4efe6"/><circle cx="50" cy="50" r="21" fill="#6b3f26"/>
    <path d="M42 47 Q50 40 58 47 Q50 56 42 47Z" fill="#c99a6b"/><rect x="78" y="44" width="16" height="12" rx="6" fill="#f4efe6"/>`) },
  { label: 'Screenshot', src: svg(60, 120, `
    <rect width="60" height="120" fill="#f2f2f2"/><rect width="60" height="12" fill="#2b2b2b"/>
    <g fill="#9a9a9a"><rect x="6" y="20" width="40" height="5"/><rect x="6" y="31" width="48" height="5"/><rect x="6" y="42" width="30" height="5"/></g>
    <rect x="6" y="54" width="48" height="36" fill="#cfd8e3"/><g fill="#9a9a9a"><rect x="6" y="96" width="44" height="5"/><rect x="6" y="107" width="26" height="5"/></g>`) },
];
