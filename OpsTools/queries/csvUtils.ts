export function encodeForCsv(str: string): string {
  return `"${str.replace(/"/g, '""').replace(/\n/g, "\\n")}}"`;
}
