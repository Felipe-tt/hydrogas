# HidroGás

Sistema de gestão de leituras de água e gás para condomínios. Permite ao síndico registrar leituras mensais e gerar links individuais para que cada morador acompanhe seu próprio consumo.

## Funcionalidades

- **Painel administrativo** com dashboard, gráficos e KPIs de consumo
- **Gestão de apartamentos** com tokens de acesso individuais e senha opcional
- **Leituras mensais** de água e gás com cálculo automático de consumo e custo
- **Histórico** de leituras por período
- **Vista pública por apartamento** — link único para o morador ver seu histórico sem precisar de cadastro
- **Dark mode** e suporte a preferências de acessibilidade

## Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Backend**: Firebase Realtime Database + Cloud Functions (Node.js 22)
- **Auth**: Firebase Auth com Custom Tokens
- **Senhas**: Argon2id via Cloud Function — nenhuma senha plain text é armazenada
- **Deploy**: Netlify (frontend) + Firebase (functions + database)

## Segurança

- Login do síndico validado server-side com Argon2id e rate limiting
- Acesso ao banco de dados bloqueado sem autenticação válida
- Firebase App Check com reCAPTCHA v3 ativo
- Tokens públicos por apartamento com 122 bits de entropia
- Todas as credenciais via variáveis de ambiente e Firebase Secret Manager — nada hardcoded

## Setup

### 1. Instalar dependências

```bash
npm install
cd functions && npm install && cd ..
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env.local
# Preencher com os valores do seu projeto Firebase
```

### 3. Configurar secrets da Cloud Function

```bash
# Gera o hash Argon2id da senha e exibe os comandos de setup
node functions/setup-secrets.js
```

### 4. Deploy

```bash
firebase deploy --only functions
firebase deploy --only database
```

### 5. Rodar localmente

```bash
npm run dev
```

## Variáveis de ambiente

Veja `.env.example` para a lista completa. Os secrets sensíveis (`ADMIN_PASSWORD_HASH`, `DATABASE_URL`) ficam no Firebase Secret Manager e nunca vão para o repositório.
