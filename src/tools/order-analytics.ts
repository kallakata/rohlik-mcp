import { z } from "zod";
import { RohlikAPI } from "../rohlik-api.js";

interface OrderProduct {
  productName?: string;
  name?: string;
  quantity?: number;
  price?: number;
  totalPrice?: number;
  brand?: string;
  categoryName?: string;
  primaryCategoryName?: string;
}

interface OrderData {
  id?: string;
  orderNumber?: string;
  deliveredAt?: string;
  createdAt?: string;
  totalPrice?: number;
  price?: number;
  status?: string;
  products?: OrderProduct[];
  items?: OrderProduct[];
}

interface OrderAnalytics {
  totalOrders: number;
  dateRange: {
    from: string;
    to: string;
  };
  totalSpent: number;
  averageOrderValue: number;
  totalProducts: number;
  mostUsedProducts: Array<{
    name: string;
    brand?: string;
    totalQuantity: number;
    totalSpent: number;
    orderCount: number;
  }>;
  topCategories: Array<{
    category: string;
    totalQuantity: number;
    totalSpent: number;
    orderCount: number;
  }>;
  topBrands: Array<{
    brand: string;
    totalQuantity: number;
    totalSpent: number;
    orderCount: number;
  }>;
  monthlyBreakdown: Array<{
    month: string;
    orderCount: number;
    totalSpent: number;
    averageOrderValue: number;
  }>;
}

export function createOrderAnalyticsTool(createRohlikAPI: () => RohlikAPI) {
  return {
    name: "analyze_orders_by_months",
    definition: {
      title: "Analyze Orders by Months",
      description: "Get orders from the last N months and calculate comprehensive analytics including most used products, spending patterns, categories, and brands",
      inputSchema: {
        months: z.number().min(1).max(24).default(6).describe("Number of months to look back (1-24, default: 6)"),
        maxOrders: z.number().min(10).max(500).default(100).describe("Maximum number of orders to fetch (10-500, default: 100)"),
        topCount: z.number().min(5).max(50).default(10).describe("Number of top items to show in each category (5-50, default: 10)")
      }
    },
    handler: async (args: { months?: number; maxOrders?: number; topCount?: number }) => {
      const { months = 6, maxOrders = 100, topCount = 10 } = args;
      
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
                text: "No order history found for the specified period."
              }
            ]
          };
        }

        const orders = Array.isArray(orderHistory) ? orderHistory : [orderHistory];
        
        // Filter orders within the date range
        const filteredOrders = orders.filter((order: OrderData) => {
          const orderDate = new Date(order.deliveredAt || order.createdAt || '');
          return !isNaN(orderDate.getTime()) && orderDate >= fromDate && orderDate <= toDate;
        });        // If no orders in date range, still try to get details for all recent orders to show something useful
        if (filteredOrders.length === 0) {
          // Use the most recent orders regardless of date
          const recentOrders = orders.slice(0, Math.min(5, orders.length));
          
          let debugOutput = `No orders found in the last ${months} months.\n\n`;
          debugOutput += `📋 SHOWING MOST RECENT ${recentOrders.length} ORDERS INSTEAD:\n\n`;
          
          for (let i = 0; i < recentOrders.length; i++) {
            const order = recentOrders[i];
            const orderDate = order.deliveredAt || order.createdAt || 'Unknown date';
            const totalPrice = order.totalPrice || order.price || 'Unknown price';
            const orderNumber = order.orderNumber || order.id || `Order ${i + 1}`;
            
            debugOutput += `${i + 1}. ${orderNumber}\n`;
            debugOutput += `   Date: ${orderDate}\n`;
            debugOutput += `   Total: ${totalPrice} CZK\n\n`;
          }
          
          debugOutput += `💡 TIP: Your most recent orders seem to be older than ${months} months. Try increasing the months parameter (e.g., 6 or 12 months).`;
          
          return {
            content: [
              {
                type: "text" as const,
                text: debugOutput
              }
            ]
          };
        }

        // Fetch detailed information for each order
        const detailedOrders: OrderData[] = [];
        let successCount = 0;
        let failCount = 0;
        
        for (const order of filteredOrders) {
          try {
            // Try multiple possible ID fields
            const orderId = order.orderNumber || order.id;
            
            if (orderId) {
              console.log(`Fetching details for order ${orderId}...`);
              const detail = await api.getOrderDetail(String(orderId));
              
              if (detail && (detail.products || detail.items)) {
                detailedOrders.push(detail);
                successCount++;
                console.log(`✓ Successfully fetched order ${orderId} with ${(detail.products || detail.items)?.length || 0} products`);
              } else {
                // Fallback to original order data
                detailedOrders.push(order);
                failCount++;
                console.log(`⚠ Order ${orderId} fetched but no products found, using summary data`);
              }
            } else {
              detailedOrders.push(order);
              failCount++;
              console.log(`⚠ Order has no ID field, using summary data:`, JSON.stringify(order).substring(0, 200));
            }
          } catch (error) {
            // Include the order even without detailed products
            detailedOrders.push(order);
            failCount++;
            console.log(`✗ Failed to fetch order details:`, error instanceof Error ? error.message : String(error));
          }
        }
        
        console.log(`\nOrder detail fetch summary: ${successCount} successful, ${failCount} failed out of ${filteredOrders.length} total`);

        // Calculate analytics
        const analytics = calculateOrderAnalytics(detailedOrders, fromDate, toDate, topCount);
        
        // Format the output
        let output = formatAnalyticsOutput(analytics, months);
        
        // Add debug info if some orders failed
        if (failCount > 0) {
          output += `\n\n⚠️  NOTE: ${failCount} out of ${filteredOrders.length} orders could not be fetched with full product details.`;
          output += `\n   Analytics may be incomplete. Check console logs for details.`;
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

function calculateOrderAnalytics(orders: OrderData[], fromDate: Date, toDate: Date, topCount: number): OrderAnalytics {
  const productMap = new Map<string, {
    name: string;
    brand?: string;
    totalQuantity: number;
    totalSpent: number;
    orderCount: number;
  }>();
  
  const categoryMap = new Map<string, {
    category: string;
    totalQuantity: number;
    totalSpent: number;
    orderCount: number;
  }>();
  
  const brandMap = new Map<string, {
    brand: string;
    totalQuantity: number;
    totalSpent: number;
    orderCount: number;
  }>();
  
  const monthlyMap = new Map<string, {
    month: string;
    orderCount: number;
    totalSpent: number;
  }>();

  let totalSpent = 0;
  let totalProducts = 0;

  orders.forEach(order => {
    const orderTotal = order.totalPrice || order.price || 0;
    totalSpent += orderTotal;
    
    // Monthly breakdown
    const orderDate = new Date(order.deliveredAt || order.createdAt || '');
    const monthKey = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;
    const monthData = monthlyMap.get(monthKey) || {
      month: monthKey,
      orderCount: 0,
      totalSpent: 0
    };
    monthData.orderCount++;
    monthData.totalSpent += orderTotal;
    monthlyMap.set(monthKey, monthData);

    // Process products
    const products = order.products || order.items || [];
    products.forEach((product: OrderProduct) => {
      const productName = product.productName || product.name || 'Unknown Product';
      const brand = product.brand || '';
      const quantity = product.quantity || 1;
      const productPrice = product.price || product.totalPrice || 0;
      const category = product.categoryName || product.primaryCategoryName || 'Unknown Category';
      
      totalProducts += quantity;
      
      // Product analytics
      const productKey = `${productName}|${brand}`;
      const productData = productMap.get(productKey) || {
        name: productName,
        brand: brand || undefined,
        totalQuantity: 0,
        totalSpent: 0,
        orderCount: 0
      };
      productData.totalQuantity += quantity;
      productData.totalSpent += productPrice;
      productData.orderCount++;
      productMap.set(productKey, productData);
      
      // Category analytics
      const categoryData = categoryMap.get(category) || {
        category,
        totalQuantity: 0,
        totalSpent: 0,
        orderCount: 0
      };
      categoryData.totalQuantity += quantity;
      categoryData.totalSpent += productPrice;
      categoryData.orderCount++;
      categoryMap.set(category, categoryData);
      
      // Brand analytics
      if (brand) {
        const brandData = brandMap.get(brand) || {
          brand,
          totalQuantity: 0,
          totalSpent: 0,
          orderCount: 0
        };
        brandData.totalQuantity += quantity;
        brandData.totalSpent += productPrice;
        brandData.orderCount++;
        brandMap.set(brand, brandData);
      }
    });
  });

  // Sort and limit results
  const mostUsedProducts = Array.from(productMap.values())
    .sort((a, b) => b.totalQuantity - a.totalQuantity)
    .slice(0, topCount);
    
  const topCategories = Array.from(categoryMap.values())
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, topCount);
    
  const topBrands = Array.from(brandMap.values())
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, topCount);
    
  const monthlyBreakdown = Array.from(monthlyMap.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(month => ({
      ...month,
      averageOrderValue: month.totalSpent / month.orderCount
    }));

  return {
    totalOrders: orders.length,
    dateRange: {
      from: fromDate.toISOString().split('T')[0],
      to: toDate.toISOString().split('T')[0]
    },
    totalSpent,
    averageOrderValue: totalSpent / orders.length,
    totalProducts,
    mostUsedProducts,
    topCategories,
    topBrands,
    monthlyBreakdown
  };
}

