import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
  Menu,
  X,
  Sun,
  Moon,
  ArrowRight,
  Download as DownloadIcon,
  CheckCircle2,
  ChevronRight,
  Coffee,
  Sandwich,
  UtensilsCrossed,
  CupSoda,
  Pizza
} from 'lucide-react';

export function LandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeLink, setActiveLink] = useState('Home');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadStep, setDownloadStep] = useState<'select' | 'progress' | 'complete'>('select');
  const [downloadProgress, setDownloadProgress] = useState(0);

  const [currentView, setCurrentView] = useState<'home' | 'ritual'>('home');

  // PWA Install Event State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const triggerPwaInstall = async () => {
    if (!deferredPrompt) {
      // Fallback: start simulated APK download process
      startDownload();
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      toast.success("Thank you for installing Cafe Loyalty!");
      setDownloadStep("complete");
    } else {
      toast.error("Installation dismissed.");
    }
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  const navLinks = ['Home', 'Download', 'About'];
  const isDark = theme === 'dark';

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const handleDownloadClick = () => {
    setDownloadStep('select');
    setDownloadProgress(0);
    setShowDownloadModal(true);
  };

  const startDownload = () => {
    setDownloadStep('progress');
    const interval = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setDownloadStep('complete');
          return 100;
        }
        return prev + 10;
      });
    }, 150);
  };

  const colors = {
    bg: isDark ? '#000000' : '#FDFBF7',
    primaryText: isDark ? '#E1E0CC' : '#1A1A1A',
    accentText: '#DEDBC8',
    aboutCard: isDark ? '#101010' : '#F3EFE0',
    featureCard: isDark ? '#212121' : '#E9E4CE',
    border: isDark ? 'rgba(225, 224, 204, 0.15)' : 'rgba(26, 26, 26, 0.12)',
    mutedText: isDark ? 'rgba(225, 224, 204, 0.6)' : '#6F6F6F'
  };

  return (
    <div 
      id="app-container" 
      className="relative min-h-screen w-full transition-colors duration-700 overflow-x-hidden flex flex-col justify-between select-none"
      style={{
        backgroundColor: colors.bg,
        color: colors.primaryText
      }}
    >
      {/* Cinematic Film Grain Overlay (feTurbulence) */}
      <div className="pointer-events-none fixed inset-0 z-50 opacity-[0.14]" style={{ mixBlendMode: 'overlay' }}>
        <svg width="100%" height="100%">
          <filter id="pedantic-noise">
            <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="matrix" values="0 0 0 0 0   0 0 0 0 0   0 0 0 0 0  0 0 0 0.14 0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#pedantic-noise)" />
        </svg>
      </div>

      <AnimatePresence>
        {currentView === 'home' && (
          <motion.div
            key="home-view"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full flex flex-col"
          >
            {/* SECTION 1: HERO CONTAINER (Full Height) */}
            <section 
              id="home" 
              className="min-h-screen flex flex-col justify-between"
            >
              <div 
                id="hero-frame"
                className="relative min-h-screen w-full flex flex-col justify-between transition-all duration-700 overflow-hidden"
              >
                {/* Blur Overlays for the top and bottom edge transitions */}
                <div className="blur-overlay blur-overlay-top" />
                <div className="blur-overlay blur-overlay-bottom" />

                {/* Background Image Layer for Hero Section */}
                <img 
                  src="https://asset.imagine.art/processed/dde736f0-b139-42c0-9c33-6212a0b67ad1"
                  alt="Hero Background"
                  className={`absolute inset-0 w-full h-full object-cover pointer-events-none select-none z-0 transition-all duration-700 ${
                    isDark ? 'opacity-35 mix-blend-luminosity' : 'opacity-25 mix-blend-multiply'
                  }`}
                  referrerPolicy="no-referrer"
                />

                {/* Subtle vignette/radial gradient overlay to guarantee flawless text readability */}
                <div 
                  className="absolute inset-0 z-0 pointer-events-none transition-colors duration-700"
                  style={{ 
                    background: isDark 
                      ? 'radial-gradient(circle at center, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.7) 100%)' 
                      : 'radial-gradient(circle at center, rgba(253,243,219,0) 0%, rgba(253,243,219,0.4) 100%)' 
                  }}
                />

                {/* Decorative Geometric Dots - Top Left */}
                <div 
                  id="geometric-top-left" 
                  className="absolute top-28 left-8 md:left-12 flex gap-3 pointer-events-none select-none z-10"
                >
                  <div className={`w-2 h-2 rounded-full transition-colors duration-500 ${isDark ? 'bg-white' : 'bg-black'}`}></div>
                  <div className={`w-2 h-2 rounded-full border transition-colors duration-500 ${isDark ? 'border-white/20' : 'border-black/20'}`}></div>
                  <div className={`w-2 h-2 rounded-full border transition-colors duration-500 ${isDark ? 'border-white/20' : 'border-black/20'}`}></div>
                </div>

                {/* Navigation Bar (at the top of the Hero frame) */}
                <nav 
                  id="navbar" 
                  className="relative z-50 w-full max-w-7xl mx-auto px-8 py-6 flex items-center justify-between"
                >
                  {/* Logo */}
                  <a 
                    id="nav-logo" 
                    href="#" 
                    className="select-none hover:opacity-90 transition-all duration-500 flex flex-col items-center justify-center text-center"
                    onClick={(e) => {
                      e.preventDefault();
                      setCurrentView('home');
                    }}
                  >
                    {/* Cafe SVG Logo */}
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-coffee size-5 text-[#EBE6DF]" aria-hidden="true"><path d="M10 2v2" /><path d="M14 2v2" /><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" /><path d="M6 2v2" /></svg>

                    <div className="flex flex-col items-center select-none">
                      <span 
                        className="text-[8px] tracking-[0.25em] font-serif uppercase"
                        style={{ fontFamily: "'Instrument Serif', serif" }}
                      >
                        Cafe
                      </span>
                      <span 
                        className="text-xs tracking-widest font-serif font-bold uppercase -mt-0.5"
                        style={{ fontFamily: "'Instrument Serif', serif" }}
                      >
                        Coffesarowar
                      </span>
                      <span className="text-[5px] tracking-[0.3em] font-sans uppercase text-[#6F6F6F] mt-0.5">Drink, Eat, Repeat</span>
                    </div>
                  </a>

                  {/* Desktop Nav Links */}
                  <div id="nav-desktop-links" className="hidden md:flex items-center gap-8">
                    {navLinks.map((link) => (
                      <a
                        key={link}
                        href={`#${link.toLowerCase()}`}
                        className="text-sm transition-all relative py-1 font-sans duration-300"
                        style={{ 
                          color: activeLink === link ? colors.primaryText : 'rgba(225, 224, 204, 0.8)',
                          fontWeight: activeLink === link ? '500' : '400'
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          setActiveLink(link);
                          if (link === 'Download') {
                            handleDownloadClick();
                          } else {
                            const element = document.getElementById(link.toLowerCase());
                            if (element) {
                              element.scrollIntoView({ behavior: 'smooth' });
                            }
                          }
                        }}
                      >
                        {link}
                        {activeLink === link && (
                          <div className="absolute bottom-0 left-0 right-0 h-px" style={{ backgroundColor: colors.primaryText }} />
                        )}
                      </a>
                    ))}
                  </div>

                  {/* Right Control Actions */}
                  <div id="nav-right-controls" className="flex items-center gap-4">
                    {/* Theme Toggle Button */}
                    <button 
                      id="theme-toggle" 
                      onClick={toggleTheme}
                      className="p-2.5 rounded-full border transition-all duration-300 cursor-pointer"
                      style={{ 
                        borderColor: colors.border,
                        color: colors.primaryText
                      }}
                      aria-label="Toggle visual theme"
                    >
                      {isDark ? <Sun size={16} className="animate-pulse text-[#DEDBC8]" /> : <Moon size={16} />}
                    </button>

                    <div id="nav-desktop-cta" className="hidden md:block">
                      <motion.button
                        className="liquid-glass rounded-full px-6 py-2.5 text-sm font-sans font-medium cursor-pointer transition-all duration-500 hover:shadow-[0_0_15px_rgba(222,219,200,0.3)] border border-[#DEDBC8]/30 hover:border-[#DEDBC8]/60 bg-[#DEDBC8]/10 text-[#DEDBC8] hover:bg-[#DEDBC8]/20"
                        style={{ color: colors.primaryText }}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          if (user) {
                            navigate({ to: '/dashboard' });
                          } else {
                            navigate({ to: '/login' });
                          }
                        }}
                      >
                        {user ? 'Dashboard' : 'Login'}
                      </motion.button>
                    </div>

                    <button
                      id="mobile-menu-toggle"
                      className="md:hidden p-2 rounded-full transition-colors cursor-pointer"
                      style={{ color: colors.primaryText }}
                      onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                      aria-label="Toggle navigation menu"
                    >
                      {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                  </div>
                </nav>

                {/* Mobile Menu Panel */}
                <AnimatePresence>
                  {isMobileMenuOpen && (
                    <motion.div
                      id="mobile-menu-panel"
                      initial={{ opacity: 0, y: -20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      transition={{ duration: 0.2 }}
                      className="absolute top-24 left-6 right-6 z-40 p-6 rounded-2xl md:hidden flex flex-col gap-6 liquid-glass items-center"
                      style={{ color: colors.primaryText }}
                    >
                      <div className="flex flex-col gap-4 items-center">
                        {navLinks.map((link) => (
                          <a
                            key={link}
                            href={`#${link.toLowerCase()}`}
                            className="text-base transition-colors py-1 font-sans"
                            style={{
                              color: activeLink === link ? colors.primaryText : colors.mutedText,
                              fontWeight: activeLink === link ? '500' : '400',
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              setActiveLink(link);
                              setIsMobileMenuOpen(false);
                              if (link === 'Download') {
                                handleDownloadClick();
                              } else if (link === 'Login') {
                                navigate({ to: '/login' });
                              } else {
                                const element = document.getElementById(link.toLowerCase());
                                if (element) {
                                  element.scrollIntoView({ behavior: 'smooth' });
                                }
                              }
                            }}
                          >
                            {link}
                            {activeLink === link && (
                              <div className="absolute bottom-0 left-0 right-0 h-px" style={{ backgroundColor: colors.primaryText }} />
                            )}
                          </a>
                        ))}
                      </div>
                      <div className="h-px w-full" style={{ backgroundColor: colors.border }} />
                      <button
                        className="w-full text-center py-3 px-6 rounded-full font-sans font-medium transition-all duration-300"
                        style={{
                          backgroundColor: colors.primaryText,
                          color: isDark ? '#000000' : '#FFFFFF',
                        }}
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                          navigate({ to: '/login' });
                        }}
                      >
                        Login
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Bottom-Aligned Hero Typography & Description */}
                <main 
                  id="hero-content"
                  className="relative z-10 flex-1 flex flex-col items-center justify-center max-w-5xl mx-auto px-6 md:px-12 pt-16 pb-24 sm:pb-32 lg:pt-24 lg:pb-24 w-full text-center"
                >
                  <div className="flex-1 flex flex-col items-center text-center max-w-3xl">
                    <motion.h1 
                      id="hero-headline"
                      className="font-serif font-normal text-5xl sm:text-7xl md:text-8xl lg:text-[90px] leading-[0.95]"
                      style={{ 
                        letterSpacing: '-2.46px',
                        color: colors.primaryText
                      }}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.9, delay: 0.1 }}
                    >
                      Your <span id="headline-italic-ritual" className="italic font-serif text-[#6F6F6F]">Daily Ritual,</span><br className="hidden sm:inline" /> Beautifully <span id="headline-italic-rewarded" className="italic font-serif text-[#6F6F6F]">Rewarded.</span>
                    </motion.h1>

                    <motion.p 
                      id="hero-description"
                      className="font-sans text-base sm:text-lg md:text-xl mt-8 leading-relaxed max-w-2xl"
                      style={{ color: colors.mutedText }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 1.2, delay: 0.4 }}
                    >
                      A distraction-free loyalty canvas designed for the relentless, the consistent, and the driven. From precise micro-lots to effortless digital stamps, we craft the ultimate catalyst for your next breakthrough.
                    </motion.p>

                    <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.8, delay: 0.6 }}
                      className="mt-10"
                    >
                      <motion.button
                        id="hero-cta-button"
                        className="font-sans rounded-full px-14 py-5 text-base sm:text-lg font-medium cursor-pointer transition-all duration-500 shadow-sm flex items-center gap-3 bg-[#DEDBC8] text-black hover:bg-[#CECAB6]"
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setCurrentView('ritual')}
                      >
                        Download now
                        <ArrowRight size={18} />
                      </motion.button>
                    </motion.div>
                  </div>
                </main>

                {/* Mini elegant footer at bottom of hero frame */}
                <div className="relative z-10 w-full px-8 py-6 flex justify-between items-center text-[10px] uppercase tracking-widest text-[#6F6F6F] font-sans border-t pb-16 md:pb-20" style={{ borderColor: colors.border }}>
                  <span>Est. MMXXIV</span>
                  <span className="hidden sm:inline">Designed for Introspection</span>
                  <span>v1.0.2</span>
                </div>

              </div>
            </section>

            {/* NEW SECTION: MENU FEATURE */}
            <section 
              id="menu" 
              className="relative w-full bg-white text-[#1A1A1A] py-24 px-6 z-30"
            >
              {/* Torn Paper Divider (top of section) */}
              <div className="absolute top-0 left-0 right-0 w-full overflow-hidden leading-[0] z-20 pointer-events-none select-none -translate-y-[99%]">
                <svg 
                  viewBox="0 0 1440 100" 
                  className="relative block w-full h-[45px] md:h-[60px]" 
                  preserveAspectRatio="none"
                >
                  <path 
                    d="M 0 100 L 0 45 L 22 52 L 41 33 L 62 48 L 85 28 L 108 55 L 132 38 L 151 46 L 178 30 L 198 52 L 220 41 L 244 58 L 268 35 L 291 48 L 315 32 L 338 54 L 358 41 L 382 50 L 405 32 L 428 55 L 452 39 L 472 48 L 498 30 L 522 52 L 541 41 L 565 58 L 588 35 L 611 48 L 635 32 L 658 54 L 678 41 L 702 50 L 725 32 L 748 55 L 772 39 L 792 48 L 818 30 L 842 52 L 861 41 L 885 58 L 908 35 L 931 48 L 955 32 L 978 54 L 998 41 L 1022 50 L 1045 32 L 1068 55 L 1092 39 L 1112 48 L 1138 30 L 1162 52 L 1181 41 L 1205 58 L 1228 35 L 1251 48 L 1275 32 L 1298 54 L 1318 41 L 1342 50 L 1365 32 L 1388 55 L 1412 39 L 1432 48 L 1440 42 L 1440 100 Z" 
                    fill="#FFFFFF" 
                  />
                </svg>
              </div>

              <div className="w-full max-w-7xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8 items-center justify-center">
                  
                  {/* Left Label Column */}
                  <div className="order-2 md:order-1 flex flex-col gap-12 md:gap-16 justify-center">
                    {/* Grilled Sandwich */}
                    <div className="flex flex-row items-center justify-center md:justify-end gap-4 text-center md:text-right w-full">
                      <div className="flex flex-col">
                        <h3 className="font-serif font-bold text-[#1A1A1A] text-base sm:text-lg">
                          Grilled Sandwich
                        </h3>
                        <p className="text-gray-500 text-xs sm:text-sm mt-1 leading-relaxed max-w-xs">
                          Artisanal sourdough pressed with aged cheddar, vine-ripened tomatoes, and wild basil pesto.
                        </p>
                      </div>
                      <div className="text-[#C19A6B] shrink-0 w-10 sm:w-12 h-10 sm:h-12 flex items-center justify-center">
                        <Sandwich size={40} strokeWidth={1} className="w-10 sm:w-12 h-10 sm:h-12" />
                      </div>
                    </div>

                    {/* French Fries */}
                    <div className="flex flex-row items-center justify-center md:justify-end gap-4 text-center md:text-right w-full">
                      <div className="flex flex-col">
                        <h3 className="font-serif font-bold text-[#1A1A1A] text-base sm:text-lg">
                          French Fries
                        </h3>
                        <p className="text-gray-500 text-xs sm:text-sm mt-1 leading-relaxed max-w-xs">
                          Thick-cut russet potatoes dusted with sea salt, smoked paprika, and fresh rosemary.
                        </p>
                      </div>
                      <div className="text-[#C19A6B] shrink-0 w-10 sm:w-12 h-10 sm:h-12 flex items-center justify-center">
                        <Pizza size={40} strokeWidth={1} className="w-10 sm:w-12 h-10 sm:h-12" />
                      </div>
                    </div>

                    {/* Burger */}
                    <div className="flex flex-row items-center justify-center md:justify-end gap-4 text-center md:text-right w-full">
                      <div className="flex flex-col">
                        <h3 className="font-serif font-bold text-[#1A1A1A] text-base sm:text-lg">
                          Burger
                        </h3>
                        <p className="text-gray-500 text-xs sm:text-sm mt-1 leading-relaxed max-w-xs">
                          Flame-grilled signature beef patty, melt-in-your-mouth brioche bun, house-made truffle aioli.
                        </p>
                      </div>
                      <div className="text-[#C19A6B] shrink-0 w-10 sm:w-12 h-10 sm:h-12 flex items-center justify-center">
                        <UtensilsCrossed size={40} strokeWidth={1} className="w-10 sm:w-12 h-10 sm:h-12" />
                      </div>
                    </div>
                  </div>

                  {/* Center column */}
                  <div className="order-1 md:order-2 flex items-center justify-center">
                    <img 
                      src="https://asset.imagine.art/processed/e7fc0a6f-8f2a-4ae8-beeb-99ca3246336f"
                      alt="Featured Coffee Cup"
                      className="w-[220px] sm:w-[280px] md:w-[320px] aspect-square object-contain relative z-10 select-none"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  {/* Right Label Column */}
                  <div className="order-3 md:order-3 flex flex-col gap-12 md:gap-16 justify-center">
                    {/* Cold Coffee */}
                    <div className="flex flex-row items-center justify-center md:justify-start gap-4 text-center md:text-left w-full">
                      <div className="text-[#C19A6B] shrink-0 w-10 sm:w-12 h-10 sm:h-12 flex items-center justify-center">
                        <CupSoda size={40} strokeWidth={1} className="w-10 sm:w-12 h-10 sm:h-12" />
                      </div>
                      <div className="flex flex-col">
                        <h3 className="font-serif font-bold text-[#1A1A1A] text-base sm:text-lg">
                          Cold Coffee
                        </h3>
                        <p className="text-gray-500 text-xs sm:text-sm mt-1 leading-relaxed max-w-xs">
                          Slow-steeped organic cold brew poured over ice, lightly sweetened with madagascar vanilla.
                        </p>
                      </div>
                    </div>

                    {/* Cappuccino */}
                    <div className="flex flex-row items-center justify-center md:justify-start gap-4 text-center md:text-left w-full">
                      <div className="text-[#C19A6B] shrink-0 w-10 sm:w-12 h-10 sm:h-12 flex items-center justify-center">
                        <Coffee size={40} strokeWidth={1} className="w-10 sm:w-12 h-10 sm:h-12" />
                      </div>
                      <div className="flex flex-col">
                        <h3 className="font-serif font-bold text-[#1A1A1A] text-base sm:text-lg">
                          Cappuccino
                        </h3>
                        <p className="text-gray-500 text-xs sm:text-sm mt-1 leading-relaxed max-w-xs">
                          Perfect double shot of rich espresso topped with velvety, micro-foamed milk.
                        </p>
                      </div>
                    </div>

                    {/* Espresso */}
                    <div className="flex flex-row items-center justify-center md:justify-start gap-4 text-center md:text-left w-full">
                      <div className="text-[#C19A6B] shrink-0 w-10 sm:w-12 h-10 sm:h-12 flex items-center justify-center">
                        <Coffee size={32} strokeWidth={1} className="w-8 sm:w-10 h-8 sm:h-10 rotate-12" />
                      </div>
                      <div className="flex flex-col">
                        <h3 className="font-serif font-bold text-[#1A1A1A] text-base sm:text-lg">
                          Espresso
                        </h3>
                        <p className="text-gray-500 text-xs sm:text-sm mt-1 leading-relaxed max-w-xs">
                          Intense, complex double shot featuring a golden crema, roasted from single-origin beans.
                        </p>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </section>

            {/* SECTION 2: ABOUT */}
            <section 
              id="about" 
              className="relative w-full px-4 sm:px-8 md:px-16 py-24 md:py-32 flex flex-col items-center justify-center overflow-hidden z-10"
              style={{ backgroundColor: '#F0E9D8' }}
            >
              {/* Torn Paper Divider */}
              <div className="absolute top-0 left-0 right-0 w-full overflow-hidden leading-[0] z-20 pointer-events-none select-none -translate-y-[99%]">
                <svg 
                  viewBox="0 0 1440 100" 
                  className="relative block w-full h-[45px] md:h-[60px]" 
                  preserveAspectRatio="none"
                >
                  <path 
                    d="M 0 100 L 0 45 L 22 52 L 41 33 L 62 48 L 85 28 L 108 55 L 132 38 L 151 46 L 178 30 L 198 52 L 220 41 L 244 58 L 268 35 L 291 48 L 315 32 L 338 54 L 358 41 L 382 50 L 405 32 L 428 55 L 452 39 L 472 48 L 498 30 L 522 52 L 541 41 L 565 58 L 588 35 L 611 48 L 635 32 L 658 54 L 678 41 L 702 50 L 725 32 L 748 55 L 772 39 L 792 48 L 818 30 L 842 52 L 861 41 L 885 58 L 908 35 L 931 48 L 955 32 L 978 54 L 998 41 L 1022 50 L 1045 32 L 1068 55 L 1092 39 L 1112 48 L 1138 30 L 1162 52 L 1181 41 L 1205 58 L 1228 35 L 1251 48 L 1275 32 L 1298 54 L 1318 41 L 1342 50 L 1365 32 L 1388 55 L 1412 39 L 1432 48 L 1440 42 L 1440 100 Z" 
                    fill="#F0E9D8" 
                  />
                </svg>
              </div>
              <img 
                  src="https://asset.imagine.art/processed/f8f73f38-9cc6-4d33-be5b-2ae86cf0dfda"
                  alt="Coffee Beans Background Texture"
                  className="absolute bottom-0 left-0 w-96 h-96 object-cover pointer-events-none select-none z-0 opacity-50 transition-opacity duration-700"
                  referrerPolicy="no-referrer"
              />

              <div 
                className="absolute inset-0 z-10 pointer-events-none"
                style={{ 
                  background: 'radial-gradient(circle, rgba(240, 233, 216, 0) 50%, #F0E9D8 100%)' 
                }}
              />

              <div 
                className="relative z-20 w-full max-w-5xl px-4 py-8 md:py-16 flex flex-col items-center text-center pt-24 sm:pt-16 md:pt-8"
              >
                <span 
                  className="text-[11px] font-bold tracking-[0.25em] uppercase mb-6 text-[#605850]"
                >
                  THE PHILOSOPHY
                </span>

                <h2 
                  className="font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl max-w-4xl leading-tight font-normal mb-8 text-[#1A1A1A]"
                  style={{ letterSpacing: '-1.5px' }}
                >
                  Beyond <span className="font-serif italic text-[#605850]">caffeine,</span> we anchor routines that spark <span className="font-serif italic text-[#605850]">vibrant communities.</span>
                </h2>

                <p 
                  className="font-sans text-base sm:text-lg max-w-2xl leading-relaxed text-[#3E3834]"
                >
                  A truly great café is defined by the community created within its walls. We aim to be your definitive third place—the space between home and work where you are always recognized. We obsess over the atmosphere, the music, and the service so you can seamlessly obsess over what matters most to you.
                </p>

                <div className="mt-10 flex gap-8 items-center justify-center">
                  <div className="flex flex-col items-center">
                    <span className="font-serif text-4xl font-normal text-[#504840] italic">99%</span>
                    <span className="text-[10px] uppercase tracking-widest mt-1 text-[#6A645F]">Noise Reduction</span>
                  </div>
                  <div className="w-px h-10 bg-[#1A1A1A]/10" />
                  <div className="flex flex-col items-center">
                    <span className="font-serif text-4xl font-normal text-[#504840] italic">4K+</span>
                    <span className="text-[10px] uppercase tracking-widest mt-1 text-[#6A645F]">Solitude Hours</span>
                  </div>
                </div>
              </div>
            </section>

            {/* SECTION 3: FEATURES */}
            <section 
              id="features" 
              className="w-full px-6 md:px-12 py-24 md:py-32 flex flex-col items-center transition-colors duration-700"
              style={{ 
                backgroundColor: colors.bg,
                borderTop: `1px solid ${colors.border}`
              }}
            >
              <div className="w-full max-w-7xl">
                <div className="mb-16 md:mb-24 text-left max-w-3xl">
                  <span className="text-xs uppercase tracking-[0.3em] font-sans text-gray-500 block mb-3">
                    CAPABILITIES
                  </span>
                  <h2 
                    className="text-4xl sm:text-5xl md:text-6xl font-normal tracking-tight font-serif"
                    style={{ color: colors.primaryText }}
                  >
                    Curated Artifacts
                  </h2>
                  <p 
                    className="text-lg sm:text-xl font-sans mt-3"
                    style={{ color: colors.mutedText }}
                  >
                    Engineered meticulously for absolute deep-focus flows.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {/* Card 1 */}
                  <div 
                    className="rounded-2xl p-8 flex flex-col justify-between min-h-[300px] border transition-all duration-300 hover:scale-[1.02]"
                    style={{ 
                      backgroundColor: colors.featureCard,
                      borderColor: colors.border
                    }}
                  >
                    <div>
                      <span className="text-xs font-mono opacity-50 block mb-6">01 // VISUAL</span>
                      <h3 className="text-2xl font-serif font-normal mb-3" style={{ color: colors.primaryText }}>
                        Digital Havens
                      </h3>
                      <p className="text-sm leading-relaxed" style={{ color: colors.mutedText }}>
                        Tailored minimal workspace templates, ambient background soundscapes, and completely zero-distraction focus UI interfaces.
                      </p>
                    </div>
                    <div className="mt-8 flex items-center justify-between">
                      <span className="text-xs uppercase tracking-widest text-[#6F6F6F]">Pure Flow</span>
                      <ChevronRight size={16} className="text-[#6F6F6F]" />
                    </div>
                  </div>

                  {/* Card 2 */}
                  <div 
                    className="rounded-2xl p-8 flex flex-col justify-between min-h-[300px] border transition-all duration-300 hover:scale-[1.02]"
                    style={{ 
                      backgroundColor: colors.featureCard,
                      borderColor: colors.border
                    }}
                  >
                    <div>
                      <span className="text-xs font-mono opacity-50 block mb-6">02 // COGNITIVE</span>
                      <h3 className="text-2xl font-serif font-normal mb-3" style={{ color: colors.primaryText }}>
                        Artisanal Fuel
                      </h3>
                      <p className="text-sm leading-relaxed" style={{ color: colors.mutedText }}>
                        Single-origin micro-lots, custom roasted and timed for peak cognitive clarity. Designed for creative stamina and intellectual vigor.
                      </p>
                    </div>
                    <div className="mt-8 flex items-center justify-between">
                      <span className="text-xs uppercase tracking-widest text-[#6F6F6F]">Organic</span>
                      <ChevronRight size={16} className="text-[#6F6F6F]" />
                    </div>
                  </div>

                  {/* Card 3 */}
                  <div 
                    className="rounded-2xl p-8 flex flex-col justify-between min-h-[300px] border transition-all duration-300 hover:scale-[1.02]"
                    style={{ 
                      backgroundColor: colors.featureCard,
                      borderColor: colors.border
                    }}
                  >
                    <div>
                      <span className="text-xs font-mono opacity-50 block mb-6">03 // INTUITION</span>
                      <h3 className="text-2xl font-serif font-normal mb-3" style={{ color: colors.primaryText }}>
                        Acoustic Quiet
                      </h3>
                      <p className="text-sm leading-relaxed" style={{ color: colors.mutedText }}>
                        Offline-friendly modes, atmospheric isolation, and complete spatial quiet zones carefully tuned for genuine mental introspection.
                      </p>
                    </div>
                    <div className="mt-8 flex items-center justify-between">
                      <span className="text-xs uppercase tracking-widest text-[#6F6F6F]">Spatial</span>
                      <ChevronRight size={16} className="text-[#6F6F6F]" />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* FOOTER */}
            <footer 
              className="w-full max-w-7xl mx-auto px-8 py-8 flex flex-col sm:flex-row justify-between items-center text-[11px] uppercase tracking-widest font-sans gap-4 border-t"
              style={{ 
                borderColor: colors.border,
                color: colors.mutedText 
              }}
            >
              <span>© 2026 VELORAH® COLLECTIVE.</span>
              <div className="flex gap-6">
                <a href="#" className="hover:text-primary transition-colors">Privacy</a>
                <a href="#" className="hover:text-primary transition-colors">Terms</a>
                <a href="#" className="hover:text-primary transition-colors">Acoustics</a>
              </div>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {currentView === 'ritual' && (
          <motion.div
            key="ritual-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-40 bg-black flex flex-col justify-between overflow-y-auto"
          >
            {/* Page 2 Nav Header */}
            <div className="w-full max-w-7xl mx-auto px-8 py-6 flex justify-between items-center z-50">
              <motion.button 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                onClick={() => setCurrentView('home')}
                className="text-xs uppercase tracking-[0.2em] text-[#6B6B6B] hover:text-[#E8E6D9] transition-colors flex items-center gap-2 cursor-pointer font-sans bg-transparent border-none"
              >
                ← Back to Sanctuary
              </motion.button>
              
              <span className="text-[11px] font-bold tracking-tighter font-serif text-[#6B6B6B]">
                ARCHETYPE.
              </span>
            </div>

            {/* Centered Main Content Area */}
            <div className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto px-6 text-center py-12 md:py-16 gap-8 z-10">
              {/* Centered Coffee Icon */}
              <div className="relative z-20 flex justify-center items-center">
                <motion.div
                  layoutId="coffee-cup"
                  className="w-20 h-20 rounded-full border border-[#E8E6D9]/10 bg-white/5 flex items-center justify-center text-[#E8E6D9]/80 shadow-lg"
                  transition={{ type: 'spring', stiffness: 120, damping: 18 }}
                >
                  <Coffee size={32} strokeWidth={1.5} className="animate-pulse" />
                </motion.div>
              </div>

              {/* Staggered Content Container */}
              <motion.div 
                className="flex flex-col items-center gap-6"
                initial="hidden"
                animate="visible"
                variants={{
                  hidden: { opacity: 0 },
                  visible: {
                    opacity: 1,
                    transition: {
                      delayChildren: 0.5,
                      staggerChildren: 0.1
                    }
                  }
                }}
              >
                {/* Headline */}
                <motion.h1 
                  variants={{
                    hidden: { opacity: 0, y: 16 },
                    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
                  }}
                  className="font-serif font-normal text-4xl sm:text-6xl md:text-7xl leading-tight tracking-tight"
                >
                  <span className="text-[#E8E6D9]">Your Daily Ritual,</span><br />
                  <span className="italic font-serif text-[#6B6B6B]">Beautifully Rewarded.</span>
                </motion.h1>

                {/* Subtext */}
                <motion.p 
                  variants={{
                    hidden: { opacity: 0, y: 16 },
                    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
                  }}
                  className="font-sans text-sm sm:text-base text-gray-500 max-w-xl leading-relaxed"
                >
                  Unlock mindful achievements, earn bespoke micro-lots, and sync your focus flow.
                </motion.p>

                {/* Actions: Preview Pill & Download Button */}
                <motion.div 
                  variants={{
                    hidden: { opacity: 0, y: 16 },
                    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
                  }}
                  className="flex flex-col sm:flex-row justify-center items-center gap-4 mt-4"
                >
                  <span className="px-5 py-2.5 rounded-full text-xs font-mono tracking-wider border border-[#E8E6D9]/15 text-[#E8E6D9]/70 bg-white/5 select-none">
                    {isInstallable ? 'Installable PWA Active' : 'App Client Ready'}
                  </span>
                  <button 
                    onClick={triggerPwaInstall}
                    className="px-8 py-3.5 rounded-full bg-[#E8E6D9] text-black text-sm font-medium hover:bg-white transition-colors cursor-pointer flex items-center gap-2 font-sans shadow-md border-none"
                  >
                    {isInstallable ? 'Install Native PWA' : 'Download App'}
                    <ArrowRight size={14} />
                  </button>
                </motion.div>
              </motion.div>
            </div>

            {/* Page 2 Footer row */}
            <div className="w-full px-8 py-6 flex justify-between items-center text-xs uppercase tracking-widest text-[#6B6B6B] font-sans border-t border-white/5">
              <span>EST. MMXXIV</span>
              <span className="hidden sm:inline">DESIGNED FOR INTROSPECTION</span>
              <span>V1.0.2</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interactive Download Dialog Modal */}
      <AnimatePresence>
        {showDownloadModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              className="fixed inset-0 bg-black/60 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDownloadModal(false)}
            />
            
            <motion.div 
              className="relative w-full max-w-md rounded-3xl p-8 border overflow-hidden liquid-glass shadow-2xl z-10 text-center"
              style={{ 
                color: colors.primaryText,
                borderColor: colors.border,
                backgroundColor: isDark ? '#0a0a0a' : '#FAF8F2'
              }}
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", duration: 0.5 }}
            >
              <button 
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer border-none"
                onClick={() => setShowDownloadModal(false)}
              >
                <X size={18} />
              </button>

              {downloadStep === 'select' && (
                <div>
                  <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[#DEDBC8]/10 flex items-center justify-center text-[#DEDBC8]">
                    <DownloadIcon size={28} />
                  </div>
                  <h3 className="text-2xl font-serif font-normal mb-2">Begin Archetype</h3>
                  <p className="text-sm text-gray-400 mb-8 max-w-xs mx-auto">
                    Download the official digital focus studio client for your creative environment.
                  </p>
                  
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={triggerPwaInstall}
                      className="w-full py-4 px-6 rounded-xl bg-[#DEDBC8] text-black font-medium text-sm flex items-center justify-between hover:opacity-95 transition-opacity cursor-pointer border-none"
                    >
                      <span>Get App for Android</span>
                      <span className="text-xs opacity-60">{isInstallable ? 'PWA Native' : 'APK Package'}</span>
                    </button>
                    <button 
                      onClick={startDownload}
                      className="w-full py-4 px-6 rounded-xl bg-white/5 border border-white/10 text-white font-medium text-sm flex items-center justify-between hover:bg-white/10 transition-colors cursor-pointer border-none"
                    >
                      <span>Get Windows Client</span>
                      <span className="text-xs opacity-40">x64 .msi</span>
                    </button>
                  </div>
                </div>
              )}

              {downloadStep === 'progress' && (
                <div className="py-8">
                  <h3 className="text-xl font-serif mb-4">Establishing Secure Stream...</h3>
                  <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mb-6">
                    <motion.div 
                      className="h-full bg-[#DEDBC8]" 
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-400">{downloadProgress}% complete</span>
                </div>
              )}

              {downloadStep === 'complete' && (
                <div>
                  <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <CheckCircle2 size={32} />
                  </div>
                  <h3 className="text-2xl font-serif font-normal mb-2">Ready for Introspection</h3>
                  <p className="text-sm text-gray-400 mb-8 max-w-xs mx-auto">
                    The package has been initiated. Open the installer to begin crafting your digital haven.
                  </p>
                  <button 
                    onClick={() => setShowDownloadModal(false)}
                    className="w-full py-4 rounded-xl bg-white/10 border border-white/15 text-white font-medium text-sm hover:bg-white/15 transition-all cursor-pointer border-none"
                  >
                    Close
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
