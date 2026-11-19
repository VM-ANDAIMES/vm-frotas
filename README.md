# VM FROTAS — VM Andaimes

Aplicativo independente para gestão da frota. Interface React + TypeScript + Vite, autenticação e dados no Supabase, pronto para publicação na Vercel e preparação Android com Capacitor.

## O que já está incluído

- Login com Supabase Auth e perfis `admin`, `driver` e `viewer`.
- Cadastro de veículos (placa, marca, modelo, ano e KM).
- Cadastro individual de motoristas por função administrativa segura do Supabase Edge Functions.
- Retirada e devolução com KM obrigatório, validação de KM crescente e cálculo de distância no histórico.
- Bloqueio transacional de retirada duplicada do mesmo veículo (índice único + RPC no banco).
- Controle inicial de manutenção e abastecimentos.
- Layout responsivo para computador e celular, com logo VM original.

## 1. Criar o projeto Supabase

1. Crie um projeto novo no Supabase, separado dos demais aplicativos da VM.
2. Abra **SQL Editor** e execute todo o arquivo `supabase/schema.sql`.
3. Em **Authentication → Users**, crie o primeiro usuário administrador (e-mail e senha provisória).
4. Copie o UUID desse usuário. No SQL Editor, execute substituindo o UUID:

```sql
update public.profiles
set full_name = 'Administrador VM', role = 'admin', active = true
where id = 'UUID_DO_ADMIN';
```

5. Em **Project Settings → API**, copie Project URL e a chave `anon`/publishable. Nunca use `service_role` no navegador.

## 2. Preparar no Windows (CMD)

Copie `.env.example` para `.env` e preencha:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON_PUBLICA
```

Abra o CMD dentro da pasta do projeto e execute:

```bat
npm install
npm run build
npm run dev
```

O endereço local será exibido pelo Vite (normalmente `http://localhost:5173`).

## 3. Ativar cadastro seguro de motoristas

Instale/abra a Supabase CLI e faça login e link do projeto. Depois publique a função:

```bat
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase functions deploy admin-create-user
```

A função usa `SUPABASE_SERVICE_ROLE_KEY` somente no ambiente seguro da Edge Function. **Não coloque essa chave no `.env` do Vite nem no código do navegador.** O administrador cadastra motoristas pelo menu Motoristas; a senha inicial deve ser entregue ao motorista por canal seguro.

## 4. Publicar na Vercel

1. Envie esta pasta para um repositório GitHub privado ou público conforme a política da empresa.
2. Importe o repositório na Vercel.
3. Configure as mesmas duas variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` nas configurações do projeto Vercel.
4. Build command: `npm run build`; output directory: `dist`.

## 5. Preparar APK Android

Com Node.js, Android Studio e SDK Android instalados:

```bat
npm install
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

No Android Studio, aguarde a sincronização do Gradle e gere o APK em **Build → Build Bundle(s) / APK(s) → Build APK(s)**. Para futuras atualizações: `npm run build` e `npx cap sync android`.

## Regras importantes de operação

- Um veículo só pode ter uma retirada em aberto.
- Qualquer perfil `driver` ativo pode retirar qualquer veículo `available`.
- A devolução só pode ser feita pelo motorista que retirou ou por administrador.
- KM de retirada não pode ser menor que o KM atual do veículo; KM de devolução não pode ser menor que o KM da retirada.
- A disponibilidade é alterada no banco dentro das funções RPC, não apenas na interface.
- Desative um motorista alterando `profiles.active = false`; o acesso fica bloqueado mesmo que a conta Auth exista.

## Limitações desta primeira versão

A base funcional está preparada, mas antes do uso operacional real é necessário configurar o projeto Supabase, publicar a Edge Function, criar o administrador e testar os fluxos com contas de teste. O módulo de manutenção e abastecimento já possui formulários básicos; relatórios avançados, anexos/fotos de hodômetro, alertas automáticos, edição de cadastros e recuperação de senha são evoluções posteriores.
