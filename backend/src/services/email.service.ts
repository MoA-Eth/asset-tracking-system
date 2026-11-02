import nodemailer from 'nodemailer';
import { UserRole } from '../types/asset-management';
import { ROLE_POLICY } from '../security/role-policy';

export type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export function isBrevoConfigured(): boolean {
  return Boolean(
    process.env.BREVO_API_KEY &&
    process.env.BREVO_FROM_EMAIL &&
    process.env.BREVO_FROM_NAME,
  );
}

export function isMailerSendConfigured(): boolean {
  return Boolean(
    process.env.MAILERSEND_API_TOKEN &&
    process.env.MAILERSEND_FROM_EMAIL &&
    process.env.MAILERSEND_FROM_NAME,
  );
}

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function isSmtpAuthenticationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const smtpError = error as {
    code?: unknown;
    responseCode?: unknown;
    response?: unknown;
  };
  return (
    smtpError.code === 'EAUTH' ||
    smtpError.responseCode === 535 ||
    (typeof smtpError.response === 'string' &&
      /\b535\b|authentication credentials invalid|username and password not accepted/i.test(
        smtpError.response,
      ))
  );
}

const SMTP_AUTHENTICATION_ERROR_MESSAGE =
  'SMTP authentication failed. Verify SMTP_USER and SMTP_PASS in the backend environment. For Gmail, use a Google App Password (with 2-Step Verification enabled), not your regular account password.';

