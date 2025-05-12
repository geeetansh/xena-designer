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

/**
 * Converts a Supabase URL to CDN URL
 * 
 * @param url The original URL from Supabase
 * @returns The CDN URL
 */
export function getCdnUrl(url: string): string {
  try {
    // Skip conversion for data URLs
    if (url.startsWith('data:')) return url;
    
    // Use the URL constructor to parse the URL
    const urlObj = new URL(url);
    // Replace the host with cdn.xena.cx but keep the pathname
    return `https://cdn.xena.cx${urlObj.pathname}`;
  } catch (e) {
    // If URL parsing fails, return the original URL
    console.warn('Error converting to CDN URL:', e);
    return url;
  }
}

/**
 * Creates a transformed image URL using Supabase Storage's transformation capabilities
 * 
 * @param url The original URL from Supabase
 * @param opts Transformation options (width, height, quality, format, resize)
 * @returns The transformed image URL
 */
export function getTransformedImageUrl(
  url: string,
  opts: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'webp' | 'jpeg' | 'png';
    resize?: 'cover' | 'contain';
  } = {}
): string {
  try {
    // Skip transformation for data URLs
    if (url.startsWith('data:')) return url;
    
    // Use the URL constructor to parse the URL
    const urlObj = new URL(url);
    
    // Check if this is a Supabase Storage URL
    if (urlObj.pathname.includes('/storage/v1/object/public/')) {
      // Create a new URLSearchParams object using the existing query parameters
      const params = new URLSearchParams(urlObj.search);
      
      // Add transformation parameters if provided
      if (opts.width) params.set('width', String(opts.width));
      if (opts.height) params.set('height', String(opts.height));
      if (opts.quality) params.set('quality', String(opts.quality));
      if (opts.format) params.set('format', opts.format);
      if (opts.resize) params.set('resize', opts.resize);
      
      // Create a new URL with the updated query parameters
      urlObj.search = params.toString();
      
      // For CDN URLs, replace the host with cdn.xena.cx but keep the pathname and search
      return `https://cdn.xena.cx${urlObj.pathname}${urlObj.search}`;
    }
    
    // If it's not a Supabase URL, just return the original URL
    return url;
  } catch (e) {
    // If URL parsing fails, return the original URL
    console.warn('Error creating transformed URL:', e);
    return url;
  }
}