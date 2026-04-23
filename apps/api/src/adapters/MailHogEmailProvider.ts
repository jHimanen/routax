import type { EmailMessage, EmailProvider } from "@via/shared";
import nodemailer from "nodemailer";

export class MailHogEmailProvider implements EmailProvider {
  private readonly transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.MAILHOG_SMTP_HOST ?? "localhost",
      port: Number(process.env.MAILHOG_SMTP_PORT ?? 1025),
      secure: false,
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: message.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }
}
