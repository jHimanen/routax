import type { EmailMessage } from "../types/email";

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}
