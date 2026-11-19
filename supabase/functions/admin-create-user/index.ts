
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    const service = Deno.env.get('VM_FROTAS_SERVICE_ROLE');

    if (!url || !anon || !service) {
      throw new Error('Configuração interna do Supabase incompleta.');
    }

    const auth = req.headers.get('Authorization');
    if (!auth) throw new Error('Não autorizado.');

    const caller = createClient(url, anon, {
      global: { headers: { Authorization: auth } },
    });

    const { data: userData, error: authError } = await caller.auth.getUser();
    const user = userData?.user;

    if (authError || !user) {
      throw new Error('Sessão inválida. Entre novamente no aplicativo.');
    }

    const admin = createClient(url, service);

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id, role, active')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('Erro ao consultar perfil administrativo:', profileError);
      throw new Error('Erro ao verificar administrador: ' + profileError.message);
    }

    if (!profile) {
      throw new Error('Perfil não encontrado para o usuário autenticado.');
    }

    if (profile.role !== 'admin' || profile.active !== true) {
      console.error('Acesso administrativo negado:', {
        userId: user.id,
        role: profile.role,
        active: profile.active,
      });
      throw new Error('Usuário sem permissão administrativa.');
    }

    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const full_name = String(body.full_name || '').trim();

    if (!email || password.length < 8 || !full_name) {
      throw new Error('Informe nome, e-mail e senha com pelo menos 8 caracteres.');
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (error) throw error;

    const { error: insertError } = await admin.from('profiles').upsert({
      id: data.user.id,
      full_name,
      role: 'driver',
      active: true,
    });

    if (insertError) {
      await admin.auth.admin.deleteUser(data.user.id);
      throw insertError;
    }

    return new Response(JSON.stringify({
      success: true,
      id: data.user.id,
    }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    const message =
      e instanceof Error
        ? e.message
        : typeof e === 'object' && e !== null && 'message' in e
          ? String((e as { message: unknown }).message)
          : JSON.stringify(e);

    console.error('Falha em admin-create-user:', e);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
