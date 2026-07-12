'use client'

import { useEffect, useRef, useState } from 'react'
import { TopBar } from '@/components/console/top-bar'
import { QrStampCard } from '@/components/console/qr-stamp-card'
import { LiveScansTable, type CounterScan } from '@/components/console/live-scans-table'
import { VoucherVerify } from '@/components/console/voucher-verify'
import { apiRequest } from '@/lib/api'

export default function ConsolePage() {
  const [scans, setScans] = useState<CounterScan[]>([])
  const fetchScansRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    const fetchRecentScans = async () => {
      try {
        const response = await apiRequest<{ success: boolean; data: any[] }>(
          '/api/admin/recent-scans'
        )
        if (response.success && Array.isArray(response.data)) {
          const parsedScans = response.data.map(scan => ({
            ...scan,
            timestamp: new Date(scan.timestamp)
          }))
          setScans(parsedScans)
        }
      } catch (err) {
        console.error('Failed to fetch recent scans:', err)
      }
    }
    fetchScansRef.current = fetchRecentScans

    fetchRecentScans()
    const interval = setInterval(fetchRecentScans, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleSessionStart = () => {
    fetchScansRef.current()
  }

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <TopBar />

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8 lg:px-10">
        <div className="mb-8">
          <h1 className="font-serif text-3xl font-semibold text-foreground text-balance">
            Barista Workspace
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Issue loyalty stamps, monitor counter scans, and redeem vouchers.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <QrStampCard onSessionStart={handleSessionStart} />
          <LiveScansTable scans={scans} />
        </div>

        <div className="mt-6">
          <VoucherVerify />
        </div>
      </main>

      <footer className="border-t border-border py-4">
        <p className="text-center text-xs text-muted-foreground">
          Mansarowar Cafe — Internal staff system. Authorized baristas only.
        </p>
      </footer>
    </div>
  )
}
