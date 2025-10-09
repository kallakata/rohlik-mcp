# Rohlik MCP Server - Project Context

## Overview
This is a Model Context Protocol (MCP) server for Rohlik Group's online grocery services across Europe (Rohlik.cz, Knuspr.de, Gurkerl.at, Kifli.hu, Sezamo.ro).

## Project Structure
```
src/
├── index.ts              # Main server entry point
├── rohlik-api.ts         # API client with all HTTP calls
├── types.ts              # TypeScript type definitions
└── tools/                # Individual MCP tools
    ├── search-products.ts
    ├── cart-management.ts
    ├── shopping-lists.ts
    ├── account-data.ts
    ├── order-history.ts
    ├── delivery-info.ts
    ├── upcoming-orders.ts
    ├── premium-info.ts
    ├── delivery-slots.ts
    ├── announcements.ts
    └── reusable-bags.ts
```

## Environment Variables
- `ROHLIK_USERNAME` - User email (required)
- `ROHLIK_PASSWORD` - User password (required)
- `ROHLIK_BASE_URL` - Service URL (optional, defaults to rohlik.cz)

## Available Tools (15 total)
**Core Shopping:** search_products, add_to_cart, get_cart_content, remove_from_cart, get_shopping_list
**Account Info:** get_account_data, get_order_history, get_upcoming_orders, get_delivery_info, get_delivery_slots, get_premium_info, get_announcements, get_reusable_bags_info, order_analytics

## Key Implementation Details
- Each tool is in separate file for modularity
- API client handles authentication (login/logout per request)
- All endpoints use reverse-engineered Rohlik Group APIs
- Session management via cookies
- Error handling with typed exceptions

## Development Commands
- `npm run build` - Compile TypeScript
- `npm start` - Run production server
- `npm run dev` - Development mode
- `npm run inspect` - Test with MCP Inspector