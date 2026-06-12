import { createClient } from '@supabase/supabase-js';

// .env가 없어도 앱이 부팅되도록 플레이스홀더로 폴백
// (스케치/로컬 AI 생성은 동작, 게시물·보관함 등 Supabase 기능만 실패)
export const hasSupabaseConfig =
  !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key'
);

export function generateId(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => chars[b % chars.length]).join('');
}

export function storageUrl(path) {
  const { data } = supabase.storage.from('post-images').getPublicUrl(path);
  return data.publicUrl;
}
