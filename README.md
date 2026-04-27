<div align="center">

```
██╗  ██╗██╗██████╗ ██████╗  ██████╗  ██████╗  █████╗ ███████╗
██║  ██║██║██╔══██╗██╔══██╗██╔═══██╗██╔════╝ ██╔══██╗██╔════╝
███████║██║██║  ██║██████╔╝██║   ██║██║  ███╗███████║███████╗
██╔══██║██║██║  ██║██╔══██╗██║   ██║██║   ██║██╔══██║╚════██║
██║  ██║██║██████╔╝██║  ██║╚██████╔╝╚██████╔╝██║  ██║███████║
╚═╝  ╚═╝╚═╝╚═════╝ ╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚══════╝
```

**Gestão de consumo de água e gás para condomínios.**  
Painel para o síndico. Link individual para cada morador. Zero burocracia.

[![Deploy](https://img.shields.io/badge/deploy-netlify-00C7B7?style=flat-square&logo=netlify)](https://hidrogas.netlify.app)
[![Firebase](https://img.shields.io/badge/backend-firebase-FFCA28?style=flat-square&logo=firebase&logoColor=black)](https://firebase.google.com)
[![React](https://img.shields.io/badge/frontend-react_19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/language-typescript-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

</div>

---

## O que é isso?

Todo mês, o síndico anota os medidores de água e gás de cada apartamento, calcula o consumo, e manda o valor para cada morador. Na maioria dos condomínios isso acontece por WhatsApp ou papel impreso.

**HidroGás** resolve isso:

- O síndico registra as leituras num painel web
- Cada apartamento tem um link único gerado automaticamente
- O morador acessa o link e vê o histórico completo do próprio apartamento — sem cadastro, sem app, sem fricção
- No final do mês, o relatório chega por e-mail automaticamente

---

## Screenshots

> _Em breve_

---

## Funcionalidades

### Para o síndico
- **Dashboard** com KPIs de consumo, gráficos mensais e comparativos entre apartamentos
- **Gestão de apartamentos** — cadastro, edição, tokens de acesso individuais, senha opcional por unidade
- **Leituras mensais** de água e gás com cálculo automático de consumo e custo
- **Histórico** filtrável por período e apartamento
- **QR Code** gerado automaticamente para cada apartamento
- **Login biométrico** com WebAuthn (digital / Face ID)
- **Relatório mensal por e-mail** com layout responsivo e gráficos

### Para o morador
- Acesso via link único — sem cadastro, sem senha obrigatória
- Histórico completo de leituras fechadas
- Consumo e custo discriminados por água e gás
- Funciona em qualquer dispositivo

### Geral
- PWA — instalável no celular
- Dark mode nativo
- Efeito giroscópio no mobile

---

## Arquitetura

```
┌─────────────────────────────────────────────────────┐
│                    NETLIFY (CDN)                     │
│              React 19 + Vite + TypeScript            │
│                                                      │
│  /login          → Auth do síndico (Argon2id)        │
│  /dashboard      → KPIs e gráficos                  │
│  /apartments     → Gestão de unidades                │
│  /readings       → Lançamento de leituras            │
│  /history        → Histórico por período             │
│  /apt/:token     → Vista pública do morador          │
└──────────────────────────┬──────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────┐
│              FIREBASE (Google Cloud)                 │
│                                                      │
│  Realtime Database   →  Dados em tempo real          │
│  Cloud Functions     →  Lógica server-side           │
│  Firebase Auth       →  Custom Tokens                │
│  App Check           →  reCAPTCHA v3                 │
│  Secret Manager      →  Credenciais                  │
│  Cloud Storage       →  Backups mensais              │
└─────────────────────────────────────────────────────┘
```

### Cloud Functions

| Função | Descrição |
|--------|-----------|
| `adminLogin` | Valida credenciais com Argon2id, emite Custom Token |
| `getBiometricRegisterChallenge` | Emite challenge HMAC para registro WebAuthn |
| `registerBiometric` | Valida attestation e persiste chave pública |
| `getBiometricAuthChallenge` | Challenge de uso único (TTL 2min) |
| `verifyBiometric` | Verifica assinatura ECDSA/RSA, emite Custom Token |
| `hashApartmentPassword` | Gera hash Argon2id da senha do apartamento |
| `resetApartmentRateLimit` | Reseta bloqueio de tentativas de um apartamento |
| `getPublicApartment` | Retorna dados públicos validando senha server-side |
| `monthlyBackup` | Snapshot do banco no Storage todo dia 1 às 03h |
| `monthlyEmailReport` | Envia relatório HTML por e-mail no dia configurado |

---

## Stack

**Frontend**
- React 19 + TypeScript + Vite
- Zustand (estado global)
- Recharts (gráficos)
- Lucide React (ícones)
- date-fns (datas)
- qr-code-styling (QR codes)
- Tailwind CSS

**Backend**
- Firebase Realtime Database
- Cloud Functions for Firebase v2 (Node.js 22)
- Firebase Auth (Custom Tokens)
- Firebase App Check (reCAPTCHA v3)
- nodemailer (e-mails)
- argon2 (hashing de senhas)
- cbor (parsing WebAuthn)

**Infra**
- Netlify (frontend + headers de segurança)
- Firebase Secret Manager (credenciais)
- Google Cloud Storage (backups)

---

## Segurança

Nenhuma credencial no repositório. Toda a lógica sensível roda server-side.

### Autenticação do síndico
- Senha hasheada com **Argon2id** (64 MiB, 3 iterações) — resistente a ataques de GPU
- Rate limiting por IP **e** por username simultaneamente — resistente a bypass via proxy
- Firebase Custom Token com claim `role: admin` — todas as operações no banco validam esse claim

### Biometria (WebAuthn)
- Challenge gerado server-side com **HMAC-SHA256** — impossível forjar client-side
- `rpId` e `origin` validados criptograficamente — resistente a phishing
- `signCount` verificado a cada autenticação — detecta clonagem de autenticador
- Comparações em **tempo constante** (`timingSafeEqual`) — resistente a timing attacks
- Apenas a chave pública é persistida — nenhum dado biométrico toca o servidor

### Banco de dados
- Nós `/apartments`, `/readings` e `/config` exigem `auth.token.role === 'admin'`
- Nó `/public/:token` exige token JWT com `aptToken === $token` — morador só vê o próprio apartamento
- `$other: false` em todos os nós — nenhum campo não declarado é aceito
- `accessPasswordHash` **nunca** é gravado em `/public` — fica somente em `/apartments` (admin-only)

### Infraestrutura
- **Firebase App Check** ativo em todas as Cloud Functions — bloqueia chamadas fora do app
- Headers HTTP via Netlify: `HSTS`, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`
- Tokens públicos de apartamento com **122 bits de entropia** (UUID v4)
- Backups mensais sanitizados — `accessPasswordHash` removido antes de gravar no Storage

---

## Setup

### Pré-requisitos
- Node.js 22+
- Firebase CLI (`npm i -g firebase-tools`)
- Conta Firebase com Realtime Database, Cloud Functions e App Check habilitados

### 1. Clonar e instalar

```bash
git clone https://github.com/seu-usuario/hydrogas.git
cd hydrogas
npm install
cd functions && npm install && cd ..
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
# Preencha com os valores do seu projeto Firebase
```

### 3. Configurar secrets da Cloud Function

```bash
# Gera o hash Argon2id da senha e exibe todos os comandos de setup
node functions/setup-secrets.js
```

Execute os comandos exibidos pelo script para configurar os secrets no Firebase Secret Manager.

### 4. Deploy

```bash
# Regras do banco
firebase deploy --only database

# Cloud Functions
firebase deploy --only functions

# Frontend (automático via Netlify ao fazer push)
```

### 5. Rodar localmente

```bash
npm run dev
```

---

## Variáveis de ambiente

Veja `.env.example` para a lista completa de variáveis do frontend (`VITE_*`).

### Secrets no Firebase Secret Manager

| Secret | Descrição |
|--------|-----------|
| `DATABASE_URL` | `https://SEU-PROJETO-default-rtdb.firebaseio.com` |
| `ADMIN_USERNAME` | Nome de usuário do painel admin |
| `ADMIN_PASSWORD_HASH` | Hash Argon2id da senha (gerado pelo `setup-secrets.js`) |
| `BIO_HMAC_KEY` | Chave secreta para assinar challenges WebAuthn |
| `GMAIL_SENDER` | E-mail Gmail para envio dos relatórios |
| `GMAIL_APP_PASSWORD` | [App Password do Gmail](https://myaccount.google.com/apppasswords) |
| `APP_URL` | URL pública do frontend, ex: `https://hidrogas.netlify.app` |
| `STORAGE_BUCKET` | Bucket do Firebase Storage para backups |

> Os secrets nunca vão para o repositório. Use `node functions/setup-secrets.js` para configurar os principais de uma vez.

---

## Licença

MIT
