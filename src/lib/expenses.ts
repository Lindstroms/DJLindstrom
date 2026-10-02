import { supabase } from './supabase'
import { VAT } from './finance'

export type ExpenseCategory = 'udstyr' | 'koersel' | 'musik' | 'markedsfoering' | 'transport' | 'andet'

export type Expense = {
  id: string
  expense_date: string
  supplier: string
  description: string
  category: ExpenseCategory
  amount: number // inkl. moms
  vat: number // købsmoms
  receipt_path: string | null
  booking_id: string | null
  created_at: string
}

export type ExpenseInput = Omit<Expense, 'id' | 'created_at'>

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  udstyr: '🎛️ Udstyr',
  musik: '🎵 Musik & abonnementer',
  koersel: '🚗 Kørsel & brændstof',
  transport: '🚚 Transport & leje',
  markedsfoering: '📣 Markedsføring',
  andet: '📦 Andet',
}

// Momsdelen af et beløb inkl. 25 % moms (= 20 % af beløbet)
export const vatOf = (incl: number) => Math.round(((incl * VAT) / (1 + VAT)) * 100) / 100

function check<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data
}

const db = () => supabase!

export async function listExpenses(): Promise<Expense[]> {
  return check(await db().from('expenses').select('*').order('expense_date', { ascending: false }).order('created_at', { ascending: false })) as Expense[]
}

export async function saveExpense(id: string | null, input: ExpenseInput): Promise<string> {
  const { expense_date, supplier, description, category, amount, vat, receipt_path, booking_id } = input
  const e = { expense_date, supplier, description, category, amount, vat, receipt_path, booking_id }
  if (id) {
    check(await db().from('expenses').update(e).eq('id', id))
    return id
  }
  return (check(await db().from('expenses').insert(e).select('id').single()) as { id: string }).id
}

export async function deleteExpense(e: Expense) {
  check(await db().from('expenses').delete().eq('id', e.id))
  if (e.receipt_path) await db().storage.from('receipts').remove([e.receipt_path])
}

export async function removeReceipt(path: string) {
  await db().storage.from('receipts').remove([path])
}

// Billeder skaleres ned til max 1600 px og gemmes som JPEG – så fylder et telefonfoto ~300 kB
async function compress(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.8))
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file // fx HEIC i en browser der ikke kan læse det – gem originalen
  }
}

export async function uploadReceipt(file: File): Promise<string> {
  const blob = await compress(file)
  const ext = blob.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() || 'bin').toLowerCase()
  const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`
  check(await db().storage.from('receipts').upload(path, blob, { contentType: blob.type || file.type }))
  return path
}

export async function receiptUrl(path: string): Promise<string> {
  const { data, error } = await db().storage.from('receipts').createSignedUrl(path, 300)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

export type BookingOption = { id: string; event_date: string; customer_name: string }

export async function listBookingOptions(): Promise<BookingOption[]> {
  return check(
    await db().from('bookings').select('id, event_date, customer_name').in('status', ['bekraeftet', 'afholdt']).order('event_date', { ascending: false }).limit(100),
  ) as BookingOption[]
}

export function exportExpensesCsv(expenses: Expense[], year: number) {
  const rows = expenses.filter((e) => e.expense_date.startsWith(String(year))).sort((a, b) => a.expense_date.localeCompare(b.expense_date))
  const n = (x: number) => Number(x).toFixed(2).replace('.', ',')
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`
  const lines = [
    ['Dato', 'Leverandør', 'Beskrivelse', 'Kategori', 'Ekskl. moms', 'Moms', 'I alt', 'Kvittering'].join(';'),
    ...rows.map((e) =>
      [
        e.expense_date,
        q(e.supplier),
        q(e.description),
        q(CATEGORY_LABEL[e.category].replace(/^\S+\s/, '')),
        n(e.amount - e.vat),
        n(e.vat),
        n(e.amount),
        e.receipt_path ? 'Ja' : 'Nej',
      ].join(';'),
    ),
  ]
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `udgifter-${year}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
