#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─── Shopify client ───────────────────────────────────────────────────────────

function getConfig() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  const apiVersion = process.env.SHOPIFY_API_VERSION ?? "2025-04";
  if (!domain || !token) {
    throw new Error(
      "SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN env vars are required"
    );
  }
  return { domain, token, apiVersion };
}

async function shopifyGraphQL(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<unknown> {
  const { domain, token, apiVersion } = getConfig();
  const url = `https://${domain}/admin/api/${apiVersion}/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`Shopify API error ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { data?: unknown; errors?: unknown[] };
  if (json.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "shopify-mcp",
  version: "1.0.0",
});

// ═══════════════════════════════════════════════════════════════════════════════
// STORE
// ═══════════════════════════════════════════════════════════════════════════════

server.tool("get_shop_info", "Get store name, domain, plan, currency, and timezone", {}, async () => {
  const data = (await shopifyGraphQL(`{
    shop {
      name myshopifyDomain email primaryDomain { url }
      plan { displayName }
      currencyCode timezoneAbbreviation
      enabledPresentmentCurrencies
    }
  }`)) as { shop: unknown };
  return { content: [{ type: "text", text: JSON.stringify(data.shop, null, 2) }] };
});

// ═══════════════════════════════════════════════════════════════════════════════
// THEMES
// ═══════════════════════════════════════════════════════════════════════════════

server.tool(
  "list_themes",
  "List all themes. Role can be MAIN (published), UNPUBLISHED (draft), or DEVELOPMENT.",
  {},
  async () => {
    const data = (await shopifyGraphQL(`{
      themes(first: 50) {
        nodes {
          id name role createdAt updatedAt
          themeStoreId prefix
        }
      }
    }`)) as { themes: { nodes: unknown[] } };
    return { content: [{ type: "text", text: JSON.stringify(data.themes.nodes, null, 2) }] };
  }
);

server.tool(
  "get_theme",
  "Get details of a single theme by its GID (e.g. gid://shopify/OnlineStoreTheme/123456789)",
  { theme_id: z.string().describe("Theme GID") },
  async ({ theme_id }) => {
    const data = (await shopifyGraphQL(
      `query GetTheme($id: ID!) {
        theme(id: $id) {
          id name role createdAt updatedAt themeStoreId prefix
          processing processingFailed
        }
      }`,
      { id: theme_id }
    )) as { theme: unknown };
    return { content: [{ type: "text", text: JSON.stringify(data.theme, null, 2) }] };
  }
);

server.tool(
  "list_theme_files",
  "List all files in a theme. Optionally filter by filename prefix (e.g. 'templates/', 'assets/', 'sections/').",
  {
    theme_id: z.string().describe("Theme GID"),
    filename_prefix: z.string().optional().describe("Filter files by prefix, e.g. 'sections/'"),
  },
  async ({ theme_id, filename_prefix }) => {
    let cursor: string | null = null;
    const files: unknown[] = [];
    do {
      const afterClause = cursor ? `, after: "${cursor}"` : "";
      const filterClause = filename_prefix
        ? `, query: "filename:${filename_prefix}*"`
        : "";
      const data = (await shopifyGraphQL(
        `query ListThemeFiles($id: ID!) {
          theme(id: $id) {
            files(first: 250${filterClause}${afterClause}) {
              nodes { filename contentType size updatedAt }
              pageInfo { hasNextPage endCursor }
            }
          }
        }`,
        { id: theme_id }
      )) as { theme: { files: { nodes: unknown[]; pageInfo: { hasNextPage: boolean; endCursor: string } } } };
      files.push(...data.theme.files.nodes);
      const { hasNextPage, endCursor } = data.theme.files.pageInfo;
      cursor = hasNextPage ? endCursor : null;
    } while (cursor);
    return { content: [{ type: "text", text: JSON.stringify(files, null, 2) }] };
  }
);

server.tool(
  "read_theme_file",
  "Read the content of a single theme file (Liquid, CSS, JS, JSON, etc.)",
  {
    theme_id: z.string().describe("Theme GID"),
    filename: z.string().describe("File path within the theme, e.g. 'sections/header.liquid'"),
  },
  async ({ theme_id, filename }) => {
    const data = (await shopifyGraphQL(
      `query ReadThemeFile($id: ID!, $filename: [String!]!) {
        theme(id: $id) {
          files(first: 1, filenames: $filename) {
            nodes {
              filename contentType size updatedAt
              body { ... on OnlineStoreThemeFileBodyText { content } }
            }
          }
        }
      }`,
      { id: theme_id, filename: [filename] }
    )) as { theme: { files: { nodes: Array<{ filename: string; body?: { content?: string } }> } } };
    const file = data.theme.files.nodes[0];
    if (!file) {
      return { content: [{ type: "text", text: `File not found: ${filename}` }] };
    }
    return {
      content: [
        { type: "text", text: `// ${file.filename}\n${file.body?.content ?? "(binary or empty)"}` },
      ],
    };
  }
);

server.tool(
  "write_theme_file",
  "Create or overwrite a theme file. Supply the filename and full file content.",
  {
    theme_id: z.string().describe("Theme GID"),
    filename: z.string().describe("File path, e.g. 'sections/hero.liquid'"),
    content: z.string().describe("Full file content to write"),
  },
  async ({ theme_id, filename, content }) => {
    const data = (await shopifyGraphQL(
      `mutation WriteThemeFile($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
        themeFilesUpsert(themeId: $themeId, files: $files) {
          upsertedThemeFiles { filename updatedAt }
          userErrors { field message }
          job { id done }
        }
      }`,
      {
        themeId: theme_id,
        files: [{ filename, body: { type: "TEXT", value: content } }],
      }
    )) as { themeFilesUpsert: { upsertedThemeFiles: unknown[]; userErrors: Array<{ message: string }>; job?: { id: string; done: boolean } } };
    const result = data.themeFilesUpsert;
    if (result.userErrors.length) {
      throw new Error(result.userErrors.map((e) => e.message).join("; "));
    }
    return {
      content: [{ type: "text", text: JSON.stringify({ upserted: result.upsertedThemeFiles, job: result.job }, null, 2) }],
    };
  }
);

server.tool(
  "delete_theme_file",
  "Delete one or more files from a theme",
  {
    theme_id: z.string().describe("Theme GID"),
    filenames: z.array(z.string()).describe("Array of filenames to delete"),
  },
  async ({ theme_id, filenames }) => {
    const data = (await shopifyGraphQL(
      `mutation DeleteThemeFiles($themeId: ID!, $files: [OnlineStoreThemeFileDeleteFileInput!]!) {
        themeFilesDelete(themeId: $themeId, files: $files) {
          deletedThemeFiles { filename }
          userErrors { field message }
        }
      }`,
      {
        themeId: theme_id,
        files: filenames.map((filename) => ({ filename })),
      }
    )) as { themeFilesDelete: { deletedThemeFiles: unknown[]; userErrors: Array<{ message: string }> } };
    const result = data.themeFilesDelete;
    if (result.userErrors.length) {
      throw new Error(result.userErrors.map((e) => e.message).join("; "));
    }
    return { content: [{ type: "text", text: JSON.stringify(result.deletedThemeFiles, null, 2) }] };
  }
);

server.tool(
  "copy_theme_files",
  "Copy files from one theme to another (overwrites destination)",
  {
    source_theme_id: z.string().describe("Source theme GID"),
    destination_theme_id: z.string().describe("Destination theme GID"),
    filenames: z.array(z.string()).describe("Files to copy"),
  },
  async ({ source_theme_id, destination_theme_id, filenames }) => {
    const data = (await shopifyGraphQL(
      `mutation CopyThemeFiles($sourceThemeId: ID!, $destinationThemeId: ID!, $files: [OnlineStoreThemeFilesCopyFileInput!]!) {
        themeFilesCopy(sourceThemeId: $sourceThemeId, destinationThemeId: $destinationThemeId, files: $files) {
          copiedThemeFiles { filename updatedAt }
          userErrors { field message }
          job { id done }
        }
      }`,
      {
        sourceThemeId: source_theme_id,
        destinationThemeId: destination_theme_id,
        files: filenames.map((filename) => ({ filename })),
      }
    )) as { themeFilesCopy: { copiedThemeFiles: unknown[]; userErrors: Array<{ message: string }>; job?: unknown } };
    const result = data.themeFilesCopy;
    if (result.userErrors.length) {
      throw new Error(result.userErrors.map((e) => e.message).join("; "));
    }
    return { content: [{ type: "text", text: JSON.stringify({ copied: result.copiedThemeFiles, job: result.job }, null, 2) }] };
  }
);

server.tool(
  "create_theme",
  "Create a new theme from a public ZIP URL. Role defaults to UNPUBLISHED; use DEVELOPMENT for temp themes.",
  {
    name: z.string().describe("Name for the new theme"),
    src: z.string().describe("Public HTTPS URL to a theme ZIP file"),
    role: z.enum(["UNPUBLISHED", "DEVELOPMENT"]).optional().default("UNPUBLISHED"),
  },
  async ({ name, src, role }) => {
    const data = (await shopifyGraphQL(
      `mutation CreateTheme($name: String!, $src: URL!, $role: ThemeRole) {
        themeCreate(name: $name, src: $src, role: $role) {
          theme { id name role createdAt }
          userErrors { field message }
        }
      }`,
      { name, src, role }
    )) as { themeCreate: { theme: unknown; userErrors: Array<{ message: string }> } };
    const result = data.themeCreate;
    if (result.userErrors.length) {
      throw new Error(result.userErrors.map((e) => e.message).join("; "));
    }
    return { content: [{ type: "text", text: JSON.stringify(result.theme, null, 2) }] };
  }
);

server.tool(
  "duplicate_theme",
  "Duplicate an existing theme",
  {
    theme_id: z.string().describe("Theme GID to duplicate"),
    name: z.string().describe("Name for the new duplicate theme"),
  },
  async ({ theme_id, name }) => {
    const data = (await shopifyGraphQL(
      `mutation DuplicateTheme($themeId: ID!, $name: String!) {
        themeDuplicate(themeId: $themeId, name: $name) {
          newTheme { id name role createdAt }
          userErrors { field message }
        }
      }`,
      { themeId: theme_id, name }
    )) as { themeDuplicate: { newTheme: unknown; userErrors: Array<{ message: string }> } };
    const result = data.themeDuplicate;
    if (result.userErrors.length) {
      throw new Error(result.userErrors.map((e) => e.message).join("; "));
    }
    return { content: [{ type: "text", text: JSON.stringify(result.newTheme, null, 2) }] };
  }
);

server.tool(
  "publish_theme",
  "Publish a theme (make it the live MAIN theme)",
  { theme_id: z.string().describe("Theme GID to publish") },
  async ({ theme_id }) => {
    const data = (await shopifyGraphQL(
      `mutation PublishTheme($themeId: ID!) {
        themePublish(themeId: $themeId) {
          theme { id name role updatedAt }
          userErrors { field message }
        }
      }`,
      { themeId: theme_id }
    )) as { themePublish: { theme: unknown; userErrors: Array<{ message: string }> } };
    const result = data.themePublish;
    if (result.userErrors.length) {
      throw new Error(result.userErrors.map((e) => e.message).join("; "));
    }
    return { content: [{ type: "text", text: JSON.stringify(result.theme, null, 2) }] };
  }
);

server.tool(
  "update_theme",
  "Rename a theme",
  {
    theme_id: z.string().describe("Theme GID"),
    name: z.string().describe("New name for the theme"),
  },
  async ({ theme_id, name }) => {
    const data = (await shopifyGraphQL(
      `mutation UpdateTheme($themeId: ID!, $name: String!) {
        themeUpdate(input: { id: $themeId, name: $name }) {
          theme { id name role updatedAt }
          userErrors { field message }
        }
      }`,
      { themeId: theme_id, name }
    )) as { themeUpdate: { theme: unknown; userErrors: Array<{ message: string }> } };
    const result = data.themeUpdate;
    if (result.userErrors.length) {
      throw new Error(result.userErrors.map((e) => e.message).join("; "));
    }
    return { content: [{ type: "text", text: JSON.stringify(result.theme, null, 2) }] };
  }
);

server.tool(
  "delete_theme",
  "Permanently delete a theme (cannot delete the active MAIN theme)",
  { theme_id: z.string().describe("Theme GID to delete") },
  async ({ theme_id }) => {
    const data = (await shopifyGraphQL(
      `mutation DeleteTheme($themeId: ID!) {
        themeDelete(id: $themeId) {
          deletedThemeId
          userErrors { field message }
        }
      }`,
      { themeId: theme_id }
    )) as { themeDelete: { deletedThemeId: string; userErrors: Array<{ message: string }> } };
    const result = data.themeDelete;
    if (result.userErrors.length) {
      throw new Error(result.userErrors.map((e) => e.message).join("; "));
    }
    return { content: [{ type: "text", text: `Deleted theme: ${result.deletedThemeId}` }] };
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════════════════════════════

server.tool(
  "list_products",
  "List products in the store",
  {
    first: z.number().min(1).max(250).optional().default(50),
    query: z.string().optional().describe("Filter query, e.g. 'status:active'"),
  },
  async ({ first, query }) => {
    const queryClause = query ? `, query: "${query}"` : "";
    const data = (await shopifyGraphQL(
      `query ListProducts($first: Int!) {
        products(first: $first${queryClause}) {
          nodes {
            id title status handle vendor productType
            priceRangeV2 { minVariantPrice { amount currencyCode } }
            totalInventory
          }
        }
      }`,
      { first }
    )) as { products: { nodes: unknown[] } };
    return { content: [{ type: "text", text: JSON.stringify(data.products.nodes, null, 2) }] };
  }
);

server.tool(
  "get_product",
  "Get full details of a product by GID",
  { product_id: z.string().describe("Product GID") },
  async ({ product_id }) => {
    const data = (await shopifyGraphQL(
      `query GetProduct($id: ID!) {
        product(id: $id) {
          id title descriptionHtml status handle vendor productType
          tags media(first: 10) { nodes { ... on MediaImage { image { url } } } }
          variants(first: 50) {
            nodes { id title sku price inventoryQuantity }
          }
        }
      }`,
      { id: product_id }
    )) as { product: unknown };
    return { content: [{ type: "text", text: JSON.stringify(data.product, null, 2) }] };
  }
);

server.tool(
  "create_product",
  "Create a new product",
  {
    title: z.string(),
    description_html: z.string().optional(),
    vendor: z.string().optional(),
    product_type: z.string().optional(),
    tags: z.array(z.string()).optional(),
    status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]).optional().default("DRAFT"),
  },
  async ({ title, description_html, vendor, product_type, tags, status }) => {
    const data = (await shopifyGraphQL(
      `mutation CreateProduct($input: ProductInput!) {
        productCreate(input: $input) {
          product { id title status handle }
          userErrors { field message }
        }
      }`,
      { input: { title, descriptionHtml: description_html, vendor, productType: product_type, tags, status } }
    )) as { productCreate: { product: unknown; userErrors: Array<{ message: string }> } };
    const result = data.productCreate;
    if (result.userErrors.length) throw new Error(result.userErrors.map((e) => e.message).join("; "));
    return { content: [{ type: "text", text: JSON.stringify(result.product, null, 2) }] };
  }
);

server.tool(
  "update_product",
  "Update a product's fields",
  {
    product_id: z.string(),
    title: z.string().optional(),
    description_html: z.string().optional(),
    status: z.enum(["ACTIVE", "DRAFT", "ARCHIVED"]).optional(),
    tags: z.array(z.string()).optional(),
    vendor: z.string().optional(),
  },
  async ({ product_id, title, description_html, status, tags, vendor }) => {
    const data = (await shopifyGraphQL(
      `mutation UpdateProduct($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id title status handle updatedAt }
          userErrors { field message }
        }
      }`,
      { input: { id: product_id, title, descriptionHtml: description_html, status, tags, vendor } }
    )) as { productUpdate: { product: unknown; userErrors: Array<{ message: string }> } };
    const result = data.productUpdate;
    if (result.userErrors.length) throw new Error(result.userErrors.map((e) => e.message).join("; "));
    return { content: [{ type: "text", text: JSON.stringify(result.product, null, 2) }] };
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// COLLECTIONS
// ═══════════════════════════════════════════════════════════════════════════════

server.tool(
  "list_collections",
  "List collections (smart and custom)",
  { first: z.number().min(1).max(250).optional().default(50) },
  async ({ first }) => {
    const data = (await shopifyGraphQL(
      `query ListCollections($first: Int!) {
        collections(first: $first) {
          nodes { id title handle updatedAt productsCount { count } }
        }
      }`,
      { first }
    )) as { collections: { nodes: unknown[] } };
    return { content: [{ type: "text", text: JSON.stringify(data.collections.nodes, null, 2) }] };
  }
);

server.tool(
  "create_collection",
  "Create a new custom collection",
  {
    title: z.string(),
    description_html: z.string().optional(),
  },
  async ({ title, description_html }) => {
    const data = (await shopifyGraphQL(
      `mutation CreateCollection($input: CollectionInput!) {
        collectionCreate(input: $input) {
          collection { id title handle }
          userErrors { field message }
        }
      }`,
      { input: { title, descriptionHtml: description_html } }
    )) as { collectionCreate: { collection: unknown; userErrors: Array<{ message: string }> } };
    const result = data.collectionCreate;
    if (result.userErrors.length) throw new Error(result.userErrors.map((e) => e.message).join("; "));
    return { content: [{ type: "text", text: JSON.stringify(result.collection, null, 2) }] };
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════════════════════════

server.tool(
  "list_orders",
  "List recent orders",
  {
    first: z.number().min(1).max(250).optional().default(50),
    query: z.string().optional().describe("Filter, e.g. 'financial_status:paid'"),
  },
  async ({ first, query }) => {
    const queryClause = query ? `, query: "${query}"` : "";
    const data = (await shopifyGraphQL(
      `query ListOrders($first: Int!) {
        orders(first: $first${queryClause}) {
          nodes {
            id name email createdAt displayFinancialStatus displayFulfillmentStatus
            currentTotalPriceSet { shopMoney { amount currencyCode } }
          }
        }
      }`,
      { first }
    )) as { orders: { nodes: unknown[] } };
    return { content: [{ type: "text", text: JSON.stringify(data.orders.nodes, null, 2) }] };
  }
);

server.tool(
  "get_order",
  "Get full details of an order by GID",
  { order_id: z.string() },
  async ({ order_id }) => {
    const data = (await shopifyGraphQL(
      `query GetOrder($id: ID!) {
        order(id: $id) {
          id name email phone createdAt displayFinancialStatus displayFulfillmentStatus
          currentTotalPriceSet { shopMoney { amount currencyCode } }
          lineItems(first: 50) {
            nodes { title quantity originalUnitPriceSet { shopMoney { amount } } }
          }
          shippingAddress { firstName lastName address1 city country zip }
        }
      }`,
      { id: order_id }
    )) as { order: unknown };
    return { content: [{ type: "text", text: JSON.stringify(data.order, null, 2) }] };
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// RAW GRAPHQL ESCAPE HATCH
// ═══════════════════════════════════════════════════════════════════════════════

server.tool(
  "graphql_query",
  "Run any read-only Shopify Admin GraphQL query. Use for anything not covered by dedicated tools.",
  {
    query: z.string().describe("GraphQL query string"),
    variables: z.record(z.string(), z.unknown()).optional().describe("Variables object"),
  },
  async ({ query, variables }) => {
    const data = await shopifyGraphQL(query, variables ?? {});
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "graphql_mutation",
  "Run any Shopify Admin GraphQL mutation. Use for anything not covered by dedicated tools.",
  {
    mutation: z.string().describe("GraphQL mutation string"),
    variables: z.record(z.string(), z.unknown()).optional().describe("Variables object"),
  },
  async ({ mutation, variables }) => {
    const data = await shopifyGraphQL(mutation, variables ?? {});
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
