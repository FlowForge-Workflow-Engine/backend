import { RuleContextBuilder } from "./rule-context.builder";
import { RuleFactNamespace, RuleContext } from "../interfaces/rule.interfaces";

describe("RuleContextBuilder", () => {
  it("maps context into payload/user/instance namespaces", () => {
    const builder = new RuleContextBuilder();
    const ctx: RuleContext = {
      payload: { amount: 100, nested: { x: true } },
      user: { id: "u1", role: "Admin", roles: ["Admin", "Approver"] },
      instance: { currentState: "Draft", createdAt: "2024-01-01T00:00:00Z" },
    };

    const facts = builder.build(ctx);
    expect(facts).toEqual({
      [RuleFactNamespace.PAYLOAD]: ctx.payload,
      [RuleFactNamespace.USER]: {
        id: "u1",
        role: "Admin",
        roles: ["Admin", "Approver"],
      },
      [RuleFactNamespace.INSTANCE]: {
        currentState: "Draft",
        createdAt: "2024-01-01T00:00:00Z",
      },
    });
  });
});

