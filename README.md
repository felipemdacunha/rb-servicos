# R&B Serviços · Ordens de serviço

App simples (celular e computador) para o consultor da **R&B Serviços** registrar os atendimentos feitos
para a **Localiza** e fechar o mês com um PDF para conferir com a nota fiscal.

## O que faz

- **Agenda** — OS do mês agrupadas por dia: veículo, placa, tipo de serviço, cidade, km, valor e status
  (Agendada → Concluída com um toque). Busca por placa, veículo ou cidade.
- **Valores automáticos** — Retirada R$ 40,00, Assistência R$ 80,00, Instalação a combinar (digita na OS).
  Fora de Pelotas: **R$ 2,00 por km rodado** (ida e volta). Ao escolher uma cidade já atendida
  (ex.: Rio Grande), o km da última viagem é preenchido sozinho.
- **Fechamento** — total a receber do mês (só OS concluídas), resumo por serviço + deslocamento e
  **PDF com a logo** (exemplo em `docs/exemplo-fechamento.pdf`).
- **Importar planilha** — botão na Agenda. Aceita .xlsx ou .csv com outras colunas e abas: o app acha sozinho
  data, placa, veículo, tipo, km, cidade, valor e nº da OS (dá para ajustar na mão), mostra uma prévia com os
  problemas de cada linha e não duplica OS que já existem (mesma data, placa e serviço).
- **Ajustes** — tabela de preços, valor do km, dados da empresa no PDF (CNPJ, telefone, PIX) e troca de senha.
  Mudar um preço não altera OS já cadastradas.
- Instala como app no celular (Android: "Adicionar à tela inicial"; iPhone: Compartilhar → Tela de Início).

## Rodar no computador

Requisito: Node.js 22 ou superior.

```bash
npm install
npm run dev
```

Abra <http://localhost:3000>. No primeiro acesso a tela pede para **criar o acesso** (nome, e-mail e senha).
Sem configuração, os dados ficam no arquivo `data/rb-servicos.db`.

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor + telas com recarga automática |
| `npm run build` / `npm start` | Versão de produção |
| `npm test` | Testes dos cálculos |
| `npm run check` | Verificação de tipos |

## Publicar na internet (grátis) — Render + Turso

Mesmo modelo do sistema ViaSat: o Render roda o app e o Turso guarda o banco
(o disco do Render é apagado a cada reinício).

1. **GitHub**: crie um repositório (ex.: `rb-servicos`) e envie esta pasta.
2. **Turso** (<https://app.turso.tech>, entrar com GitHub) → *Create Database* `rb-servicos`,
   região **AWS US East (Virginia)**. Copie a **URL** (`libsql://...`) e crie um **token** sem expiração.
3. **Render** (<https://dashboard.render.com>) → **New + → Blueprint** → escolha o repositório.
   O Render lê o `render.yaml` e pede `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN`. **Apply**.
4. Em ~5 min o app fica em `https://rb-servicos.onrender.com` (ou nome parecido). Abra e crie o acesso do consultor.
5. Opcional: no plano grátis o Render "dorme" após 15 min sem uso (demora ~1 min para abrir).
   Para evitar, crie um monitor no <https://uptimerobot.com> para `https://SEU-ENDERECO/api/health` a cada 5 min.

## Estrutura

```
shared/   regras e cálculos (valores em centavos, total = serviço + km × valor do km)
server/   Express + banco libSQL (arquivo local ou Turso): login e API
src/      telas React + PDF (jsPDF)
public/   logo (logo.svg), logo do PDF e ícones do app
scripts/  gerador da logo (opcional)
```

## Logo

A logo foi redesenhada em vetor a partir do bordado (carro em traço vermelho + "R&B Serviços").
O script `scripts/make-logo.mjs` gera `public/logo.svg`, `public/logo-pdf.png` e os ícones; para rodar de novo:

```bash
cd scripts
npm install opentype.js@1.3.4 sharp@0.34.3 @fontsource/kaushan-script@5.2.5
node make-logo.mjs ../public
```
