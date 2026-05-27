# lia-desktop

App operacional desktop para atendimento, produção, logística e anexos.

## URL pública alvo

https://desktop.aneety.com/

## Arquitetura alvo

- Cloudflare Pages Free para assets estáticos.
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

Scaffold inicial separado. Implementação funcional virá após estabilização do `REQ.md`, `lia-core` e `lia-backend` em Cloudflare Workers/Supabase.

## Deploy Cloudflare Pages Free

```bash
pnpm lint
pnpm test
pnpm build
pnpm deploy:cloudflare
```

Projeto Cloudflare Pages esperado: `lia-desktop`.
