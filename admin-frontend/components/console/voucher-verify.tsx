'use client'

import { useState } from 'react'
import { BadgeCheck, Search, Ticket, XCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { apiRequest } from '@/lib/api'
import toast from 'react-hot-toast'

const voucherSchema = z.object({
  voucherCode: z
    .string()
    .trim()
    .min(1, 'Voucher code is required')
    .regex(/^CAFE-[A-Z0-9]+$/i, 'Voucher code must start with "CAFE-" and contain only letters or numbers')
})

type VoucherFormValues = z.infer<typeof voucherSchema>

type VerifyResult =
  | { state: 'idle' }
  | { state: 'valid'; code: string }
  | { state: 'invalid'; code: string }

export function VoucherVerify() {
  const [result, setResult] = useState<VerifyResult>({ state: 'idle' })
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<VoucherFormValues>({
    resolver: zodResolver(voucherSchema),
    defaultValues: {
      voucherCode: ''
    }
  })

  async function onSubmit(values: VoucherFormValues) {
    if (isLoading) return

    setIsLoading(true)
    const toastId = toast.loading('Redeeming voucher...')
    const code = values.voucherCode.trim().toUpperCase()

    try {
      const response = await apiRequest<{ success: boolean; message: string }>(
        '/api/admin/redeem-voucher',
        {
          method: 'POST',
          body: { voucherCode: code }
        }
      )

      if (response.success) {
        toast.success(response.message || 'Voucher successfully redeemed. Dispense free coffee reward.', {
          id: toastId,
          duration: 5000
        })
        setResult({ state: 'valid', code })
        reset() // Clear the input field upon success
      } else {
        throw new Error(response.message || 'Redemption failed.')
      }
    } catch (err: any) {
      const errMsg = err.message || 'Failed to redeem voucher.'
      toast.error(errMsg, { id: toastId, duration: 5000 })
      setResult({ state: 'invalid', code })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section
      aria-label="Verify free coffee voucher"
      className="border border-[#2D2D2D] bg-[#1A1A1A] p-6 lg:p-8 rounded-[48px] overflow-hidden shadow-none text-[#EBE6DF]"
    >
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center border border-[#2D2D2D] bg-[#121212] rounded-[16px]">
          <Ticket className="size-5 text-[#EBE6DF]" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-serif text-xl font-normal text-[#EBE6DF]">
            Verify Free Coffee Voucher
          </h2>
          <p className="mt-0.5 text-sm leading-relaxed text-[#A3A3A3]">
            Enter the customer&apos;s voucher code to confirm and redeem.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#A3A3A3]/55"
            aria-hidden="true"
          />
          <label htmlFor="voucher-code" className="sr-only">
            Voucher code
          </label>
          <input
            id="voucher-code"
            type="text"
            autoComplete="off"
            spellCheck={false}
            disabled={isLoading}
            placeholder="e.g. CAFE-8H2K9Q"
            {...register('voucherCode')}
            className="h-14 w-full rounded-[32px] border border-[#2D2D2D] bg-[#121212] pl-12 pr-4 font-mono text-base uppercase tracking-wider text-[#EBE6DF] placeholder:normal-case placeholder:font-sans placeholder:tracking-normal placeholder:text-[#A3A3A3]/40 focus:outline-none focus:border-[#EBE6DF] disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="h-14 rounded-full bg-[#EBE6DF] px-8 text-base font-bold text-black uppercase tracking-widest border border-[#EBE6DF] hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? 'Redeeming…' : 'Redeem Reward'}
        </button>
      </form>

      {errors.voucherCode && (
        <p className="mt-2 text-xs text-red-500 font-semibold" role="alert">{errors.voucherCode.message}</p>
      )}

      <div aria-live="polite" className="mt-4 min-h-6">
        {result.state === 'valid' && (
          <div className="flex items-center gap-3 border border-[#2D2D2D] bg-[#121212] px-4 py-3 rounded-[24px]">
            <BadgeCheck className="size-5 shrink-0 text-[#EBE6DF]" aria-hidden="true" />
            <p className="text-sm text-[#EBE6DF]">
              <span className="font-bold uppercase tracking-wider">Voucher valid.</span>{' '}
              Free coffee redeemed successfully.{' '}
              <span className="font-mono text-xs text-[#A3A3A3]">
                ({result.code})
              </span>
            </p>
          </div>
        )}
        {result.state === 'invalid' && (
          <div className="flex items-center gap-3 border border-red-950 bg-red-950/20 px-4 py-3 rounded-[24px]">
            <XCircle className="size-5 shrink-0 text-red-500" aria-hidden="true" />
            <p className="text-sm text-[#EBE6DF]">
              <span className="font-bold uppercase tracking-wider text-red-500">
                Invalid or already redeemed.
              </span>{' '}
              Code{' '}
              <span className="font-mono text-xs text-red-500 font-semibold">{result.code}</span> was not
              found or has already been used. Please check with the customer.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
