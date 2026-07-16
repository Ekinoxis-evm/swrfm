import { redirect } from 'next/navigation'

// Payments moved into the Vendors hub.
export default function ChargesRedirect() {
  redirect('/vendors/payments')
}
