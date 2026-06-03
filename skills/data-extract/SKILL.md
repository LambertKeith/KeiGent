---
name: data-extract
description: Use this skill when the user wants to extract structured data from a fetched webpage or document. This includes pulling out tables, lists, key-value pairs, prices, contact info, or any structured fields from page content. Use whenever the user mentions extracting data, fields, tables, or structured information from a page.
metadata:
  version: "0.1.0"
  author: keigent
  tags: [data, extract, structured, table]
---

# Structured Data Extraction

Extract structured data from fetched page content.

## Workflow

### Step 1: Identify the data shape

Determine what structure the data should take:
- Table → list of rows with consistent columns
- Key-value pairs → object with named fields
- List → array of items

### Step 2: Extract

From the fetched content, pull out the target fields. Preserve original values, do not paraphrase numbers or identifiers.

After extracting, call `request_verification` with `checkpoint_desc="数据已提取"`.

## Guidelines

- Never invent data that is not present in the source.
- Preserve exact numeric values, dates, and identifiers.
- If a field is missing, mark it as null rather than guessing.
- Output extracted data as a JSON-like structure for clarity.
