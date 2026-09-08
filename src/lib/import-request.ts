export function isMultipartContentType(contentType: string | null): boolean {
  return (contentType ?? "").toLowerCase().startsWith("multipart/form-data");
}
