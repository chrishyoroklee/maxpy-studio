interface Props {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: Props) {
  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <img src="/logo.webp" alt="" className="onboarding-logo" />
        <h1 className="onboarding-title">MaxPyLang Studio</h1>
        <p className="onboarding-subtitle">
          Generate Max for Live plugins from text descriptions.
          Powered by AI — runs entirely in your browser.
        </p>
        <button className="onboarding-button" onClick={onComplete}>
          Get Started
        </button>
      </div>
    </div>
  );
}
