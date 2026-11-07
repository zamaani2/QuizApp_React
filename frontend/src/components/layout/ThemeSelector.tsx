import { useState, useEffect, useRef, type FC } from 'react';

export type AccentTheme = 'academic' | 'green' | 'purple' | 'red';

interface ThemeOption {
  id: AccentTheme;
  name: string;
  subtitle: string;
  dotColor: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'academic',
    name: 'Academic Pro',
    subtitle: 'Classic school navy',
    dotColor: '#1e40af',
  },
  {
    id: 'green',
    name: 'Green Vibrant',
    subtitle: 'Fresh emerald energy',
    dotColor: '#047857',
  },
  {
    id: 'purple',
    name: 'Purple Vibrant',
    subtitle: 'Elegant royal violet',
    dotColor: '#7c3aed',
  },
  {
    id: 'red',
    name: 'Red Vibrant',
    subtitle: 'Bold energetic red',
    dotColor: '#dc2626',
  },
];

export const ThemeSelector: FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<AccentTheme>('academic');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Read from localStorage or DOM
    try {
      const stored = localStorage.getItem('preferredTheme') as AccentTheme;
      if (stored && ['academic', 'green', 'purple', 'red'].includes(stored)) {
        setCurrentTheme(stored);
        applyTheme(stored);
      }
    } catch {
      // fallback
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const applyTheme = (theme: AccentTheme) => {
    setCurrentTheme(theme);
    const themeClasses = [
      'academic-pro-theme-page',
      'green-theme-page',
      'purple-theme-page',
      'red-theme-page',
    ];
    const activeClass = theme === 'academic' ? themeClasses[0] : `${theme}-theme-page`;

    themeClasses.forEach((cls) => {
      document.documentElement.classList.remove(cls);
      document.body.classList.remove(cls);
    });

    document.documentElement.classList.add(activeClass);
    document.body.classList.add(activeClass);
    document.documentElement.setAttribute('data-app-theme', theme);

    try {
      localStorage.setItem('preferredTheme', theme);
    } catch {
      // ignore
    }
  };

  const handleSelect = (theme: AccentTheme) => {
    applyTheme(theme);
    setIsOpen(false);
  };

  return (
    <div className="core-theme" ref={dropdownRef}>
      <button
        className="core-theme__trigger"
        type="button"
        aria-expanded={isOpen}
        aria-label="Accent theme preferences"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="core-theme__swatch" aria-hidden="true" />
        <span className="core-theme__label">Theme</span>
      </button>

      {isOpen && (
        <div
          className="core-theme__menu"
          role="group"
          aria-label="Theme accent"
        >
          <div className="core-theme__title">Theme Accent</div>
          <div>
            {THEME_OPTIONS.map((opt) => {
              const isActive = currentTheme === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`core-theme__option ${isActive ? 'is-active' : ''}`}
                  onClick={() => handleSelect(opt.id)}
                  aria-pressed={isActive}
                >
                  <span
                    className="core-theme__option-swatch"
                    style={{ backgroundColor: opt.dotColor }}
                  />
                  <span className="core-theme__option-copy">
                    <strong>{opt.name}</strong>
                    <small>{opt.subtitle}</small>
                  </span>
                  {isActive && <span className="core-theme__check" aria-hidden="true">&#10003;</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
