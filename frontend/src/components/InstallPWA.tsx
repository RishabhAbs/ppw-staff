import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export function InstallPWA() {
  const [supportsPWA, setSupportsPWA] = useState(false);
  const [promptInstall, setPromptInstall] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setSupportsPWA(true);
      setPromptInstall(e);
      // Check if user has dismissed it recently? For now, just show it.
      if (!localStorage.getItem('pwa_dismissed')) {
        setShowBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const onClick = (evt: any) => {
    evt.preventDefault();
    if (!promptInstall) {
      return;
    }
    promptInstall.prompt();
    promptInstall.userChoice.then((choiceResult: any) => {
      if (choiceResult.outcome === 'accepted') {
        setShowBanner(false);
      } else {
        // Dismissed
      }
      // Clear the prompt, it can't be used again
      setPromptInstall(null);
    });
  };

  const onDismiss = () => {
    setShowBanner(false);
    // Hide for 24 hours or per session? usage: session for now.
    // Or set a flag to never show again?
    // Let's just hide for this session state.
    // Or better, set a temporary storage
    localStorage.setItem('pwa_dismissed', 'true');
  };

  if (!supportsPWA || !showBanner) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-indigo-600 text-white p-3 shadow-xl flex items-center justify-between animate-slide-down">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-white/20 rounded-lg">
          <img src="/ppw-logo.png" alt="App Logo" className="w-8 h-8 object-contain" />
        </div>
        <div>
          <p className="text-sm font-bold">Install App</p>
          <p className="text-xs text-indigo-100">Add to Home Screen for better experience</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button 
          onClick={onClick}
          className="px-3 py-1.5 bg-white text-indigo-600 text-xs font-bold rounded-lg shadow-sm hover:bg-slate-50 transition-colors"
        >
          Install
        </button>
        <button 
          onClick={onDismiss}
          className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
