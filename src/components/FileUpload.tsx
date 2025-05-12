import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  selectedFiles: File[];
  maxFiles?: number;
  className?: string;
  required?: boolean;
  singleFileMode?: boolean;
  uploadType?: string;
}

export function FileUpload({ 
  onFilesSelected, 
  selectedFiles, 
  maxFiles = 4,
  className,
  required = false,
  singleFileMode = false,
  uploadType = "Image"
}: FileUploadProps) {
  const [isDragActive, setIsDragActive] = useState(false);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      // For single file mode, replace the current selection
      if (singleFileMode) {
        onFilesSelected(acceptedFiles.slice(0, 1));
        return;
      }
      
      // Check if adding these files would exceed the max count
      if (selectedFiles.length + acceptedFiles.length > maxFiles) {
        alert(`You can only upload up to ${maxFiles} images`);
        return;
      }
      
      // Only accept image files
      const imageFiles = acceptedFiles.filter(
        file => file.type.startsWith('image/')
      );
      
      onFilesSelected([...selectedFiles, ...imageFiles]);
    },
    [selectedFiles, onFilesSelected, maxFiles, singleFileMode]
  );

  const removeFile = (index: number) => {
    const newFiles = [...selectedFiles];
    newFiles.splice(index, 1);
    onFilesSelected(newFiles);
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: {
      'image/*': []
    },
    onDragEnter: () => setIsDragActive(true),
    onDragLeave: () => setIsDragActive(false),
    onDropAccepted: () => setIsDragActive(false),
    onDropRejected: () => setIsDragActive(false),
    maxFiles: singleFileMode ? 1 : maxFiles
  });

  const isDisabled = singleFileMode ? selectedFiles.length >= 1 : selectedFiles.length >= maxFiles;

  return (
    <div className={cn("w-full h-full flex flex-col", className)}>
      <div className="flex items-baseline mb-2">
        <p className="text-sm font-medium">{uploadType} {required && <span className="text-destructive">*</span>}</p>
        <p className="text-xs text-muted-foreground ml-auto">
          {selectedFiles.length} / {singleFileMode ? 1 : maxFiles}
        </p>
      </div>
      
      <div 
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors flex flex-col items-center justify-center flex-grow",
          isDragActive ? "border-primary bg-primary/5" : "border-border",
          isDisabled ? "opacity-50 cursor-not-allowed" : ""
        )}
      >
        <input {...getInputProps()} disabled={isDisabled} />
        
        {selectedFiles.length === 0 ? (
          <>
            <Upload className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground text-center">
              {uploadType}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {singleFileMode ? 
              "Drop to replace" : 
              `${selectedFiles.length} of ${maxFiles} selected`
            }
          </p>
        )}
      </div>

      {selectedFiles.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {selectedFiles.map((file, index) => (
            <div key={index} className="relative group">
              <div className="rounded-lg overflow-hidden aspect-square bg-muted relative">
                <img
                  src={URL.createObjectURL(file)}
                  alt={`preview ${index}`}
                  className="w-full h-full object-cover"
                />
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {file.name}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}