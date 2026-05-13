import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://alxqpzbvbajsqsfngwko.supabase.co';
const SUPABASE_KEY = 'sb_publishable_M4-JfQs1pzRbf1Qz-2SvPw_LVVVBNBT';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);