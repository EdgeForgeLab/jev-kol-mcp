export interface ToolTextResult {
  [key: string]: unknown;
  content: [{ type: "text"; text: string }];
  isError?: boolean;
}

export function textResult(text: string, isError = false): ToolTextResult {
  if (isError) {
    return {
      isError: true,
      content: [{ type: "text", text }],
    };
  }
  return {
    content: [{ type: "text", text }],
  };
}

export function jsonResult(data: unknown): ToolTextResult {
  return textResult(JSON.stringify(data, null, 2));
}
