import { Coffee, Wifi, LogOut } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

export function TopBar() {
  const { user, logout } = useAuth()

  return (
    <header className="border-b border-[#2D2D2D] bg-[#121212]">
      <div className="mx-auto flex h-auto md:h-16 max-w-7xl flex-col md:flex-row items-center justify-between px-6 lg:px-10 py-3.5 md:py-0 gap-3.5 md:gap-0">
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-3">
            <div className="flex size-9 sm:size-10 items-center justify-center border border-[#2D2D2D] bg-[#1A1A1A]">
              <Coffee className="size-4 sm:size-5 text-[#EBE6DF]" aria-hidden="true" />
            </div>
            <div className="flex flex-col">
              <span className="font-serif text-base sm:text-lg font-normal leading-tight text-[#EBE6DF]">
                Mansarowar Cafe
              </span>
              <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.2em] text-[#A3A3A3] font-bold">
                Staff System Portal
              </span>
            </div>
          </div>
          
          {user && (
            <div className="flex flex-col items-end md:hidden">
              <span className="text-xs font-bold text-[#EBE6DF] truncate max-w-[120px]">{user.name}</span>
              <span className="text-[9px] text-[#A3A3A3] uppercase tracking-widest font-semibold">{user.role}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3 w-full md:w-auto justify-between md:justify-end border-t border-[#2D2D2D]/60 pt-3 md:border-t-0 md:pt-0">
          {user && (
            <div className="hidden md:flex flex-col items-end">
              <span className="text-xs font-bold text-[#EBE6DF]">{user.name}</span>
              <span className="text-[9px] text-[#A3A3A3] uppercase tracking-widest font-semibold">{user.role}</span>
            </div>
          )}
          
          <div className="flex items-center gap-2 border border-[#2D2D2D] bg-[#1A1A1A] px-2.5 sm:px-3 py-1.5 shrink-0">
            <span className="relative flex size-2 shrink-0">
              <span className="relative inline-flex size-2 bg-emerald-600 rounded-full" />
            </span>
            <span className="text-[10px] sm:text-xs font-bold text-[#EBE6DF] uppercase tracking-wider">
              <span className="inline sm:hidden">Online</span>
              <span className="hidden sm:inline">Counter Online</span>
            </span>
          </div>
          
          <div className="flex items-center gap-1.5 text-[#A3A3A3] font-mono text-[10px] sm:text-[11px] tracking-wider shrink-0">
            <Wifi className="size-3.5 sm:size-4 text-[#EBE6DF]" aria-hidden="true" />
            <span className="hidden xs:inline">Terminal 01</span>
          </div>

          {user && (
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 border border-[#2D2D2D] bg-[#1A1A1A] px-2.5 sm:px-3 py-1.5 text-xs font-bold text-[#EBE6DF] transition-colors hover:bg-[#EBE6DF] hover:text-black shrink-0"
              aria-label="Log out staff session"
            >
              <LogOut className="size-3.5" />
              <span>Logout</span>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
