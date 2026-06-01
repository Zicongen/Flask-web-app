import { describe, it, expect } from "vitest";
import { buildDateFilter, classifyEmail, getHeader, GmailMessage } from "../src/utils.js";

describe("buildDateFilter", () => {
  it("generates correct filter for today", () => {
    const filter = buildDateFilter("today");
    expect(filter).toContain("after:");
  });

  it("generates correct filter for last_7_days", () => {
    const filter = buildDateFilter("last_7_days");
    expect(filter).toContain("after:");
  });

  it("generates correct filter for last_30_days", () => {
    const filter = buildDateFilter("last_30_days");
    expect(filter).toContain("after:");
  });

  it("generates correct filter for this_month", () => {
    const filter = buildDateFilter("this_month");
    expect(filter).toContain("after:");
    expect(filter).toContain("/01");
  });

  it("returns empty string for invalid range", () => {
    const filter = buildDateFilter("invalid");
    expect(filter).toBe("");
  });
});

describe("getHeader", () => {
  it("extracts header case-insensitively", () => {
    const msg: GmailMessage = {
      id: "123",
      threadId: "123",
      payload: {
        headers: [
          { name: "From", value: "test@example.com" },
          { name: "SUBJECT", value: "Hello" }
        ]
      }
    };
    expect(getHeader(msg, "from")).toBe("test@example.com");
    expect(getHeader(msg, "subject")).toBe("Hello");
    expect(getHeader(msg, "date")).toBe("");
  });
});

describe("classifyEmail", () => {
  it("classifies SPAM label as Spam/Junk", () => {
    const msg: GmailMessage = {
      id: "123",
      threadId: "123",
      labelIds: ["SPAM"]
    };
    expect(classifyEmail(msg)).toBe("Spam/Junk");
  });

  it("classifies CATEGORY_SOCIAL label as Social", () => {
    const msg: GmailMessage = {
      id: "123",
      threadId: "123",
      labelIds: ["CATEGORY_SOCIAL"]
    };
    expect(classifyEmail(msg)).toBe("Social");
  });

  it("classifies social sender domains as Social", () => {
    const msg: GmailMessage = {
      id: "123",
      threadId: "123",
      payload: {
        headers: [{ name: "From", value: "notifications@linkedin.com" }]
      }
    };
    expect(classifyEmail(msg)).toBe("Social");
  });

  it("classifies finance keywords in subject as Finance", () => {
    const msg: GmailMessage = {
      id: "123",
      threadId: "123",
      payload: {
        headers: [{ name: "Subject", value: "Your Stripe Invoice receipt" }]
      }
    };
    expect(classifyEmail(msg)).toBe("Finance");
  });

  it("classifies finance sender domains as Finance", () => {
    const msg: GmailMessage = {
      id: "123",
      threadId: "123",
      payload: {
        headers: [{ name: "From", value: "billing@paypal.com" }]
      }
    };
    expect(classifyEmail(msg)).toBe("Finance");
  });

  it("classifies work domains as Work", () => {
    const msg: GmailMessage = {
      id: "123",
      threadId: "123",
      payload: {
        headers: [{ name: "From", value: "updates@slack.com" }]
      }
    };
    expect(classifyEmail(msg)).toBe("Work");
  });

  it("classifies work keywords in subject as Work", () => {
    const msg: GmailMessage = {
      id: "123",
      threadId: "123",
      payload: {
        headers: [{ name: "Subject", value: "Project standup meeting scrum agenda" }]
      }
    };
    expect(classifyEmail(msg)).toBe("Work");
  });

  it("classifies promotions label as Promotions", () => {
    const msg: GmailMessage = {
      id: "123",
      threadId: "123",
      labelIds: ["CATEGORY_PROMOTIONS"]
    };
    expect(classifyEmail(msg)).toBe("Promotions");
  });

  it("classifies promotional subject keywords as Promotions", () => {
    const msg: GmailMessage = {
      id: "123",
      threadId: "123",
      payload: {
        headers: [{ name: "Subject", value: "Special sale! 50% off discount promo coupon" }]
      }
    };
    expect(classifyEmail(msg)).toBe("Promotions");
  });

  it("classifies updates label as Updates", () => {
    const msg: GmailMessage = {
      id: "123",
      threadId: "123",
      labelIds: ["CATEGORY_UPDATES"]
    };
    expect(classifyEmail(msg)).toBe("Updates");
  });

  it("classifies update keywords as Updates", () => {
    const msg: GmailMessage = {
      id: "123",
      threadId: "123",
      snippet: "Your shipment has been dispatched. Track your package update here."
    };
    expect(classifyEmail(msg)).toBe("Updates");
  });

  it("falls back to Primary", () => {
    const msg: GmailMessage = {
      id: "123",
      threadId: "123",
      payload: {
        headers: [
          { name: "From", value: "friend@example.com" },
          { name: "Subject", value: "How have you been?" }
        ]
      }
    };
    expect(classifyEmail(msg)).toBe("Primary");
  });
});
