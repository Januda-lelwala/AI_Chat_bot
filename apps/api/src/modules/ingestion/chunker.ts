export function chunkText(text: string, maxChars = 1200): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).trim().length > maxChars && current) {
      chunks.push(current);
      current = paragraph;
      continue;
    }

    current = (current + "\n\n" + paragraph).trim();
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length ? chunks : [text.slice(0, maxChars)];
}
