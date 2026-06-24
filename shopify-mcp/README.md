# shopify-mcp

A Model Context Protocol (MCP) server for full Shopify store management including
theme editing. Works with any Shopify store — just supply an access token.

## Tools

### Store
| Tool | Description |
|------|-------------|
| `get_shop_info` | Store name, domain, plan, currency, timezone |

### Themes (full read/write)
| Tool | Description |
|------|-------------|
| `list_themes` | List all themes and their roles (MAIN / UNPUBLISHED / DEVELOPMENT) |
| `get_theme` | Inspect a single theme |
| `list_theme_files` | List every file in a theme; filter by prefix e.g. `sections/` |
| `read_theme_file` | Read a Liquid / CSS / JS / JSON file |
| `write_theme_file` | Create or overwrite a theme file |
| `delete_theme_file` | Delete one or more theme files |
| `copy_theme_files` | Copy files between themes |
| `create_theme` | Create a theme from a public ZIP URL |
| `duplicate_theme` | Clone an existing theme |
| `publish_theme` | Set a theme as the live store theme |
| `update_theme` | Rename a theme |
| `delete_theme` | Permanently delete a theme |

### Products
| Tool | Description |
|------|-------------|
| `list_products` | List products with optional filter query |
| `get_product` | Full product detail by GID |
| `create_product` | Create a new product |
| `update_product` | Update product fields |

### Collections
| Tool | Description |
|------|-------------|
| `list_collections` | List all collections |
| `create_collection` | Create a custom collection |

### Orders
| Tool | Description |
|------|-------------|
| `list_orders` | List recent orders |
| `get_order` | Full order detail by GID |

### Escape hatches
| Tool | Description |
|------|-------------|
| `graphql_query` | Run any Admin GraphQL query |
| `graphql_mutation` | Run any Admin GraphQL mutation |

---

## Setup

### 1. Create a Shopify Custom App

For a **brand new store**:

1. Go to **Shopify Admin → Settings → Apps and sales channels → Develop apps**
2. Click **Create an app**, give it a name (e.g. "Claude MCP")
3. Under **Configuration → Admin API access scopes**, enable:
   - `read_themes`, `write_themes`
   - `read_products`, `write_products`
   - `read_orders`, `write_orders`
   - `read_content`, `write_content`
   - `read_online_store_pages`, `write_online_store_pages`
4. Click **Install app** → copy the **Admin API access token** (shown once)
5. Note your store domain: `your-store.myshopify.com`

### 2. Install and build

```bash
cd shopify-mcp
npm install
npm run build
```

### 3. Configure Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "shopify": {
      "command": "node",
      "args": ["/absolute/path/to/shopify-mcp/dist/index.js"],
      "env": {
        "SHOPIFY_STORE_DOMAIN": "your-store.myshopify.com",
        "SHOPIFY_ACCESS_TOKEN": "shpat_xxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

### 4. Configure Claude Code (CLI)

Add to your project's `.mcp.json` or `~/.claude.json`:

```json
{
  "mcpServers": {
    "shopify": {
      "command": "node",
      "args": ["/absolute/path/to/shopify-mcp/dist/index.js"],
      "env": {
        "SHOPIFY_STORE_DOMAIN": "your-store.myshopify.com",
        "SHOPIFY_ACCESS_TOKEN": "shpat_xxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

Or with `npx tsx` for dev (no build step):

```json
{
  "mcpServers": {
    "shopify": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/shopify-mcp/src/index.ts"],
      "env": {
        "SHOPIFY_STORE_DOMAIN": "your-store.myshopify.com",
        "SHOPIFY_ACCESS_TOKEN": "shpat_xxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

---

## Example: edit a theme file

```
list_themes
→ [{ "id": "gid://shopify/OnlineStoreTheme/123", "name": "Dawn", "role": "MAIN" }]

read_theme_file(theme_id="gid://...123", filename="sections/header.liquid")
→ <full liquid source>

write_theme_file(theme_id="gid://...123", filename="sections/header.liquid", content="...")
→ { "upserted": [{ "filename": "sections/header.liquid", "updatedAt": "..." }] }
```

## API version

Defaults to `2025-04`. Override with `SHOPIFY_API_VERSION` env var.
