import { z } from "zod";
import { RohlikAPI } from "../rohlik-api.js";
import { Paymentdata } from "../types.js";

export function getPaymentMethods(createRohlikAPI: () => RohlikAPI) {
  return {
    name: "get_payment_methods",
    definition: {
      title: "Get Payment Methods",
      description: "Get available payment methods for your account",
      inputSchema: {
        methods: z.array(z.string()).optional().describe("Optional list of payment method IDs to filter results")
      }
    },
    handler: async (args: { methods?: string[] }) => {
      const { methods = [] } = args;

      try {
        const api = createRohlikAPI();
        const paymentMethods = await api.getPaymentMethods();

        if (!paymentMethods?.length) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No payment methods found."
              }
            ]
          };
        }

        const filteredMethods = methods.length > 0
          ? paymentMethods.filter((method: Paymentdata) => methods.includes(method.id))
          : paymentMethods;

        const output = `💳 PAYMENT METHODS (${filteredMethods.length} available):\n\n${filteredMethods.map((method: Paymentdata) => `${method.name} (${method.id})`).join('\n')}`;

        return {
          content: [
            {
              type: "text" as const,
              text: output
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: error instanceof Error ? error.message : String(error)
            }
          ],
          isError: true
        };
      }
    }
  };
}