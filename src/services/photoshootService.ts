import { log, error as logError } from '@/lib/logger';

// This service has been deprecated and is kept only for backward compatibility
// Please use the automationService.ts instead

export type PhotoshootStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type PhotoshootType = 'photoshoot' | 'static_ad';

export interface Photoshoot {
  id: string;
  name: string;
  prompt: string;
  product_image_url: string;
  reference_image_url?: string | null;
  result_image_url?: string | null;
  status: PhotoshootStatus;
  type: PhotoshootType;
  error_message?: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
  batch_id?: string | null;
  batch_index?: number | null;
  variation_group_id?: string | null;
  variation_index?: number | null;
}

export async function createPhotoshoot(): Promise<Photoshoot> {
  logError('photoshootService is deprecated. Please use automationService instead.');
  throw new Error('photoshootService is deprecated. Please use automationService instead.');
}

export async function fetchPhotoshoots(): Promise<{
  photoshoots: Photoshoot[];
  hasMore: boolean;
  totalCount: number;
}> {
  logError('photoshootService is deprecated. Please use automationService instead.');
  return {
    photoshoots: [],
    hasMore: false,
    totalCount: 0
  };
}

export async function deletePhotoshoot(): Promise<void> {
  logError('photoshootService is deprecated. Please use automationService instead.');
  throw new Error('photoshootService is deprecated. Please use automationService instead.');
}