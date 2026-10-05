<?php
// config/mailer.php - Disparo de E-mails via PHPMailer (Compatível com InfinityFree)

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception;

require_once __DIR__ . '/../libs/PHPMailer/Exception.php';
require_once __DIR__ . '/../libs/PHPMailer/PHPMailer.php';
require_once __DIR__ . '/../libs/PHPMailer/SMTP.php';
require_once __DIR__ . '/database.php';

function sendVerificationEmail($toEmail, $toName, $verificationCode) {
    if (!filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
        return ['success' => false, 'error' => 'Endereço de e-mail inválido.'];
    }

    $smtpHost = defined('SMTP_HOST') && !empty(SMTP_HOST) ? SMTP_HOST : 'smtp.gmail.com';
    $smtpPort = defined('SMTP_PORT') && !empty(SMTP_PORT) ? (int)SMTP_PORT : 587;
    $smtpUser = defined('SMTP_USER') ? SMTP_USER : '';
    $smtpPass = defined('SMTP_PASS') ? SMTP_PASS : '';
    $fromEmail = defined('SMTP_FROM_EMAIL') && !empty(SMTP_FROM_EMAIL) ? SMTP_FROM_EMAIL : $smtpUser;
    $fromName = defined('SMTP_FROM_NAME') && !empty(SMTP_FROM_NAME) ? SMTP_FROM_NAME : 'Re-Store Marketplace';

    // Se as credenciais de SMTP ainda não foram informadas no ambiente
    if (empty($smtpUser) || empty($smtpPass)) {
        return [
            'success' => false,
            'unconfigured' => true,
            'error' => 'As credenciais de envio de e-mail (SMTP_USER / SMTP_PASS) ainda não foram configuradas nas Secrets do GitHub ou no servidor.'
        ];
    }

    $mail = new PHPMailer(true);

    try {
        // Configurações do servidor SMTP
        $mail->isSMTP();
        $mail->Host       = $smtpHost;
        $mail->SMTPAuth   = true;
        $mail->Username   = $smtpUser;
        $mail->Password   = $smtpPass;
        
        // Na InfinityFree, porta 587 com STARTTLS é OBRIGATÓRIA (portas 25 e 465 são bloqueadas)
        $mail->Port       = $smtpPort;
        if ($smtpPort === 587) {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        } elseif ($smtpPort === 465) {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        }

        // Opções SSL para tolerar certificados em hospedagens compartilhadas
        $mail->SMTPOptions = [
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
                'allow_self_signed' => true
            ]
        ];

        $mail->Timeout = 12;
        $mail->CharSet = 'UTF-8';

        // Remetente e Destinatário
        $mail->setFrom($fromEmail, $fromName);
        $displayName = !empty($toName) ? $toName : explode('@', $toEmail)[0];
        $mail->addAddress($toEmail, $displayName);
        $mail->addReplyTo($fromEmail, $fromName);

        // Assunto e Conteúdo HTML
        $mail->isHTML(true);
        $mail->Subject = '🌱 Seu Código de Recuperação de Senha - Re-Store';

        $safeName = htmlspecialchars($displayName, ENT_QUOTES, 'UTF-8');
        $safeCode = htmlspecialchars($verificationCode, ENT_QUOTES, 'UTF-8');

        $mail->Body = "
        <!DOCTYPE html>
        <html lang='pt-BR'>
        <head>
          <meta charset='UTF-8'>
          <title>Recuperação de Senha</title>
        </head>
        <body style='margin: 0; padding: 24px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif;'>
          <table align='center' border='0' cellpadding='0' cellspacing='0' width='100%' style='max-width: 520px; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;'>
            <tr>
              <td style='padding: 32px 32px 16px 32px; text-align: center; background: linear-gradient(135deg, #0d9488 0%, #059669 100%);'>
                <h1 style='margin: 0; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;'>🌱 Re-Store</h1>
                <p style='margin: 6px 0 0 0; color: #ccfbf1; font-size: 13px; font-weight: 500;'>Marketplace Sustentável & Gamificação</p>
              </td>
            </tr>
            <tr>
              <td style='padding: 32px;'>
                <h2 style='margin: 0 0 16px 0; color: #0f172a; font-size: 18px; font-weight: 700;'>Recuperação de Acesso</h2>
                <p style='margin: 0 0 14px 0; color: #475569; font-size: 14px; line-height: 1.6;'>
                  Olá, <strong>{$safeName}</strong>!
                </p>
                <p style='margin: 0 0 24px 0; color: #475569; font-size: 14px; line-height: 1.6;'>
                  Recebemos uma solicitação para redefinir a senha da sua conta no <strong>Re-Store</strong>. Utilize o código de verificação abaixo para continuar:
                </p>

                <!-- CAIXA DO CÓDIGO -->
                <div style='background-color: #f0fdfa; border: 2px dashed #0d9488; border-radius: 16px; padding: 20px; text-align: center; margin: 20px 0;'>
                  <span style='display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #0d9488; letter-spacing: 1px; margin-bottom: 6px;'>Código de Verificação</span>
                  <span style='font-family: \"Courier New\", Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #0f766e;'>{$safeCode}</span>
                </div>

                <div style='background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 8px; margin-bottom: 24px;'>
                  <p style='margin: 0; color: #92400e; font-size: 12px; line-height: 1.5;'>
                    ⏳ <strong>Atenção:</strong> Este código expira em <strong>10 minutos</strong>. Se você não solicitou a alteração de senha, nenhuma ação é necessária. Sua conta continua totalmente protegida.
                  </p>
                </div>

                <p style='margin: 0; color: #64748b; font-size: 13px; line-height: 1.5;'>
                  Abraços,<br>
                  <strong>Equipe Re-Store Sustentabilidade</strong>
                </p>
              </td>
            </tr>
            <tr>
              <td style='background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;'>
                <p style='margin: 0; color: #94a3b8; font-size: 11px;'>
                  © " . date('Y') . " Re-Store Marketplace. Mensagem gerada automaticamente pelo sistema.
                </p>
              </td>
            </tr>
          </table>
        </body>
        </html>
        ";

        $mail->AltBody = "Olá, {$displayName}!\n\nSeu código de recuperação de senha no Re-Store é: {$verificationCode}\n\nEste código é válido por 10 minutos.\nSe você não solicitou este código, apenas ignore este e-mail.";

        $mail->send();
        return ['success' => true];

    } catch (Exception $e) {
        return [
            'success' => false,
            'error' => 'Falha ao enviar e-mail via SMTP: ' . $mail->ErrorInfo
        ];
    }
}

