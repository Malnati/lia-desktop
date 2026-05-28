# lia-desktop

App operacional desktop para atendimento, produção, logística e anexos.

## URL pública alvo

https://desktop.aneety.com/

## Arquitetura alvo

- Cloudflare Pages Free para assets estáticos gerados por Vite em `dist`.
- Supabase Auth para login.
- API Cloudflare Workers + Hono via `VITE_API_URL=https://api.aneety.com`.
- Contratos compartilhados por `lia-core` em <https://core.aneety.com/>.
- Base real Supabase/Postgres; não usar mock como destino final.
- Custo zero: sem Pages Functions pagas, Workers Paid, Containers ou add-ons.

## Fluxo principal

- Login Supabase Auth.
- Listar e editar pedidos do tenant.
- Atualizar checkpoints de molde, prótese, retirada e entrega.
- Consultar e anexar arquivos via https://api.aneety.com.

## Status

Scaffold React/Vite com baseline shadcn/ui inicial. Fluxos funcionais serão ampliados após estabilização de Auth, API e massa de teste Supabase.

## Deploy Cloudflare Pages Free

```bash
pnpm lint
pnpm test
pnpm build
pnpm deploy:cloudflare
```

Projeto Cloudflare Pages esperado: `lia-desktop`, com deploy do diretório `dist`.

## Design system

- React + Vite + TypeScript + Tailwind + shadcn/ui.
- `components.json` versionado no repo.
- Componentes copiados para `src/components/ui` via `pnpm dlx shadcn@latest add`.
- Aliases `@/*`, `@/components`, `@/components/ui`, `@/lib` configurados para o app.
