/**
 * Fetch Shufersal PriceFull data and output public/shufersal-products.json
 *
 * Usage: node scripts/fetch-shufersal.mjs
 *
 * Downloads PriceFull XML files from prices.shufersal.co.il,
 * parses them, deduplicates by barcode, and writes a JSON file.
 */

import { createWriteStream } from "fs";
import { writeFile, mkdir } from "fs/promises";
import { gunzipSync } from "zlib";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const OUTPUT = join(ROOT, "public", "shufersal-products.json");

const BASE = "http://prices.shufersal.co.il";
const LIST_URL = `${BASE}/FileObject/UpdateCategory?catID=2&storeId=&sort=Date&sortdir=DESC&page=1`;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "he-IL,he;q=0.9,en;q=0.5",
};

// How many PriceFull files to download and merge (more = more products but slower)
const FILES_TO_DOWNLOAD = 5;

async function fetchPage(url) {
  console.log(`  Fetching page: ${url}`);
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

function extractDownloadLinks(html) {
  // Links are Azure blob URLs with SAS tokens, HTML-encoded with &amp;
  const re = /href="(https?:\/\/pricesprodpublic\.blob\.core\.windows\.net[^"]+)"/gi;
  const links = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    links.push(m[1].replace(/&amp;/g, "&"));
  }
  return links;
}

async function downloadAndDecompress(url) {
  console.log(`  Downloading: ${url.slice(0, 100)}...`);
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading file`);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`  Decompressing ${(buf.length / 1024).toFixed(0)} KB...`);
  return gunzipSync(buf).toString("utf-8");
}

function parseXmlProducts(xml) {
  const products = [];
  // Match each <Item>...</Item> block
  const itemRe = /<Item>([\s\S]*?)<\/Item>/gi;
  let match;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, "i"));
      return m ? m[1].trim() : "";
    };

    const barcode = get("ItemCode");
    const name = get("ItemName");
    if (!barcode || !name) continue;

    const brand = get("ManufactureName");
    const unitQty = get("UnitQty");
    const quantity = get("Quantity");
    const unitMeasure = get("UnitOfMeasure");

    const product = { barcode, name };
    if (brand) product.brand = brand;

    // Parse weight/volume from Quantity + UnitOfMeasure
    const qty = parseFloat(quantity) || parseFloat(unitQty) || 0;
    if (qty > 0) {
      const measure = unitMeasure.toLowerCase();
      if (
        measure.includes("גרם") ||
        measure === "gr" ||
        measure === "g" ||
        measure === "gram"
      ) {
        product.weightG = qty;
      } else if (
        measure.includes("מ\"ל") ||
        measure.includes("מיליליטר") ||
        measure === "ml" ||
        measure === "milliliter"
      ) {
        product.volumeMl = qty;
      } else if (
        measure.includes("ליטר") ||
        measure === "l" ||
        measure === "liter"
      ) {
        product.volumeMl = qty * 1000;
      } else if (
        measure.includes("ק\"ג") ||
        measure.includes("קילו") ||
        measure === "kg"
      ) {
        product.weightG = qty * 1000;
      }
    }

    // Pack quantity
    const qtyInPack = parseInt(get("QtyInPackage") || get("UnitQty"), 10);
    if (qtyInPack > 1) product.qtyInPack = qtyInPack;

    products.push(product);
  }
  return products;
}

async function main() {
  console.log("=== Shufersal Products Fetcher ===\n");

  // Step 1: Get the file list page (sorted by size descending to get largest stores)
  console.log("Step 1: Fetching file list...");
  const html = await fetchPage(LIST_URL);

  const links = extractDownloadLinks(html);
  if (links.length === 0) {
    console.error(
      "ERROR: Could not find any download links on the page.\n" +
        "The page structure may have changed, or the server is down.\n" +
        "Try visiting http://prices.shufersal.co.il/ manually.",
    );
    process.exit(1);
  }
  console.log(`  Found ${links.length} download links\n`);

  // Step 2: Download and parse
  console.log(
    `Step 2: Downloading top ${FILES_TO_DOWNLOAD} files (largest stores)...`,
  );
  const allProducts = new Map(); // barcode -> product

  for (let i = 0; i < Math.min(FILES_TO_DOWNLOAD, links.length); i++) {
    try {
      const xml = await downloadAndDecompress(links[i]);
      const products = parseXmlProducts(xml);
      console.log(`  Parsed ${products.length} products from file ${i + 1}`);
      for (const p of products) {
        if (!allProducts.has(p.barcode)) {
          allProducts.set(p.barcode, p);
        }
      }
    } catch (err) {
      console.warn(`  Warning: failed to process file ${i + 1}: ${err.message}`);
    }
  }

  console.log(`\n  Total unique products: ${allProducts.size}\n`);

  if (allProducts.size === 0) {
    console.error("ERROR: No products parsed. Something went wrong.");
    process.exit(1);
  }

  // Step 3: Write output
  console.log("Step 3: Writing output...");
  await mkdir(join(ROOT, "public"), { recursive: true });
  const output = JSON.stringify([...allProducts.values()], null, 0);
  await writeFile(OUTPUT, output, "utf-8");
  console.log(`  Written to: ${OUTPUT}`);
  console.log(`  File size: ${(Buffer.byteLength(output) / 1024).toFixed(0)} KB`);
  console.log(`  Products: ${allProducts.size}`);
  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
