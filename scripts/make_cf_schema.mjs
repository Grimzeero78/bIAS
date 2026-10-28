#!/usr/bin/env node
/**
 * Derives prisma/schema.cf.prisma from prisma/schema.prisma, swapping the
 * generator to the CF-native one (prisma-client + queryCompiler + workerd
 * runtime). Keeps models perfectly in sync — no manual duplication.
 */
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("prisma/schema.prisma", "utf-8");

const cfGenerator = `generator client {
  provider        = "prisma-client"
  output          = "../src/generated/prisma-cf"
  runtime         = "workerd"
  previewFeatures = ["driverAdapters", "queryCompiler"]
}`;

const patched = src.replace(
  /generator client \{[\s\S]*?\}/,
  cfGenerator
);

if (!patched.includes('provider        = "prisma-client"')) {
  throw new Error("Failed to patch the generator block");
}

writeFileSync("prisma/schema.cf.prisma", patched);
console.log("prisma/schema.cf.prisma written (queryCompiler + workerd)");
