# HidroGás

Sistema de gestão de leituras de água e gás para condomínios.

O síndico registra as leituras mensais pelo painel administrativo. Cada apartamento recebe um link único — o morador acessa e vê o próprio histórico de consumo sem precisar de cadastro.

---

## Stack

**Frontend** — React 19, TypeScript, Vite, Zustand, Recharts, Tailwind  
**Backend** — Firebase Realtime Database, Cloud Functions (Node.js 22), Firebase Auth  
**Infra** — Netlify, Firebase Secret Manager, Google Cloud Storage

---

## Funcionalidades

- Dashboard com KPIs e gráficos de consumo
- Gestão de apartamentos com tokens individuais e senha opcional por unidade
- Lançamento de leituras mensais de água e gás com cálculo automático
- Histórico filtrável por período
- Vista pública por apartamento via link/QR code
- Login biométrico com WebAuthn (digital / Face ID)
- Relatório mensal automático por e-mail
- PWA — instalável no celular

---

## Segurança

- Senhas com **Argon2id** (64 MiB, 3 iterações)
- Rate limiting por IP e por username em todas as endpoints sensíveis
- **WebAuthn** com challenge HMAC-SHA256, validação de `rpId`, `origin` e `signCount`
- Regras do Firebase RTDB por role — dados admin inacessíveis sem autenticação válida
- `accessPasswordHash` nunca exposto no nó público do banco
- **Firebase App Check** (reCAPTCHA v3) ativo em todas as Cloud Functions
- Headers HTTP: `HSTS`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`
- Tokens de apartamento com 122 bits de entropia
- Backups mensais sanitizados no Cloud Storage

---

## Setup

### Pré-requisitos

- Node.js 22+
- Firebase CLI — `npm i -g firebase-tools`
- Projeto Firebase com Realtime Database, Cloud Functions e App Check habilitados

### Instalação

```bash
git clone https://github.com/seu-usuario/hydrogas.git
cd hydrogas
npm install
cd functions && npm install && cd ..
```

### Variáveis de ambiente

```bash
cp .env.example .env
# Preencha com os valores do seu projeto Firebase
```

### Secrets (Firebase Secret Manager)

```bash
# Gera o hash Argon2id da senha e exibe os comandos de configuração
node functions/setup-secrets.js
```

| Secret | Descrição |
|--------|-----------|
| `DATABASE_URL` | URL do Realtime Database |
| `ADMIN_USERNAME` | Usuário do painel admin |
| `ADMIN_PASSWORD_HASH` | Hash Argon2id da senha (gerado pelo script acima) |
| `BIO_HMAC_KEY` | Chave para assinar challenges WebAuthn |
| `GMAIL_SENDER` | E-mail remetente dos relatórios |
| `GMAIL_APP_PASSWORD` | [App Password do Gmail](https://myaccount.google.com/apppasswords) |
| `APP_URL` | URL pública do frontend |
| `STORAGE_BUCKET` | Bucket do Firebase Storage para backups |

### Deploy

```bash
firebase deploy --only database
firebase deploy --only functions
```

O frontend é implantado automaticamente pelo Netlify a cada push.

### Desenvolvimento local

```bash
npm run dev
```

---

## Licença

MIT
