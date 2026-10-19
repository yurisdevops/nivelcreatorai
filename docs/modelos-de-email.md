# Modelos de e-mail do login (Supabase)

Onde colar: Supabase → projeto **Nivel Creator AI** → **Authentication** → **Emails** (ou Email Templates). Para cada modelo, troque o **Subject** e cole o HTML inteiro no **Message body**. Depois clique em **Save**.

O logo vem de `https://creator.nivelstudio.com.br/icon-192.png`, que já está no ar.

## 1. Confirm signup

**Subject:** `Confirme seu e-mail e comece seus 7 dias grátis`

```html
<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#070d20;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070d20;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0f1630;border:1px solid #26365d;border-radius:20px;">
        <tr><td align="center" style="padding:36px 32px 8px;">
          <img src="https://creator.nivelstudio.com.br/icon-192.png" width="64" height="64" alt="Nível Creator" style="display:block;border-radius:16px;">
          <p style="margin:16px 0 0;color:#bd94ff;font-size:12px;font-weight:bold;letter-spacing:2px;">NÍVEL CREATOR IA</p>
        </td></tr>
        <tr><td style="padding:8px 32px 0;color:#f6f4fb;">
          <h1 style="margin:12px 0;font-size:24px;line-height:1.3;text-align:center;">Falta só um clique 🎉</h1>
          <p style="margin:0 0 24px;color:#b3b1c6;font-size:15px;line-height:1.6;text-align:center;">Confirme seu e-mail para entrar no seu escritório de criador UGC e começar seus <b style="color:#f6f4fb;">7 dias grátis</b>.</p>
        </td></tr>
        <tr><td align="center" style="padding:0 32px 28px;">
          <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email" style="display:inline-block;padding:15px 28px;border-radius:12px;background:#7b3fff;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;">Confirmar meu e-mail</a>
        </td></tr>
        <tr><td style="padding:0 32px 32px;color:#8f9bbd;font-size:12px;line-height:1.6;text-align:center;">
          Se você não criou uma conta, é só ignorar este e-mail.<br>Nível Creator IA, um produto da Nível Studio.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

## 2. Reset Password

**Subject:** `Crie uma nova senha no Nível Creator`

```html
<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#070d20;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070d20;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0f1630;border:1px solid #26365d;border-radius:20px;">
        <tr><td align="center" style="padding:36px 32px 8px;">
          <img src="https://creator.nivelstudio.com.br/icon-192.png" width="64" height="64" alt="Nível Creator" style="display:block;border-radius:16px;">
          <p style="margin:16px 0 0;color:#bd94ff;font-size:12px;font-weight:bold;letter-spacing:2px;">NÍVEL CREATOR IA</p>
        </td></tr>
        <tr><td style="padding:8px 32px 0;color:#f6f4fb;">
          <h1 style="margin:12px 0;font-size:24px;line-height:1.3;text-align:center;">Vamos criar uma nova senha</h1>
          <p style="margin:0 0 24px;color:#b3b1c6;font-size:15px;line-height:1.6;text-align:center;">Clique no botão abaixo. Você já entra direto na tela de nova senha, sem precisar digitar o e-mail de novo.</p>
        </td></tr>
        <tr><td align="center" style="padding:0 32px 28px;">
          <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery" style="display:inline-block;padding:15px 28px;border-radius:12px;background:#7b3fff;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;">Criar nova senha</a>
        </td></tr>
        <tr><td style="padding:0 32px 32px;color:#8f9bbd;font-size:12px;line-height:1.6;text-align:center;">
          O link vale por pouco tempo. Se você não pediu isso, ignore este e-mail: sua senha continua a mesma.<br>Nível Creator IA, um produto da Nível Studio.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```
