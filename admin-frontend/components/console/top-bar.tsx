import { Coffee, Wifi, LogOut } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

export function TopBar() {
  const { user, logout } = useAuth()

  return (
    <header className="border-b border-[#2D2D2D] bg-[#121212]">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-10">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center border border-[#2D2D2D] bg-[#1A1A1A]">
            <Coffee className="size-5 text-[#EBE6DF]" aria-hidden="true" />
          </div>
          <div className="flex flex-col">
            <span className="font-serif text-lg font-normal leading-tight text-[#EBE6DF]">
              Mansarowar Cafe
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#A3A3A3] font-bold">
              Staff System Portal
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {user && (
            <div className="hidden flex-col items-end sm:flex">
              <span className="text-xs font-bold text-[#EBE6DF]">{user.name}</span>
              <span className="text-[9px] text-[#A3A3A3] uppercase tracking-widest font-semibold">{user.role}</span>
            </div>
          )}
          
          <div className="flex items-center gap-2 border border-[#2D2D2D] bg-[#1A1A1A] px-3 py-1.5">
            <span className="relative flex size-2">
              <span className="relative inline-flex size-2 bg-emerald-600" />
            </span>
            <span className="text-xs font-bold text-[#EBE6DF] uppercase tracking-wider">
              Counter Online
            </span>
          </div>
          
          <div className="hidden items-center gap-2 text-[#A3A3A3] sm:flex font-mono text-[11px] tracking-wider">
            <Wifi className="size-4 text-[#EBE6DF]" aria-hidden="true" />
            <span>Terminal 01</span>
          </div>

          {user && (
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 border border-[#2D2D2D] bg-[#1A1A1A] px-3 py-1.5 text-xs font-bold text-[#EBE6DF] transition-colors hover:bg-[#EBE6DF] hover:text-black"
              aria-label="Log out staff session"
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