function formatAnalyticsOutput(analytics: OrderAnalytics, months: number): string {
  const formatCurrency = (amount: number) => `${amount.toFixed(2)} CZK`;
  
  return `📊 ORDER ANALYTICS - LAST ${months} MONTHS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 PERIOD: ${analytics.dateRange.from} to ${analytics.dateRange.to}

💰 SPENDING SUMMARY:
• Total Orders: ${analytics.totalOrders}
• Total Spent: ${formatCurrency(analytics.totalSpent)}
• Average Order Value: ${formatCurrency(analytics.averageOrderValue)}
• Total Products Ordered: ${analytics.totalProducts}

🔥 MOST ORDERED PRODUCTS:
${analytics.mostUsedProducts.map((product, index) => 
  `${index + 1}. ${product.name}${product.brand ? ` (${product.brand})` : ''}
   📦 Quantity: ${product.totalQuantity} | 💰 Spent: ${formatCurrency(product.totalSpent)} | 📋 Orders: ${product.orderCount}`
).join('\n')}

📂 TOP CATEGORIES BY SPENDING:
${analytics.topCategories.map((category, index) => 
  `${index + 1}. ${category.category}
   📦 Quantity: ${category.totalQuantity} | 💰 Spent: ${formatCurrency(category.totalSpent)} | 📋 Orders: ${category.orderCount}`
).join('\n')}

🏷️ TOP BRANDS BY SPENDING:
${analytics.topBrands.map((brand, index) => 
  `${index + 1}. ${brand.brand}
   📦 Quantity: ${brand.totalQuantity} | 💰 Spent: ${formatCurrency(brand.totalSpent)} | 📋 Orders: ${brand.orderCount}`
).join('\n')}

📈 MONTHLY BREAKDOWN:
${analytics.monthlyBreakdown.map(month => 
  `${month.month}: ${month.orderCount} orders | ${formatCurrency(month.totalSpent)} | Avg: ${formatCurrency(month.averageOrderValue)}`
).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}