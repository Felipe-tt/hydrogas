/**
 * Script de setup — gera o hash Argon2id da senha e mostra os comandos
 * para configurar os secrets no Firebase.
 *
 * Uso:
 *   node functions/setup-secrets.js
 *
 * Depois copie os comandos exibidos e execute no terminal.
 */

const argon2   = require('argon2')
const readline = require('readline')

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve))
}

;(async () => {
  console.log('\n=== HidroGás — Setup de Secrets ===\n')

  const username = (await ask('Nome de usuário admin [admin]: ')).trim() || 'admin'
  const password = (await ask('Senha do admin: ')).trim()

  if (!password) {
    console.error('Senha não pode ser vazia.')
    process.exit(1)
  }

  console.log('\nGerando hash Argon2id (64 MiB, 3 iterações)...')
  const hash = await argon2.hash(password, {
    type:        argon2.argon2id,
    memoryCost:  65536,
    timeCost:    3,
    parallelism: 1,
  })

  console.log('\n✅ Hash gerado com sucesso!\n')
  console.log('Execute os comandos abaixo para configurar os secrets no Firebase:\n')
  console.log(`  firebase functions:secrets:set DATABASE_URL`)
  console.log(`  # Digite quando solicitado: https://SEU-PROJETO-default-rtdb.firebaseio.com\n`)
  console.log(`  firebase functions:secrets:set ADMIN_USERNAME`)
  console.log(`  # Digite quando solicitado: ${username}\n`)
  console.log(`  firebase functions:secrets:set ADMIN_PASSWORD_HASH`)
  console.log(`  # Cole quando solicitado:\n  # ${hash}\n`)
  console.log(`  firebase functions:secrets:set GMAIL_SENDER`)
  console.log(`  # Digite quando solicitado: seu-email@gmail.com\n`)
  console.log(`  firebase functions:secrets:set GMAIL_APP_PASSWORD`)
  console.log(`  # Gere em: https://myaccount.google.com/apppasswords\n`)
  console.log(`  firebase functions:secrets:set APP_URL`)
  console.log(`  # Digite quando solicitado: https://SEU-SITE.netlify.app\n`)
  console.log(`  firebase functions:secrets:set STORAGE_BUCKET`)
  console.log(`  # Digite quando solicitado: SEU-PROJETO.appspot.com\n`)
  console.log('Depois faça o deploy da função:')
  console.log('  firebase deploy --only functions\n')

  rl.close()
})()
