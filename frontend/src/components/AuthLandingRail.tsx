/** Flat full-height rail for the signed-out landing (M3-style, no card chrome). */

export function AuthLandingRail() {
  return (
    <nav className="auth-rail" aria-label="Landing shortcuts">
      <a className="auth-rail-item" href="#auth-top" title="Top">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 22V12h6v10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>Home</span>
      </a>
      <a className="auth-rail-item" href="#auth-demo-section" title="Offline demo">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polygon points="5 3 19 12 5 21 5 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>Demo</span>
      </a>
      <a className="auth-rail-item" href="#auth-tutorial" title="Tutorial video">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="2" y="5" width="20" height="14" rx="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <polygon points="10 9 16 12 10 15 10 9" fill="currentColor" stroke="none" />
        </svg>
        <span>Tutorial</span>
      </a>
      <a className="auth-rail-item" href="#auth-account" title="Sign in">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>Sign in</span>
      </a>
      <a
        className="auth-rail-item"
        href="https://github.com/Barnard-PL-Labs/MaxPyLang"
        target="_blank"
        rel="noopener noreferrer"
        title="Repository"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
        </svg>
        <span>Code</span>
      </a>

      <a
        className="auth-rail-item"
        href="https://www.youtube.com/@fishpyler"
        target="_blank"
        rel="noopener noreferrer"
        title="YouTube"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M23.498 6.186a2.998 2.998 0 0 0-2.112-2.12C19.504 3.5 12 3.5 12 3.5s-7.504 0-9.386.566a2.998 2.998 0 0 0-2.112 2.12C0 8.082 0 12 0 12s0 3.918.502 5.814a2.998 2.998 0 0 0 2.112 2.12C4.496 20.5 12 20.5 12 20.5s7.504 0 9.386-.566a2.998 2.998 0 0 0 2.112-2.12C24 15.918 24 12 24 12s0-3.918-.502-5.814ZM9.75 15.568V8.432L15.9 12l-6.15 3.568Z" />
        </svg>
        <span>YouTube</span>
      </a>
    </nav>
  );
}
