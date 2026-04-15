import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export type Categoria = 'Comida' | 'Tech/Vlog' | 'Transporte' | 'Viajes' | 'Ocio' | 'Suscripciones' | 'Cuotas' | 'Fintual' | 'Otro'

export interface Transaccion {
  id?: string
  fecha: string
  descripcion: string
  monto: number
  categoria: Categoria
  origen?: string
  creado_en?: string
}

export interface Presupuesto {
  id?: string
  categoria: Categoria
  monto_mensual: number
}

export interface Fintual {
  id?: string
  saldo_actual: number
  meta_aporte_mensual: number
  actualizado_en?: string
}
