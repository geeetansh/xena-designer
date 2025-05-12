/**
 * Shared logging utility for consistent log formatting across the application
 */

/**
 * Formats a message with timestamp prefix
 */
export function formatLog(message: string): string {
  return `[${new Date().toISOString().replace('T', ' ').split('.')[0]}] ${message}`;
}

/**
 * Log normal application flow
 */
export function log(message: string, ...data: any[]): void {
  console.log(formatLog(message), ...data);
}

/**
 * Log warnings
 */
export function warn(message: string, ...data: any[]): void {
  console.warn(formatLog(`⚠️ ${message}`), ...data);
}

/**
 * Log errors
 */
export function error(message: string, ...data: any[]): void {
  console.error(formatLog(`❌ ${message}`), ...data);
}

/**
 * Log successful completions
 */
export function success(message: string, ...data: any[]): void {
  console.log(formatLog(`✅ ${message}`), ...data);
}

/**
 * Log the start of an operation
 */
export function startOperation(operation: string, ...data: any[]): void {
  console.log(formatLog(`▶️ Started ${operation}`), ...data);
}

/**
 * Log the end of an operation with duration
 */
export function endOperation(operation: string, startTime: number, ...data: any[]): void {
  const duration = (Date.now() - startTime) / 1000;
  console.log(formatLog(`✓ Completed ${operation} in ${duration.toFixed(2)}s`), ...data);
}

/**
 * Log upload-related information
 */
export function uploadLog(message: string, ...data: any[]): void {
  console.log(formatLog(`⬆️ ${message}`), ...data);
}

/**
 * Log download-related information
 */
export function downloadLog(message: string, ...data: any[]): void {
  console.log(formatLog(`⬇️ ${message}`), ...data);
}

/**
 * Log API calls
 */
export function apiLog(message: string, ...data: any[]): void {
  console.log(formatLog(`🔄 ${message}`), ...data);
}

/**
 * Format file size in a human-readable way
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}