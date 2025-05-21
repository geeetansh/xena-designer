import { 
  uploadFromBuffer, 
  uploadFromUrl, 
  fetchAssets, 
  deleteAsset 
} from './AssetsService';

export type LibraryImage = {
  id: string;
  url: string;
  filename?: string;
  content_type?: string;
  size?: number;
  created_at: string;
};

/**
 * Upload an image to the library
 * @param file The file to upload
 */
export async function uploadLibraryImage(file: File): Promise<string> {
  try {
    // Use the new AssetService to upload the file
    const asset = await uploadFromBuffer(file, {
      source: 'library',
      filename: file.name,
      content_type: file.type,
      size: file.size
    });
    
    return asset.original_url;
  } catch (error) {
    console.error('Error uploading library image:', error);
    throw error;
  }
}

/**
 * Fetch library images with pagination
 * @param limit The number of images to fetch per page
 * @param page The page number to fetch
 */
export async function fetchLibraryImages(limit: number = 24, page: number = 1): Promise<{
  images: LibraryImage[];
  totalCount: number;
  hasMore: boolean;
}> {
  try {
    // Use the new AssetService to fetch library assets
    const { assets, totalCount, hasMore } = await fetchAssets({
      source: 'library',
      limit,
      page
    });
    
    // Convert assets to LibraryImage format
    const images = assets.map(asset => ({
      id: asset.id,
      url: asset.original_url,
      filename: asset.filename || undefined,
      content_type: asset.content_type || undefined,
      size: asset.size || undefined,
      created_at: asset.created_at
    }));
    
    return {
      images,
      totalCount,
      hasMore
    };
  } catch (error) {
    console.error('Error fetching library images:', error);
    throw error;
  }
}

/**
 * Delete a library image
 * @param imageId The ID of the image to delete
 */
export async function deleteLibraryImage(imageId: string): Promise<void> {
  try {
    // Use the new AssetService to delete the asset
    await deleteAsset(imageId);
  } catch (error) {
    console.error('Error deleting library image:', error);
    throw error;
  }
}