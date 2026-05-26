/**
 * Fetch one PriceFull GZ file from Shufersal's price transparency portal,
 * parse its XML, and emit a deduplicated JSON of products:
 *   { barcode, name, brand, quantity, unitOfMeasure }
 *
 * Usage:  node scripts/fetch-shufersal.mjs [--out path/to/output.json]
 *
 * Steps:
 *  1. Scrape the PriceFull file-list page sorted by size DESC (biggest = most products).
 *  2. Extract the first Azure Blob download link (includes SAS token).
 *  3. Download the GZ, decompress, parse XML.
 *  4. Deduplicate by barcode (keep first occurrence).
 *  5. Write JSON array to disk.
 */

import { gunzipSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";

const DEFAULT_OUT = "scripts/shufersal-products.json";
const LIST_URL =
  "https://prices.shufersal.co.il/FileObject/UpdateCategory?catID=2&storeId=0&sort=Size&sortdir=DESC&page=1";

function parseArgs() {
  const args = process.argv.slice(2);
  let out = DEFAULT_OUT;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out" && args[i + 1]) out = args[++i];
  }
  return { out };
}

async function fetchFileListPage() {
  console.log("⏳ Fetching PriceFull file list from Shufersal…");
  const res = await fetch(LIST_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      Accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`File list HTTP ${res.status}`);
  return res.text();
}

function extractDownloadUrls(html) {
  // Links on Shufersal page: href contains blob.core.windows.net OR relative /FileObject/Download path
  const blobRe = /href="(https:\/\/pricesprodpublic\.blob\.core\.windows\.net\/[^"]+)"/gi;
  const urls = [];
  let m;
  while ((m = blobRe.exec(html)) !== null) {
    urls.push(decodeHtmlEntities(m[1]));
  }
  if (urls.length) return urls;

  // Fallback: look for download links via /FileObject/Download?... pattern
  const dlRe = /href="(\/FileObject\/Download[^"]*)"/gi;
  while ((m = dlRe.exec(html)) !== null) {
    urls.push("https://prices.shufersal.co.il" + decodeHtmlEntities(m[1]));
  }
  return urls;
}

function decodeHtmlEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
}

async function downloadGz(url) {
  console.log("⏳ Downloading GZ file…");
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      Referer: "http://prices.shufersal.co.il/",
      Accept: "*/*",
    },
  });
  if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`   Downloaded ${(buf.length / 1024).toFixed(1)} KB`);
  return buf;
}

function parseXml(xmlText) {
  const parser = new XMLParser({
    ignoreAttributes: true,
    isArray: (name) => name === "Item" || name === "Product",
  });
  const doc = parser.parse(xmlText);

  // Structure varies: Root > Items > Item  OR  Root > Products > Product
  let items =
    doc?.Root?.Items?.Item ??
    doc?.Root?.Products?.Product ??
    doc?.root?.Items?.Item ??
    doc?.root?.Products?.Product ??
    doc?.Prices?.Items?.Item ??
    doc?.Prices?.Products?.Product ??
    [];

  // Flatten if nested under a different wrapper
  if (!Array.isArray(items)) items = [items];

  return items;
}

function normalizeProducts(rawItems) {
  const seen = new Map();

  for (const item of rawItems) {
    // Field names vary: ItemCode / Itemcode / itemcode etc.
    const code = String(
      item.ItemCode ?? item.Itemcode ?? item.itemcode ?? item.ITEMCODE ?? "",
    ).trim();
    if (!code || code.length < 7) continue;
    // Skip internal codes (start with chain prefix, non-EAN)
    if (code.startsWith("7290027600007")) continue;

    if (seen.has(code)) continue;

    const name = String(
      item.ItemName ?? item.Itemname ?? item.itemname ?? "",
    ).trim();
    const brand = String(
      item.ManufactureName ??
        item.ManufacturerName ??
        item.Manufacturername ??
        "",
    ).trim();
    const qty = String(
      item.Quantity ?? item.quantity ?? "",
    ).trim();
    const unitQty = String(
      item.UnitQty ?? item.unitqty ?? "",
    ).trim();
    const unit = String(
      item.UnitOfMeasure ?? item.Unitofmeasure ?? "",
    ).trim();
    const qtyInPack = String(
      item.QtyInPackage ?? item.QtyInpackage ?? "",
    ).trim();

    if (!name) continue;

    // Parse weight from quantity field (e.g. "210.00" with unitQty "גרם")
    const numQty = parseFloat(qty);
    const weightG =
      Number.isFinite(numQty) && numQty > 0 && /גרם|gram/i.test(unitQty)
        ? numQty
        : undefined;
    const volumeMl =
      Number.isFinite(numQty) && numQty > 0 && /ליטר|מיליליטר|מ"ל|ml|liter/i.test(unitQty)
        ? (/ליטר/i.test(unitQty) && numQty <= 20 ? numQty * 1000 : numQty)
        : undefined;

    seen.set(code, {
      barcode: code,
      name,
      brand: brand || undefined,
      weightG,
      volumeMl,
      qtyInPack: qtyInPack && qtyInPack !== "0" ? Number(qtyInPack) || undefined : undefined,
    });
  }

  return [...seen.values()];
}

async function main() {
  const { out } = parseArgs();

  const html = await fetchFileListPage();
  const urls = extractDownloadUrls(html);
  if (urls.length === 0) {
    console.error("❌ No download links found on the page. The site may have changed.");
    console.error("   Writing debug HTML to scripts/_debug_page.html");
    writeFileSync("scripts/_debug_page.html", html, "utf-8");
    process.exit(1);
  }
  console.log(`   Found ${urls.length} download links.`);

  // Download multiple files to maximize product coverage (dedupe at the end).
  const MAX_FILES = Math.min(5, urls.length);
  let allRawItems = [];

  for (let i = 0; i < MAX_FILES; i++) {
    const url = urls[i];
    console.log(`\n[${i + 1}/${MAX_FILES}] ${url.slice(url.lastIndexOf("/") + 1, url.indexOf("?"))}`);
    try {
      const gzBuf = await downloadGz(url);
      console.log("   Decompressing…");
      const xml = gunzipSync(gzBuf).toString("utf-8");
      console.log(`   XML size: ${(xml.length / 1024).toFixed(0)} KB`);
      const rawItems = parseXml(xml);
      console.log(`   Items in file: ${rawItems.length}`);
      allRawItems = allRawItems.concat(rawItems);
    } catch (err) {
      console.warn(`   ⚠️ Skipped: ${err.message}`);
    }
  }

  console.log(`\n⏳ Total raw items from ${MAX_FILES} files: ${allRawItems.length}`);
  const products = normalizeProducts(allRawItems);
  console.log(`✅ Unique products (barcode ≥ 7 digits): ${products.length}`);

  writeFileSync(out, JSON.stringify(products, null, 2), "utf-8");
  console.log(`💾 Saved to ${out}`);
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
