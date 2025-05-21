// This file has been simplified after removing Gallery and Library pages.
// It now just contains type definitions for backward compatibility.

export type AssetSource = 'library' | 'reference' | 'shopify' | 'generated';

export interface Asset {
  id: string;
  user_id: string;
  source: AssetSource;
  source_ref?: string | null;
  original_url: string;
  filename?: string | null;
  content_type?: string | null;
  size?: number | null;
  created_at: string;
  variation_group_id?: string | null;
  variation_index?: number | null;
}

export interface AssetMetadata {
  source: AssetSource;
  source_ref?: string;
  filename?: string;
  content_type?: string;
  size?: number;
  variation_group_id?: string;
  variation_index?: number;
}

// All functionality has been removed