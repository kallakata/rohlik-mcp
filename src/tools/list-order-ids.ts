import { z } from "zod";
import { RohlikAPI } from "../rohlik-api.js";

export function createListOrderIdsTool(createRohlikAPI: () => RohlikAPI) {
  return {
    name: "list_order_ids",
    definition: {
      title: "List Order IDs",
      description: "List all order IDs from a specified time frame for debugging purposes",
      inputSchema: {
        months: z.number().min(1).max(24).default(6).describe("Number of months to look back (1-24, default: 6)"),
        maxOrders: z.number().min(10).max(500).default(100).describe("Maximum number of orders to fetch (10-500, default: 100)"),
        testFetch: z.boolean().optional().default(false).describe("If true, will also test fetching details for the first order")
      }
    },
    handler: async (args: { months?: number; maxOrders?: number; testFetch?: boolean }) => {
      const { months = 6, maxOrders = 100, testFetch = false } = args;
      
      try {
        const api = createRohlikAPI();
        
        // Calculate date range
        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setMonth(fromDate.getMonth() - months);
        
        // Get order history
        const orderHistory = await api.getOrderHistory(maxOrders);
        
        if (!orderHistory || (Array.isArray(orderHistory) && orderHistory.length === 0)) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No order history found."
              }
            ]
          };
        }

        const orders = Array.isArray(orderHistory) ? orderHistory : [orderHistory];
        
        // Filter orders within the date range
        const filteredOrders = orders.filter((order: any) => {
          const orderDate = new Date(order.deliveredAt || order.createdAt || '');
          return !isNaN(orderDate.getTime()) && orderDate >= fromDate && orderDate <= toDate;
        });

        if (filteredOrders.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No orders found in the last ${months} months.\n\nMost recent order date: ${orders[0]?.deliveredAt || orders[0]?.createdAt || 'Unknown'}`
              }
            ]
          };
        }

        // Build output
        let output = `📋 ORDER IDs - LAST ${months} MONTHS\n`;
        output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        output += `Period: ${fromDate.toISOString().split('T')[0]} to ${toDate.toISOString().split('T')[0]}\n`;
        output += `Total Orders Found: ${filteredOrders.length}\n\n`;

        filteredOrders.forEach((order: any, index: number) => {
          const orderId = order.orderNumber || order.id || 'NO_ID';
          const orderDate = order.deliveredAt || order.createdAt || 'Unknown date';
          const totalPrice = order.totalPrice || order.price || 'Unknown';
          const status = order.status || 'Delivered';
          
          output += `${index + 1}. Order ID: ${orderId}\n`;
          output += `   Date: ${orderDate}\n`;
          output += `   Total: ${totalPrice} CZK\n`;
          output += `   Status: ${status}\n`;
          
          // Show available fields for debugging
          const availableFields = Object.keys(order).join(', ');
          output += `   Available fields: ${availableFields}\n\n`;
        });

        // Test fetching details for the first order if requested
        if (testFetch && filteredOrders.length > 0) {
          const firstOrder = filteredOrders[0];
          const testOrderId = firstOrder.orderNumber || firstOrder.id;
          
          if (testOrderId) {
            output += `\n🔍 TEST FETCH FOR FIRST ORDER (${testOrderId}):\n`;
            output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            
            try {
              const detail = await api.getOrderDetail(String(testOrderId));
              
              if (detail) {
                output += `✓ Successfully fetched order details\n\n`;
                output += `Available fields in detail: ${Object.keys(detail).join(', ')}\n\n`;
                
                const products = detail.products || detail.items || [];
                output += `Products/Items count: ${products.length}\n`;
                
                if (products.length > 0) {
                  output += `\nFirst 3 products:\n`;
                  products.slice(0, 3).forEach((product: any, idx: number) => {
                    const productName = product.productName || product.name || 'Unknown';
                    const quantity = product.quantity || 1;
                    const price = product.price || product.totalPrice || 0;
                    const brand = product.brand || 'Unknown brand';
                    
                    output += `${idx + 1}. ${productName}\n`;
                    output += `   Brand: ${brand}\n`;
                    output += `   Quantity: ${quantity}\n`;
                    output += `   Price: ${price} CZK\n`;
                    output += `   Fields: ${Object.keys(product).join(', ')}\n\n`;
                  });
                } else {
                  output += `⚠️  No products found in order details\n`;
                  output += `Raw detail preview: ${JSON.stringify(detail).substring(0, 500)}...\n`;
                }
              } else {
                output += `✗ Order detail returned null/undefined\n`;
              }
            } catch (error) {
              output += `✗ Failed to fetch order details\n`;
              output += `Error: ${error instanceof Error ? error.message : String(error)}\n`;
            }
          } else {
            output += `\n⚠️  Cannot test fetch - first order has no ID field\n`;
          }
        }

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