/**
 * Envia e-mail de validação para ativação de nova conta no cadastro do Re-Store.
 */
function sendRegistrationVerificationEmail($toEmail, $toName, $verificationCode) {
    if (!filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
        return ['success' => false, 'error' => 'Endereço de e-mail inválido.'];
    }

    $smtpHost = defined('SMTP_HOST') && !empty(SMTP_HOST) ? SMTP_HOST : 'smtp.gmail.com';
    $smtpPort = defined('SMTP_PORT') && !empty(SMTP_PORT) ? (int)SMTP_PORT : 587;
    $smtpUser = defined('SMTP_USER') ? SMTP_USER : '';
    $smtpPass = defined('SMTP_PASS') ? SMTP_PASS : '';
    $fromEmail = defined('SMTP_FROM_EMAIL') && !empty(SMTP_FROM_EMAIL) ? SMTP_FROM_EMAIL : $smtpUser;
    $fromName = defined('SMTP_FROM_NAME') && !empty(SMTP_FROM_NAME) ? SMTP_FROM_NAME : 'Re-Store Marketplace';

    // Se as credenciais de SMTP ainda não foram informadas no ambiente
    if (empty($smtpUser) || empty($smtpPass)) {
        return [
            'success' => false,
            'unconfigured' => true,
            'error' => 'As credenciais de envio de e-mail (SMTP_USER / SMTP_PASS) ainda não foram configuradas nas Secrets do GitHub ou no servidor.'
        ];
    }

    $mail = new PHPMailer(true);

    try {
        $mail->isSMTP();
        $mail->Host       = $smtpHost;
        $mail->SMTPAuth   = true;
        $mail->Username   = $smtpUser;
        $mail->Password   = $smtpPass;
        
        $mail->Port       = $smtpPort;
        if ($smtpPort === 587) {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        } elseif ($smtpPort === 465) {
            $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        }

        $mail->SMTPOptions = [
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
                'allow_self_signed' => true
            ]
        ];

        $mail->Timeout = 12;
        $mail->CharSet = 'UTF-8';

        $mail->setFrom($fromEmail, $fromName);
        $displayName = !empty($toName) ? $toName : explode('@', $toEmail)[0];
        $mail->addAddress($toEmail, $displayName);
        $mail->addReplyTo($fromEmail, $fromName);

        $mail->isHTML(true);
        $mail->Subject = '🌱 Confirme seu E-mail - Código de Cadastro Re-Store';

        $safeName = htmlspecialchars($displayName, ENT_QUOTES, 'UTF-8');
        $safeCode = htmlspecialchars($verificationCode, ENT_QUOTES, 'UTF-8');

        $mail->Body = "
        <!DOCTYPE html>
        <html lang='pt-BR'>
        <head>
          <meta charset='UTF-8'>
          <title>Confirmação de Cadastro</title>
        </head>
        <body style='margin: 0; padding: 24px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif;'>
          <table align='center' border='0' cellpadding='0' cellspacing='0' width='100%' style='max-width: 520px; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;'>
            <tr>
              <td style='padding: 32px 32px 16px 32px; text-align: center; background: linear-gradient(135deg, #0d9488 0%, #059669 100%);'>
                <h1 style='margin: 0; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;'>🌱 Re-Store</h1>
                <p style='margin: 6px 0 0 0; color: #ccfbf1; font-size: 13px; font-weight: 500;'>Marketplace Sustentável & Gamificação</p>
              </td>
            </tr>
            <tr>
              <td style='padding: 32px;'>
                <h2 style='margin: 0 0 16px 0; color: #0f172a; font-size: 18px; font-weight: 700;'>Validação do E-mail para Cadastro</h2>
                <p style='margin: 0 0 14px 0; color: #475569; font-size: 14px; line-height: 1.6;'>
                  Olá, <strong>{$safeName}</strong>!
                </p>
                <p style='margin: 0 0 20px 0; color: #475569; font-size: 14px; line-height: 1.6;'>
                  Obrigado por se juntar à comunidade <strong>Re-Store</strong>! Para confirmar seu endereço de e-mail e ativar sua conta com <strong>+150 Pontos Verdes</strong> de boas-vindas, utilize o código de verificação abaixo:
                </p>

                <!-- CAIXA DO CÓDIGO -->
                <div style='background-color: #f0fdfa; border: 2px dashed #0d9488; border-radius: 16px; padding: 20px; text-align: center; margin: 20px 0;'>
                  <span style='display: block; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #0d9488; letter-spacing: 1px; margin-bottom: 6px;'>Código de Confirmação</span>
                  <span style='font-family: \"Courier New\", Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #0f766e;'>{$safeCode}</span>
                </div>

                <div style='background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 8px; margin-bottom: 24px;'>
                  <p style='margin: 0; color: #92400e; font-size: 12px; line-height: 1.5;'>
                    ⏳ <strong>Atenção:</strong> Este código expira em <strong>10 minutos</strong>. Se você não solicitou este cadastro no Re-Store, ignore esta mensagem com segurança.
                  </p>
                </div>

                <p style='margin: 0; color: #64748b; font-size: 13px; line-height: 1.5;'>
                  Seja muito bem-vindo(a) à economia circular!<br>
                  <strong>Equipe Re-Store Sustentabilidade</strong>
                </p>
              </td>
            </tr>
            <tr>
              <td style='background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;'>
                <p style='margin: 0; color: #94a3b8; font-size: 11px;'>
                  © " . date('Y') . " Re-Store Marketplace. Mensagem gerada automaticamente pelo sistema.
                </p>
              </td>
            </tr>
          </table>
        </body>
        </html>
        ";

        $mail->AltBody = "Olá, {$displayName}!\n\nSeu código de confirmação de cadastro no Re-Store é: {$verificationCode}\n\nEste código é válido por 10 minutos.\nInforme-o para concluir a criação de sua conta e liberar seus +150 Pontos Verdes.";

        $mail->send();
        return ['success' => true];

    } catch (Exception $e) {
        return [
            'success' => false,
            'error' => 'Falha ao enviar e-mail via SMTP: ' . $mail->ErrorInfo
        ];
    }
}

