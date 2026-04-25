import { beforeAll, describe, expect, it } from "vitest";
import { MailHogEmailProvider } from "../MailHogEmailProvider.js";

describe("MailHogEmailProvider", () => {
  let provider: MailHogEmailProvider;

  beforeAll(() => {
    provider = new MailHogEmailProvider();
  });

  it("delivers an email to MailHog", async () => {
    const subject = `routax-test-${Date.now()}`;

    await provider.send({
      from: "sender@routax.local",
      to: "recipient@routax.local",
      subject,
      html: "<p>Integration test</p>",
    });

    const mailhogHost = process.env.MAILHOG_HTTP_HOST ?? "localhost";
    const mailhogPort = process.env.MAILHOG_UI_PORT ?? "8025";

    const response = await fetch(
      `http://${mailhogHost}:${mailhogPort}/api/v2/search?kind=containing&query=${subject}`,
    );
    expect(response.ok).toBe(true);

    const data = (await response.json()) as {
      count: number;
      items: Array<{
        Content: { Headers: { Subject: string[] } };
      }>;
    };

    expect(data.count).toBeGreaterThanOrEqual(1);
    const item = data.items[0];
    expect(item?.Content.Headers.Subject[0]).toBe(subject);
  });
});
