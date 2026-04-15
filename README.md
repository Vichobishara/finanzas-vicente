# Finanzas Vicente

Dashboard financiero personal conectado a Supabase.

## Deploy en Vercel

1. Subí este repo a GitHub
2. Entrá a vercel.com → New Project → importá el repo
3. En "Environment Variables" agregá:
   - `NEXT_PUBLIC_SUPABASE_URL` = https://zzkafdvojrafpojxgbqy.supabase.co
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (la clave que te dio Claude)
4. Deploy → listo, tenés tu URL

## Desarrollo local

```bash
npm install
npm run dev
```

Abrí http://localhost:3000
