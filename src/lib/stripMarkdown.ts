/**
 * Strips basic markdown syntax from a string for use in plain-text previews.
 * Handles: **bold**, *italic*, ## headings, `code`, > blockquotes, numbered/bulleted lists
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')       // headings
    .replace(/\*\*(.+?)\*\*/g, '$1')   // bold
    .replace(/\*(.+?)\*/g, '$1')        // italic
    .replace(/__(.+?)__/g, '$1')        // bold alt
    .replace(/_(.+?)_/g, '$1')          // italic alt
    .replace(/`(.+?)`/g, '$1')          // inline code
    .replace(/^>\s+/gm, '')             // blockquotes
    .replace(/^\s*[-*+]\s+/gm, '')      // unordered list bullets
    .replace(/^\s*\d+\.\s+/gm, '')      // ordered list numbers
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links → label only
    .replace(/\n{3,}/g, '\n\n')         // collapse excess newlines
    .trim();
}
