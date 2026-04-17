# HidroGás

Sistema de gestão de leituras de água e gás para condomínios.

## Setup inicial (primeira vez)

### 1. Instalar dependências

```bash
npm install
cd functions && npm install && cd ..
```

### 2. Configurar secrets da Cloud Function

```bash
# Instalar Firebase CLI (se não tiver)
npm install -g firebase-tools
firebase login

# Gerar hash da senha e obter os comandos de setup
node functions/setup-secrets.js

# Seguir as instruções exibidas pelo script acima
```

### 3. Deploy da Cloud Function

```bash
firebase deploy --only functions
```

### 4. Rodar localmente

```bash
npm run dev
```

---

## Como o login funciona

1. Frontend envia `{ username, password }` para a Cloud Function `adminLogin`
2. A função verifica as credenciais contra os secrets do Firebase Secret Manager
3. Se correto, retorna um Firebase Custom Token
4. Frontend chama `signInWithCustomToken(auth, token)` — sessão 100% gerenciada pelo Firebase Auth
5. `onAuthStateChanged` no `AdminGate` detecta o login e libera o painel

## Variáveis de ambiente (.env.local para desenvolvimento)

Copie `.env.example` para `.env.local` e preencha os valores:

```bash
cp .env.example .env.local
```

## Secrets da Cloud Function (Firebase Secret Manager)

| Secret | Descrição |
|--------|-----------|
| `ADMIN_USERNAME` | Nome de usuário do admin |
| `ADMIN_PASSWORD_HASH` | Hash bcrypt (salt 12) da senha |

Para alterar a senha:
```bash
node functions/setup-secrets.js
firebase deploy --only functions
```
