'use client'

import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { QrCode, RefreshCw } from 'lucide-react'
import { apiRequest } from '@/lib/api'
import toast from 'react-hot-toast'

const QR_LIFETIME_SECONDS = 30

type QrStampCardProps = {
  onSessionStart?: () => void
}

export function QrStampCard({ onSessionStart }: QrStampCardProps) {
  const [token, setToken] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [isExpired, setIsExpired] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isActive = token !== null && secondsLeft > 0

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  async function startSession() {
    if (isActive || isLoading) return

    setIsLoading(true)
    const toastId = toast.loading('Generating active loyalty token...')

    try {
      const response = await apiRequest<{ success: boolean; data: { token: string; expiresInSeconds: number } }>(
        '/api/admin/generate-qr',
        { method: 'POST' }
      )

      if (response.success && response.data?.token) {
        setToken(response.data.token)
        setSecondsLeft(response.data.expiresInSeconds || QR_LIFETIME_SECONDS)
        setIsExpired(false)
        toast.success('Loyalty token generated successfully!', { id: toastId })

        onSessionStart?.()

        if (intervalRef.current) clearInterval(intervalRef.current)
        intervalRef.current = setInterval(() => {
          setSecondsLeft(prev => {
            if (prev <= 1) {
              if (intervalRef.current) clearInterval(intervalRef.current)
              setToken(null) // Clear active token from UI state on expiration
              setIsExpired(true)
              return 0
            }
            return prev - 1
          })
        }, 1000)
      } else {
        throw new Error('Invalid response data from server.')
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate stamp token.', { id: toastId })
    } finally {
      setIsLoading(false)
    }
  }

  // Circular countdown geometry
  const radius = 26
  const circumference = 2 * Math.PI * radius
  const progress = secondsLeft / QR_LIFETIME_SECONDS
  const dashOffset = circumference * (1 - progress)

  return (
    <section
      aria-label="Stamp QR generator"
      className="flex h-full flex-col border border-[#2D2D2D] bg-[#1A1A1A] p-6 lg:p-8 rounded-[48px] overflow-hidden shadow-none"
    >
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-serif text-xl font-normal text-[#EBE6DF]">
            Loyalty Stamp Session
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-[#A3A3A3]">
            Generate a one-time QR for the customer at the counter.
          </p>
        </div>
        {isActive && (
          <div className="relative flex size-16 shrink-0 items-center justify-center" aria-live="polite">
            <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden="true">
              <circle cx="32" cy="32" r={radius} fill="none" strokeWidth="5" className="stroke-neutral-800" />
              <circle
                cx="32"
                cy="32"
                r={radius}
                fill="none"
                strokeWidth="5"
                strokeLinecap="square"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                className="stroke-[#EBE6DF] transition-all duration-1000 ease-linear"
              />
            </svg>
            <span className="absolute text-sm font-bold tabular-nums text-[#EBE6DF]">
              {secondsLeft}s
            </span>
            <span className="sr-only">{secondsLeft} seconds remaining before QR code expires</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <div
          className={`flex size-56 items-center justify-center border border-[#2D2D2D] bg-white rounded-[32px] overflow-hidden`}
        >
          {isActive && token ? (
            <QRCodeSVG value={token} size={192} bgColor="#ffffff" fgColor="#000000" level="M" title="Loyalty stamp QR code" />
          ) : isExpired ? (
            <div className="flex flex-col items-center gap-2 px-6 text-center">
              <RefreshCw className="size-8 text-[#EBE6DF]" aria-hidden="true" />
              <p className="text-sm font-bold uppercase tracking-wider text-[#EBE6DF]">QR expired</p>
              <p className="text-xs text-[#A3A3A3]">
                Generate a fresh code to continue stamping.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 px-6 text-center">
              <QrCode className="size-8 text-[#A3A3A3]/25" aria-hidden="true" />
              <p className="text-sm text-[#A3A3A3]">
                Your stamp QR will appear here
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={startSession}
          disabled={isLoading || isActive}
          className="w-full max-w-sm bg-[#EBE6DF] px-8 py-5 text-lg font-bold tracking-wide text-black uppercase transition-opacity hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none rounded-full border border-[#EBE6DF]"
        >
          {isLoading ? 'Generating...' : isActive ? 'Token Active' : 'Generate New Stamp Token'}
        </button>

        {isActive && token && (
          <p className="text-xs text-[#A3A3A3]">
            Session token:{' '}
            <span className="font-mono font-medium text-[#EBE6DF]">
              {token}
            </span>
          </p>
        )}
      </div>
    </section>
  )
}
