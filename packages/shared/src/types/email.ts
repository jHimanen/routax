export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  html: string;
  text?: string;
}
