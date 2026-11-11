import { redirect } from 'next/navigation'

// Endereço antigo: tudo agora fica na aba Comercial.
export default function OldPage() {
  redirect('/comercial')
}