export async function sendEmail(message: TransactionalEmail): Promise<void> {
  const cleanTo = message.to.trim().toLowerCase();

  // 1. Try Brevo API first
  if (isBrevoConfigured()) {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY!,
      },
      body: JSON.stringify({
        sender: {
          email: process.env.BREVO_FROM_EMAIL,
          name: process.env.BREVO_FROM_NAME,
        },
        to: [
          {
            email: cleanTo,
          },
        ],
        subject: message.subject,
        textContent: message.text,
        ...(message.html ? { htmlContent: message.html } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(
        `Brevo returned HTTP ${response.status}: ${responseText}`,
      );
    }

    console.log(`[Email]: Sent successfully via Brevo to ${cleanTo}`);
    return;
  }

  // 2. Try MailerSend REST API
  if (isMailerSendConfigured()) {
    const apiToken = process.env.MAILERSEND_API_TOKEN;
    const fromEmail = process.env.MAILERSEND_FROM_EMAIL;
    const fromName = process.env.MAILERSEND_FROM_NAME;

    const response = await fetch('https://api.mailersend.com/v1/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${apiToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: { email: fromEmail, name: fromName },
        to: [{ email: cleanTo }],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const responseText = (await response.text()).slice(0, 500);
      let providerMessage = responseText;
      try {
        const payload = JSON.parse(responseText) as { message?: unknown };
        providerMessage = typeof payload.message === 'string' ? payload.message : responseText;
      } catch {
        // Keep plain-text response
      }
      throw new Error(
        `MailerSend returned HTTP ${response.status}${providerMessage ? `: ${providerMessage}` : ''}`,
      );
    }

    console.log(`[Email]: Sent successfully via MailerSend to ${cleanTo}`);
    return;
  }

  // 3. Try SMTP / Nodemailer
  if (isSmtpConfigured()) {
    const port = Number(process.env.SMTP_PORT) || 587;
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const fromAddress =
      process.env.SMTP_FROM || `"MoA Fixed Asset Tracking System" <${process.env.SMTP_USER}>`;
    const senderEmail = process.env.SMTP_USER;

    const createTransporter = (targetPort: number, isSecure: boolean) =>
      nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: targetPort,
        secure: isSecure,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS?.replace(/\s+/g, ''),
        },
        connectionTimeout: 15_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
        tls: {
          rejectUnauthorized: false,
        },
      } as any);

    const mailOptions = {
      from: fromAddress,
      to: cleanTo,
      sender: senderEmail,
      replyTo: senderEmail || fromAddress,
      envelope: {
        from: senderEmail || fromAddress,
        to: [cleanTo],
      },
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      headers: {
        'X-Auto-Response-Suppress': 'All',
        'Auto-Submitted': 'auto-generated',
        'X-Priority': '3',
        Priority: 'Normal',
        Importance: 'Normal',
      },
    };

    try {
      const transporter = createTransporter(port, secure);
      await transporter.sendMail(mailOptions);
      console.log(`[Email]: Sent successfully via SMTP to ${cleanTo}`);
      return;
    } catch (primaryError) {
      if (isSmtpAuthenticationError(primaryError)) {
        console.error('[Email]: SMTP provider rejected credentials');
        throw new Error(SMTP_AUTHENTICATION_ERROR_MESSAGE, { cause: primaryError });
      }

      const fallbackPort = port === 465 ? 587 : 465;
      const fallbackSecure = fallbackPort === 465;
      console.warn(`[Email]: Primary SMTP delivery failed on port ${port}, trying fallback port ${fallbackPort}`);

      try {
        const fallbackTransporter = createTransporter(fallbackPort, fallbackSecure);
        await fallbackTransporter.sendMail(mailOptions);
        console.log(`[Email]: Sent successfully via fallback SMTP to ${cleanTo}`);
        return;
      } catch (fallbackError) {
        if (isSmtpAuthenticationError(fallbackError)) {
          console.error('[Email]: SMTP provider rejected credentials on fallback port');
          throw new Error(SMTP_AUTHENTICATION_ERROR_MESSAGE, { cause: fallbackError });
        }
        console.error('[Email]: Failed to send email via SMTP on both ports:', fallbackError);
        throw fallbackError;
      }
    }
  }

  // 4. Fallback in development
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Email (Dev Mock)]: Sent to ${cleanTo} | Subject: "${message.subject}"`);
    console.log(`[Email Body Preview]:\n${message.text}`);
    return;
  }

  throw new Error('No email provider is configured. Please configure Brevo, MailerSend, or SMTP credentials.');
}

export async function deliverUserInvitation(values: {
  email: string;
  displayName: string;
  role: UserRole;
  invitationUrl: string;
  expiresHours?: number;
}): Promise<void> {
  const hours = values.expiresHours ?? (Number(process.env.USER_INVITATION_HOURS) || 48);
  const roleTitle = (ROLE_POLICY[values.role] && ROLE_POLICY[values.role].name) || values.role;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #0f172a; background-color: #f8fafc; margin: 0; padding: 20px; }
          .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
          .header { background: #00843D; color: #ffffff; padding: 32px 24px; text-align: center; }
          .header h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; }
          .header p { margin: 6px 0 0 0; opacity: 0.85; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; }
          .body { padding: 32px 24px; }
          .badge { display: inline-block; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; font-weight: 700; font-size: 13px; padding: 6px 14px; border-radius: 9999px; margin: 12px 0; }
          .cta-btn { display: inline-block; background: #00843D; color: #ffffff !important; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 9999px; font-size: 14px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .footer { background: #f8fafc; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
          .link-box { font-size: 12px; word-break: break-all; color: #00843D; background: #f1f5f9; padding: 12px; border-radius: 8px; font-family: monospace; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Ministry of Agriculture</h1>
            <p>Fixed Asset Tracking System (MoA-ATS)</p>
          </div>
          <div class="body">
            <h2 style="margin-top:0; color:#0f172a; font-size:18px;">Account Registration Invitation</h2>
            <p>Hello <strong>${values.displayName}</strong>,</p>
            <p>You have been officially invited to join the <strong>MoA Fixed Asset Tracking System</strong> with the following assigned role:</p>
            <div><span class="badge">${roleTitle}</span></div>
            <p>To accept your invitation and activate your account, please set up your password by clicking the button below:</p>
            <div style="text-align: center;">
              <a href="${values.invitationUrl}" class="cta-btn">Create Password & Activate Account</a>
            </div>
            <p style="font-size: 13px; color: #64748b;">Or copy and paste this link into your web browser:</p>
            <div class="link-box">${values.invitationUrl}</div>
            <p style="font-size: 13px; color: #dc2626; font-weight: 600; margin-top: 20px;">
              ⚠️ Note: This invitation link expires in ${hours} hours.
            </p>
          </div>
          <div class="footer">
            <p>If you were not expecting this invitation, you may safely ignore this email.</p>
            <p>&copy; ${new Date().getFullYear()} Ministry of Agriculture. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const textContent = [
    `Hello ${values.displayName},`,
    '',
    `You have been invited to join the MoA Fixed Asset Tracking System as ${roleTitle}.`,
    '',
    'Create your password using this secure link:',
    values.invitationUrl,
    '',
    `This invitation expires in ${hours} hours.`,
    'If you were not expecting this invitation, you can ignore this email.',
  ].join('\n');

  await sendEmail({
    to: values.email,
    subject: 'Invitation: Access your MoA Fixed Asset Tracking System Account',
    text: textContent,
    html: htmlContent,
  });
}
