const escapeCell = (value: string | number | boolean | null | undefined): string => {
  const serialized = value == null ? "" : String(value);

  if (!/[",\n]/.test(serialized)) {
    return serialized;
  }

  return `"${serialized.replace(/"/g, "\"\"")}"`;
};

export const toCsv = (
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>
): string => {
  const csvRows = [
    headers.map((header) => escapeCell(header)).join(","),
    ...rows.map((row) => row.map((cell) => escapeCell(cell)).join(","))
  ];

  return `${csvRows.join("\n")}\n`;
};
