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
      className="flex h-full flex-col border border-[#2D2D2D] bg-[#1A1A1A] p-6 lg:p-8 rounded-[48px] overflow-hidden shadow-none text-[#EBE6DF]"
    >
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-serif text-xl font-normal text-[#EBE6DF]">
            Live Counter Scans
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-[#A3A3A3]">
            Stamps credited in real time as customers scan.
          </p>
        </div>
        <div className="flex items-center gap-2 border border-[#2D2D2D] bg-[#121212] px-3 py-1.5 rounded-[20px] overflow-hidden">
          <ScanLine className="size-4 text-[#EBE6DF]" aria-hidden="true" />
          <span className="text-xs font-bold uppercase tracking-wider text-[#EBE6DF]">
            {scans.length} today
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden border border-[#2D2D2D] rounded-[32px]">
        {scans.length === 0 ? (
          <div className="flex h-full min-h-52 flex-col items-center justify-center gap-3 bg-[#1A1A1A] p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center border border-[#2D2D2D] bg-[#121212] rounded-[20px]">
              <ScanLine className="size-6 text-[#A3A3A3]/30" aria-hidden="true" />
            </div>
            <h3 className="font-serif text-lg font-normal text-[#EBE6DF]">
              Awaiting customer scans&hellip;
            </h3>
            <p className="text-xs text-[#A3A3A3] max-w-[220px] leading-relaxed">
              No activity recorded yet today. Scans will appear here live when customers claim stamps.
            </p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-[#121212] text-xs uppercase tracking-wider text-[#EBE6DF] border-b border-[#2D2D2D]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Timestamp
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Customer
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2D2D2D] bg-[#1A1A1A]">
                {scans.map(scan => (
                  <tr key={scan.id} className="transition-colors hover:bg-[#121212]/40">
                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-[#A3A3A3]">
                      {formatTime(scan.timestamp)}
                    </td>
                    <td className="px-4 py-3 font-bold text-[#EBE6DF]">
                      {scan.customerName}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1.5 border border-[#2D2D2D] bg-[#121212] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#EBE6DF] rounded-[20px] overflow-hidden">
                        <span className="size-1.5 bg-[#EBE6DF]" aria-hidden="true" />
                        {'Stamp Credited (+1)'}
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
