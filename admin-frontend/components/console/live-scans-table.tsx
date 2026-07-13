'use client'

import { ScanLine } from 'lucide-react'

export type CounterScan = {
  id: string
  timestamp: Date
  customerName: string
  status: 'credited'
}

type LiveScansTableProps = {
  scans: CounterScan[]
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function LiveScansTable({ scans }: LiveScansTableProps) {
  return (
    <section
      aria-label="Live counter scans"
      className="flex h-full flex-col border border-[#2D2D2D] bg-[#1A1A1A] p-5 sm:p-6 lg:p-8 rounded-[32px] sm:rounded-[48px] overflow-hidden shadow-none text-[#EBE6DF]"
    >
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg sm:text-xl font-normal text-[#EBE6DF]">
            Live Counter Scans
          </h2>
          <p className="mt-1 text-xs sm:text-sm leading-relaxed text-[#A3A3A3]">
            Stamps credited in real time as customers scan.
          </p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 border border-[#2D2D2D] bg-[#121212] px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-[16px] sm:rounded-[20px] overflow-hidden shrink-0">
          <ScanLine className="size-3.5 sm:size-4 text-[#EBE6DF]" aria-hidden="true" />
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#EBE6DF]">
            {scans.length} today
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden border border-[#2D2D2D] rounded-[24px] sm:rounded-[32px]">
        {scans.length === 0 ? (
          <div className="flex h-full min-h-[180px] sm:min-h-52 flex-col items-center justify-center gap-2 xs:gap-3 bg-[#1A1A1A] p-4 xs:p-6 sm:p-8 text-center">
            <div className="flex h-10 w-10 xs:h-12 xs:w-12 sm:h-14 sm:w-14 items-center justify-center border border-[#2D2D2D] bg-[#121212] rounded-[14px] xs:rounded-[18px] sm:rounded-[20px]">
              <ScanLine className="size-5 xs:size-6 text-[#A3A3A3]/30" aria-hidden="true" />
            </div>
            <h3 className="font-serif text-base xs:text-lg font-normal text-[#EBE6DF]">
              Awaiting customer scans&hellip;
            </h3>
            <p className="text-[11px] xs:text-xs text-[#A3A3A3] max-w-[220px] leading-relaxed">
              No activity recorded yet today. Scans will appear here live when customers claim stamps.
            </p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-[#121212] text-[10px] sm:text-xs uppercase tracking-wider text-[#EBE6DF] border-b border-[#2D2D2D]">
                <tr>
                  <th scope="col" className="px-3 sm:px-4 py-2 sm:py-3 font-semibold">
                    Timestamp
                  </th>
                  <th scope="col" className="px-3 sm:px-4 py-2 sm:py-3 font-semibold">
                    Customer
                  </th>
                  <th scope="col" className="px-3 sm:px-4 py-2 sm:py-3 text-right font-semibold">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2D2D2D] bg-[#1A1A1A]">
                {scans.map(scan => (
                  <tr key={scan.id} className="transition-colors hover:bg-[#121212]/40">
                    <td className="px-3 sm:px-4 py-2 sm:py-3 font-mono text-[10px] sm:text-xs tabular-nums text-[#A3A3A3]">
                      {formatTime(scan.timestamp)}
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 font-bold text-xs sm:text-sm text-[#EBE6DF] truncate max-w-[100px] sm:max-w-[150px]">
                      {scan.customerName}
                    </td>
                    <td className="px-3 sm:px-4 py-2 sm:py-3 text-right">
                      <span className="inline-flex items-center gap-1 sm:gap-1.5 border border-[#2D2D2D] bg-[#121212] px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#EBE6DF] rounded-[16px] sm:rounded-[20px] overflow-hidden">
                        <span className="size-1.5 bg-[#EBE6DF] shrink-0" aria-hidden="true" />
                        <span className="hidden xs:inline">{'Stamp Credited (+1)'}</span>
                        <span className="inline xs:hidden">{'+1'}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
