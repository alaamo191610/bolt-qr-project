import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database types based on your schema
export interface MenuItem {
  id: string
  name_en: string
  name_ar?: string
  price: number
  available: boolean
  image_url?: string
  category_id?: string
  user_id: string
  created_at: string
  deleted_at?: string
}

export interface Category {
  id: string
  name_en: string
  name_ar?: string
}

export interface Order {
  id: string
  user_id: string
  table_id: string
  status?: string
  total?: number
  note?: string
  created_at: string
  preparing_at?: string
  completed_at?: string
  cancelled_at?: string
  status_updated_at?: string
  admin_id?: string
  order_number?: number
}

export interface OrderItem {
  id: string
  order_id: string
  menu_item_id: string
  quantity: number
  price_at_order: number
  modifiers?: string[]
  note?: string
  created_at: string
}

export interface Table {
  id: string
  name?: string
  admin_id: string
  code: string
  created_at: string
}

export interface Admin {
  id: string
  email?: string
  name?: string
  logo_url?: string
  theme_color?: string
  background_url?: string
  number_of_tables?: number
  show_order_status?: boolean
  preferred_language?: string
}