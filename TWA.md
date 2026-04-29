# Publicação na Play Store via TWA (Trusted Web Activity)

## Pré-requisitos
- Node.js 18+
- Java JDK 17+ (`java -version`)
- Android Studio ou só o SDK CLI
- Conta Google Play Developer ($25 taxa única)
- App hospedado com HTTPS (Netlify/Firebase)

---

## 1. Instalar o Bubblewrap

```bash
npm install -g @bubblewrap/cli
```

---

## 2. Gerar o projeto Android

```bash
mkdir hidrogas-twa && cd hidrogas-twa
bubblewrap init --manifest https://SEU-DOMINIO.com/manifest.webmanifest
```

Quando perguntar, preencha:
| Campo | Valor |
|-------|-------|
| Package ID | `com.hidrogas.app` (ou domínio invertido seu) |
| App name | `HidroGás` |
| Display mode | `standalone` |
| Theme color | `#2563eb` |
| Start URL | `/` |

---

## 3. Build do APK/AAB

```bash
bubblewrap build
```

Isso gera `app-release-signed.aab` — é esse arquivo que vai para a Play Store.

---

## 4. Configurar o assetlinks.json

Depois de criar o keystore no passo anterior, pegue o SHA-256:

```bash
keytool -list -v -keystore android.keystore -alias android -storepass android -keypass android | grep SHA256
```

Cole o valor em `public/.well-known/assetlinks.json` substituindo `COLOQUE_AQUI_O_SHA256_DO_SEU_KEYSTORE`.
Também substitua `SEU.PACKAGE.NAME` pelo package ID escolhido acima.

Faça deploy do site — o arquivo precisa estar acessível em:
`https://SEU-DOMINIO.com/.well-known/assetlinks.json`

---

## 5. Publicar na Play Store

1. Acesse [play.google.com/console](https://play.google.com/console)
2. Crie o app → **Criar aplicativo**
3. Preencha: nome, idioma, tipo (app), categoria (Ferramentas ou Produtividade)
4. Vá em **Produção → Criar nova versão**
5. Faça upload do `app-release-signed.aab`
6. Preencha a ficha da loja:
   - Descrição curta (80 chars): *Gestão de água e gás para condomínios*
   - Descrição longa: colada do README
   - Screenshots: mínimo 2 prints da tela (1080x1920 ou similar)
   - Ícone feature: 1024x500px (banner)
   - URL da política de privacidade: `https://SEU-DOMINIO.com/privacy-policy.html`
7. Enviar para revisão

---

## Checklist antes de enviar

- [ ] `assetlinks.json` acessível e com SHA-256 correto
- [ ] Política de privacidade publicada em `/privacy-policy.html`
- [ ] Screenshots prontas (mínimo 2)
- [ ] Feature graphic 1024x500px
- [ ] Package name definido e igual no assetlinks + bubblewrap
- [ ] App testado no dispositivo Android via `bubblewrap install`

---

## Tempo estimado

| Etapa | Tempo |
|-------|-------|
| Setup Bubblewrap + build | ~2h |
| Ficha Play Store | ~1h |
| Revisão Google | 1–3 dias |
