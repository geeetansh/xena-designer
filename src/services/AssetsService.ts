import { supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import { log, error as logError, success, uploadLog } from '@/lib/logger';

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

/**
 * Ensure the storage bucket exists for the given source
 * @param source The source bucket to ensure exists
 */
export async function ensureStorageBucket(source: AssetSource): Promise<string> {
  try {
    // Map the source to the appropriate bucket name
    let bucketName: string;
    switch (source) {
      case 'library':
      case 'reference':
        bucketName = 'user-uploads';
        break;
      case 'shopify':
        bucketName = 'shopify-images';
        break;
      case 'generated':
        bucketName = 'images';
        break;
      default:
        bucketName = 'user-uploads';
    }
    
    // First check if the bucket exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      throw new Error(`Error checking storage buckets: ${listError.message}`);
    }
    
    const bucketExists = buckets?.some(bucket => bucket.name === bucketName);
    
    if (!bucketExists) {
      try {
        // Create the bucket if it doesn't exist
        const { error } = await supabase.storage.createBucket(bucketName, {
          public: true // Make the bucket public
        });
        
        if (error) {
          // Check if it's a duplicate error (bucket was created in a race condition)
          if (error.message?.includes('409') || error.message?.includes('Duplicate') || 
              (typeof error === 'object' && 'statusCode' in error && error.statusCode === '409')) {
            log(`Bucket ${bucketName} already exists (created by another process)`);
          } else {
            throw new Error(`Error creating storage bucket: ${error.message}`);
          }
        } else {
          log(`Successfully created ${bucketName} bucket with public access`);
        }
      } catch (createError) {
        // If creation fails, check again - another process might have created it
        const { data: checkBuckets } = await supabase.storage.listBuckets();
        if (!checkBuckets?.some(bucket => bucket.name === bucketName)) {
          // If still doesn't exist, propagate the error
          throw createError;
        }
        // Otherwise, bucket exists now, continue
        log(`Bucket ${bucketName} already exists after rechecking`);
      }
    } else {
      log(`Bucket ${bucketName} already exists, skipping creation`);
    }
    
    return bucketName;
  } catch (err) {
    logError(`Error ensuring storage bucket: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

/**
 * Upload a file buffer to storage and create an asset record
 * 
 * @param buffer The file buffer to upload
 * @param metadata The asset metadata
 * @returns The created asset
 */
export async function uploadFromBuffer(
  buffer: ArrayBuffer | Blob | File,
  metadata: AssetMetadata
): Promise<Asset> {
  try {
    uploadLog(`Uploading file to ${metadata.source} storage`);
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    const userId = user.id;
    
    // Ensure proper bucket exists
    const bucketName = await ensureStorageBucket(metadata.source);
    
    // Generate a filename if not provided
    const filename = metadata.filename || `file-${Date.now()}`;
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.]/g, '_');
    
    // Create a unique file path
    const filePath = `${userId}/${Date.now()}_${sanitizedFilename}`;
    
    // Determine content type
    let contentType = metadata.content_type;
    if (!contentType) {
      if (buffer instanceof File || buffer instanceof Blob) {
        contentType = buffer.type || 'application/octet-stream';
      } else {
        // Try to guess from filename
        const ext = sanitizedFilename.split('.').pop()?.toLowerCase();
        if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';
        else if (ext === 'png') contentType = 'image/png';
        else if (ext === 'webp') contentType = 'image/webp';
        else if (ext === 'gif') contentType = 'image/gif';
        else contentType = 'application/octet-stream';
      }
    }
    
    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(filePath, buffer, {
        upsert: true,
        contentType
      });
    
    if (uploadError) {
      throw new Error(`Error uploading file: ${uploadError.message}`);
    }
    
    // Get the public URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(filePath);
    
    const fileUrl = urlData.publicUrl;
    
    // Determine file size
    let fileSize = metadata.size;
    if (fileSize === undefined) {
      if (buffer instanceof File || buffer instanceof Blob) {
        fileSize = buffer.size;
      }
    }
    
    // Create asset record in database
    const { data: asset, error: insertError } = await supabase
      .from('assets')
      .insert({
        user_id: userId,
        source: metadata.source,
        source_ref: metadata.source_ref,
        original_url: fileUrl,
        filename: sanitizedFilename,
        content_type: contentType,
        size: fileSize,
        variation_group_id: metadata.variation_group_id,
        variation_index: metadata.variation_index
      })
      .select('*')
      .single();
    
    if (insertError) {
      // If we get an RLS error, log a more helpful message
      if (insertError.message?.includes('row-level security') || 
          insertError.message?.includes('violates row-level security policy')) {
        throw new Error(`Error creating asset record: Row-level security policy violation. Make sure you have the right permissions for this operation. Technical details: ${insertError.message}`);
      }
      throw new Error(`Error creating asset record: ${insertError.message}`);
    }
    
    success(`Asset successfully created: ${asset.id}`);
    return asset;
  } catch (err) {
    logError(`Error uploading from buffer: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

/**
 * Upload a file from a URL and create an asset record
 * 
 * @param url The URL to fetch the file from
 * @param metadata The asset metadata
 * @returns The created asset
 */
export async function uploadFromUrl(
  url: string,
  metadata: AssetMetadata
): Promise<Asset> {
  try {
    uploadLog(`Uploading file from URL to ${metadata.source} storage`);
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }
    
    // If URL is already from our Supabase storage and source matches, just create the asset record
    if (url.includes(import.meta.env.VITE_SUPABASE_URL) && url.includes(`/${metadata.source}/`)) {
      log(`URL is already in Supabase storage: ${url}`);
      
      // Extract filename from URL
      const urlPath = new URL(url).pathname;
      const filename = urlPath.split('/').pop() || `file-${Date.now()}`;
      
      // Create asset record in database
      const { data: asset, error: insertError } = await supabase
        .from('assets')
        .insert({
          user_id: user.id,
          source: metadata.source,
          source_ref: metadata.source_ref,
          original_url: url,
          filename: metadata.filename || filename,
          content_type: metadata.content_type,
          size: metadata.size,
          variation_group_id: metadata.variation_group_id,
          variation_index: metadata.variation_index
        })
        .select('*')
        .single();
      
      if (insertError) {
        // If we get an RLS error, log a more helpful message
        if (insertError.message?.includes('row-level security') || 
            insertError.message?.includes('violates row-level security policy')) {
          throw new Error(`Error creating asset record: Row-level security policy violation. Make sure you have the right permissions for this operation. Technical details: ${insertError.message}`);
        }
        throw new Error(`Error creating asset record: ${insertError.message}`);
      }
      
      success(`Asset record created without re-uploading: ${asset.id}`);
      return asset;
    }
    
    // Fetch the file from the URL
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch file from URL: ${response.statusText}`);
    }
    
    // Get file content type from response
    const contentType = response.headers.get('content-type') || metadata.content_type || 'application/octet-stream';
    
    // Get file as blob
    const blob = await response.blob();
    
    // Get the file size
    const size = blob.size;
    
    // Generate a filename if not provided
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    const filenameFromUrl = pathParts[pathParts.length - 1] || `file-${Date.now()}`;
    const filename = metadata.filename || filenameFromUrl;
    
    // Now upload the blob
    return uploadFromBuffer(blob, {
      ...metadata,
      filename,
      content_type: contentType,
      size
    });
  } catch (err) {
    logError(`Error uploading from URL: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

/**
 * Fetch assets with filtering and pagination
 * 
 * @param options The fetch options
 * @returns Assets and pagination info
 */
export async function fetchAssets(options?: {
  source?: AssetSource;
  limit?: number;
  page?: number;
  variation_group_id?: string;
}): Promise<{
  assets: Asset[];
  totalCount: number;
  hasMore: boolean;
}> {
  try {
    const limit = options?.limit || 20;
    const page = options?.page || 1;
    const offset = (page - 1) * limit;
    
    // Base query
    let query = supabase
      .from('assets')
      .select('*', { count: 'exact' });
    
    // Add source filter if provided
    if (options?.source) {
      query = query.eq('source', options.source);
    }
    
    // Add variation_group_id filter if provided
    if (options?.variation_group_id) {
      query = query.eq('variation_group_id', options.variation_group_id);
    }
    
    // Add pagination
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    // Execute query
    const { data, error, count } = await query;
    
    if (error) {
      throw error;
    }
    
    return {
      assets: data as Asset[],
      totalCount: count || 0,
      hasMore: Boolean(count && count > offset + limit)
    };
  } catch (err) {
    logError(`Error fetching assets: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

/**
 * Fetch variations of an asset by their variation group ID
 * 
 * @param variationGroupId The variation group ID
 * @returns Array of variation assets
 */
export async function fetchAssetVariations(variationGroupId: string): Promise<Asset[]> {
  try {
    const { data, error } = await supabase
      .from('assets')
      .select('*')
      .eq('variation_group_id', variationGroupId)
      .order('variation_index', { ascending: true });
      
    if (error) {
      throw error;
    }
    
    return data as Asset[];
  } catch (err) {
    logError(`Error fetching asset variations: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

/**
 * Delete an asset and its storage file
 * 
 * @param assetId The ID of the asset to delete
 */
export async function deleteAsset(assetId: string): Promise<void> {
  try {
    // Get the asset to delete
    const { data: asset, error: fetchError } = await supabase
      .from('assets')
      .select('*')
      .eq('id', assetId)
      .single();
    
    if (fetchError) {
      throw new Error(`Error fetching asset: ${fetchError.message}`);
    }
    
    if (!asset) {
      throw new Error('Asset not found');
    }
    
    // If the URL is from Supabase storage, try to delete the file
    if (asset.original_url.includes(import.meta.env.VITE_SUPABASE_URL)) {
      try {
        // Extract bucket and path from URL
        const urlPath = new URL(asset.original_url).pathname;
        // Format: /storage/v1/object/public/[bucket]/[path]
        const parts = urlPath.split('/');
        const bucketIndex = parts.indexOf("public") + 1;
        
        if (bucketIndex > 0 && bucketIndex < parts.length) {
          const bucket = parts[bucketIndex];
          const path = parts.slice(bucketIndex + 1).join('/');
          
          // Delete the file from storage
          await supabase.storage
            .from(bucket)
            .remove([path]);
            
          log(`Deleted file from storage: ${bucket}/${path}`);
        }
      } catch (storageError) {
        // Log but continue - the database record is more important
        logError(`Error deleting file from storage: ${storageError instanceof Error ? storageError.message : String(storageError)}`);
      }
    }
    
    // Delete the asset record
    const { error: deleteError } = await supabase
      .from('assets')
      .delete()
      .eq('id', assetId);
    
    if (deleteError) {
      throw new Error(`Error deleting asset: ${deleteError.message}`);
    }
    
    success(`Asset successfully deleted: ${assetId}`);
  } catch (err) {
    logError(`Error deleting asset: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}