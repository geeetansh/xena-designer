import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Get the appropriate aspect ratio based on the layout
 * 
 * @param layout Layout type ('square', 'landscape', 'portrait', or 'auto')
 * @returns Aspect ratio as a string (e.g., '1:1', '3:2', '2:3')
 */
export function getAspectRatio(layout: string): string {
  switch (layout) {
    case 'square':
      return '1:1';
    case 'landscape':
      return '16:9'; // or '3:2' depending on your preference
    case 'portrait':
      return '9:16'; // or '2:3' depending on your preference
    case 'auto':
    default:
      return '1:1'; // Default to square
  }
}

/**
 * Maps layout setting to OpenAI's supported image generation dimensions
 * 
 * @param layout Layout type ('square', 'landscape', 'portrait', or 'auto')
 * @returns OpenAI supported dimension string
 */
export function mapLayoutToOpenAISize(layout: string): string {
  switch (layout) {
    case 'square':
      return '1024x1024';
    case 'landscape':
      return '1536x1024'; // OpenAI supported landscape size
    case 'portrait':
      return '1024x1536'; // OpenAI supported portrait size
    case 'auto':
    default:
      return '1024x1024'; // Default to square for reliability
  }
}