// This file has been simplified after removing Library pages.
// It now just contains type definitions for backward compatibility.

export type LibraryImage = {
  id: string;
  url: string;
  filename?: string;
  content_type?: string;
  size?: number;
  created_at: string;
};

// All functionality has been removed