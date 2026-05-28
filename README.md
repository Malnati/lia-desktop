# lia-desktop

App operacional desktop para atendimento, produção, logística, checkpoints e anexos.

## URL pública alvo

https://desktop.aneety.com/

## Arquitetura vigente

- Cloudflare Pages Free para assets estáticos gerados por Vite em `dist`.
- Autenticação de usuários reais modelada no banco de dados e exposta pela API Lia.
- API real Cloudflare Workers Free + Hono via `VITE_API_URL=https://api.aneety.com`.
- Banco real Supabase/Postgres no projeto `mqxwdyhtsvzzehmdfhtj`, com RLS no backend.
- Contratos e tokens compartilháveis por `lia-core` em <https://core.aneety.com/>.
- Custo zero: sem Pages Functions pagas, Workers Paid, Containers, Render, VPS ou add-ons pagos.
- Proibido usar mock, NestJS, Mongo/Mongoose ou GridFS como arquitetura vigente.


## Limites semânticos de serviços externos

O desktop operacional não deve acoplar regra de negócio a marca de fornecedor. Hospedagem, API, banco, storage, pagamento, logs e CI são aceitos pela função semântica: domínio `aneety.com`, API HTTP, Postgres/migrations, auth modelada no banco, secrets fora do frontend, custo zero e adapter substituível.

## Fluxos implementados

- Login via API Lia com sessão/token próprio; frontend não deve exigir chave pública de provedor externo para autenticar.
- Listagem de pedidos reais via `GET https://api.aneety.com/api/orders`.
- Seleção de pedido e visualização operacional desktop.
- Atualização de status via `PATCH /api/orders/:id/status`.
- Conclusão de checkpoints de retirada, molde, prótese e entrega via `PATCH /api/orders/:id/checkpoints/:key`.
- Envio/listagem de anexos PNG/JPEG/WebP via `POST` e `GET /api/orders/:id/attachments`, com armazenamento real no Supabase Storage pelo Worker.

## Variáveis públicas de build

```bash
VITE_API_URL=https://api.aneety.com
```

Nunca usar `SUPABASE_SERVICE_ROLE_KEY` no frontend. A service role pertence somente aos secrets do Worker `lia-backend`.

## Validação local

```bash
pnpm install
pnpm lint
pnpm test
pnpm build
```

## E2E publicado

O E2E roda somente contra URLs publicadas em `aneety.com` quando `LIA_E2E_ENABLED=1` e as credenciais de teste existem.

```bash
LIA_E2E_ENABLED=1 \
LIA_E2E_DESKTOP_URL=https://desktop.aneety.com \
LIA_E2E_API_URL=https://api.aneety.com \
LIA_E2E_ADMIN_EMAIL=<usuario-teste> \
LIA_E2E_ADMIN_PASSWORD=<senha-teste> \
pnpm test:e2e
```

Cobertura alvo: login via modelo de banco, criação de pedido via API publicada, abertura no desktop, conclusão de checkpoint de molde e upload/listagem de anexo real.

No GitHub Actions, o E2E publicado legado que ainda depende de autenticação por provedor externo só roda quando `LIA_E2E_ALLOW_LEGACY_PROVIDER_AUTH=1` estiver definido em variables. Enquanto a API `/api/auth/*` modelada no banco não existir, esse E2E legado fica bloqueado por contrato e deve ser substituído, não tratado como aceite.


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
- Componentes em `src/components/ui`, gerados ou sincronizados com `pnpm dlx shadcn@latest add`.
- Componentes usados: `Alert`, `Badge`, `Button`, `Card`, `DropdownMenu`, `Field`, `Input`, `Select`, `Separator`, `Sheet`, `Sidebar`, `Table`, `Tabs`, `Textarea`, `Tooltip`.
- Aliases `@/*`, `@/components`, `@/components/ui`, `@/lib` configurados para o app.

## Screenshot

- Home operacional publicada: `docs/screenshots/desktop-operational-home.png`.
